// App shell: onboarding, tab routing, top bar and sync indicator.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { $, $$, colorVars, copyText, esc, isDark, prefs, setTheme, startProblems, toast } from './util.js';
import { showOnboarding } from './onboarding.js';
import { createToday } from './today.js';
import { createMap } from './map.js';
import { createPlan } from './plan.js';
import { createUs } from './us.js';
import { tray } from './sticker-ui.js';
import { isNative, nativeTheme, startNative, updateNativeSession } from './native.js';
import { initMove } from './spacemove.js';
import { openSheet } from './ui.js';
import { avatarHTML } from './avatars.js';
import { initCustom } from './custom.js';
import { startNudges } from './nudges.js';
import { setBionic } from './bionic.js';

const views = {};
let current = null;

const SYNC_LABEL = { idle: '', synced: 'synced', saving: 'saving…', offline: 'offline', error: 'sync issue' };

// ── Theme: 'auto' follows the phone; 'light' pastel paper; 'dark' galaxy ──
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(rerender = false) {
  const pref = prefs.theme || 'auto';
  setTheme(pref === 'dark' || (pref === 'auto' && darkQuery.matches) ? 'dark' : 'light');
  $('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#0B1029' : '#FFF4F8');
  nativeTheme(isDark());
  if (rerender && current) { renderTopbar(); views[current].show(); }
}
darkQuery.addEventListener('change', () => applyTheme(true));

function renderTopbar() {
  const me = store.readMine('profile', {});
  const them = store.readPartner('profile', null);
  $('#duo').innerHTML = `
    <span class="av" style="${colorVars(me.color)}" title="${esc(me.name || 'Me')}">${avatarHTML(me)}</span>
    <span class="av${them ? '' : ' empty'}" style="${colorVars(them ? them.color : 'lavender')}" title="${esc(them ? them.name : 'Waiting for your person')}">${them ? avatarHTML(them) : '＋'}</span>`;
}

function renderSync(s) {
  const el = $('#sync');
  el.dataset.state = s.state;
  el.querySelector('.sync-txt').textContent = SYNC_LABEL[s.state] || '';
}

function route() {
  const name = (location.hash || '#today').slice(1);
  const v = views[name] ? name : 'today';
  if (tray.target) tray.close();
  $$('.view').forEach(el => el.classList.toggle('active', el.dataset.view === v));
  $$('.tab').forEach(b => {
    const on = b.dataset.tab === v;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.body.dataset.view = v;
  current = v;
  views[v].show();
}

function startApp() {
  $('#app').hidden = false;
  initCustom();
  if (CONFIG.mock) $('#mock-badge').hidden = false;
  views.today = createToday($('#view-today'));
  views.map = createMap($('#view-map'));
  views.plan = createPlan($('#view-plan'));
  views.us = createUs($('#view-us'), { onTimeFormat: () => views.plan.rerender(), onTheme: () => applyTheme(true), onBionic: () => setBionic(!!prefs.bionic, prefs.bionicLevel) });

  $$('.tab').forEach(b => b.addEventListener('click', () => {
    if (location.hash === '#' + b.dataset.tab) route(); else location.hash = b.dataset.tab;
  }));
  $('#duo').addEventListener('click', () => { location.hash = 'us'; });
  window.addEventListener('hashchange', route);

  store.on(k => { if (k.endsWith(':profile')) renderTopbar(); });
  store.onStatus(renderSync);
  renderTopbar();
  // A move to a longer space code: asks for the new code when another app made one (spacemove.js).
  // Set up before anything below, so nothing that fails there can stop it.
  initMove({
    ns: 'tend', app: 'Human Being', store, toast, copyText,
    sheet: (title, body) => openSheet({ title, body }),
    busy: () => !!document.querySelector('.sheet-wrap'),
    myName: () => store.readMine('profile', {}).name,
    after: () => { safely('phone', updateNativeSession); safely('screen', route); },
    cls: { input: 'inp', code: 'code-pill big', actions: 'sheet-actions', primary: 'btn', ghost: 'btn ghost', err: 'ob-err' },
  });
  const synced = store.startSync();
  // Each start-up step on its own: one that fails doesn't stop the others (Us lists any that did).
  safely('messages', () => startNudges(synced));
  safely('bionic', () => setBionic(!!prefs.bionic, prefs.bionicLevel));
  safely('phone', startNative);
  safely('screen', route);
}

function safely(what, fn) {
  try { fn(); } catch (e) { console.error(e); startProblems.push(`${what}: ${(e && e.message) || e}`); }
}

// Android back button: close the top sheet / sticker drawer / edit first.
window.tendBack = () => {
  const sheets = document.querySelectorAll('.sheet-wrap.open');
  if (sheets.length) { sheets[sheets.length - 1].querySelector('.sheet-x').click(); return true; }
  if (tray.target) { tray.close(); return true; }
  if (document.activeElement && document.activeElement.isContentEditable) { document.activeElement.blur(); return true; }
  return false;
};

function registerSW() {
  if (isNative || !('serviceWorker' in navigator)) return;   // the Android app bundles its files
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (location.protocol !== 'https:' && !local) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

registerSW();
applyTheme();
if (store.getSession()) startApp();
else showOnboarding(startApp);
