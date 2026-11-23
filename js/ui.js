// Bottom sheets, confirm/prompt dialogs and the colour swatch row.
import { COLORS, COLOR_KEYS, colorVars, esc } from './util.js';

export function openSheet({ title, body = '', onClose, className = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <header class="sheet-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="icon-btn sheet-x" aria-label="Close">✕</button>
      </header>
      <div class="sheet-body"></div>
    </div>`;
  const bodyEl = wrap.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.append(body);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));

  let closed = false;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 260);
    onClose && onClose();
  }
  // Ignore the tail of the tap that opened the sheet.
  const openedAt = Date.now();
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => { if (Date.now() - openedAt > 400) close(); });
  wrap.querySelector('.sheet-x').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  return { el: bodyEl, close };
}

export function confirmSheet(title, message, { ok = 'Yes', danger = false } = {}) {
  return new Promise(resolve => {
    let answer = false;
    const s = openSheet({
      title,
      body: `<p class="sheet-msg">${esc(message)}</p>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-a="no">Cancel</button>
          <button type="button" class="btn ${danger ? 'danger' : ''}" data-a="yes">${esc(ok)}</button>
        </div>`,
      onClose: () => resolve(answer),
    });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      answer = b.dataset.a === 'yes';
      s.close();
    });
  });
}

// A question with a few answers: choices = [{ v, label, danger?, primary? }].
// Resolves to the chosen `v`, or null if the sheet is closed.
export function choiceSheet(title, message, choices) {
  return new Promise(resolve => {
    let answer = null;
    const s = openSheet({
      title,
      body: `<p class="sheet-msg">${esc(message)}</p>
        <div class="sheet-actions choice-actions">${choices.map(c => `
          <button type="button" class="btn ${c.primary ? '' : 'ghost'} ${c.danger ? (c.primary ? 'danger' : 'danger-text') : ''}" data-v="${esc(c.v)}">${esc(c.label)}</button>`).join('')}
        </div>`,
      onClose: () => resolve(answer),
    });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      answer = b.dataset.v;
      s.close();
    });
  });
}

export function promptSheet(title, { value = '', placeholder = '', ok = 'Save', maxlength = 60 } = {}) {
  return new Promise(resolve => {
    let answer = null;
    const s = openSheet({
      title,
      body: `<form class="prompt-form">
          <input class="inp" name="v" maxlength="${maxlength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
          <div class="sheet-actions">
            <button type="button" class="btn ghost" data-a="no">Cancel</button>
            <button type="submit" class="btn">${esc(ok)}</button>
          </div>
        </form>`,
      onClose: () => resolve(answer),
    });
    const form = s.el.querySelector('form');
    const inp = form.querySelector('input');
    setTimeout(() => { inp.focus(); inp.select(); }, 280);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      answer = v;
      s.close();
    });
    form.querySelector('[data-a="no"]').addEventListener('click', () => s.close());
  });
}

export function swatchesHTML(selected) {
  return `<div class="swatches" role="radiogroup" aria-label="Colour">${COLOR_KEYS.map(k => `
    <button type="button" class="sw${k === selected ? ' on' : ''}" data-color="${k}" role="radio"
      aria-checked="${k === selected}" aria-label="${COLORS[k].name}" title="${COLORS[k].name}"
      style="${colorVars(k)}"></button>`).join('')}</div>`;
}

export function markSwatch(container, key) {
  container.querySelectorAll('.sw').forEach(b => {
    const on = b.dataset.color === key;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
}
