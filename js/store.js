// Offline-first document store with partner sync.
//
// Each partner owns a handful of JSON documents and only ever writes their
// own, so the two of you can never overwrite each other:
//
//   tend:<space>:p:<slot>:profile    { name, emoji, color }
//   tend:<space>:p:<slot>:checkins   { "YYYY-MM-DD": { need, rating, sleep, tired, spoons, tags, support, moods, mood, done, updated } }
//   tend:<space>:p:<slot>:hugs       { "YYYY-MM-DD": timestamp }   (hugs sent to the partner)
//   tend:<space>:p:<slot>:boops      { "YYYY-MM-DD": timestamp }   (latest "please check in" boop sent to the partner)
//   tend:<space>:p:<slot>:feedback   { items: [note], marks: { <partner's note id>: { done, t } } }   (feedback.js)
//   tend:<space>:p:<slot>:map        { nodes: [...], stickers: [...] }
//   tend:<space>:p:<slot>:schedules  [ { id, name, start, end, step, row, blocks, stickers } ]
//
// <slot> is "a" (whoever created the space) or "b" (whoever joined).
// Documents live in localStorage as { t: editedAt, d: data } and are pushed
// to the shared `tb_store` table; newer `t` wins when pulling.

import { CONFIG, apiBase } from './config.js';

const SESSION_KEY = 'tend:session';
const DIRTY_KEY = 'tend:dirty';
const SEEN_KEY = 'tend:seen';
const DOC = fk => 'tend:doc:' + fk;
export const DOC_NAMES = ['profile', 'checkins', 'hugs', 'boops', 'map', 'schedules', 'gifts', 'stickerbox', 'feedback', 'nudges'];

function lsGet(k) {
  try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

let session = lsGet(SESSION_KEY);
let dirty = new Set(lsGet(DIRTY_KEY) || []);
let seen = lsGet(SEEN_KEY) || {};          // full key -> server updated_at last pulled
const listeners = new Set();
const statusListeners = new Set();
let status = { state: 'idle', at: 0, pending: dirty.size };
let flushTimer = null, pollTimer = null, flushing = null;

// ── Session ───────────────────────────────────────────────────────────────
export const getSession = () => session;
export function setSession(s) { session = s; lsSet(SESSION_KEY, s); }

export function signOut() {
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('tend:doc:') || k === DIRTY_KEY || k === SEEN_KEY || k === SESSION_KEY)) drop.push(k);
    }
    drop.forEach(lsDel);
  } catch (e) {}
  session = null;
  dirty = new Set();
  seen = {};
  stopSync();
}

export const me = () => session.slot;
export const partner = () => (session.slot === 'a' ? 'b' : 'a');
export const keyFor = (slot, doc) => `p:${slot}:${doc}`;
const full = (k, space = session.space) => `tend:${space}:${k}`;
const short = fk => fk.slice(`tend:${session.space}:`.length);

// ── Reading & writing ─────────────────────────────────────────────────────
export function read(k, fallback) {
  const e = lsGet(DOC(full(k)));
  return e ? e.d : fallback;
}
// When a doc was last written (ms), on whichever phone wrote it.
export const stampOf = k => (lsGet(DOC(full(k))) || {}).t || 0;
export const readMine = (doc, fb) => read(keyFor(me(), doc), fb);
export const readPartner = (doc, fb) => read(keyFor(partner(), doc), fb);

export function write(k, data) {
  const fk = full(k);
  lsSet(DOC(fk), { t: Date.now(), d: data });
  dirty.add(fk);
  lsSet(DIRTY_KEY, [...dirty]);
  emit(k, 'local');
  scheduleFlush();
}
export const writeMine = (doc, data) => write(keyFor(me(), doc), data);

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(k, source) {
  listeners.forEach(fn => { try { fn(k, source); } catch (e) { console.error(e); } });
}

export function onStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
export const getStatus = () => status;
function setStatus(state) {
  status = { state, at: Date.now(), pending: dirty.size };
  statusListeners.forEach(fn => fn(status));
}

// ── Network ───────────────────────────────────────────────────────────────
function headers(extra = {}) {
  return { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, ...extra };
}
async function api(query, opts = {}) {
  const r = await fetch(apiBase() + '/rest/v1/' + CONFIG.table + query, { ...opts, headers: headers(opts.headers) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')));
  return r;
}
const inList = fks => 'in.(' + fks.map(k => '"' + k + '"').join(',') + ')';

async function fetchDocs(fks) {
  const r = await api('?select=key,value,updated_at&key=' + encodeURIComponent(inList(fks)));
  const rows = await r.json();
  return rows.map(row => {
    let v = row.value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    return { key: row.key, updated_at: row.updated_at, entry: v };
  });
}
async function fetchStamps(fks) {
  const r = await api('?select=key,updated_at&key=' + encodeURIComponent(inList(fks)));
  return r.json();
}

// Older check-ins live in one archive document per year (see checkins.js).
export const archiveDocs = () => {
  const out = [];
  for (let y = 2026; y <= new Date().getFullYear(); y++) out.push('checkins-' + y);
  return out;
};
const allKeys = () => ['a', 'b'].flatMap(s => [...DOC_NAMES, ...archiveDocs()].map(d => full(keyFor(s, d))));

// Pull anything that changed on the server since we last looked.
// Resolves true if the server was reached.
export async function pull({ force = false } = {}) {
  if (!session) return false;
  if (navigator.onLine === false) { setStatus('offline'); return false; }
  try {
    const fks = allKeys();
    let want = fks;
    if (!force) {
      const stamps = await fetchStamps(fks);
      want = stamps.filter(s => seen[s.key] !== s.updated_at).map(s => s.key);
    }
    if (want.length) {
      const rows = await fetchDocs(want);
      const changed = [];
      for (const row of rows) {
        seen[row.key] = row.updated_at;
        const e = row.entry;
        if (!e || typeof e.t !== 'number' || dirty.has(row.key)) continue;
        const local = lsGet(DOC(row.key));
        if (!local || e.t > local.t) {
          lsSet(DOC(row.key), e);
          changed.push(short(row.key));
        }
      }
      lsSet(SEEN_KEY, seen);
      changed.forEach(k => emit(k, 'remote'));
    }
    if (!dirty.size) setStatus('synced');
    return true;
  } catch (e) {
    console.warn('Tend: pull failed', e);
    setStatus(navigator.onLine === false ? 'offline' : 'error');
    return false;
  }
}

function scheduleFlush(ms = 700) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), ms);
  setStatus('saving');
}

// Push every locally-edited document in one upsert.
export async function flush({ keepalive = false } = {}) {
  if (!session || !dirty.size) return true;
  if (flushing) return flushing;
  if (navigator.onLine === false) { setStatus('offline'); return false; }
  const batch = [...dirty].map(fk => ({ fk, entry: lsGet(DOC(fk)) })).filter(x => x.entry);
  const now = new Date().toISOString();
  flushing = (async () => {
    try {
      await api('', {
        method: 'POST',
        keepalive,
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch.map(x => ({ key: x.fk, value: JSON.stringify(x.entry), updated_at: now }))),
      });
      for (const x of batch) {
        const cur = lsGet(DOC(x.fk));
        if (cur && cur.t === x.entry.t) dirty.delete(x.fk);   // edited again mid-flight? keep it dirty
      }
      lsSet(DIRTY_KEY, [...dirty]);
      if (dirty.size) scheduleFlush(300); else setStatus('synced');
      return true;
    } catch (e) {
      console.warn('Tend: push failed', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      return false;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Starts syncing; resolves once the first check is done (true if the server was reached). */
export function startSync() {
  stopSync();
  const first = pull({ force: true });
  first.then(() => flush());
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') { pull(); flush(); }
  }, CONFIG.pollMs);
  return first;
}
export function stopSync() { clearInterval(pollTimer); pollTimer = null; }
export const syncNow = () => flush().then(() => pull({ force: true }));

document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.visibilityState === 'visible') { pull(); flush(); }
  else flush({ keepalive: true });
});
window.addEventListener('online', () => { if (session) { flush(); pull(); } });
window.addEventListener('offline', () => setStatus('offline'));

// ── Spaces ────────────────────────────────────────────────────────────────
const ADJ = ['sunny', 'cozy', 'fuzzy', 'sweet', 'misty', 'dreamy', 'peachy', 'minty', 'sleepy', 'bubbly',
  'snug', 'honey', 'velvet', 'starry', 'dewy', 'rosy', 'lucky', 'gentle', 'merry', 'breezy', 'cloudy',
  'golden', 'lilac', 'silky', 'twinkly', 'jolly', 'mellow', 'plushy', 'sparkly', 'tender'];
const NOUN = ['otter', 'bunny', 'panda', 'koala', 'fawn', 'duckling', 'kitten', 'puffin', 'hedgehog', 'lamb',
  'robin', 'seal', 'cub', 'sparrow', 'bee', 'fox', 'mochi', 'dumpling', 'teacup', 'petal', 'clover',
  'cloud', 'acorn', 'pebble', 'muffin', 'peach', 'plum', 'tulip', 'fern', 'moon'];

export function makeSpaceCode() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${ADJ[r[0] % ADJ.length]}-${NOUN[r[1] % NOUN.length]}-${1000 + (r[2] % 9000)}`;
}
export const normalizeCode = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Who's already in a space? Returns { a?: profile, b?: profile }.
export async function peekSpace(code) {
  const fks = ['a', 'b'].map(s => full(keyFor(s, 'profile'), code));
  const rows = await fetchDocs(fks);
  const out = {};
  rows.forEach(r => {
    const slot = r.key.split(':')[3];
    if (r.entry && r.entry.d) out[slot] = r.entry.d;
  });
  return out;
}

export function exportMine() {
  const out = { app: 'tend', exported: new Date().toISOString(), space: session.space, slot: session.slot };
  [...DOC_NAMES, ...archiveDocs()].forEach(d => { out[d] = readMine(d, null); });
  return out;
}
