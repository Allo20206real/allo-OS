// allo OS — system shell
// Home screen, app lifecycle, package manager, gestures, lock screen and
// the message API that apps use to talk to the system.
import { WALLPAPERS, findWallpaper } from './wallpapers.js';

const VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BASE = new URL('../', import.meta.url).href;
const KEY = 'allo.state';
const WALL_KEY = 'allo.wallpaper';
const DOCK_MAX = 4;
const MAX_RUNNING = 6;

const el = {
  device: $('#device'), wallpaper: $('#wallpaper'), home: $('#home'), pages: $('#pages'), dots: $('#dots'),
  dock: $('#dock'), done: $('#edit-done'), windows: $('#windows'), recents: $('#recents'),
  statusbar: $('#statusbar'), homebar: $('#homebar'), lock: $('#lock'), control: $('#control'),
  search: $('#search'), searchInput: $('#search-input'), searchResults: $('#search-results'),
  toasts: $('#toasts'), dialogs: $('#dialog-layer'), setup: $('#setup'), dim: $('#dim')
};

/* =========================================================================
   State
   ========================================================================= */
// On Android, allo runs as the phone's real home screen and talks to the
// system through window.AlloNative (see android/).
const NATIVE = window.AlloNative || null;
const nativeCall = (fn, fallback = null) => { try { return fn(); } catch (e) { console.warn(e); return fallback; } };
if (NATIVE) {
  document.documentElement.classList.add('native');
  const i = nativeCall(() => JSON.parse(NATIVE.insets()), null);
  if (i) { document.documentElement.style.setProperty('--sat', i.top + 'px'); document.documentElement.style.setProperty('--sab', i.bottom + 'px'); }
}
let nativeDark = NATIVE ? nativeCall(() => NATIVE.isDark(), false) : false;
let nativeWallLight = NATIVE ? nativeCall(() => NATIVE.wallpaperLight(), false) : false;

const DEFAULTS = {
  v: 1, setup: false, installed: [], home: [], dock: [], external: {}, notes: [],
  settings: { theme: NATIVE ? 'auto' : 'light', wallpaper: NATIVE ? 'system' : 'aurora', accent: '#2f7cf6', clock24: false, autoLock: !NATIVE, wallLight: false, name: '' }
};
const clone = o => JSON.parse(JSON.stringify(o));
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return { ...clone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
  } catch {}
  return clone(DEFAULTS);
}
let state = loadState();
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
    broadcast('state', publicState());
  }, 40);
}

const catalog = new Map();          // id -> manifest from apps/catalog.json
const installing = new Map();       // id -> progress 0..100
const nativeApps = new Map();      // id -> the phone's real apps (Android)
function getApp(id) { return catalog.get(id) || nativeApps.get(id) || state.external[id] || null; }
const isInstalled = id => state.installed.includes(id);

/* =========================================================================
   Environment
   ========================================================================= */
const html = document.documentElement;
if (navigator.standalone === true) html.classList.add('ios-standalone');
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
const frameQuery = matchMedia('(min-width: 700px) and (min-height: 640px) and (pointer: fine)');
function applyFrame() { document.body.classList.toggle('framed', frameQuery.matches); relayout(); }
frameQuery.addEventListener?.('change', applyFrame);

let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; broadcast('state', publicState()); });
addEventListener('appinstalled', () => { installPrompt = null; toast({ title: 'allo OS installed', body: 'Open it from your home screen.' }); });

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const resolvedTheme = () => state.settings.theme === 'auto' ? ((NATIVE ? nativeDark : darkQuery.matches) ? 'dark' : 'light') : state.settings.theme;
darkQuery.addEventListener?.('change', () => applyTheme());

/* =========================================================================
   Theme & wallpaper
   ========================================================================= */
function applyTheme() {
  const t = resolvedTheme();
  html.dataset.theme = t;
  html.style.setProperty('--accent', state.settings.accent);
  $('meta[name="theme-color"]').content = '#000000';
  for (const w of running.values()) sendEnv(w);
  updateChrome();
  updateControl();
}

function applyWallpaper() {
  const s = state.settings;
  let light;
  if (s.wallpaper === 'system') {
    if (!NATIVE) { s.wallpaper = 'aurora'; return applyWallpaper(); }
    el.wallpaper.style.background = 'transparent';   // the real phone wallpaper shows through
    light = nativeWallLight;
  } else if (s.wallpaper === 'custom') {
    let url = null;
    try { url = localStorage.getItem(WALL_KEY); } catch {}
    if (url) { el.wallpaper.style.background = `#222 url("${url}") center / cover no-repeat`; light = !!s.wallLight; }
    else { s.wallpaper = 'aurora'; return applyWallpaper(); }
  } else {
    const w = findWallpaper(s.wallpaper);
    el.wallpaper.style.background = w.css;
    light = !!w.light;
  }
  el.device.classList.toggle('wall-light', light);
  el.home.classList.toggle('on-light', light);
  updateChrome();
}
const wallIsLight = () => el.device.classList.contains('wall-light');

/* =========================================================================
   Clock, status bar, battery, network
   ========================================================================= */
function fmtTime(d = new Date(), forceShort = false) {
  return d.toLocaleTimeString([], { hour: state.settings.clock24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !state.settings.clock24 })
    .replace(/\s?[AP]M$/i, forceShort ? '' : m => m);
}
function tick() {
  const d = new Date();
  const short = fmtTime(d, true);
  $('#sb-time').textContent = short;
  $('#lock-time').textContent = short;
  $('#lock-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $('#cc-time').textContent = short;
  $('#cc-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
function startClock() {
  tick();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000 + 50);
}
function updateNet() {
  $('#sb-net').classList.toggle('off', !navigator.onLine);
  $('#cc-net-sub').textContent = navigator.onLine ? 'Online' : 'Offline';
  $('#cc-net').classList.toggle('on', navigator.onLine);
}
addEventListener('online', updateNet);
addEventListener('offline', updateNet);
async function initBattery() {
  if (!navigator.getBattery) return;
  try {
    const b = await navigator.getBattery();
    const upd = () => {
      $('#sb-batt').hidden = false;
      const pct = Math.round(b.level * 100);
      $('#sb-batt-pct').textContent = pct;
      $('#sb-batt-fill').style.width = pct + '%';
      $('#sb-batt-fill').style.background = b.charging ? '#34c759' : pct <= 20 ? '#ff3b30' : '';
    };
    upd();
    b.addEventListener('levelchange', upd);
    b.addEventListener('chargingchange', upd);
  } catch {}
}

/* status bar / home bar colour depends on what is on screen */
function updateChrome() {
  let darkText = false;
  const overlay = locked || !el.setup.hidden || !el.control.hidden || !el.search.hidden || inRecents;
  if (!overlay && current) {
    const w = running.get(current);
    const style = w?.bar || (resolvedTheme() === 'dark' ? 'light' : 'dark');
    darkText = style === 'dark';
  } else if (!overlay) {
    darkText = wallIsLight();
  }
  el.statusbar.classList.toggle('dark', darkText);
  el.homebar.classList.toggle('dark', darkText);
  if (NATIVE) nativeCall(() => NATIVE.setStatusBarStyle(darkText));
}

/* =========================================================================
   Home screen rendering
   ========================================================================= */
let editing = false;
let dragId = null;
let pageCap = 24;
let pageIndex = 0;

function iconUrl(app) { return app.iconData || app.icon; }

function makeIcon(id) {
  const app = getApp(id);
  if (!app) return null;
  const b = document.createElement('div');
  b.className = 'icon';
  b.dataset.id = id;
  b.tabIndex = 0;
  b.setAttribute('role', 'button');
  b.setAttribute('aria-label', app.name);
  if (app.system || app.locked) b.classList.add('locked');
  if (id === dragId) b.classList.add('ghost');
  const p = installing.get(id);
  if (p != null) { b.classList.add('installing'); b.style.setProperty('--p', p); }
  b.innerHTML = `<div class="glyph"><img alt="" draggable="false"><button class="badge-remove" aria-label="Remove ${esc(app.name)}" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button></div><div class="label"></div>`;
  b.querySelector('img').src = iconUrl(app);
  b.querySelector('.label').textContent = app.name;
  return b;
}

function measure() {
  const h = el.pages.clientHeight || 500;
  const cell = parseFloat(getComputedStyle(html).getPropertyValue('--icon')) + 36;
  const rows = Math.max(3, Math.floor(h / cell));
  const cellH = Math.floor(h / rows);
  el.pages.style.setProperty('--cell-h', Math.min(cellH, cell + 14) + 'px');
  pageCap = rows * 4;
}

function renderHome({ flip = false } = {}) {
  const before = flip ? snapshotRects() : null;
  measure();
  const n = Math.max(1, Math.ceil(state.home.length / pageCap) + (editing ? 1 : 0));
  pageIndex = Math.min(pageIndex, n - 1);
  el.pages.textContent = '';
  for (let p = 0; p < n; p++) {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.page = p;
    for (const id of state.home.slice(p * pageCap, (p + 1) * pageCap)) {
      const i = makeIcon(id);
      if (i) page.append(i);
    }
    el.pages.append(page);
  }
  el.dock.textContent = '';
  for (const id of state.dock) { const i = makeIcon(id); if (i) el.dock.append(i); }
  el.pages.scrollLeft = pageIndex * el.pages.clientWidth;
  renderDots();
  if (before) playFlip(before);
}

function renderDots() {
  const n = el.pages.children.length;
  el.dots.innerHTML = n > 1 ? Array.from({ length: n }, (_, i) => `<i class="${i === pageIndex ? 'on' : ''}"></i>`).join('') : '';
}
el.pages.addEventListener('scroll', () => {
  const i = Math.round(el.pages.scrollLeft / (el.pages.clientWidth || 1));
  if (i !== pageIndex) { pageIndex = i; renderDots(); }
}, { passive: true });
el.dots.addEventListener('click', e => {
  const i = [...el.dots.children].indexOf(e.target);
  if (i >= 0) goPage(i);
});
function goPage(i, smooth = true) {
  const n = el.pages.children.length;
  pageIndex = Math.max(0, Math.min(n - 1, i));
  el.pages.scrollTo({ left: pageIndex * el.pages.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  renderDots();
}

function snapshotRects() {
  const m = new Map();
  for (const i of $$('.icon', el.home)) m.set(i.dataset.id, i.getBoundingClientRect());
  return m;
}
function playFlip(before) {
  for (const i of $$('.icon', el.home)) {
    const a = before.get(i.dataset.id);
    if (!a) continue;
    const b = i.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (!dx && !dy) continue;
    if (Math.abs(dx) > 600 || Math.abs(dy) > 900) continue;
    i.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.25,1)' });
  }
}

function relayout() {
  if (!catalog.size) return;
  renderHome();
  if (inRecents) layoutRecents(false);
}
addEventListener('resize', () => requestAnimationFrame(relayout));

/* =========================================================================
   Edit mode, drag & drop
   ========================================================================= */
function enterEdit() {
  if (editing) return;
  editing = true;
  el.home.classList.add('editing');
  el.done.hidden = false;
  renderHome();
}
function exitEdit() {
  if (!editing) return;
  editing = false;
  el.home.classList.remove('editing');
  el.done.hidden = true;
  renderHome();
}
el.done.addEventListener('click', exitEdit);

function removeFromLayout(id) {
  state.home = state.home.filter(x => x !== id);
  state.dock = state.dock.filter(x => x !== id);
}

// move `id` to `list` at `index`; a full dock swaps with the target
function moveApp(id, list, index) {
  const from = state.dock.includes(id) ? 'dock' : 'home';
  const fromIdx = state[from].indexOf(id);
  if (list === 'dock' && from !== 'dock' && state.dock.length >= DOCK_MAX) {
    const ti = Math.min(index, state.dock.length - 1);
    const out = state.dock[ti];
    state.dock[ti] = id;
    state.home[fromIdx] = out;
    return;
  }
  state[from].splice(fromIdx, 1);
  index = Math.max(0, Math.min(index, state[list].length));
  state[list].splice(index, 0, id);
}

const drag = { float: null, offX: 0, offY: 0, lastTarget: null, lastMove: 0, edgeTimer: null, edgeDir: 0 };
function devRect() { return el.device.getBoundingClientRect(); }

function startDrag(press, x, y) {
  press.dragging = true;
  dragId = press.id;
  const r = press.el.getBoundingClientRect();
  const d = devRect();
  const f = press.el.cloneNode(true);
  f.classList.remove('pressed');
  f.classList.add('drag-float');
  f.style.width = r.width + 'px';
  f.style.height = r.height + 'px';
  drag.offX = x - r.left; drag.offY = y - r.top;
  f.style.left = r.left - d.left + 'px';
  f.style.top = r.top - d.top + 'px';
  el.device.append(f);
  drag.float = f;
  press.el.classList.add('ghost');
  drag.lastTarget = null;
}

function moveDrag(x, y) {
  const d = devRect();
  drag.float.style.left = x - drag.offX - d.left + 'px';
  drag.float.style.top = y - drag.offY - d.top + 'px';

  // page flipping near the screen edges
  const dir = x - d.left < 26 ? -1 : d.right - x < 26 ? 1 : 0;
  if (dir !== drag.edgeDir) {
    clearTimeout(drag.edgeTimer);
    drag.edgeDir = dir;
    if (dir) {
      const flipPage = () => {
        const n = el.pages.children.length;
        const target = pageIndex + dir;
        if (target >= 0 && target < n) goPage(target);
        drag.edgeTimer = setTimeout(flipPage, 700);
      };
      drag.edgeTimer = setTimeout(flipPage, 500);
    }
  }

  const now = performance.now();
  if (now - drag.lastMove < 120) return;
  const hit = document.elementFromPoint(x, y);
  if (!hit) return;
  const icon = hit.closest('.icon');
  const inDock = !!hit.closest('#dock');
  const inPages = !!hit.closest('#pages');
  el.dock.classList.toggle('drop', inDock);
  let list, index, key;
  if (icon && icon.dataset.id !== dragId && (inDock || inPages)) {
    list = inDock ? 'dock' : 'home';
    index = state[list].indexOf(icon.dataset.id);
    key = 'i:' + icon.dataset.id;
  } else if (inDock && !icon && !state.dock.includes(dragId) && state.dock.length < DOCK_MAX) {
    list = 'dock'; index = state.dock.length; key = 'dock-end';
  } else if (inPages && !icon) {
    const pageEl = hit.closest('.page');
    if (!pageEl) return;
    const p = +pageEl.dataset.page;
    const onPage = state.home.slice(p * pageCap, (p + 1) * pageCap).filter(i => i !== dragId);
    const last = onPage[onPage.length - 1];
    list = 'home';
    index = last ? state.home.indexOf(last) + (state.home.indexOf(dragId) > state.home.indexOf(last) || !state.home.includes(dragId) ? 1 : 0) : p * pageCap;
    key = 'p-end:' + p + ':' + onPage.length;
  } else return;
  if (key === drag.lastTarget) return;
  drag.lastTarget = key;
  drag.lastMove = now;
  const prev = JSON.stringify([state.home, state.dock]);
  moveApp(dragId, list, index);
  if (JSON.stringify([state.home, state.dock]) !== prev) {
    const sl = el.pages.scrollLeft;
    renderHome({ flip: true });
    el.pages.scrollLeft = sl;
  }
}

function endDrag() {
  clearTimeout(drag.edgeTimer);
  drag.edgeDir = 0;
  el.dock.classList.remove('drop');
  const f = drag.float;
  const target = $(`.icon[data-id="${CSS.escape(dragId)}"]`, el.home);
  const id = dragId;
  dragId = null;
  drag.float = null;
  save();
  if (!f) return;
  if (target) {
    const d = devRect(), r = target.getBoundingClientRect();
    const a = f.animate([{ left: f.style.left, top: f.style.top }, { left: r.left - d.left + 'px', top: r.top - d.top + 'px' }],
      { duration: 220, easing: 'cubic-bezier(.2,.9,.25,1)' });
    a.onfinish = () => { f.remove(); target.classList.remove('ghost'); };
  } else { f.remove(); }
  if (!target) renderHome();
  void id;
}

/* =========================================================================
   Home pointer handling (tap, long-press, drag, swipe gestures)
   ========================================================================= */
let press = null;
let vg = null; // vertical/horizontal gesture on empty home area

el.home.addEventListener('contextmenu', e => e.preventDefault());

el.home.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  const icon = e.target.closest('.icon');
  if (e.target.closest('.badge-remove') || e.target.closest('#edit-done')) return;
  const d = devRect();
  vg = { x: e.clientX, y: e.clientY, pid: e.pointerId, top: e.clientY - d.top < parseFloat(getComputedStyle(el.statusbar).height) + 24, icon: !!icon, mouse: e.pointerType === 'mouse', t: performance.now() };
  if (!icon) return;
  press = { id: icon.dataset.id, el: icon, x: e.clientX, y: e.clientY, pid: e.pointerId, long: false, dragging: false };
  icon.classList.add('pressed');
  press.timer = setTimeout(() => {
    if (!press) return;
    press.long = true;
    press.el.classList.remove('pressed');
    haptic();
    if (!editing) {
      enterEdit();
      // re-find the element after re-render
      press.el = $(`.icon[data-id="${CSS.escape(press.id)}"]`, el.home) || press.el;
    }
  }, editing ? 220 : 480);
});

addEventListener('pointermove', e => {
  if (press && e.pointerId === press.pid) {
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.dragging && Math.hypot(dx, dy) > 8) {
      if (editing) { clearTimeout(press.timer); press.el.classList.remove('pressed'); startDrag(press, press.x, press.y); vg = null; }
      else { cancelPress(); }
    }
    if (press?.dragging) { moveDrag(e.clientX, e.clientY); return; }
  }
  if (vg && e.pointerId === vg.pid && !editing) {
    const dx = e.clientX - vg.x, dy = e.clientY - vg.y;
    if (dy > 46 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      const fromTop = vg.top;
      vg = null;
      cancelPress();
      if (fromTop) { if (!(NATIVE && nativeCall(() => NATIVE.expandNotifications(), false))) openControl(); }
      else openSearch();
    }
  }
});

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.el.classList.remove('pressed');
  press = null;
}

addEventListener('pointerup', e => {
  if (vg && e.pointerId === vg.pid) {
    const dx = e.clientX - vg.x, dy = e.clientY - vg.y;
    // mouse users can drag horizontally to change pages
    if ((vg.mouse || editing) && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) goPage(pageIndex + (dx < 0 ? 1 : -1));
    else if (editing && !vg.icon && Math.hypot(dx, dy) < 8 && !e.target.closest('#edit-done')) exitEdit();
    vg = null;
  }
  if (!press || e.pointerId !== press.pid) return;
  const p = press;
  press = null;
  clearTimeout(p.timer);
  p.el.classList.remove('pressed');
  if (p.dragging) { endDrag(); return; }
  if (!p.long && !editing) launch(p.id, p.el);
});
addEventListener('pointercancel', e => {
  if (vg && e.pointerId === vg.pid) vg = null;
  if (!press || e.pointerId !== press.pid) return;
  if (press.dragging) { const p = press; press = null; clearTimeout(p.timer); endDrag(); }
  else cancelPress();
});
// stop the browser from scrolling while an icon is being dragged
document.addEventListener('touchmove', e => { if ((press && (press.dragging || editing)) || dragId) e.preventDefault(); }, { passive: false });

el.home.addEventListener('click', e => {
  const rm = e.target.closest('.badge-remove');
  if (rm) { e.stopPropagation(); askUninstall(rm.closest('.icon').dataset.id); }
});
el.home.addEventListener('keydown', e => {
  const icon = e.target.closest('.icon');
  if (icon && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); launch(icon.dataset.id, icon); }
});

/* =========================================================================
   Running apps (windows) and launch / close animations
   ========================================================================= */
const running = new Map(); // id -> { id, el, iframe, bar, last }
let current = null;
let animating = false;

function devSize() { return { W: el.device.clientWidth, H: el.device.clientHeight }; }
function deviceRadius() { return document.body.classList.contains('framed') ? 54 : 0; }

function iconRectFor(id) {
  // visible icon on the current page or dock, relative to the device
  const d = devRect();
  const cands = $$(`.icon[data-id="${CSS.escape(id)}"] .glyph`, el.home);
  for (const g of cands) {
    const r = g.getBoundingClientRect();
    if (r.width && r.left >= d.left - 2 && r.right <= d.right + 2) return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height };
  }
  return null;
}

// keyframe for a window "collapsed" into rect r
function collapsedFrame(r) {
  const { W, H } = devSize();
  const s = r.w / W;
  const hv = r.h / s;
  const inset = Math.max(0, (H - hv) / 2);
  const rad = (r.w * 0.27) / s;
  const tx = r.x + r.w / 2 - s * W / 2;
  const ty = r.y + r.h / 2 - s * H / 2;
  return { transform: `translate(${tx}px, ${ty}px) scale(${s})`, clipPath: `inset(${inset}px 0px round ${rad}px)` };
}
function fullFrame() {
  return { transform: 'translate(0px, 0px) scale(1)', clipPath: `inset(0px 0px round ${deviceRadius()}px)` };
}

function createWindow(id) {
  const app = getApp(id);
  const w = document.createElement('div');
  w.className = 'window';
  w.dataset.id = id;
  w.innerHTML = `<div class="splash"><img alt=""></div><img class="zoom-icon" alt="" style="position:absolute;left:0;width:100%;z-index:3;pointer-events:none;opacity:0">`;
  w.querySelector('.splash img').src = iconUrl(app);
  w.querySelector('.zoom-icon').src = iconUrl(app);
  if (app.background) w.style.background = app.background;
  if (app.background) w.querySelector('.splash').style.setProperty('--splash', app.background);
  else w.querySelector('.splash').style.setProperty('--splash', 'var(--surface-solid)');
  const f = document.createElement('iframe');
  f.title = app.name;
  f.allow = 'camera; microphone; geolocation; fullscreen; clipboard-read; clipboard-write; autoplay; accelerometer; gyroscope; magnetometer; screen-wake-lock';
  f.src = app.entry;
  f.addEventListener('load', () => { w.classList.add('loaded'); sendEnv(rec); });
  w.append(f);
  el.windows.append(w);
  const rec = { id, el: w, iframe: f, bar: app.statusBar || null, last: Date.now() };
  running.set(id, rec);
  // keep memory in check
  if (running.size > MAX_RUNNING) {
    const oldest = [...running.values()].filter(r => r.id !== id).sort((a, b) => a.last - b.last)[0];
    if (oldest) killApp(oldest.id);
  }
  return rec;
}

function zoomIconFrames(r, opening) {
  const { W, H } = devSize();
  const hv = r.h / (r.w / W);
  const top = (H - hv) / 2;
  return { top: top + 'px', height: hv + 'px', op: opening ? [1, 0] : [0, 1] };
}

function launch(id, fromEl) {
  const app = getApp(id);
  if (!app || animating) return;
  if (installing.has(id)) return;
  if (app.native) { launchNative(app, fromEl); return; }
  if (app.webclip) { if (NATIVE) NATIVE.openUrl(app.url); else window.open(app.url, '_blank', 'noopener'); return; }
  closeSearch(true);
  closeControl();
  if (inRecents) exitRecents();
  if (current && current !== id) suspend(current);
  let rec = running.get(id);
  if (!rec) rec = createWindow(id);
  rec.last = Date.now();
  rec.el.classList.remove('bg');
  rec.el.style.zIndex = 10;
  for (const r of running.values()) if (r !== rec) r.el.style.zIndex = 1;
  current = id;
  el.device.classList.add('app-open');
  notifyVisibility(rec, true);
  updateChrome();
  let r = fromEl ? (() => { const g = fromEl.querySelector('.glyph') || fromEl; const b = g.getBoundingClientRect(), d = devRect(); return { x: b.left - d.left, y: b.top - d.top, w: b.width, h: b.height }; })() : iconRectFor(id);
  const { W, H } = devSize();
  if (!r) r = { x: W / 2 - 30, y: H / 2 - 30, w: 60, h: 60 };
  animating = true;
  const zi = rec.el.querySelector('.zoom-icon');
  const z = zoomIconFrames(r, true);
  zi.style.top = z.top; zi.style.height = z.height;
  zi.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'none' });
  const a = rec.el.animate([collapsedFrame(r), fullFrame()], { duration: 460, easing: 'cubic-bezier(.2,.95,.25,1)' });
  rec.el.style.transform = ''; rec.el.style.clipPath = '';
  a.onfinish = a.oncancel = () => { animating = false; };
  setTimeout(() => { animating = false; }, 600);
}

function launchNative(app, fromEl) {
  const g = fromEl ? (fromEl.querySelector('.glyph') || fromEl) : $(`.icon[data-id="${CSS.escape(app.id)}"] .glyph`, el.home);
  const r = g?.getBoundingClientRect();
  const k = devicePixelRatio || 1;
  if (r && r.width) NATIVE.launch(app.pkg, app.cls, Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k));
  else NATIVE.launch(app.pkg, app.cls, 0, 0, 0, 0);
  setTimeout(() => closeSearch(true), 300);
}

function suspend(id) {
  const rec = running.get(id);
  if (!rec) return;
  rec.el.classList.add('bg');
  notifyVisibility(rec, false);
}

// animate current app back to its icon
function goHome({ from = null } = {}) {
  if (inRecents) { exitRecents(); return; }
  if (!current) { closeSearch(); closeControl(); exitEdit(); return; }
  const rec = running.get(current);
  const id = current;
  current = null;
  el.device.classList.remove('app-open');
  updateChrome();
  const r = iconRectFor(id);
  const { W, H } = devSize();
  const start = from || fullFrame();
  let end, zi = rec.el.querySelector('.zoom-icon');
  if (r) {
    end = collapsedFrame(r);
    const z = zoomIconFrames(r, false);
    zi.style.top = z.top; zi.style.height = z.height;
    zi.animate([{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: 1 }], { duration: 420, easing: 'ease-in' });
  } else {
    end = { transform: `translate(${W * .3}px, ${H * .3}px) scale(.4)`, clipPath: 'inset(0px round 60px)', opacity: 0 };
  }
  const a = rec.el.animate([{ ...start, opacity: 1 }, { opacity: 1, ...end }], { duration: 420, easing: 'cubic-bezier(.25,.9,.3,1)' });
  rec.el.style.transform = ''; rec.el.style.clipPath = '';
  a.onfinish = () => { if (current !== id && !inRecents) { rec.el.classList.add('bg'); notifyVisibility(rec, false); } };
}

function killApp(id) {
  const rec = running.get(id);
  if (!rec) return;
  rec.el.remove();
  running.delete(id);
  if (current === id) { current = null; el.device.classList.remove('app-open'); updateChrome(); }
}

function notifyVisibility(rec, visible) {
  try { rec.iframe.contentWindow?.postMessage({ type: 'allo:visibility', visible }, '*'); } catch {}
}

/* =========================================================================
   Home bar gesture: swipe up = home, swipe up & hold = recents
   ========================================================================= */
let hb = null;
el.homebar.addEventListener('pointerdown', e => {
  if (animating) return;
  el.homebar.setPointerCapture(e.pointerId);
  hb = { y: e.clientY, x: e.clientX, t: performance.now(), lastY: e.clientY, lastT: performance.now(), still: performance.now(), dy: 0, dx: 0, moved: false };
  if (current) running.get(current).el.classList.add('gesture');
});
el.homebar.addEventListener('pointermove', e => {
  if (!hb) return;
  const now = performance.now();
  const dy = Math.max(0, hb.y - e.clientY), dx = e.clientX - hb.x;
  if (Math.abs(e.clientY - hb.lastY) > 2) hb.still = now;
  hb.vy = (hb.lastY - e.clientY) / Math.max(1, now - hb.lastT);
  hb.lastY = e.clientY; hb.lastT = now; hb.dy = dy; hb.dx = dx;
  if (dy > 4) hb.moved = true;
  if (current && hb.moved) {
    const rec = running.get(current);
    const { W, H } = devSize();
    const p = Math.min(1, dy / (H * 0.6));
    const s = 1 - p * 0.5;
    const tx = (W - W * s) / 2 + dx * 0.6;
    const ty = (H - H * s) * 0.75 - dy * 0.35;
    const f = { transform: `translate(${tx}px, ${ty}px) scale(${s})`, clipPath: `inset(0px round ${Math.max(deviceRadius(), 24 + p * 40) / 1}px)` };
    rec.el.style.transform = f.transform;
    rec.el.style.clipPath = f.clipPath;
    hb.frame = f;
    el.device.classList.toggle('peek', p > 0.05);
  }
});
function hbEnd(e) {
  if (!hb) return;
  const g = hb; hb = null;
  const now = performance.now();
  const held = now - g.still > 160;
  const rec = current && running.get(current);
  rec?.el.classList.remove('gesture');
  if (!g.moved) { // tap on the bar
    if (current) goHome(); else if (editing) exitEdit();
    return;
  }
  if (!current) {
    if (g.dy > 60 && running.size) enterRecents(); else if (g.dy > 40) { closeSearch(); closeControl(); exitEdit(); }
    return;
  }
  if (g.dy > 110 && held) { enterRecents(g.frame); return; }
  if (g.dy > 70 || (g.vy || 0) > 0.6) { goHome({ from: g.frame }); return; }
  // snap back
  const a = rec.el.animate([g.frame || fullFrame(), fullFrame()], { duration: 300, easing: 'cubic-bezier(.2,.9,.25,1)' });
  rec.el.style.transform = ''; rec.el.style.clipPath = '';
  void a;
}
el.homebar.addEventListener('pointerup', hbEnd);
el.homebar.addEventListener('pointercancel', hbEnd);

/* =========================================================================
   Recents
   ========================================================================= */
let inRecents = false;
let recOffset = 0;   // horizontal scroll in px
let recOrder = [];

function recentsGeometry() {
  const { W, H } = devSize();
  const s = 0.64;
  const cw = W * s;
  const gap = 18;
  return { W, H, s, cw, step: cw + gap, y: (H - H * s) / 2 - 6 };
}
function layoutRecents(animate = true) {
  const g = recentsGeometry();
  const n = recOrder.length;
  const maxOff = 0, minOff = -(n - 1) * g.step;
  recOffset = Math.max(minOff - 40, Math.min(maxOff + 40, recOffset));
  recOrder.forEach((id, i) => {
    const rec = running.get(id);
    if (!rec) return;
    const pos = (n - 1 - i) * -g.step + recOffset * -1; // most recent on the right
    const x = (g.W - g.cw) / 2 + pos;
    rec.el.style.transition = animate ? 'transform .42s cubic-bezier(.2,.9,.25,1), opacity .3s' : 'none';
    rec.el.style.transform = `translate(${x}px, ${g.y}px) scale(${g.s})`;
    rec.el.style.clipPath = `inset(0px round ${26 / g.s}px)`;
    rec.el.style.opacity = '1';
    rec.el.style.zIndex = 10 + i;
    let lab = el.recents.querySelector(`.rlabel[data-id="${CSS.escape(id)}"]`);
    if (!lab) {
      const app = getApp(id);
      lab = document.createElement('div');
      lab.className = 'rlabel'; lab.dataset.id = id;
      lab.innerHTML = '<img alt=""><span></span>';
      lab.querySelector('img').src = iconUrl(app);
      lab.querySelector('span').textContent = app.name;
      el.recents.append(lab);
    }
    lab.style.width = g.cw + 'px';
    lab.style.transition = rec.el.style.transition;
    lab.style.transform = `translate(${x}px, ${g.y - 42}px)`;
  });
  for (const lab of $$('.rlabel', el.recents)) if (!recOrder.includes(lab.dataset.id)) lab.remove();
  $('#recents-empty').hidden = n > 0;
  $('#recents-clear').hidden = n === 0;
}
function enterRecents(fromFrame) {
  if (inRecents) return;
  inRecents = true;
  recOrder = [...running.values()].sort((a, b) => a.last - b.last).map(r => r.id);
  recOffset = 0;
  if (current) { const r = running.get(current); if (fromFrame) { r.el.style.transform = fromFrame.transform; } current = null; }
  closeSearch(true); closeControl(); exitEdit();
  el.device.classList.remove('app-open');
  el.device.classList.add('recents');
  el.recents.hidden = false;
  for (const id of recOrder) running.get(id).el.classList.remove('bg');
  requestAnimationFrame(() => layoutRecents(true));
  updateChrome();
}
function exitRecents(openId = null) {
  if (!inRecents) return;
  inRecents = false;
  el.device.classList.remove('recents');
  el.recents.hidden = true;
  for (const lab of $$('.rlabel', el.recents)) lab.remove();
  for (const id of recOrder) {
    const rec = running.get(id);
    if (!rec) continue;
    if (id === openId) continue;
    rec.el.style.transition = 'transform .35s cubic-bezier(.2,.9,.25,1), opacity .25s';
    rec.el.style.opacity = '0';
    rec.el.style.transform += ' translateY(40px)';
    setTimeout(() => { if (current !== id) { rec.el.classList.add('bg'); clearInline(rec.el); notifyVisibility(rec, false); } }, 360);
  }
  if (openId) {
    const rec = running.get(openId);
    rec.el.style.transition = 'transform .4s cubic-bezier(.2,.95,.25,1), clip-path .4s';
    rec.el.style.transform = 'translate(0px, 0px) scale(1)';
    rec.el.style.clipPath = `inset(0px round ${deviceRadius()}px)`;
    rec.el.style.zIndex = 50;
    rec.last = Date.now();
    current = openId;
    el.device.classList.add('app-open');
    notifyVisibility(rec, true);
    setTimeout(() => { if (current === openId) clearInline(rec.el); }, 420);
  }
  recOrder = [];
  updateChrome();
}
function clearInline(w) { w.style.transition = ''; w.style.transform = ''; w.style.clipPath = ''; w.style.opacity = ''; }

let rg = null;
el.windows.addEventListener('pointerdown', e => {
  if (!inRecents) return;
  const w = e.target.closest('.window');
  rg = { x: e.clientX, y: e.clientY, off: recOffset, w, id: w?.dataset.id, mode: null, pid: e.pointerId };
  el.windows.setPointerCapture(e.pointerId);
});
el.windows.addEventListener('pointermove', e => {
  if (!rg || !inRecents) return;
  const dx = e.clientX - rg.x, dy = e.clientY - rg.y;
  if (!rg.mode && Math.hypot(dx, dy) > 8) rg.mode = rg.w && dy < 0 && Math.abs(dy) > Math.abs(dx) ? 'dismiss' : 'scroll';
  if (rg.mode === 'scroll') { recOffset = rg.off - dx; layoutRecents(false); }
  if (rg.mode === 'dismiss') {
    const rec = running.get(rg.id);
    const g = recentsGeometry();
    const base = rec.el.style.transform.replace(/translate\(([^,]+), [^)]+\)/, (m, x) => `translate(${x}, ${g.y + Math.min(0, dy)}px)`);
    rec.el.style.transition = 'none';
    rec.el.style.transform = base;
    rec.el.style.opacity = String(1 + Math.min(0, dy) / 500);
  }
});
function rgEnd(e) {
  if (!rg) return;
  const g = rg; rg = null;
  const dy = e.clientY - g.y;
  if (!g.mode) {
    if (g.w) exitRecents(g.id); else exitRecents();
    return;
  }
  if (g.mode === 'scroll') {
    const geo = recentsGeometry();
    recOffset = Math.round(recOffset / geo.step) * geo.step;
    layoutRecents(true);
  } else if (g.mode === 'dismiss') {
    if (dy < -110) {
      const rec = running.get(g.id);
      rec.el.style.transition = 'transform .3s ease-in, opacity .3s';
      rec.el.style.transform = rec.el.style.transform.replace(/translate\(([^,]+), [^)]+\)/, (m, x) => `translate(${x}, -100%)`);
      rec.el.style.opacity = '0';
      setTimeout(() => {
        killApp(g.id);
        recOrder = recOrder.filter(i => i !== g.id);
        if (!recOrder.length) exitRecents(); else layoutRecents(true);
      }, 280);
    } else layoutRecents(true);
  }
}
el.windows.addEventListener('pointerup', rgEnd);
el.windows.addEventListener('pointercancel', rgEnd);
el.recents.addEventListener('click', e => { if (e.target === el.recents || e.target.id === 'recents-empty') exitRecents(); });
$('#recents-clear').addEventListener('click', () => {
  for (const id of [...running.keys()]) killApp(id);
  recOrder = [];
  exitRecents();
});

/* =========================================================================
   Search
   ========================================================================= */
function openSearch() {
  if (current || locked) return;
  el.search.hidden = false;
  el.device.classList.add('searching');
  el.searchInput.value = '';
  renderSearch();
  setTimeout(() => el.searchInput.focus(), 60);
  updateChrome();
}
function closeSearch(instant) {
  if (el.search.hidden) return;
  el.search.hidden = true;
  el.device.classList.remove('searching');
  el.searchInput.blur();
  updateChrome();
  void instant;
}
function renderSearch() {
  const q = el.searchInput.value.trim().toLowerCase();
  const ids = state.installed.filter(id => { const a = getApp(id); return a && (!q || a.name.toLowerCase().includes(q)); })
    .sort((a, b) => getApp(a).name.localeCompare(getApp(b).name));
  el.searchResults.textContent = '';
  for (const id of ids) { const i = makeIcon(id); if (i) el.searchResults.append(i); }
  if (!ids.length) el.searchResults.innerHTML = `<div class="empty">No apps found.${NATIVE ? '' : ' Try the App Store.'}</div>`;
  if (NATIVE && q) {
    const b = document.createElement('button');
    b.className = 'play-search';
    b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span></span>';
    b.querySelector('span').textContent = `Search Google Play for “${el.searchInput.value.trim()}”`;
    b.onclick = e => { e.stopPropagation(); NATIVE.openPlay(el.searchInput.value.trim()); };
    el.searchResults.append(b);
  }
}
el.searchInput.addEventListener('input', renderSearch);
el.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const f = $('.icon', el.searchResults); if (f) launch(f.dataset.id, f); }
});
$('#search-cancel').addEventListener('click', () => closeSearch());
el.search.addEventListener('click', e => {
  const icon = e.target.closest('.icon');
  if (icon) launch(icon.dataset.id, icon);
  else if (e.target === el.search || e.target === el.searchResults) closeSearch();
});

/* =========================================================================
   Control center
   ========================================================================= */
function openControl() {
  if (locked) return;
  el.control.hidden = false;
  el.device.classList.add('cc-open');
  updateControl();
  updateChrome();
}
function closeControl() {
  if (el.control.hidden) return;
  el.control.hidden = true;
  el.device.classList.remove('cc-open');
  updateChrome();
}
function updateControl() {
  const dark = resolvedTheme() === 'dark';
  $('#cc-dark').classList.toggle('on', dark);
  $('#cc-dark-sub').textContent = dark ? 'On' : 'Off';
  const fs = !!document.fullscreenElement;
  $('#cc-full').classList.toggle('on', fs);
  $('#cc-full-sub').textContent = fs ? 'On' : 'Off';
  $('#cc-full').hidden = !document.documentElement.requestFullscreen || html.classList.contains('ios-standalone');
}
document.addEventListener('fullscreenchange', updateControl);
let ccg = null;
el.control.addEventListener('pointerdown', e => { ccg = { y: e.clientY, x: e.clientX, onPanel: !!e.target.closest('.cc-tile, .cc-slider, .cc-gear') }; });
el.control.addEventListener('pointerup', e => {
  if (!ccg) return;
  const dy = e.clientY - ccg.y;
  if (dy < -40) closeControl();
  else if (!ccg.onPanel && Math.abs(dy) < 8 && !e.target.closest('.cc-panel > *')) closeControl();
  ccg = null;
});
$('#cc-dark').addEventListener('click', () => { setSetting('theme', resolvedTheme() === 'dark' ? 'light' : 'dark'); });
$('#cc-full').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await html.requestFullscreen({ navigationUI: 'hide' }); } catch {}
});
$('#cc-lock').addEventListener('click', () => { closeControl(); lock(); });
$('#cc-settings').addEventListener('click', () => { closeControl(); launch('settings'); });
const bright = $('#cc-bright');
bright.addEventListener('input', () => { el.dim.style.opacity = String((100 - bright.value) / 100 * 0.85); });

/* =========================================================================
   Lock screen
   ========================================================================= */
let locked = true;
function lock() {
  if (current) suspend(current);
  const keep = current;
  locked = true;
  el.device.classList.add('locked');
  el.lock.style.transform = ''; el.lock.style.opacity = '';
  closeSearch(true); closeControl(); exitEdit();
  if (inRecents) exitRecents();
  if (keep) { current = keep; }
  updateChrome();
}
function unlock() {
  locked = false;
  el.device.classList.remove('locked');
  $('#lock-notes').textContent = '';
  el.lock.style.transform = ''; el.lock.style.opacity = '';
  if (current) { const rec = running.get(current); rec.el.classList.remove('bg'); notifyVisibility(rec, true); }
  updateChrome();
}
let lg = null;
el.lock.addEventListener('pointerdown', e => {
  lg = { y: e.clientY, t: performance.now(), lastY: e.clientY, lastT: performance.now(), v: 0 };
  el.lock.setPointerCapture(e.pointerId);
  el.lock.style.transition = 'none';
});
el.lock.addEventListener('pointermove', e => {
  if (!lg) return;
  const now = performance.now();
  lg.v = (lg.lastY - e.clientY) / Math.max(1, now - lg.lastT);
  lg.lastY = e.clientY; lg.lastT = now;
  const dy = Math.min(0, e.clientY - lg.y);
  el.lock.style.transform = `translateY(${dy}px)`;
  el.lock.style.opacity = String(1 + dy / (devSize().H * 0.7));
});
function lgEnd(e) {
  if (!lg) return;
  const dy = e.clientY - lg.y;
  const v = lg.v;
  lg = null;
  el.lock.style.transition = '';
  if (dy < -devSize().H * 0.18 || (v > 0.5 && dy < -30) || (Math.abs(dy) < 6 && e.pointerType === 'mouse' && false)) unlock();
  else { el.lock.style.transform = ''; el.lock.style.opacity = ''; }
}
el.lock.addEventListener('pointerup', lgEnd);
el.lock.addEventListener('pointercancel', lgEnd);

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (state.setup && state.settings.autoLock && hiddenAt && Date.now() - hiddenAt > 60_000) lock();
});

/* =========================================================================
   Toasts & dialogs
   ========================================================================= */
function toast({ title, body = '', icon = null, appId = null }) {
  const app = appId && getApp(appId);
  const src = icon || (app ? iconUrl(app) : 'icons/icon.svg');
  if (locked) {
    const n = document.createElement('div');
    n.className = 'lock-note';
    n.innerHTML = `<img alt=""><div><b></b><span></span></div>`;
    n.querySelector('img').src = src;
    n.querySelector('b').textContent = title;
    n.querySelector('span').textContent = body;
    $('#lock-notes').prepend(n);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<img alt=""><div><b></b><span></span></div>`;
  t.querySelector('img').src = src;
  t.querySelector('b').textContent = title;
  t.querySelector('span').textContent = body;
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  t.addEventListener('click', () => { kill(); if (appId && !locked) launch(appId); });
  el.toasts.append(t);
  setTimeout(kill, 4200);
  navigator.vibrate?.([10, 40, 10]);
}

function dialog({ icon, title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const bd = document.createElement('div'); bd.className = 'dialog-backdrop';
    const d = document.createElement('div'); d.className = 'dialog';
    d.setAttribute('role', 'alertdialog');
    d.innerHTML = `${icon ? '<img alt="">' : ''}<h3></h3><p></p><div class="row">${cancel ? '<button data-v="0"></button>' : ''}<button data-v="1" class="${danger ? 'danger' : 'primary'}"></button></div>`;
    if (icon) d.querySelector('img').src = icon;
    d.querySelector('h3').textContent = title;
    d.querySelector('p').textContent = text;
    if (cancel) d.querySelector('[data-v="0"]').textContent = cancel;
    d.querySelector('[data-v="1"]').textContent = ok;
    const done = v => { bd.classList.add('out'); d.classList.add('out'); setTimeout(() => { bd.remove(); d.remove(); }, 200); resolve(v); };
    bd.onclick = () => done(false);
    d.onclick = e => { const b = e.target.closest('button'); if (b) done(b.dataset.v === '1'); };
    el.dialogs.append(bd, d);
    d.querySelector('.primary, .danger').focus();
  });
}

/* =========================================================================
   Package manager
   ========================================================================= */
const hasCaches = 'caches' in self;
const cacheName = id => 'allo-app-' + id;

function appFiles(app) {
  return [...new Set([app.entry, app.icon, ...(app.files || [])].filter(f => f && !f.startsWith('data:')))];
}

async function installApp(id) {
  const app = getApp(id);
  if (!app) throw new Error('Unknown app');
  if (isInstalled(id) || installing.has(id)) return;
  installing.set(id, 0);
  state.home.push(id);
  renderHome();
  broadcast('install', { id, progress: 0 });
  const files = app.webclip ? [] : appFiles(app);
  const t0 = performance.now();
  let done = 0;
  try {
    const cache = hasCaches ? await caches.open(cacheName(id)) : null;
    for (const f of files) {
      try {
        if (cache) {
          let res = await fetch(f, { cache: 'no-cache' }).catch(() => null);
          if (!res) res = await fetch(f, { mode: 'no-cors' });
          if (res && (res.ok || res.type === 'opaque')) await cache.put(f, res);
        }
      } catch (e) { console.warn('install: could not fetch', f, e); }
      done++;
      setProgress(id, Math.round(done / Math.max(1, files.length) * 90));
    }
    // a short minimum so the progress ring is visible
    const rest = 700 - (performance.now() - t0);
    for (let p = 90; p <= 100; p += 5) { setProgress(id, p); await sleep(Math.max(0, rest) / 3); }
  } finally {
    installing.delete(id);
  }
  state.installed.push(id);
  save();
  renderHome();
  broadcast('install', { id, progress: 100, done: true });
}
function setProgress(id, p) {
  installing.set(id, p);
  for (const i of $$(`.icon[data-id="${CSS.escape(id)}"]`)) i.style.setProperty('--p', p);
  broadcast('install', { id, progress: p });
}

async function uninstallApp(id) {
  const app = getApp(id);
  if (app?.native) { if (!app.locked) NATIVE.uninstall(app.pkg); return; }
  if (!app || app.system) throw new Error('This app cannot be removed');
  killApp(id);
  state.installed = state.installed.filter(x => x !== id);
  removeFromLayout(id);
  if (hasCaches) await caches.delete(cacheName(id)).catch(() => {});
  try {
    const prefix = `app.${id}.`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  } catch {}
  try { indexedDB.deleteDatabase('app.' + id); } catch {}
  if (state.external[id]) delete state.external[id];
  save();
  renderHome({ flip: true });
  if (!el.search.hidden) renderSearch();
}

async function askUninstall(id) {
  const app = getApp(id);
  if (app?.native) { if (!app.locked) NATIVE.uninstall(app.pkg); return; }
  if (!app || app.system) return;
  const ok = await dialog({ icon: iconUrl(app), title: `Remove “${app.name}”?`, text: 'The app and its data will be deleted from this device.', ok: 'Remove', danger: true });
  if (ok) uninstallApp(id);
}

// Install a third-party app from a manifest URL, or add any website as a web app.
async function installFromUrl(input) {
  let url;
  try { url = new URL(input.includes('://') ? input : 'https://' + input, location.href); }
  catch { throw new Error('That doesn’t look like a valid address'); }
  let manifest = null;
  try {
    const res = await fetch(url.href, { cache: 'no-cache' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && (type.includes('json') || url.pathname.endsWith('.json'))) manifest = await res.json();
  } catch {}
  let app;
  if (manifest && manifest.name && (manifest.entry || manifest.start_url)) {
    const abs = p => p ? new URL(p, url.href).href : p;
    const icon = manifest.icon || manifest.icons?.slice().sort((a, b) => parseInt(b.sizes) - parseInt(a.sizes))[0]?.src;
    app = {
      id: 'ext.' + slug(manifest.id || manifest.name) + '.' + hash(url.href),
      name: String(manifest.short_name || manifest.name).slice(0, 24),
      description: manifest.description || '',
      version: manifest.version || '1.0',
      developer: manifest.developer || url.host,
      entry: abs(manifest.entry || manifest.start_url),
      icon: icon ? abs(icon) : letterIcon(manifest.name, manifest.color || manifest.theme_color),
      files: (manifest.files || []).map(abs),
      background: manifest.background || null,
      category: manifest.category || 'Utilities',
      external: true
    };
    // Standard web app manifests are for regular websites, which usually refuse to run inside other pages.
    if (!manifest.entry && manifest.start_url) app.webclip = true, app.url = app.entry;
  } else {
    const name = url.hostname.replace(/^www\./, '').split('.')[0];
    app = {
      id: 'web.' + slug(url.hostname) + '.' + hash(url.href),
      name: name.charAt(0).toUpperCase() + name.slice(1),
      description: url.href, developer: url.host, version: 'Web',
      webclip: true, url: url.href, entry: url.href,
      icon: letterIcon(name, null), category: 'Web', external: true
    };
  }
  if (isInstalled(app.id)) throw new Error(`${app.name} is already installed`);
  state.external[app.id] = app;
  await installApp(app.id);
  return { id: app.id, name: app.name };
}

function letterIcon(name, color) {
  const palette = ['#2f7cf6', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#00b5c8', '#5856d6', '#ff6b3d'];
  const c = color || palette[hash(name) % palette.length];
  const ch = (name || '?').trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".82"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="67" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="50" font-weight="600" fill="#fff" text-anchor="middle">${esc(ch)}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* =========================================================================
   Settings
   ========================================================================= */
function setSetting(key, value) {
  if (!(key in DEFAULTS.settings)) throw new Error('Unknown setting');
  state.settings[key] = value;
  if (key === 'theme' || key === 'accent') applyTheme();
  if (key === 'wallpaper') applyWallpaper();
  if (key === 'clock24') tick();
  save();
}

async function setCustomWallpaper(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('Not an image');
  const { url, light } = await shrinkImage(dataUrl);
  try { localStorage.setItem(WALL_KEY, url); }
  catch { throw new Error('The image is too large to store'); }
  state.settings.wallLight = light;
  setSetting('wallpaper', 'custom');
}
function shrinkImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // average brightness of the top half decides text colour
      const sample = ctx.getImageData(0, 0, c.width, Math.max(1, Math.round(c.height / 2))).data;
      let sum = 0, n = 0;
      for (let i = 0; i < sample.length; i += 4 * 64) { sum += 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2]; n++; }
      resolve({ url: c.toDataURL('image/jpeg', 0.84), light: sum / n > 175 });
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

async function resetAll() {
  for (const id of [...running.keys()]) killApp(id);
  if (hasCaches) for (const k of await caches.keys()) if (k.startsWith('allo-app-')) await caches.delete(k);
  try { localStorage.clear(); } catch {}
  try { indexedDB.deleteDatabase('allo-media'); } catch {}
  location.reload();
}

/* =========================================================================
   App <-> system messaging
   ========================================================================= */
function insets() {
  return { top: Math.round(el.statusbar.getBoundingClientRect().height), bottom: Math.round(el.homebar.getBoundingClientRect().height) };
}
function sendEnv(rec) {
  if (!rec) return;
  try {
    rec.iframe.contentWindow?.postMessage({
      type: 'allo:env', appId: rec.id, theme: resolvedTheme(), accent: state.settings.accent,
      insets: insets(), clock24: state.settings.clock24, visible: current === rec.id
    }, '*');
  } catch {}
}
function broadcast(name, data) {
  for (const rec of running.values()) {
    const app = getApp(rec.id);
    if (!app?.system) continue;
    try { rec.iframe.contentWindow?.postMessage({ type: 'allo:event', name, data }, '*'); } catch {}
  }
}
function publicState() {
  const list = id => { const a = getApp(id); return a && { ...a, installed: isInstalled(id) }; };
  return {
    version: VERSION,
    settings: { ...state.settings },
    wallpapers: [
      ...(NATIVE ? [{ id: 'system', name: 'Phone', css: 'linear-gradient(160deg,#8e9aaf,#4b5568)', light: false }] : []),
      ...WALLPAPERS.map(w => ({ id: w.id, name: w.name, css: w.css, light: !!w.light }))
    ],
    native: !!NATIVE,
    isDefaultHome: NATIVE ? nativeCall(() => NATIVE.isDefaultHome(), false) : false,
    nativeVersion: NATIVE ? nativeCall(() => NATIVE.version(), '') : '',
    customWallpaper: state.settings.wallpaper === 'custom' ? (() => { try { return localStorage.getItem(WALL_KEY); } catch { return null; } })() : null,
    catalog: [...catalog.keys()].map(list),
    installed: state.installed.map(list).filter(Boolean),
    installing: Object.fromEntries(installing),
    standalone: !!NATIVE || isStandalone(),
    canPromptInstall: !!installPrompt,
    platform: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop',
    running: [...running.keys()],
    base: BASE
  };
}

const API = {
  openPlay: Object.assign(q => { if (!NATIVE) { window.open('https://play.google.com/store/search?c=apps&q=' + encodeURIComponent(q || '')); return; } NATIVE.openPlay(String(q || '')); }, { system: true }),
  appInfo: Object.assign(id => { const a = getApp(id); if (a?.native) NATIVE.appInfo(a.pkg); }, { system: true }),
  setDefaultHome: Object.assign(() => NATIVE && NATIVE.requestDefaultHome(), { system: true }),
  openPhoneSettings: Object.assign(() => NATIVE && NATIVE.openSettings(), { system: true }),
  saveImage: (dataUrl) => NATIVE ? NATIVE.saveImage(String(dataUrl)) : false,
  haptic: (kind) => haptic(kind),
  notify(opts, app) { toast({ title: String(opts?.title || app.name).slice(0, 80), body: String(opts?.body || '').slice(0, 200), appId: app.id }); },
  open(id) { if (!isInstalled(id)) throw new Error('App not installed'); setTimeout(() => launch(id), 0); },
  close() { goHome(); },
  setStatusBar(style, app) { const rec = running.get(app.id); if (rec) { rec.bar = style === 'light' ? 'light' : style === 'dark' ? 'dark' : null; updateChrome(); } },
  getState: Object.assign(() => publicState(), { system: true }),
  setSetting: Object.assign((k, v) => setSetting(k, v), { system: true }),
  setWallpaperImage: Object.assign(d => setCustomWallpaper(d), { system: true }),
  install: Object.assign(id => installApp(id), { system: true }),
  installFromUrl: Object.assign(url => installFromUrl(url), { system: true }),
  uninstall: Object.assign(async id => {
    const app = getApp(id);
    if (app?.native) { await uninstallApp(id); return false; }
    const ok = await dialog({ icon: app && iconUrl(app), title: `Remove “${app?.name}”?`, text: 'The app and its data will be deleted from this device.', ok: 'Remove', danger: true });
    if (ok) await uninstallApp(id);
    return ok;
  }, { system: true }),
  lock: Object.assign(() => lock(), { system: true }),
  promptInstall: Object.assign(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const r = await installPrompt.userChoice;
    installPrompt = null;
    return r.outcome === 'accepted';
  }, { system: true }),
  storageEstimate: Object.assign(async () => (navigator.storage?.estimate ? navigator.storage.estimate() : null), { system: true }),
  reset: Object.assign(async () => {
    const ok = await dialog({ title: 'Erase all content?', text: 'All apps, settings and data on this device will be removed. allo OS will restart.', ok: 'Erase', danger: true });
    if (ok) await resetAll();
    return ok;
  }, { system: true })
};

addEventListener('message', async e => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  const rec = [...running.values()].find(r => r.iframe.contentWindow === e.source);
  if (!rec) return;
  if (d.type === 'allo:ready') { sendEnv(rec); return; }
  if (d.type === 'allo:home') { goHome(); return; }
  if (d.type !== 'allo:call') return;
  const app = getApp(rec.id);
  const reply = msg => { try { e.source.postMessage({ type: 'allo:reply', id: d.id, ...msg }, '*'); } catch {} };
  try {
    const fn = Object.hasOwn(API, d.method) ? API[d.method] : null;
    if (!fn) throw new Error('Unknown method: ' + d.method);
    if (fn.system && !app.system) throw new Error('Permission denied');
    const args = Array.isArray(d.args) ? d.args : [];
    const result = await fn(...args, app);
    reply({ ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) });
  } catch (err) {
    reply({ ok: false, error: err?.message || String(err) });
  }
});

/* =========================================================================
   Keyboard
   ========================================================================= */
addEventListener('keydown', e => {
  if (locked && state.setup && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) { unlock(); return; }
  if (e.key === 'Escape') back();
  if (!current && !locked && el.search.hidden && e.key === '/' ) { e.preventDefault(); openSearch(); }
});

/* =========================================================================
   First-run setup
   ========================================================================= */
let setupRefresh = () => {};
function runSetup() {
  el.setup.hidden = false;
  el.device.classList.add('setup');
  updateChrome();
  const steps = [
    () => `<div class="step"><div class="spacer"></div><img class="logo" src="icons/icon.svg" alt=""><div class="hello">hello</div><div class="sub">Welcome to allo OS. A simple, quiet home for your apps.</div><div class="spacer"></div><button class="cta" data-next>Get started</button></div>`,
    () => `<div class="step"><h2>Choose a look</h2><div class="sub">You can change this any time in Settings.</div>
      <div class="themes">
        <button class="theme-opt ${state.settings.theme === 'light' ? 'on' : ''}" data-theme="light"><i style="background:linear-gradient(#fff,#eef0f4);"></i>Light</button>
        <button class="theme-opt ${state.settings.theme === 'dark' ? 'on' : ''}" data-theme="dark"><i style="background:linear-gradient(#2a2a2e,#111);"></i>Dark</button>
        <button class="theme-opt ${state.settings.theme === 'auto' ? 'on' : ''}" data-theme="auto"><i style="background:linear-gradient(135deg,#fff 50%,#1b1b1e 50%);"></i>Auto</button>
      </div>
      <div class="walls">${(NATIVE ? [{ id: 'system', name: 'Phone', css: 'linear-gradient(160deg,#8e9aaf,#4b5568)' }, ...WALLPAPERS.slice(0, 7)] : WALLPAPERS).map(w => `<button data-wall="${w.id}" class="${w.id === state.settings.wallpaper ? 'on' : ''}" style="background:${w.css.replace(/"/g, "'")}" aria-label="${w.name}"></button>`).join('')}</div>
      <div class="spacer"></div><button class="cta" data-next>Continue</button></div>`,
    () => {
      if (NATIVE) {
        const isHome = nativeCall(() => NATIVE.isDefaultHome(), false);
        return `<div class="step"><div class="spacer"></div><img class="logo" src="icons/icon.svg" alt=""><h2>${isHome ? 'You’re all set' : 'Make allo your home screen'}</h2>
          <div class="sub">${isHome ? 'allo is now your phone’s home screen. Press Home any time to come back here.' : 'Choose allo as your default home app so it opens every time you press Home.'}</div><div class="spacer"></div>
          ${isHome ? '' : '<button class="cta" data-sethome style="margin-bottom:12px">Set as home screen</button>'}
          <button class="cta" data-finish ${isHome ? '' : 'style="background:rgba(255,255,255,.18);color:#fff"'}>${isHome ? 'Start' : 'Not now'}</button></div>`;
      }
      const p = publicState().platform;
      const how = isStandalone() ? 'allo OS is installed on this device. Enjoy!'
        : p === 'ios' ? 'To install, tap the Share button in Safari, then “Add to Home Screen”. allo OS will open full screen like a real system.'
        : installPrompt ? 'Install allo OS to run it full screen and offline, right from your home screen.'
        : 'To install, open your browser menu and choose “Install app” or “Add to Home screen”.';
      return `<div class="step"><div class="spacer"></div><img class="logo" src="icons/icon.svg" alt=""><h2>${isStandalone() ? 'You’re all set' : 'Install allo OS'}</h2><div class="sub">${how}</div><div class="spacer"></div>
        ${installPrompt && !isStandalone() ? '<button class="cta" data-install style="margin-bottom:12px">Install</button>' : ''}
        <button class="cta" data-finish ${installPrompt && !isStandalone() ? 'style="background:rgba(255,255,255,.18);color:#fff"' : ''}>${isStandalone() ? 'Start' : 'Continue in browser'}</button></div>`;
    }
  ];
  let i = 0;
  const show = () => { el.setup.innerHTML = steps[i](); };
  setupRefresh = () => { if (!el.setup.hidden) show(); };
  show();
  el.setup.onclick = async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.theme) { setSetting('theme', t.dataset.theme); show(); }
    else if (t.dataset.wall) { setSetting('wallpaper', t.dataset.wall); show(); }
    else if ('next' in t.dataset) { i++; show(); }
    else if ('install' in t.dataset) { await API.promptInstall.call(null); show(); }
    else if ('sethome' in t.dataset) { NATIVE.requestDefaultHome(); }
    else if ('finish' in t.dataset) {
      state.setup = true; save();
      el.setup.hidden = true;
      el.device.classList.remove('setup');
      unlock();
    }
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'app'; }
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 100000; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* =========================================================================
   Phone integration (Android)
   ========================================================================= */
function loadNativeApps() {
  if (!NATIVE) return;
  const list = nativeCall(() => JSON.parse(NATIVE.apps()), []);
  nativeApps.clear();
  for (const a of list) {
    const id = 'android:' + a.pkg + '/' + a.cls;
    nativeApps.set(id, {
      id, name: a.label, native: true, pkg: a.pkg, cls: a.cls, locked: !!a.system,
      icon: `${BASE}__icon/${encodeURIComponent(a.pkg)}/${encodeURIComponent(a.cls)}.png?v=${a.updated}`,
      category: 'Android app', developer: a.pkg, version: a.version || '', description: ''
    });
  }
}

function nativeDefaultDock() {
  const list = nativeCall(() => JSON.parse(NATIVE.defaults()), []);
  const ids = [];
  for (const d of list) {
    const id = 'android:' + d.pkg + '/' + d.cls;
    if (nativeApps.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, DOCK_MAX);
}

// New phone apps go on the home screen (no app drawer, like HyperOS); removed ones disappear.
function syncNativeApps() {
  if (!NATIVE) return;
  loadNativeApps();
  const gone = id => id.startsWith('android:') && !nativeApps.has(id);
  for (const id of state.installed.filter(gone)) removeFromLayout(id);
  state.installed = state.installed.filter(id => !gone(id));
  const known = new Set(state.knownNative || []);
  const added = [...nativeApps.keys()].filter(id => !known.has(id))
    .sort((a, b) => nativeApps.get(a).name.localeCompare(nativeApps.get(b).name));
  for (const id of added) {
    if (!state.installed.includes(id)) state.installed.push(id);
    if (!state.home.includes(id) && !state.dock.includes(id)) state.home.push(id);
  }
  state.knownNative = [...nativeApps.keys()];
}

function haptic(kind = 'long') {
  if (NATIVE) nativeCall(() => NATIVE.haptic(kind));
  else navigator.vibrate?.(kind === 'light' ? 6 : 12);
}

// Back button / gesture: let the open app go back first, then close things one at a time.
function back() {
  if (el.dialogs.children.length) { el.dialogs.querySelector('.dialog [data-v="0"]')?.click() || el.dialogs.querySelector('.dialog-backdrop')?.click(); return; }
  if (!el.setup.hidden) return;
  if (!el.control.hidden) return closeControl();
  if (!el.search.hidden) return closeSearch();
  if (inRecents) return exitRecents();
  if (current) {
    const rec = running.get(current);
    const token = Math.random();
    let answered = false;
    const onReply = e => {
      if (e.source !== rec.iframe.contentWindow || e.data?.type !== 'allo:back-result' || e.data.id !== token) return;
      answered = true;
      removeEventListener('message', onReply);
      if (!e.data.handled && current === rec.id) goHome();
    };
    addEventListener('message', onReply);
    try { rec.iframe.contentWindow.postMessage({ type: 'allo:back', id: token }, '*'); } catch {}
    setTimeout(() => { if (!answered) { removeEventListener('message', onReply); if (current === rec.id) goHome(); } }, 250);
    return;
  }
  if (editing) return exitEdit();
}

// Home button / gesture. When allo was already showing, go back to the first page.
function pressHome(wasForeground = true) {
  if (el.dialogs.children.length) el.dialogs.querySelector('.dialog-backdrop')?.click();
  closeControl(); closeSearch(true);
  if (inRecents) exitRecents();
  if (current) { goHome(); return; }
  if (editing) { exitEdit(); return; }
  if (wasForeground && pageIndex !== 0) goPage(0);
}

/* =========================================================================
   Boot
   ========================================================================= */
async function boot() {
  applyFrame();
  applyTheme();
  applyWallpaper();
  startClock();
  updateNet();
  initBattery();

  let list = [];
  try { list = await (await fetch('apps/catalog.json', { cache: 'no-cache' })).json(); }
  catch { try { list = await (await fetch('apps/catalog.json')).json(); } catch { list = []; } }
  for (const a of list) {
    if (NATIVE && a.id === 'settings') a.name = 'Customize';
    catalog.set(a.id, { ...a, entry: new URL(a.entry, BASE).href, icon: new URL(a.icon, BASE).href, files: (a.files || []).map(f => new URL(f, BASE).href) });
  }

  loadNativeApps();
  if (!state.installed.length) {
    // On a phone, allo's own versions of Camera, Clock etc. are optional (in the App Store).
    const pre = NATIVE ? ['settings', 'store', 'weather', 'notes'] : list.filter(a => a.preinstalled).map(a => a.id);
    state.installed = [...pre];
    state.dock = NATIVE ? nativeDefaultDock() : list.filter(a => a.dock).map(a => a.id).slice(0, DOCK_MAX);
    for (const id of state.dock) if (!state.installed.includes(id)) state.installed.push(id);
    state.home = pre.filter(id => !state.dock.includes(id));
    save();
    // cache preinstalled apps for offline use
    if (hasCaches) for (const id of pre) {
      caches.open(cacheName(id)).then(c => c.addAll(appFiles(getApp(id)))).catch(() => {});
    }
  }
  // drop anything that no longer exists, make sure system apps stay installed
  syncNativeApps();
  state.installed = state.installed.filter(id => getApp(id));
  for (const a of list) if (a.system && !isInstalled(a.id)) state.installed.push(a.id);
  const placed = new Set([...state.home, ...state.dock]);
  for (const id of state.installed) if (!placed.has(id)) state.home.push(id);
  state.home = state.home.filter(id => isInstalled(id));
  state.dock = state.dock.filter(id => isInstalled(id));

  renderHome();

  if (state.setup && !NATIVE) { lock(); }
  else { locked = false; el.device.classList.remove('locked'); if (!state.setup) runSetup(); }
  updateChrome();
  requestAnimationFrame(() => document.body.classList.add('ready'));

  if (!NATIVE && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed', e));
  }
}

boot();

// for debugging from the console
window.alloOS = {
  state: () => state, launch, goHome, lock, unlock, installApp, uninstallApp, installFromUrl, enterRecents,
  back, home: pressHome,
  // called by the Android launcher
  nativeAppsChanged() { syncNativeApps(); save(); renderHome({ flip: true }); if (!el.search.hidden) renderSearch(); },
  nativeResume() {
    nativeWallLight = nativeCall(() => NATIVE.wallpaperLight(), nativeWallLight);
    applyWallpaper();
    window.alloOS.nativeAppsChanged();
    if (current) { const r = running.get(current); if (r) notifyVisibility(r, true); }
    setupRefresh();
  },
  nativePause() { if (current) { const r = running.get(current); if (r) notifyVisibility(r, false); } if (editing) exitEdit(); },
  nativeThemeChanged(dark) { nativeDark = !!dark; applyTheme(); },
  nativeWallpaperChanged() { nativeWallLight = nativeCall(() => NATIVE.wallpaperLight(), false); applyWallpaper(); },
  insetsChanged() { relayout(); for (const r of running.values()) sendEnv(r); }
};

// Never let the browser scroll system containers (e.g. when an off-screen app takes focus).
for (const c of [el.device, el.windows, el.home, document.scrollingElement]) {
  c?.addEventListener?.('scroll', () => { if (c.scrollTop || c.scrollLeft) { c.scrollTop = 0; c.scrollLeft = 0; } }, { passive: true });
}
addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
