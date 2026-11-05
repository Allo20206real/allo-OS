# allo OS

A simple, clean operating system for your phone: a lock screen, a home screen
for your apps, an App Store, and gestures. You install it on your phone,
then install apps inside it.

allo OS is a Progressive Web App (PWA). Once installed it opens full screen
from its own home-screen icon and works offline. It runs on iPhone, Android,
tablets and computers.

## Install it on your phone

1. Open the allo OS URL on your phone (see *Hosting* below).
2. **iPhone / iPad (Safari):** tap **Share** → **Add to Home Screen**.
   **Android (Chrome):** tap **⋮** → **Install app**.
3. Open **allo** from your home screen.

## What's inside

**System**
- Lock screen with a large clock. Swipe up to unlock.
- Home screen with pages, a dock and page dots.
- Long-press any icon to rearrange (drag, including to other pages and the
  dock) or remove apps.
- Animated app launch and close: apps zoom out of their icon and back into it.
- **Swipe up** from the bottom bar to go home. **Swipe up and pause** to see
  recent apps, then swipe a card up to close that app.
- **Swipe down** from the top for Control Center (dark mode, brightness,
  full screen, lock). **Swipe down** anywhere else on the home screen to search.
- Notifications (shown as banners, and on the lock screen while locked).
- Light, dark and auto themes, 8 wallpapers, or your own photo, plus accent colors.
- First-run setup, auto-lock, and offline support.

**App Store**
- Install and remove apps. Installing downloads the app's files to the device,
  so it keeps working offline. Removing an app deletes its files and data.
- **Add from link:** install a third-party allo app from its manifest URL, or
  add any website as a web app.

**Apps:** Settings, App Store, Notes, Camera, Gallery, Clock (world clock,
stopwatch, timer), Calculator, Weather, Calendar. More in the store: Tasks,
Sketch, Recorder and Converter.

## Hosting

allo OS is static files with no build step. Any HTTPS host works.

**GitHub Pages:** this repo includes `.github/workflows/pages.yml`. In the
repository go to **Settings → Pages → Build and deployment → Source** and
choose **GitHub Actions**. Every push to `main` then deploys to
`https://<user>.github.io/<repo>/`.

**Local:** run `python3 -m http.server 8080` and open `http://localhost:8080`.
On a computer, allo OS shows inside a phone frame.

## Make your own app

An allo app is a web page plus a small manifest:

```json
{
  "name": "Dice",
  "entry": "index.html",
  "icon": "icon.svg",
  "description": "Roll one or two dice.",
  "version": "1.0",
  "files": ["app.js", "style.css"]
}
```

Host it anywhere, then in **App Store → Add from link**, paste the manifest's
URL. Everything listed in `entry`, `icon` and `files` is downloaded on install.
See [`examples/dice`](examples/dice): on a deployed site, install it from
`<your allo URL>/examples/dice/manifest.json`.

To match the system, include the SDK:

```html
<link rel="stylesheet" href="https://<your allo URL>/sdk/allo.css">
<script src="https://<your allo URL>/sdk/allo.js"></script>
```

| API | What it does |
| --- | --- |
| `allo.notify(title, body)` | Show a notification |
| `allo.open(appId)` | Open another installed app |
| `allo.home()` | Go to the home screen |
| `allo.statusBar('light' \| 'dark')` | Status bar text color for your app |
| `allo.store.get(key, fallback)` / `.set(key, value)` | Per-app storage, removed on uninstall |
| `allo.photos.add(blob)` / `.list()` / `.remove(id)` | Shared photo library (same-origin apps) |
| `allo.sheet(html)` | Bottom sheet |
| `allo.on('show' \| 'hide' \| 'env', fn)` | Lifecycle and theme changes |

The SDK sets `data-theme` (`light`/`dark`), `--accent`, and the safe-area
insets `--sat` / `--sab` for you. `allo.css` includes ready-made components:
`.titlebar`, `.group`/`.item` lists, `.btn`, `.field`, `.switch`, `.seg`,
`.tabbar` and `.fab`.

Built-in apps live in `apps/<id>/` and are listed in `apps/catalog.json`.

## Project layout

```
index.html            system shell
os/system.js          home screen, windows, gestures, package manager, app API
os/style.css          system UI
os/wallpapers.js      built-in wallpapers
sw.js                 service worker (offline + app packages)
sdk/                  SDK for apps (allo.js, allo.css)
apps/                 built-in apps + catalog.json
examples/dice/        a sample third-party app
tools/                icon generators
```

`node tools/make-icons.mjs` regenerates the app icons, and
`node tools/make-pngs.cjs` regenerates the PNG home-screen icons (needs Playwright).

## Limits

allo OS runs on top of your phone's own system, the way a launcher does. It
can't replace iOS or Android, run native APKs or iOS apps, or change
system settings such as Wi-Fi. On iPhone, the iOS status bar and home gesture
stay visible above it.
