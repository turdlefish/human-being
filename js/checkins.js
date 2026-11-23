// Check-ins, kept small to sync. The last few weeks live in the "checkins"
// document — the one that's sent on every save and that the widget reads.
// Older days are moved into one archive document per year ("checkins-2026"),
// which hardly ever changes. Reading merges them back together.

import * as store from './store.js';
import { dayKey, shiftDay } from './util.js';

const KEEP_DAYS = 45;       // days that stay in the recent document
const ARCHIVE_AFTER = 60;   // tidy once anything is older than this (so archiving happens in batches)

const yearOf = k => Math.max(2026, Number(k.slice(0, 4)) || 2026);

/** Every check-in for a person: { "YYYY-MM-DD": entry }. */
export function readCheckins(slot) {
  const out = {};
  for (const doc of store.archiveDocs()) Object.assign(out, store.read(store.keyFor(slot, doc), {}));
  return Object.assign(out, store.read(store.keyFor(slot, 'checkins'), {}));
}

/** Save (or with entry = null, remove) my check-in for a day. */
export function writeMyCheckin(day, entry) {
  const recent = { ...store.readMine('checkins', {}) };
  if (entry) recent[day] = entry;
  else {
    delete recent[day];
    const doc = 'checkins-' + yearOf(day);   // it may have been archived already
    const archived = store.readMine(doc, null);
    if (archived && archived[day]) {
      const next = { ...archived };
      delete next[day];
      store.writeMine(doc, next);
    }
  }
  store.writeMine('checkins', tidy(recent));
}

/** Moves my older days into the yearly archives (only when there are some to move). */
export function tidyMyCheckins() {
  const recent = store.readMine('checkins', null);
  if (!recent) return;
  const before = Object.keys(recent).length;
  const next = tidy({ ...recent });
  if (Object.keys(next).length !== before) store.writeMine('checkins', next);
}

function tidy(recent) {
  const today = dayKey();
  const cutoff = shiftDay(today, -ARCHIVE_AFTER), keepFrom = shiftDay(today, -KEEP_DAYS);
  if (!Object.keys(recent).some(k => k < cutoff)) return recent;
  const byYear = {};
  for (const k of Object.keys(recent)) {
    if (k >= keepFrom) continue;
    (byYear[yearOf(k)] = byYear[yearOf(k)] || {})[k] = recent[k];
    delete recent[k];
  }
  for (const [y, entries] of Object.entries(byYear)) {
    store.writeMine('checkins-' + y, { ...store.readMine('checkins-' + y, {}), ...entries });
  }
  return recent;
}

/** Boops only matter on the day: keep two weeks. */
export function pruneBoops(boops) {
  const cutoff = shiftDay(dayKey(), -14);
  for (const k of Object.keys(boops)) if (k < cutoff) delete boops[k];
  return boops;
}

/** Hugs only matter for today: keep the last couple of months. */
export function pruneHugs(hugs) {
  const cutoff = shiftDay(dayKey(), -ARCHIVE_AFTER);
  for (const k of Object.keys(hugs)) if (k < cutoff) delete hugs[k];
  return hugs;
}
