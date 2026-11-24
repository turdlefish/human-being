// Glue for the Android app (tend-android), which exposes window.TendNative.
// In a normal browser all of this quietly does nothing.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { dayKey, debounce, startProblems } from './util.js';
import { avatarId } from './avatars.js';
import { checkinMoods, moodOf } from './moods.js';
import { helpTagLabel } from './help.js';

const bridge = window.TendNative || null;
export const isNative = !!bridge;

export const canShare = () => isNative || !!navigator.share;

export async function shareText(title, text) {
  if (bridge) { bridge.share(title, text); return; }
  try { await navigator.share({ title, text }); } catch (e) { /* cancelled */ }
}

function person(slot) {
  const p = store.read(store.keyFor(slot, 'profile'), null);
  const c = store.read(store.keyFor(slot, 'checkins'), {})[dayKey()] || {};
  return {
    name: p ? p.name || '' : '',
    emoji: p ? p.emoji || '💗' : '💗',
    color: p ? p.color || 'pink' : 'pink',
    avatar: avatarId(p) || '',
    joined: !!p,
    need: c.need || '',
    rating: c.rating || 0,
    sleep: c.sleep || 0,
    tired: c.tired || 0,
    spoons: c.spoons || 0,
    spoonsNote: c.spoonsNote || '',
    tags: Array.isArray(c.tags) ? c.tags : [],
    tagLabels: (Array.isArray(c.tags) ? c.tags : []).map(id => helpTagLabel(id, p)).filter(Boolean),
    support: c.support || '',
    mood: moodOf(c.mood)?.id || '',
    // Every mood picked, ready to draw: a sticker id (or '' for your own) with its emoji and name.
    moods: checkinMoods(c, p).map(m => ({ id: m.svg ? m.id : '', emoji: m.emoji || '', label: m.label.toLowerCase() })),
    done: !!c.done,
    // When this person's data last changed, so the widget keeps whichever copy is newer.
    t: Math.max(...['profile', 'checkins', 'hugs', 'boops'].map(d => store.stampOf(store.keyFor(slot, d)))),
  };
}

// Status / navigation bar colours follow the app's light or galaxy theme.
export function nativeTheme(dark) {
  if (bridge && bridge.setTheme) bridge.setTheme(dark ? 'dark' : 'light');
}

// The app showed this hug already, so the background check won't notify for it.
export function hugSeen(ts) {
  if (bridge && bridge.hugSeen) bridge.hugSeen(String(ts));
}

// The app showed this boop already, so the background check won't notify for it.
export function boopSeen(ts) {
  if (bridge && bridge.boopSeen) bridge.boopSeen(String(ts));
}

// The app knows your person finished this day's check-in, so no notification for it.
export function theirCheckinSeen(day) {
  if (bridge && bridge.checkinSeen) bridge.checkinSeen(day);
}

// Today's check-ins for the home-screen widget (same shape as WidgetData.java).
function pushWidget() {
  if (!bridge || !store.getSession()) return;
  const them = person(store.partner());
  const hugTs = store.readPartner('hugs', {})[dayKey()] || 0;
  them.hug = !!hugTs;
  them.hugTs = hugTs;
  them.boopTs = store.readPartner('boops', {})[dayKey()] || 0;
  bridge.updateWidget(JSON.stringify({ day: dayKey(), me: person(store.me()), them }));
}

export function startNative() {
  if (!bridge) return;
  const widget = () => step('widget', pushWidget);
  const soon = debounce(widget, 300);
  store.on(k => { if (/:(profile|checkins|hugs|boops)$/.test(k)) soon(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { soon.flush(); widget(); }
  });
  window.tendPushWidget = () => { soon.flush(); widget(); };   // called by the app when it goes to the background
  // Lets the widget (and hug, boop and check-in notifications) refresh from the database while the app is closed.
  step('session', updateNativeSession);
  step('alerts', () => { if (bridge.enableHugAlerts) bridge.enableHugAlerts(); });
  widget();
}

// One phone step; if it fails, the others still run, and Us lists it (once).
function step(what, fn) {
  try { fn(); } catch (e) {
    console.error(e);
    const line = `${what}: ${(e && e.message) || e}`;
    if (!startProblems.includes(line)) startProblems.push(line);
  }
}

export function stopNative() {
  if (bridge) bridge.setSession('');
}


/** Tells the Android app which space to check while it's closed (again after a move to a new code). */
export function updateNativeSession() {
  if (!bridge) return;
  const s = store.getSession();
  bridge.setSession(JSON.stringify({ url: CONFIG.supabaseUrl, key: CONFIG.supabaseKey, table: CONFIG.table, space: s.space, slot: s.slot }));
}
