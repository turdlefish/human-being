// Today: each partner's daily check-in — the need taking up the most brain
// space and how big it is, how they slept (and for how many hours), how tired they are, how many spoons
// they have, what kind of support would help and their moods — side by side.
// You can hug your person, or boop them as a gentle reminder to check in.

import * as store from './store.js';
import { $, $$, burstHearts, colorVars, copyText, dayKey, debounce, esc, fmtDay, keyToDate, shiftDay, toast, uid } from './util.js';
import { boopSeen, hugSeen, isNative, theirCheckinSeen } from './native.js';
import { avatarHTML } from './avatars.js';
import { greetingSticker } from './icons.js';
import { FIRST_ROW, MOODS, checkinMoods, moodImg, moodOf, ownMoods } from './moods.js';
import { helpTagLabel, helpTagsFor } from './help.js';
import { pruneBoops, pruneHugs, readCheckins, tidyMyCheckins, writeMyCheckin } from './checkins.js';
import { openSheet } from './ui.js';

const RATING_WORDS = ['', 'a tiny bit', 'a tiny bit', 'a little', 'a little', 'a fair bit', 'a fair bit', 'a lot', 'a lot', 'nearly all of it', 'all of it'];
const SLEEP_WORDS = ['', 'a rough night', 'a rough night', 'not great', 'not great', 'okay', 'okay', 'pretty good', 'good', 'great', 'amazing'];
const TIRED_WORDS = ['', 'wide awake', 'wide awake', 'a little tired', 'a little tired', 'a bit tired', 'a bit tired', 'pretty tired', 'very tired', 'exhausted', 'completely drained'];
const SPOON_WORDS = ['', 'barely any', 'barely any', 'a few', 'a few', 'some', 'some', 'a good amount', 'a good amount', 'lots', 'all the spoons'];
const PLACEHOLDERS = [
  'e.g. a big deadline — I need quiet time tonight',
  'e.g. feeling disconnected, I need some us-time',
  'e.g. so tired. I need rest and an early night',
  'e.g. anxious about tomorrow, I need reassurance',
  'e.g. overwhelmed by chores, I need a hand',
];
// The 1–10 scales on the check-in card.
const SCALES = {
  rating: { words: RATING_WORDS, color: null, ask: '🧠 How much brain space is it taking?', show: '🧠 Brain space', ends: ['minimal', 'all-consuming'] },
  sleep: { words: SLEEP_WORDS, color: 'lavender', ask: '🌙 How do you rate your sleep?', show: '🌙 Sleep', ends: ['rough night', 'amazing'] },
  tired: { words: TIRED_WORDS, color: 'sky', ask: '🥱 How tired are you?', show: '🥱 Tiredness', ends: ['wide awake', 'exhausted'] },
  spoons: { words: SPOON_WORDS, color: 'peach', ask: '🥄 How many spoons do you have today?', show: '🥄 Spoons', ends: ['running on empty', 'plenty to share'] },
};
// Hours slept (sleepHours), under the sleep rating: − and + go half an hour at
// a time (from HOURS_START when it's empty), or type "7.5", "7½", "6:45", "6h30".
const HOURS_START = 7;
const FRAC = ['', '¼', '½', '¾'];
const hasHours = c => !!c && typeof c.sleepHours === 'number';
/** 7.5 → "7½" */
export function fmtHours(h) {
  const q = Math.round(h * 4), w = Math.floor(q / 4), f = FRAC[q % 4];
  return (w || !f ? String(w) : '') + f;
}
const hoursWord = h => `${fmtHours(h)} ${h === 1 ? 'hour' : 'hours'}`;
// What was typed, as hours to the quarter: a number, null when it's empty, or undefined when it isn't a time.
function parseHours(v) {
  const s = String(v || '').trim().toLowerCase().replace(',', '.')
    .replace(/\s*¼/g, '.25').replace(/\s*½/g, '.5').replace(/\s*¾/g, '.75');
  if (!s) return null;
  let h = NaN, m;
  if (/^\d*\.?\d+$/.test(s)) h = Number(s);
  else if ((m = /^(\d{1,2})\s*(?:h|hrs?|hours?|:)\s*(?:(\d{1,2})\s*(?:m|mins?|minutes?)?)?$/.exec(s))) h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  else if ((m = /^(\d{1,3})\s*(?:m|mins?|minutes?)$/.exec(s))) h = Number(m[1]) / 60;
  if (!Number.isFinite(h)) return undefined;
  return Math.min(24, Math.max(0, Math.round(h * 4) / 4));
}
const STRIP_CHUNK = 120;   // days added to the day strip at a time
const BOOP_GAP = 30 * 60 * 1000;   // one boop per half hour, so it stays a nudge

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Hi, night owl';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Hi, night owl';
}

function dots(n, editable) {
  let out = '';
  for (let i = 1; i <= 10; i++) {
    const on = n && i <= n;
    out += editable
      ? `<button type="button" class="rb${on ? ' on' : ''}${n === i ? ' peak' : ''}" data-r="${i}" aria-label="${i} out of 10" aria-pressed="${n === i}">${i}</button>`
      : `<span class="rd${on ? ' on' : ''}"></span>`;
  }
  return out;
}

const readout = (n, words) => (n ? `<b>${n}</b>/10 · ${esc(words[n])}` : '<span class="muted">tap a number</span>');

const isEmpty = c => !c || (!c.need && !c.support && !c.rating && !c.sleep && !hasHours(c) && !c.tired && !c.spoons && !c.spoonsNote
  && !(c.tags && c.tags.length) && !c.mood && !(c.moods && c.moods.length));

export function createToday(root) {
  let day = dayKey();
  let followToday = true;
  let stripStart = null;     // oldest day currently in the strip
  let moodsOpen = false;

  const myProfile = () => store.readMine('profile', {});
  const theirProfile = () => store.readPartner('profile', null);
  const myCheckins = () => readCheckins(store.me());   // recent + yearly archives (checkins.js)
  const theirCheckins = () => readCheckins(store.partner());
  tidyMyCheckins();   // tuck older days into the yearly archive

  root.innerHTML = `
    <div class="page today">
      <div class="today-head" id="t-head"></div>
      <div class="strip-head">
        <span class="strip-month" id="t-month"></span>
        <button type="button" class="today-btn" data-act="go-today" hidden>↩ Today</button>
      </div>
      <div class="day-strip" id="t-strip" aria-label="Days"></div>
      <div class="cards-2">
        <div id="t-me"></div>
        <div id="t-them"></div>
      </div>
      <section class="history" id="t-history"></section>
    </div>`;

  const strip = $('#t-strip', root);
  const todayBtn = $('.today-btn', root);

  // ── header ─────────────────────────────────────────────────────────────
  function renderHead() {
    const p = myProfile();
    const isToday = day === dayKey();
    $('#t-head', root).innerHTML = `
      <h1 class="display">${esc(greeting())}, <span class="hi-name">${esc(p.name || 'love')}</span> <span class="wave">${greetingSticker()}</span></h1>
      <p class="muted">${isToday ? 'How are you today?' : 'Looking back at ' + esc(fmtDay(day))}</p>`;
  }

  // ── day strip: swipe back through every day, newest on the right ───────
  function cellHTML(k, today) {
    const d = keyToDate(k);
    return `<button type="button" class="wk${k === day ? ' on' : ''}${k === today ? ' today' : ''}" data-day="${k}" aria-label="${esc(fmtDay(k))}">
      <span class="wk-d">${esc(d.toLocaleDateString(undefined, { weekday: 'narrow' }))}</span>
      <span class="wk-n">${d.getDate()}</span>
      <span class="wk-dots"><i></i><i></i></span>
    </button>`;
  }
  function cellsBetween(from, to, today) {
    let out = '';
    for (let k = from; k <= to; k = shiftDay(k, 1)) out += cellHTML(k, today);
    return out;
  }

  function buildStrip() {
    const today = dayKey();
    stripStart = shiftDay(today, -STRIP_CHUNK);
    if (day < stripStart) stripStart = shiftDay(day, -14);
    strip.innerHTML = cellsBetween(stripStart, today, today);
    strip.dataset.today = today;
    refreshDots();
    centerOn(day, false);
  }

  // Older days load in as you swipe back.
  function extendStrip() {
    const today = dayKey();
    const from = shiftDay(stripStart, -STRIP_CHUNK);
    const before = strip.scrollWidth;
    strip.insertAdjacentHTML('afterbegin', cellsBetween(from, shiftDay(stripStart, -1), today));
    stripStart = from;
    strip.scrollLeft += strip.scrollWidth - before;
    refreshDots();
  }

  function refreshDots() {
    const mine = myCheckins(), theirs = theirCheckins();
    const meVars = colorVars(myProfile().color), themVars = colorVars(theirProfile()?.color || 'lavender');
    strip.querySelectorAll('.wk').forEach(cell => {
      const [a, b] = cell.querySelectorAll('.wk-dots i');
      const k = cell.dataset.day;
      a.style.cssText = meVars;
      b.style.cssText = themVars;
      a.classList.toggle('on', !isEmpty(mine[k]));
      b.classList.toggle('on', !isEmpty(theirs[k]));
    });
  }

  function markSelected() {
    strip.querySelectorAll('.wk').forEach(c => c.classList.toggle('on', c.dataset.day === day));
  }

  let gliding = 0;   // timestamp until which a programmatic scroll is running
  function centerOn(k, smooth = true) {
    const cell = strip.querySelector(`.wk[data-day="${k}"]`);
    if (!cell || !strip.clientWidth) return;
    const left = cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2;
    if (smooth) gliding = Date.now() + 900;
    strip.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
    updateStripChrome();
  }

  function updateStripChrome() {
    const cells = strip.querySelectorAll('.wk');
    if (!cells.length) return;
    const step = cells.length > 1 ? cells[1].offsetLeft - cells[0].offsetLeft : 1;
    const mid = Math.round((strip.scrollLeft + strip.clientWidth / 2 - cells[0].offsetLeft - step / 2) / step);
    const cell = cells[Math.min(cells.length - 1, Math.max(0, mid))];
    if (!cell) return;   // the strip is hidden (another tab is showing), so it has no size to measure
    $('#t-month', root).textContent = keyToDate(cell.dataset.day).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - step * 1.5;
    todayBtn.hidden = day === dayKey() && atEnd;
  }

  // Fingers swipe the strip natively; let a mouse drag it too.
  let mouseDrag = null;
  let dragEndedAt = 0;
  strip.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button === 0) mouseDrag = { x: e.clientX, left: strip.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', e => {
    if (!mouseDrag) return;
    const dx = e.clientX - mouseDrag.x;
    if (!mouseDrag.moved && Math.abs(dx) > 5) { mouseDrag.moved = true; strip.style.scrollSnapType = 'none'; }
    if (mouseDrag.moved) strip.scrollLeft = mouseDrag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!mouseDrag) return;
    if (mouseDrag.moved) {
      strip.style.scrollSnapType = '';
      dragEndedAt = Date.now();   // the click that ends a drag shouldn't pick a day
    }
    mouseDrag = null;
  });

  let stripRaf = 0;
  strip.addEventListener('scroll', () => {
    if (stripRaf) return;
    stripRaf = requestAnimationFrame(() => {
      stripRaf = 0;
      if (strip.scrollLeft < strip.clientWidth * 0.5 && Date.now() > gliding) extendStrip();
      updateStripChrome();
    });
  }, { passive: true });

  // ── a check-in as a read-only card body (partner's, or mine once done) ──
  function scaleView(key, n, extra = '') {
    const s = SCALES[key];
    return `<div class="rating-view"${s.color ? ` style="${colorVars(s.color)}"` : ''}>
      <span class="rv-label">${s.show}</span>
      ${n ? `<div class="rdots">${dots(n, false)}</div>
      <span><b>${n}</b>/10 · ${esc(s.words[n])}</span>` : ''}${extra}
    </div>`;
  }
  // Sleep: the rating, and the hours under it (either can be on its own).
  const sleepView = c => scaleView('sleep', c.sleep || 0, hasHours(c) ? `<span class="rv-hours">🛏️ ${hoursWord(c.sleepHours)} of sleep</span>` : '');

  function checkinBody(c, mine) {
    const owner = mine ? myProfile() : theirProfile();
    const tagMap = Object.fromEntries(helpTagsFor(owner).map(t => [t.id, t]));
    const moods = checkinMoods(c, owner);
    return `
      ${c.need ? `<p class="need-quote">“${esc(c.need)}”</p>` : ''}
      ${c.rating ? scaleView('rating', c.rating) : ''}
      ${c.sleep || hasHours(c) ? sleepView(c) : ''}
      ${c.tired ? scaleView('tired', c.tired) : ''}
      ${c.spoons ? scaleView('spoons', c.spoons) : ''}
      ${c.spoonsNote ? `<p class="spoons-note" style="${colorVars('peach')}">🥄 ${esc(c.spoonsNote)}</p>` : ''}
      ${c.tags && c.tags.length ? `<div class="chips readonly">${c.tags.filter(t => tagMap[t]).map(t => `<span class="chip on">${tagMap[t].emoji} ${esc(tagMap[t].label)}</span>`).join('')}</div>` : ''}
      ${c.support ? `<div class="support-box"><span class="lbl">${mine ? 'How my person can help' : 'How you can help'}</span><p>${esc(c.support)}</p></div>` : ''}
      ${moods.length ? `<p class="mood-line">Feeling ${moods.map(m => `<span class="mood-pick">${moodImg(m.id, 'mood-img big', owner, false)}<span>${esc(m.label.toLowerCase())}</span></span>`).join('')}</p>` : ''}`;
  }

  // ── my card ────────────────────────────────────────────────────────────
  function scaleHTML(key, c) {
    const s = SCALES[key];
    const id = 'sc-' + key;
    return `<section class="q-block" data-q="${key}"${s.color ? ` style="${colorVars(s.color)}"` : ''}>
      <div class="q q-row" id="${id}-q">${s.ask} <span class="rating-read" data-read="${key}">${readout(c[key], s.words)}</span></div>
      <div class="rating" role="group" aria-labelledby="${id}-q" data-scale="${key}">${dots(c[key], true)}</div>
      <div class="rating-ends"><span>${s.ends[0]}</span><span>${s.ends[1]}</span></div>
      ${key === 'spoons' ? `
        <label class="q sub" for="ci-spoons">What do you have spoons for today? <span class="muted">(optional)</span></label>
        <textarea id="ci-spoons" class="inp" rows="2" maxlength="300" placeholder="e.g. enough spoons to play games together, but not for cooking dinner">${esc(c.spoonsNote || '')}</textarea>` : ''}
      ${key === 'sleep' ? hoursHTML(c.sleepHours) : ''}
    </section>`;
  }

  // "How many hours did you sleep?"  − 7½ hours +
  function hoursHTML(h) {
    const set = typeof h === 'number';
    return `
      <div class="q sub q-row hrs-q"><label for="ci-hours">How many hours did you sleep? <span class="muted">(optional)</span></label>
        <button type="button" class="link-btn hrs-clear" data-act="hours-clear"${set ? '' : ' hidden'}>clear</button></div>
      <div class="hrs" role="group" aria-label="Hours slept">
        <button type="button" class="hrs-btn" data-hrs="-1" aria-label="Half an hour less">−</button>
        <label class="hrs-val" for="ci-hours"><input id="ci-hours" class="hrs-inp" inputmode="decimal" maxlength="6" autocomplete="off" enterkeyhint="done" value="${set ? fmtHours(h) : ''}" placeholder="–"><span class="hrs-unit">${set && h === 1 ? 'hour' : 'hours'}</span></label>
        <button type="button" class="hrs-btn" data-hrs="1" aria-label="Half an hour more">+</button>
      </div>`;
  }

  // Saves hours slept and updates the stepper (typed: leave the box as it is).
  function setHours(h, typed = false) {
    patchMine({ sleepHours: h });
    const inp = $('#ci-hours', root);
    if (inp && !typed) inp.value = h == null ? '' : fmtHours(h);
    const unit = $('.hrs-unit', root);
    if (unit) unit.textContent = h === 1 ? 'hour' : 'hours';
    const clear = $('.hrs-clear', root);
    if (clear) clear.hidden = h == null;
    refreshDots();
  }

  // "Feeling unwell, anxious" beside the Mood question.
  function moodRead(c) {
    const ms = checkinMoods(c, myProfile());
    return ms.length ? `feeling <b>${ms.map(m => esc(m.label.toLowerCase())).join(', ')}</b>` : '<span class="muted">pick as many as you like</span>';
  }

  function moodPicker(c) {
    const p = myProfile();
    const picked = checkinMoods(c, p).map(m => m.id);
    const on = new Set(picked);
    const all = [...MOODS, ...ownMoods(p).filter(m => !m.gone)];
    let list = moodsOpen ? all : all.slice(0, FIRST_ROW);
    // Closed: picked moods from further down take the last spots, so they stay in view.
    if (!moodsOpen) {
      list = [...list];
      for (const id of picked) {
        if (list.some(m => m.id === id)) continue;
        const m = moodOf(id, p);
        if (!m) continue;
        let i = list.length - 1;
        while (i >= 0 && on.has(list[i].id)) i--;
        if (i >= 0) list[i] = m; else list.push(m);
      }
    }
    const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const tile = m => `
      <button type="button" class="mood${on.has(m.id) ? ' on' : ''}" data-mood="${esc(m.id)}" aria-pressed="${on.has(m.id)}">
        <span class="mood-face">${moodImg(m.id, 'mood-img', p, false)}</span><span class="mood-name${m.label.split(' ').some(w => w.length > 9) ? ' long' : ''}">${esc(m.label)}</span></button>`;
    return `<div class="moods${moodsOpen ? ' open' : ''}">${list.map(tile).join('')}
      ${moodsOpen ? `<button type="button" class="mood own" data-act="own-mood"><span class="mood-face">${icon('M12 6v12M6 12h12')}</span><span class="mood-name">your own</span></button>` : ''}
      <button type="button" class="mood more" data-act="more-moods" aria-expanded="${moodsOpen}"><span class="mood-face">${icon(moodsOpen ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5')}</span><span class="mood-name">${moodsOpen ? 'fewer' : 'more'}</span></button>
    </div>`;
  }

  function renderMe() {
    const p = myProfile();
    const c = myCheckins()[day] || {};
    const isToday = day === dayKey();
    const head = `
      <div class="card-tape"></div>
      <header class="card-head">
        <span class="avatar">${avatarHTML(p)}</span>
        <div><h2>My check-in</h2><p class="muted small">${isToday ? 'today · ' : ''}${esc(fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' }))}</p></div>
        <span class="saved-note" aria-live="polite"></span>
      </header>`;

    // Finished check-ins show like your partner's card, with an edit button.
    if (c.done && !isEmpty(c)) {
      $('#t-me', root).innerHTML = `
        <article class="card me-card viewing" style="${colorVars(p.color)}">
          ${head}
          ${checkinBody(c, true)}
          <button type="button" class="btn ghost edit-btn" data-act="edit">✏️ Edit my check-in</button>
          <div class="hug-note"></div>
        </article>`;
      renderHugNote();
      return;
    }

    const tags = new Set(c.tags || []);
    const ph = PLACEHOLDERS[keyToDate(day).getDate() % PLACEHOLDERS.length];
    $('#t-me', root).innerHTML = `
      <article class="card me-card" style="${colorVars(p.color)}">
        ${head}
        <section class="q-block">
          <label class="q" for="ci-need">What's taking up the most brain space today?</label>
          <textarea id="ci-need" class="inp" rows="3" maxlength="400" placeholder="${esc(ph)}">${esc(c.need || '')}</textarea>
        </section>

        ${scaleHTML('rating', c)}
        ${scaleHTML('sleep', c)}
        ${scaleHTML('tired', c)}
        ${scaleHTML('spoons', c)}

        <section class="q-block">
          <div class="q">What would help?</div>
          <div class="chips">${helpTagsFor(p).map(t => `<button type="button" class="chip${tags.has(t.id) ? ' on' : ''}" data-tag="${t.id}" aria-pressed="${tags.has(t.id)}">${esc(t.emoji)} ${esc(t.label)}</button>`).join('')}
            <button type="button" class="chip add-own" data-act="own-help">＋ Your own</button></div>
        </section>

        <section class="q-block">
          <label class="q" for="ci-support">How can ${esc(theirProfile()?.name || 'my person')} support me? <span class="muted">(optional)</span></label>
          <textarea id="ci-support" class="inp" rows="2" maxlength="300" placeholder="e.g. a hug when you get home, and handle dinner?">${esc(c.support || '')}</textarea>
        </section>

        <section class="q-block">
          <div class="q q-row">Mood <span class="mood-read" data-read="mood">${moodRead(c)}</span></div>
          ${moodPicker(c)}
        </section>

        <button type="button" class="btn big done-btn" data-act="done">Done ✓</button>
        <div class="hug-note"></div>
      </article>`;
    renderHugNote();
  }

  function renderHugNote() {
    const el = $('.hug-note', root);
    if (!el) return;
    const them = theirProfile();
    const hugged = them && store.readPartner('hugs', {})[day];
    el.innerHTML = hugged ? `<span class="hug-pill">💗 ${esc(them.name)} sent you a hug</span>` : '';
  }

  function patchMine(patch) {
    const next = { ...(myCheckins()[day] || {}), ...patch, updated: Date.now() };
    writeMyCheckin(day, isEmpty(next) ? null : next);   // only the small recent document is sent
    flashSaved();
  }

  // ── your own "what would help?" choices (kept in your profile) ─────────
  const firstEmoji = s => {
    if (!s) return '';
    if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter().segment(s)][0]?.segment || '';
    return Array.from(s)[0] || '';
  };
  function openOwnHelp() {
    const sheet = openSheet({ title: 'Your own “what would help”', body: '<div class="own-help"></div>', onClose: () => renderMe() });
    const box = sheet.el.querySelector('.own-help');
    const draw = () => {
      const own = myProfile().helpTags || [];
      box.innerHTML = `
        <form class="own-form">
          <div class="own-row">
            <input class="inp own-emoji" name="emoji" maxlength="16" placeholder="✨" aria-label="Emoji (optional)" autocomplete="off">
            <input class="inp" name="label" maxlength="28" placeholder="e.g. Bubble tea" aria-label="What would help" autocomplete="off">
          </div>
          <button type="submit" class="btn">Add</button>
        </form>
        ${own.length
          ? `<p class="muted small own-label">Yours — tap × to remove</p><div class="chips">${own.map(t => `<span class="chip on own">${esc(t.emoji)} ${esc(t.label)}<button type="button" class="own-del" data-del="${t.id}" aria-label="Remove ${esc(t.label)}">×</button></span>`).join('')}</div>`
          : `<p class="muted small own-label">Add things that help you, like “bubble tea” or “a walk together”. They show on your check-in for ${esc(theirProfile()?.name || 'your person')} too.</p>`}`;
    };
    draw();
    setTimeout(() => box.querySelector('[name=label]')?.focus(), 280);
    box.addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      const label = form.elements.namedItem('label').value.trim();
      if (!label) { form.elements.namedItem('label').focus(); return; }
      const tag = { id: 'own-' + uid(), emoji: firstEmoji(form.elements.namedItem('emoji').value.trim()) || '✨', label };
      const p = myProfile();
      store.writeMine('profile', { ...p, helpTags: [...(p.helpTags || []), tag] });
      const tags = new Set(myCheckins()[day]?.tags || []);
      tags.add(tag.id);   // picked for today straight away
      patchMine({ tags: [...tags] });
      draw();
      box.querySelector('[name=label]')?.focus();
    });
    box.addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const p = myProfile();
      store.writeMine('profile', { ...p, helpTags: (p.helpTags || []).filter(t => t.id !== del.dataset.del) });
      draw();
    });
  }

  function openOwnMood() {
    const sheet = openSheet({ title: 'Your own moods', body: '<div class="own-help"></div>', onClose: () => renderMe() });
    const box = sheet.el.querySelector('.own-help');
    const draw = () => {
      const own = ownMoods(myProfile()).filter(m => !m.gone);
      box.innerHTML = `
        <form class="own-form">
          <div class="own-row">
            <input class="inp own-emoji" name="emoji" maxlength="16" placeholder="😮‍💨" aria-label="Emoji" autocomplete="off">
            <input class="inp" name="label" maxlength="20" placeholder="e.g. Burnt out" aria-label="Mood name" autocomplete="off">
          </div>
          <button type="submit" class="btn">Add</button>
        </form>
        ${own.length
          ? `<p class="muted small own-label">Yours — tap × to remove</p><div class="chips">${own.map(m => `<span class="chip on own">${esc(m.emoji)} ${esc(m.label)}<button type="button" class="own-del" data-del="${esc(m.id)}" aria-label="Remove ${esc(m.label)}">×</button></span>`).join('')}</div>`
          : `<p class="muted small own-label">Make moods that fit you, like “😮‍💨 Burnt out” or “🥹 Grateful”. They show on your check-in for ${esc(theirProfile()?.name || 'your person')} too.</p>`}`;
    };
    draw();
    setTimeout(() => box.querySelector('[name=emoji]')?.focus(), 280);
    box.addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      const label = form.elements.namedItem('label').value.trim();
      if (!label) { form.elements.namedItem('label').focus(); return; }
      const mood = { id: 'own-' + uid(), emoji: firstEmoji(form.elements.namedItem('emoji').value.trim()) || '💭', label };
      const p = myProfile();
      store.writeMine('profile', { ...p, ownMoods: [...ownMoods(p), mood] });
      const ids = checkinMoods(myCheckins()[day] || {}, myProfile()).map(m => m.id);
      patchMine({ moods: [...ids, mood.id], mood: ids[0] || mood.id });   // picked for today straight away
      draw();
      box.querySelector('[name=emoji]')?.focus();
    });
    box.addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      // Kept (hidden from the picker) so days you already picked it still show it.
      const p = myProfile();
      store.writeMine('profile', { ...p, ownMoods: ownMoods(p).map(m => (m.id === del.dataset.del ? { ...m, gone: true } : m)) });
      draw();
    });
  }

  let savedTimer = null;
  function flashSaved() {
    const el = $('.saved-note', root);
    if (!el) return;
    el.textContent = 'saved 🌱';
    el.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  const saveNeed = debounce(v => patchMine({ need: v }), 350);
  const saveSupport = debounce(v => patchMine({ support: v }), 350);
  const saveSpoons = debounce(v => patchMine({ spoonsNote: v }), 350);
  const saveHours = debounce(v => setHours(v, true), 450);
  const flushTyping = () => { saveNeed.flush(); saveSupport.flush(); saveSpoons.flush(); saveHours.flush(); };

  // ── partner card ───────────────────────────────────────────────────────
  function renderThem() {
    const them = theirProfile();
    const el = $('#t-them', root);
    if (!them) {
      const code = store.getSession().space;
      el.innerHTML = `
        <article class="card invite-card" style="${colorVars('lavender')}">
          <div class="card-tape"></div>
          <div class="invite-art">💌</div>
          <h2>Waiting for your person</h2>
          <p class="muted">Send them the app and this code so your check-ins show up side by side.</p>
          <div class="code-pill">${esc(code)}</div>
          <button type="button" class="btn" data-act="invite">Copy invite</button>
        </article>`;
      return;
    }
    const c = theirCheckins()[day];
    const sent = !!store.readMine('hugs', {})[day];
    const isToday = day === dayKey();
    // Not finished today's check-in yet? A boop is a gentle nudge to do it.
    const canBoop = isToday && !(c && c.done);
    const booped = store.readMine('boops', {})[day] || 0;
    const justBooped = booped && Date.now() - booped < BOOP_GAP;
    el.innerHTML = `
      <article class="card them-card" style="${colorVars(them.color)}">
        <div class="card-tape"></div>
        <header class="card-head">
          <span class="avatar">${avatarHTML(them)}</span>
          <div><h2>${esc(them.name)}'s check-in</h2><p class="muted small">${isToday ? 'today · ' : ''}${esc(fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' }))}</p></div>
        </header>
        ${isEmpty(c) ? `
          <div class="empty-state">
            <div class="empty-art">🌱</div>
            <p>${esc(them.name)} hasn't checked in ${isToday ? 'yet today' : 'this day'}.</p>
            ${canBoop ? '<p class="muted small">Boop them for a gentle reminder 👉</p>' : ''}
          </div>` : checkinBody(c, false)}
        ${!isEmpty(c) && canBoop ? `<p class="muted small still-going">Still filling it in — not finished yet 🌱</p>` : ''}
        <div class="them-actions">
          <button type="button" class="btn hug-btn${sent ? ' sent' : ''}" data-act="hug" aria-pressed="${sent}">${sent ? '💗 Hug sent' : '🤗 Send a hug'}</button>
          ${canBoop ? `<button type="button" class="btn boop-btn${justBooped ? ' sent' : ''}" data-act="boop" aria-pressed="${!!justBooped}">${justBooped ? '👉 Booped!' : booped ? '👉 Boop again' : '👉 Boop'}</button>` : ''}
        </div>
      </article>`;
  }

  // ── history ────────────────────────────────────────────────────────────
  function renderHistory() {
    const mine = myCheckins(), theirs = theirCheckins();
    const me = myProfile(), them = theirProfile();
    const today = dayKey();
    const rows = [];
    for (let i = 1; i <= 21 && rows.length < 10; i++) {
      const k = shiftDay(today, -i);
      if (isEmpty(mine[k]) && isEmpty(theirs[k])) continue;
      rows.push(k);
    }
    const line = (p, c) => !p ? '' : `
      <div class="hist-line" style="${colorVars(p.color)}">
        <span class="hist-av">${avatarHTML(p)}</span>
        ${isEmpty(c) ? '<span class="muted">—</span>' : `
          ${c.rating ? `<span class="hist-r" title="Brain space">🧠${c.rating}</span>` : ''}
          ${c.sleep ? `<span class="hist-r" title="Sleep" style="${colorVars('lavender')}">🌙${c.sleep}</span>` : ''}
          ${hasHours(c) ? `<span class="hist-r" title="Hours slept" style="${colorVars('lavender')}">🛏️${fmtHours(c.sleepHours)}h</span>` : ''}
          ${c.tired ? `<span class="hist-r" title="Tiredness" style="${colorVars('sky')}">🥱${c.tired}</span>` : ''}
          ${c.spoons ? `<span class="hist-r" title="Spoons" style="${colorVars('peach')}">🥄${c.spoons}</span>` : ''}
          <span class="hist-t">${esc(c.need || (c.tags || []).map(id => helpTagLabel(id, p)).filter(Boolean).join(', ') || '')}</span>`}
      </div>`;
    $('#t-history', root).innerHTML = rows.length ? `
      <h3 class="section-title">Looking back</h3>
      <div class="hist-list">${rows.map(k => `
        <button type="button" class="hist-row" data-day="${k}">
          <span class="hist-day">${esc(fmtDay(k, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
          ${line(me, mine[k])}${line(them, theirs[k])}
        </button>`).join('')}
      </div>` : '';
  }

  function renderCards() {
    renderHead();
    renderMe();
    renderThem();
    renderHistory();
  }

  function setDay(k) {
    flushTyping();
    day = k;
    followToday = k === dayKey();
    moodsOpen = false;
    if (k < stripStart) buildStrip();
    else { markSelected(); centerOn(k); }
    renderCards();
  }

  // ── events ─────────────────────────────────────────────────────────────
  root.addEventListener('input', e => {
    if (e.target.id === 'ci-need') saveNeed(e.target.value.trim());
    else if (e.target.id === 'ci-support') saveSupport(e.target.value.trim());
    else if (e.target.id === 'ci-spoons') saveSpoons(e.target.value.trim());
    else if (e.target.id === 'ci-hours') { const h = parseHours(e.target.value); if (h !== undefined) saveHours(h); }
  });
  root.addEventListener('focusout', e => {
    if (['ci-need', 'ci-support', 'ci-spoons', 'ci-hours'].includes(e.target.id)) flushTyping();
    if (e.target.id === 'ci-hours') {   // tidy what was typed: "7.5" shows as 7½
      const h = myCheckins()[day]?.sleepHours;
      e.target.value = typeof h === 'number' ? fmtHours(h) : '';
    }
  });
  root.addEventListener('keydown', e => {
    if (e.target.id === 'ci-hours' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  root.addEventListener('click', async e => {
    const t = e.target;
    const rb = t.closest('.me-card .rb');
    if (rb) {
      const row = rb.closest('[data-scale]');
      const key = row.dataset.scale;
      const r = Number(rb.dataset.r);
      const next = myCheckins()[day]?.[key] === r ? null : r;
      patchMine({ [key]: next });
      row.innerHTML = dots(next, true);
      $(`[data-read="${key}"]`, root).innerHTML = readout(next, SCALES[key].words);
      refreshDots();
      return;
    }
    const hb = t.closest('.me-card [data-hrs]');
    if (hb) {
      saveHours.flush();
      const cur = myCheckins()[day]?.sleepHours;
      const up = hb.dataset.hrs === '1';
      // Half an hour at a time, to the next half hour after a typed 6¾.
      const next = typeof cur !== 'number' ? HOURS_START
        : Math.min(24, Math.max(0, (up ? Math.floor(cur * 2 + 1) : Math.ceil(cur * 2 - 1)) / 2));
      setHours(next);
      return;
    }
    const chip = t.closest('.me-card .chip');
    if (chip && chip.dataset.tag) {
      const tags = new Set(myCheckins()[day]?.tags || []);
      const id = chip.dataset.tag;
      tags.has(id) ? tags.delete(id) : tags.add(id);
      patchMine({ tags: [...tags] });
      chip.classList.toggle('on', tags.has(id));
      chip.setAttribute('aria-pressed', tags.has(id));
      refreshDots();
      return;
    }
    const mood = t.closest('.mood[data-mood]');
    if (mood) {
      // Pick as many as you like; the first one picked is kept as "mood" for older readers.
      const ids = checkinMoods(myCheckins()[day] || {}, myProfile()).map(m => m.id);
      const id = mood.dataset.mood;
      const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
      patchMine({ moods: next, mood: next[0] || '' });
      const on = new Set(next);
      $$('.mood[data-mood]', root).forEach(b => { const v = on.has(b.dataset.mood); b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); });
      $('[data-read="mood"]', root).innerHTML = moodRead(myCheckins()[day] || {});
      refreshDots();
      return;
    }
    const dayBtn = t.closest('[data-day]');
    if (dayBtn) {
      if (Date.now() - dragEndedAt < 80 && dayBtn.classList.contains('wk')) return;
      setDay(dayBtn.dataset.day);
      if (dayBtn.classList.contains('hist-row')) root.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'own-help') {
      openOwnHelp();
    } else if (act === 'own-mood') {
      openOwnMood();
    } else if (act === 'hours-clear') {
      saveHours.flush();
      setHours(null);
    } else if (act === 'go-today') {
      setDay(dayKey());
    } else if (act === 'more-moods') {
      moodsOpen = !moodsOpen;
      t.closest('.moods').outerHTML = moodPicker(myCheckins()[day] || {});
    } else if (act === 'done') {
      flushTyping();
      if (isEmpty(myCheckins()[day])) { toast('Add a little something first 🌱'); return; }
      patchMine({ done: true });
      renderMe();
      const r = $('#t-me', root).getBoundingClientRect();
      burstHearts(r.left + r.width / 2, r.top + 60, ['🌷', '✨', '💗', '🌱']);
      $('#t-me', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'edit') {
      patchMine({ done: false });
      renderMe();
    } else if (act === 'hug') {
      const hugs = store.readMine('hugs', {});
      if (hugs[day]) delete hugs[day];
      else {
        hugs[day] = Date.now();
        const r = t.closest('[data-act]').getBoundingClientRect();
        burstHearts(r.left + r.width / 2, r.top + r.height / 2);
      }
      store.writeMine('hugs', pruneHugs(hugs));
      renderThem();
    } else if (act === 'boop') {
      const them = theirProfile();
      const boops = store.readMine('boops', {});
      const last = boops[dayKey()] || 0;
      if (last && Date.now() - last < BOOP_GAP) {
        const mins = Math.round((Date.now() - last) / 60000);
        toast(`You booped ${them.name} ${mins < 1 ? 'just now' : mins + ' min ago'} — give them a little while 💗`);
        return;
      }
      boops[dayKey()] = Date.now();
      store.writeMine('boops', pruneBoops(boops));
      const r = t.closest('[data-act]').getBoundingClientRect();
      burstHearts(r.left + r.width / 2, r.top + r.height / 2, ['👉', '💗', '✨']);
      toast(`Booped ${them.name} 👉 they'll get a gentle nudge to check in`);
      renderThem();
    } else if (act === 'invite') {
      const ok = await copyText(inviteText());
      toast(ok ? 'Invite copied — send it to your person 💌' : 'Could not copy — the code is on the card');
    }
  });

  // Remote changes: refresh what's affected without trampling active typing.
  store.on((k, source) => {
    if (source !== 'remote') return;
    const p = store.partner(), m = store.me();
    if (k.startsWith(store.keyFor(p, 'checkins')) || k === store.keyFor(p, 'profile')) {
      renderThem(); refreshDots(); renderHistory();
      if (k.endsWith('profile')) renderMe();
      else checkTheirDone(true);
    } else if (k === store.keyFor(p, 'hugs')) {
      renderHugNote();
      checkForHug();
    } else if (k === store.keyFor(p, 'boops')) {
      checkForBoop();
    } else if (k.startsWith('p:' + m + ':')) {
      const typing = document.activeElement && root.contains(document.activeElement) && ['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName);
      if (!typing) { renderCards(); refreshDots(); }
    }
  });

  // A hug from your person pops up front and centre (and the Android app
  // also sends a notification when Tend is closed).
  function checkForHug() {
    const them = theirProfile();
    const ts = store.readPartner('hugs', {})[dayKey()];
    if (!them || !ts) return;
    let last = 0;
    try { last = Number(localStorage.getItem('tend:hugSeen')) || 0; } catch (e) {}
    if (ts <= last) return;
    try { localStorage.setItem('tend:hugSeen', String(ts)); } catch (e) {}
    hugSeen(ts);
    showHug(them);
  }

  // A card in the middle of the screen (a hug, a boop). If one is already
  // showing, the next waits until it's closed.
  const popQueue = [];
  function showPop(them, { art, title, text, buttons, burst, onButton }) {
    if (document.querySelector('.hug-pop')) { popQueue.push(arguments); return; }
    const pop = document.createElement('div');
    pop.className = 'hug-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    pop.innerHTML = `
      <div class="hug-card" style="${colorVars(them.color)}">
        <span class="avatar big">${avatarHTML(them)}</span>
        <div class="hug-art">${art}</div>
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(text)}</p>
        <div class="btn-row center">${buttons.map((b, i) => `
          <button type="button" class="btn${i ? ' ghost' : ''}" data-pop="${b.id}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    document.body.append(pop);
    requestAnimationFrame(() => pop.classList.add('open'));
    setTimeout(() => burstHearts(innerWidth / 2, innerHeight / 2 - 60, burst), 250);
    const close = () => {
      pop.classList.remove('open');
      setTimeout(() => { pop.remove(); if (popQueue.length) showPop(...popQueue.shift()); }, 250);
    };
    pop.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pop]');
      if (!b && ev.target !== pop) return;
      if (b) onButton(b.dataset.pop);
      close();
    });
  }

  function showHug(them) {
    showPop(them, {
      art: '🤗',
      title: `${them.name} sent you a hug!`,
      text: 'Sending love your way today 💗',
      buttons: [{ id: 'back', label: '🤗 Hug back' }, { id: 'close', label: 'Aww, thank you' }],
      onButton: id => {
        if (id !== 'back') return;
        const hugs = store.readMine('hugs', {});
        hugs[dayKey()] = Date.now();
        store.writeMine('hugs', pruneHugs(hugs));
        renderThem();
        toast(`Hug sent back to ${them.name} 💗`);
      },
    });
  }

  // A boop from your person: a gentle nudge to do today's check-in (the
  // Android app also notifies you while Human Being is closed).
  function checkForBoop() {
    const them = theirProfile();
    const ts = store.readPartner('boops', {})[dayKey()];
    if (!them || !ts) return;
    let last = 0;
    try { last = Number(localStorage.getItem('tend:boopSeen')) || 0; } catch (e) {}
    if (ts <= last) return;
    try { localStorage.setItem('tend:boopSeen', String(ts)); } catch (e) {}
    boopSeen(ts);
    if (myCheckins()[dayKey()]?.done) return;   // already checked in: nothing to nudge
    showPop(them, {
      art: '👉',
      title: `${them.name} booped you!`,
      text: 'A gentle nudge to do your check-in today 🌱',
      burst: ['👉', '💗', '✨'],
      buttons: [{ id: 'go', label: '🌱 Check in now' }, { id: 'later', label: 'In a bit' }],
      onButton: id => {
        if (id !== 'go') return;
        if (day !== dayKey()) setDay(dayKey());
        location.hash = 'today';
        $('#t-me', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $('#ci-need', root)?.focus({ preventScroll: true }), 500);
      },
    });
  }

  // Your person finished today's check-in. announce: say so (it happened while
  // the app was open); otherwise just note it so no notification follows.
  function checkTheirDone(announce) {
    const them = theirProfile();
    const today = dayKey();
    if (!them || !theirCheckins()[today]?.done) return;
    let seen = '';
    try { seen = localStorage.getItem('tend:theirDoneSeen') || ''; } catch (e) {}
    if (seen === today) return;
    try { localStorage.setItem('tend:theirDoneSeen', today); } catch (e) {}
    theirCheckinSeen(today);
    if (announce) toast(`${them.name} finished their check-in 🌷`);
  }

  return {
    show() {
      if (followToday && day !== dayKey()) day = dayKey();
      // A new day since the strip was built (or first show): rebuild it.
      if (!stripStart || strip.dataset.today !== dayKey() || !strip.clientWidth) buildStrip();
      else { markSelected(); refreshDots(); updateStripChrome(); }
      renderCards();
      checkForHug();
      checkForBoop();
      checkTheirDone(false);
    },
  };
}

export function inviteText() {
  const code = store.getSession().space;
  const open = isNative ? 'Install the Human Being app I sent you and open it' : `Open ${location.origin + location.pathname}`;
  return `Come join me on Human Being 🌷 — our little space for check-ins, self-care and plans.\n\n1. ${open}\n2. Tap "I have a code"\n3. Enter our code: ${code}`;
}
