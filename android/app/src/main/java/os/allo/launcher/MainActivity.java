package os.allo.launcher;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityOptions;
import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * allo OS home screen.
 *
 * The system UI is the allo web shell (bundled in assets/www) running in a
 * transparent WebView over the real system wallpaper. A JavaScript bridge
 * ("AlloNative") gives it the phone's installed apps, their icons, and the
 * ability to launch and uninstall them.
 */
public class MainActivity extends Activity {
    private static final String HOST = "allo.local";
    private static final String ORIGIN = "https://" + HOST + "/";
    private static final int REQ_MEDIA = 1, REQ_FILE = 2, REQ_GEO = 3, REQ_HOME_ROLE = 4;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private boolean resumed;
    private int barTop, barBottom, ime;          // device px
    private Boolean lastDarkIcons;

    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingMedia;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private final BroadcastReceiver packageReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            js("window.alloOS && alloOS.nativeAppsChanged && alloOS.nativeAppsChanged()");
        }
    };
    private WallpaperManager.OnColorsChangedListener wallpaperListener;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setupWindow();

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setGeolocationEnabled(true);
        s.setSupportMultipleWindows(false);

        web.addJavascriptInterface(new Bridge(), "AlloNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            readInsets(insets);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
            if (lp.bottomMargin != ime) { lp.bottomMargin = ime; web.setLayoutParams(lp); }
            pushInsets();
            return insets;
        });
        setContentView(root);

        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(packageReceiver, f, Context.RECEIVER_EXPORTED);
        else registerReceiver(packageReceiver, f);

        if (Build.VERSION.SDK_INT >= 27) {
            wallpaperListener = (colors, which) -> js("window.alloOS && alloOS.nativeWallpaperChanged && alloOS.nativeWallpaperChanged()");
            try { WallpaperManager.getInstance(this).addOnColorsChangedListener(wallpaperListener, main); } catch (Exception ignored) { }
        }

        web.loadUrl(ORIGIN + "index.html");
    }

    @SuppressWarnings("deprecation")
    private void setupWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            w.setNavigationBarContrastEnforced(false);
            w.setStatusBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
    }

    @SuppressWarnings("deprecation")
    private void readInsets(WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets kb = insets.getInsets(WindowInsets.Type.ime());
            barTop = bars.top;
            barBottom = bars.bottom;
            ime = kb.bottom;
        } else {
            int bottom = insets.getSystemWindowInsetBottom();
            barTop = insets.getSystemWindowInsetTop();
            boolean keyboard = bottom > dp(120);
            ime = keyboard ? bottom : 0;
            if (!keyboard) barBottom = bottom;
        }
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private String insetsJson() {
        float d = getResources().getDisplayMetrics().density;
        int bottom = ime > 0 ? 0 : barBottom;
        return "{\"top\":" + Math.round(barTop / d) + ",\"bottom\":" + Math.round(bottom / d) + "}";
    }

    private void pushInsets() {
        js("(function(i){var s=document.documentElement.style;s.setProperty('--sat',i.top+'px');s.setProperty('--sab',i.bottom+'px');"
                + "window.alloOS&&alloOS.insetsChanged&&alloOS.insetsChanged();})(" + insetsJson() + ")");
    }

    private void js(String code) {
        main.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    // ------------------------------------------------------------------ lifecycle

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        web.onResume();
        js("window.alloOS && alloOS.nativeResume && alloOS.nativeResume()");
    }

    @Override protected void onPause() {
        resumed = false;
        js("window.alloOS && alloOS.nativePause && alloOS.nativePause()");
        web.onPause();
        super.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (Intent.ACTION_MAIN.equals(intent.getAction()) && intent.hasCategory(Intent.CATEGORY_HOME)) {
            // Pressing Home while already on the home screen goes back to the first page.
            js("window.alloOS && alloOS.home && alloOS.home(" + resumed + ")");
        }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        // A home screen never closes; Back is handled by allo (close app, search, edit mode...).
        js("window.alloOS && alloOS.back && alloOS.back()");
    }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        js("window.alloOS && alloOS.nativeThemeChanged && alloOS.nativeThemeChanged(" + isDarkMode() + ")");
    }

    @Override protected void onDestroy() {
        try { unregisterReceiver(packageReceiver); } catch (Exception ignored) { }
        if (Build.VERSION.SDK_INT >= 27 && wallpaperListener != null) {
            try { WallpaperManager.getInstance(this).removeOnColorsChangedListener(wallpaperListener); } catch (Exception ignored) { }
        }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    private boolean isDarkMode() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    // ------------------------------------------------------------------ results

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        } else if (code == REQ_HOME_ROLE) {
            js("window.alloOS && alloOS.nativeResume && alloOS.nativeResume()");
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        boolean all = results.length > 0;
        for (int r : results) all &= r == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_MEDIA && pendingMedia != null) {
            if (all) pendingMedia.grant(pendingMedia.getResources()); else pendingMedia.deny();
            pendingMedia = null;
        } else if (code == REQ_GEO && geoCallback != null) {
            boolean any = false;
            for (int r : results) any |= r == PackageManager.PERMISSION_GRANTED;
            geoCallback.invoke(geoOrigin, any, false);
            geoCallback = null;
        }
    }

    // ------------------------------------------------------------------ web content

    private class Client extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            return serve(req.getUrl());
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            if (!req.isForMainFrame()) return false;
            openExternal(u);
            return true;
        }

        @Override public void onPageFinished(WebView view, String url) { pushInsets(); }
    }

    private class Chrome extends WebChromeClient {
        @Override public void onPermissionRequest(PermissionRequest req) {
            main.post(() -> {
                List<String> missing = new ArrayList<>();
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) addIfMissing(missing, Manifest.permission.CAMERA);
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) addIfMissing(missing, Manifest.permission.RECORD_AUDIO);
                }
                if (missing.isEmpty()) { req.grant(req.getResources()); return; }
                if (pendingMedia != null) pendingMedia.deny();
                pendingMedia = req;
                requestPermissions(missing.toArray(new String[0]), REQ_MEDIA);
            });
        }

        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                cb.invoke(origin, true, false);
                return;
            }
            geoOrigin = origin;
            geoCallback = cb;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
        }

        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
        }
    }

    private void addIfMissing(List<String> list, String perm) {
        if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) list.add(perm);
    }

    /** Serves the bundled allo shell from assets, plus app icons, at https://allo.local/. */
    private WebResourceResponse serve(Uri u) {
        if (!HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
        if (path.endsWith("/")) path += "index.html";
        if (path.startsWith("/__icon/")) return icon(path.substring(8));
        try {
            InputStream in = getAssets().open("www" + path);
            return response(mime(path), in, 200, "no-cache");
        } catch (IOException e) {
            return response("text/plain", new ByteArrayInputStream(new byte[0]), 404, "no-store");
        }
    }

    private static WebResourceResponse response(String mime, InputStream in, int code, String cache) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", cache);
        boolean text = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg") || mime.contains("manifest");
        return new WebResourceResponse(mime, text ? "utf-8" : null, code, code == 200 ? "OK" : "Not Found", h, in);
    }

    private static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /** Renders an app's launcher icon as a full-bleed square PNG; allo applies its own icon shape. */
    private WebResourceResponse icon(String spec) {
        String[] p = spec.split("/");
        String pkg = p[0];
        String cls = p.length > 1 ? p[1].replaceAll("\\.png$", "") : "";
        PackageManager pm = getPackageManager();
        Drawable d;
        try { d = pm.getActivityIcon(new ComponentName(pkg, cls)); }
        catch (Exception e) {
            try { d = pm.getApplicationIcon(pkg); }
            catch (Exception e2) { d = pm.getDefaultActivityIcon(); }
        }
        Bitmap bm = renderIcon(d, 192);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bm.compress(Bitmap.CompressFormat.PNG, 100, out);
        bm.recycle();
        return response("image/png", new ByteArrayInputStream(out.toByteArray()), 200, "max-age=31536000");
    }

    private static Bitmap renderIcon(Drawable d, int size) {
        Bitmap bm = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm);
        if (d instanceof AdaptiveIconDrawable) {
            // Adaptive icon layers are 108dp with a 72dp visible area: draw them 1.5x so the visible part fills the square.
            AdaptiveIconDrawable a = (AdaptiveIconDrawable) d;
            int pad = size / 4;
            Drawable bg = a.getBackground(), fg = a.getForeground();
            if (bg != null) { bg.setBounds(-pad, -pad, size + pad, size + pad); bg.draw(c); }
            else c.drawColor(Color.WHITE);
            if (fg != null) { fg.setBounds(-pad, -pad, size + pad, size + pad); fg.draw(c); }
        } else {
            c.drawColor(Color.WHITE);
            int pad = Math.round(size * 0.14f);
            d.setBounds(pad, pad, size - pad, size - pad);
            d.draw(c);
        }
        return bm;
    }

    private void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception e) { toast("No app can open this link"); }
    }

    private void toast(String msg) { main.post(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()); }

    private boolean isDefaultHome() {
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo r = getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
        return r != null && r.activityInfo != null && getPackageName().equals(r.activityInfo.packageName);
    }

    // ------------------------------------------------------------------ bridge

    /** Methods callable from JavaScript as window.AlloNative.*  */
    private class Bridge {
        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return "1.0"; }
        }

        @JavascriptInterface public String insets() { return insetsJson(); }

        @JavascriptInterface public boolean isDark() { return isDarkMode(); }

        /** Every app with a launcher entry: [{pkg, cls, label, system, updated, version}] */
        @JavascriptInterface public String apps() {
            PackageManager pm = getPackageManager();
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            JSONArray arr = new JSONArray();
            for (ResolveInfo r : pm.queryIntentActivities(i, 0)) {
                ActivityInfo ai = r.activityInfo;
                if (ai == null || getPackageName().equals(ai.packageName)) continue;
                try {
                    JSONObject o = new JSONObject();
                    o.put("pkg", ai.packageName);
                    o.put("cls", ai.name);
                    o.put("label", String.valueOf(r.loadLabel(pm)));
                    o.put("system", (ai.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                    PackageInfo info = pm.getPackageInfo(ai.packageName, 0);
                    o.put("updated", info.lastUpdateTime);
                    o.put("version", info.versionName == null ? "" : info.versionName);
                    arr.put(o);
                } catch (Exception ignored) { }
            }
            return arr.toString();
        }

        /** The phone, messages, browser and camera apps, for the default dock. */
        @JavascriptInterface public String defaults() {
            PackageManager pm = getPackageManager();
            Intent[] wanted = {
                    new Intent(Intent.ACTION_DIAL),
                    new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")),
                    new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.example.com")),
                    new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
            };
            JSONArray arr = new JSONArray();
            for (Intent w : wanted) {
                try {
                    ResolveInfo r = pm.resolveActivity(w, PackageManager.MATCH_DEFAULT_ONLY);
                    if (r == null || r.activityInfo == null || "android".equals(r.activityInfo.packageName)) continue;
                    Intent launch = pm.getLaunchIntentForPackage(r.activityInfo.packageName);
                    if (launch == null || launch.getComponent() == null) continue;
                    JSONObject o = new JSONObject();
                    o.put("pkg", launch.getComponent().getPackageName());
                    o.put("cls", launch.getComponent().getClassName());
                    arr.put(o);
                } catch (Exception ignored) { }
            }
            return arr.toString();
        }

        /** Opens an app, animating from the icon's on-screen bounds (device pixels). */
        @JavascriptInterface public boolean launch(String pkg, String cls, int x, int y, int w, int h) {
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                    .setComponent(new ComponentName(pkg, cls))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            main.post(() -> {
                try {
                    Bundle opts = null;
                    if (w > 0 && h > 0) {
                        i.setSourceBounds(new Rect(x, y, x + w, y + h));
                        opts = ActivityOptions.makeScaleUpAnimation(web, x, y, w, h).toBundle();
                    }
                    startActivity(i, opts);
                } catch (Exception e) {
                    toast("This app can’t be opened");
                }
            });
            return true;
        }

        @JavascriptInterface public void uninstall(String pkg) {
            main.post(() -> {
                try { startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception e) { toast("This app can’t be removed"); }
            });
        }

        @JavascriptInterface public void appInfo(String pkg) {
            main.post(() -> {
                try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception ignored) { }
            });
        }

        @JavascriptInterface public void openPlay(String query) {
            main.post(() -> {
                String q = query == null ? "" : query.trim();
                Uri market = Uri.parse(q.isEmpty() ? "market://search?q=apps" : "market://search?q=" + Uri.encode(q) + "&c=apps");
                try {
                    if (q.isEmpty()) {
                        Intent store = getPackageManager().getLaunchIntentForPackage("com.android.vending");
                        if (store != null) { startActivity(store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; }
                    }
                    startActivity(new Intent(Intent.ACTION_VIEW, market).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception e) {
                    openExternal(Uri.parse("https://play.google.com/store/search?c=apps&q=" + Uri.encode(q)));
                }
            });
        }

        @JavascriptInterface public void openUrl(String url) { main.post(() -> openExternal(Uri.parse(url))); }

        @JavascriptInterface public void openSettings() {
            main.post(() -> {
                try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception ignored) { }
            });
        }

        /** Pulls down the real notification shade. */
        @SuppressLint("WrongConstant")
        @JavascriptInterface public boolean expandNotifications() {
            try {
                Object sb = getSystemService("statusbar");
                Class.forName("android.app.StatusBarManager").getMethod("expandNotificationsPanel").invoke(sb);
                return true;
            } catch (Throwable t) {
                return false;
            }
        }

        @JavascriptInterface public boolean isDefaultHome() { return MainActivity.this.isDefaultHome(); }

        /** Asks Android to make allo the default home screen. */
        @JavascriptInterface public void requestDefaultHome() {
            main.post(() -> {
                if (Build.VERSION.SDK_INT >= 29) {
                    try {
                        RoleManager rm = getSystemService(RoleManager.class);
                        if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                            startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_HOME_ROLE);
                            return;
                        }
                    } catch (Exception ignored) { }
                }
                try { startActivity(new Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception e) {
                    try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
                }
            });
        }

        /** true when the system wallpaper is bright enough for dark text. */
        @JavascriptInterface public boolean wallpaperLight() {
            if (Build.VERSION.SDK_INT < 27) return false;
            try {
                WallpaperColors wc = WallpaperManager.getInstance(MainActivity.this).getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
                if (wc == null) return false;
                if (Build.VERSION.SDK_INT >= 31) return (wc.getColorHints() & WallpaperColors.HINT_SUPPORTS_DARK_TEXT) != 0;
                return Color.luminance(wc.getPrimaryColor().toArgb()) > 0.6f;
            } catch (Exception e) {
                return false;
            }
        }

        /** Dark status/navigation bar icons when allo shows something light. */
        @SuppressWarnings("deprecation")
        @JavascriptInterface public void setStatusBarStyle(boolean darkIcons) {
            main.post(() -> {
                if (lastDarkIcons != null && lastDarkIcons == darkIcons) return;
                lastDarkIcons = darkIcons;
                if (Build.VERSION.SDK_INT >= 30) {
                    WindowInsetsController c = getWindow().getInsetsController();
                    if (c == null) return;
                    int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    c.setSystemBarsAppearance(darkIcons ? mask : 0, mask);
                } else {
                    View decor = getWindow().getDecorView();
                    int f = decor.getSystemUiVisibility();
                    int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    decor.setSystemUiVisibility(darkIcons ? (f | mask) : (f & ~mask));
                }
            });
        }

        @JavascriptInterface public void haptic(String kind) {
            main.post(() -> {
                if (web == null) return;
                int type = "light".equals(kind) ? HapticFeedbackConstants.KEYBOARD_TAP : HapticFeedbackConstants.LONG_PRESS;
                web.performHapticFeedback(type);
            });
        }

        /** Saves a data: URL image to the phone's Pictures/allo folder. */
        @JavascriptInterface public boolean saveImage(String dataUrl) {
            if (Build.VERSION.SDK_INT < 29 || dataUrl == null || !dataUrl.startsWith("data:image/")) return false;
            try {
                int comma = dataUrl.indexOf(',');
                String mime = dataUrl.substring(5, dataUrl.indexOf(';'));
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, "allo_" + System.currentTimeMillis() + (mime.contains("png") ? ".png" : ".jpg"));
                cv.put(MediaStore.Images.Media.MIME_TYPE, mime);
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/allo");
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return false;
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) return false;
                    out.write(bytes);
                }
                toast("Saved to Pictures");
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
