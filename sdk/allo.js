// allo SDK — lets an app follow the system theme and talk to allo OS.
(function () {
  const root = document.documentElement;
  const allo = (window.allo = {});
  const listeners = {};
  const emit = (n, d) => (listeners[n] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });
  allo.on = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };

  // app id from the path: /apps/<id>/...
  const m = location.pathname.match(/\/apps\/([^/]+)\//);
  allo.appId = m ? m[1] : (location.pathname.split('/').slice(-2, -1)[0] || 'app');
  allo.env = { theme: 'light', accent: '#2f7cf6', insets: { top: 48, bottom: 22 }, clock24: false, visible: true };

  function applyEnv(env) {
    Object.assign(allo.env, env);
    root.dataset.theme = allo.env.theme;
    root.style.setProperty('--accent', allo.env.accent);
    root.style.setProperty('--sat', allo.env.insets.top + 'px');
    root.style.setProperty('--sab', allo.env.insets.bottom + 'px');
  }

  // first paint: read system settings directly when we share an origin
  try {
    const s = JSON.parse(localStorage.getItem('allo.state') || '{}').settings || {};
    const theme = s.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : (s.theme || 'light');
    applyEnv({ theme, accent: s.accent || '#2f7cf6', clock24: !!s.clock24 });
  } catch { applyEnv({}); }

  const inOS = window.parent !== window;
  let seq = 0;
  const pending = new Map();

  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'allo:env') { applyEnv(d); emit('env', allo.env); }
    else if (d.type === 'allo:reply') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      d.ok ? p.resolve(d.result) : p.reject(new Error(d.error));
    } else if (d.type === 'allo:event') emit(d.name, d.data);
    else if (d.type === 'allo:visibility') { allo.env.visible = d.visible; emit(d.visible ? 'show' : 'hide'); }
    else if (d.type === 'allo:back') {
      // Android Back: close an open sheet, or let the app go back a screen. Unhandled = go home.
      let handled = false;
      const sheet = document.querySelector('.sheet');
      if (sheet && sheet.close) { sheet.close(); handled = true; }
      else handled = (listeners.back || []).some(f => { try { return f() === true; } catch { return false; } });
      window.parent.postMessage({ type: 'allo:back-result', id: d.id, handled }, '*');
    }
  });

  /** Call a system method. Resolves with its result. */
  allo.call = (method, ...args) => new Promise((resolve, reject) => {
    if (!inOS) return reject(new Error('Not running inside allo OS'));
    const id = ++seq;
    pending.set(id, { resolve, reject });
    window.parent.postMessage({ type: 'allo:call', id, method, args }, '*');
  });

  allo.notify = (title, body) => inOS ? allo.call('notify', { title, body }) : Promise.resolve(console.log('[notify]', title, body));
  allo.open = id => allo.call('open', id);
  allo.home = () => window.parent.postMessage({ type: 'allo:home' }, '*');
  allo.statusBar = style => inOS && allo.call('setStatusBar', style);
  allo.haptic = (ms = 10) => {
    try { if (window.parent.AlloNative) return window.parent.AlloNative.haptic(ms > 20 ? 'long' : 'light'); } catch {}
    navigator.vibrate?.(ms);
  };
  /** true when allo is the phone's real home screen (Android). */
  allo.native = (() => { try { return !!window.parent.AlloNative; } catch { return false; } })();

  /** Small key/value store, namespaced per app and removed on uninstall. */
  const prefix = `app.${allo.appId}.`;
  allo.store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(prefix + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch (e) { console.warn(e); } }
  };

  /** Shared photo library (used by Camera, Sketch and Gallery). */
  function db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('allo-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('photos', mode);
      const out = fn(t.objectStore('photos'));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  allo.photos = {
    add: (blob, source = allo.appId) => {
      const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), blob, source, created: Date.now() };
      return tx('readwrite', s => s.put(item)).then(() => item);
    },
    list: async () => ((await tx('readonly', s => s.getAll())) || []).sort((a, b) => b.created - a.created),
    remove: id => tx('readwrite', s => s.delete(id))
  };

  /** Bottom sheet helper: returns the sheet element; call close() to dismiss. */
  allo.sheet = (htmlContent, { onClose } = {}) => {
    const bd = document.createElement('div'); bd.className = 'sheet-bd';
    const sh = document.createElement('div'); sh.className = 'sheet';
    sh.innerHTML = htmlContent;
    const close = () => { bd.classList.add('out'); sh.classList.add('out'); setTimeout(() => { bd.remove(); sh.remove(); }, 200); onClose && onClose(); };
    bd.onclick = close;
    sh.close = close;
    document.body.append(bd, sh);
    return sh;
  };

  allo.inOS = inOS;
  if (inOS) window.parent.postMessage({ type: 'allo:ready' }, '*');
  // Escape goes home, unless the app handled the key itself
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && inOS) setTimeout(() => { if (!e.defaultPrevented && !document.querySelector('.sheet')) allo.home(); }, 0);
  });
})();
