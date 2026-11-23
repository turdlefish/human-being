// Self-care map: a poster-style mind map. The centre bubble branches into core
// needs, which branch into secondary and tertiary ideas. Bubbles can be
// dragged anywhere (their branch comes along), edited in place, recoloured,
// and the whole poster can be decorated with stickers.

import * as store from './store.js';
import { COLORS, COLOR_KEYS, DARK_SURFACE, $, clamp, clone, colorVars, esc, isDark, mix, prefs, setPref, uid } from './util.js';
import { STICKER_ICON, createStickerLayer, tapAway, tray } from './sticker-ui.js';
import { confirmSheet } from './ui.js';
import { giftList, myGifts, saveGifts, stickerMoves, theirGifts } from './gifts.js';
import { fmtButtons, plainText, richFromEditor, richHTML, wireRich } from './richtext.js';

const TEXT_MAX = 600;                      // characters in one bubble
const SIZES = [0.8, 1, 1.25, 1.55, 1.9];   // text sizes in a bubble (× the usual)
// Branch line styles. A style set on a bubble applies to its line and to every line growing from it.
const LINES = [
  { id: 'curve', label: 'Curvy' },
  { id: 'straight', label: 'Straight' },
  { id: 'wavy', label: 'Wavy' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'sketch', label: 'Sketchy' },
  { id: 'vine', label: 'Vine' },
];

const CORE = [
  { text: 'Rest 😴', color: 'lavender', kids: ['early nights', 'lazy mornings'] },
  { text: 'Nourish 🍓', color: 'peach', kids: ['warm meals', 'water!'] },
  { text: 'Move 🌿', color: 'mint', kids: ['gentle walks', 'stretching'] },
  { text: 'Connect 💞', color: 'pink', kids: ['cuddles', 'calling a friend'] },
  { text: 'Calm 🫧', color: 'sky', kids: ['journaling', 'quiet time'] },
  { text: 'Joy 🌈', color: 'butter', kids: ['music', 'making things'] },
];

export function seedMap() {
  const root = { id: uid(), parent: null, text: 'my self-care 💗', x: 0, y: 0 };
  const nodes = [root];
  // A tall ellipse, so the starter poster fits a phone held upright: ideas
  // fan out above/below the top and bottom needs, and stack beside the others.
  CORE.forEach((c, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / CORE.length);
    const cos = Math.cos(a), sin = Math.sin(a);
    const n = { id: uid(), parent: root.id, text: c.text, color: c.color, x: Math.round(cos * 135), y: Math.round(sin * 215) };
    nodes.push(n);
    const offsets = Math.abs(cos) < 0.3
      ? [[-65, Math.sign(sin) * 85], [65, Math.sign(sin) * 85]]
      : [[Math.sign(cos) * 33, -63], [Math.sign(cos) * 33, 62]];
    c.kids.forEach((t, j) => {
      nodes.push({ id: uid(), parent: n.id, text: t, x: n.x + offsets[j][0], y: n.y + offsets[j][1] });
    });
  });
  return { nodes, stickers: [] };
}

const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// ── Hand-made looks ──────────────────────────────────────────────────────
// The centre is a puffy cloud; each core need is a paint blob whose wobbly
// shape, splatters and tilt are seeded from its id, so it always looks the same.
function rng(str) {
  let a = 0;
  for (let i = 0; i < str.length; i++) a = (Math.imul(31, a) + str.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pt = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
const svgUrl = svg => `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;

// Smooth closed curve through points (Catmull-Rom → Bézier).
function smoothClosed(pts) {
  const n = pts.length;
  let d = 'M' + pt(pts[0]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ' C' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])
      + ' ' + pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
  }
  return d + 'Z';
}

// Paint blob: jittered points around an ellipse.
function blobPath(rand, cx, cy, rx, ry, wobble) {
  const n = 9, pts = [];
  const a0 = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const r = 1 + (rand() - 0.5) * wobble * 2;
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return smoothClosed(pts);
}

// Branch bubble: a rounded rectangle (superellipse) with gently wavy edges.
function wavyPath(rand, w, h) {
  const n = 20, pts = [];
  const a = w / 2 - 6, b = h / 2 - 5;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([
      w / 2 + Math.sign(c) * Math.pow(Math.abs(c), 0.4) * a + (rand() - 0.5) * 5,
      h / 2 + Math.sign(s) * Math.pow(Math.abs(s), 0.4) * b + (rand() - 0.5) * 4,
    ]);
  }
  return smoothClosed(pts);
}

const shapeCache = new Map();
function cached(key, make) {
  if (!shapeCache.has(key)) shapeCache.set(key, make());
  return shapeCache.get(key);
}

// Flat pastel paint blob with a few splatters.
function paintBlob(id, colorKey) {
  return cached(`b:${id}:${colorKey}`, () => {
    const c = COLORS[colorKey] || COLORS.pink;
    const rand = rng(id);
    const shape = blobPath(rand, 90, 48, 72, 35, 0.14);
    let splats = '';
    for (let i = 0, n = 2 + Math.floor(rand() * 2); i < n; i++) {
      const a = rand() * Math.PI * 2;
      splats += `<circle cx="${(90 + Math.cos(a) * 85).toFixed(1)}" cy="${(48 + Math.sin(a) * 43).toFixed(1)}" r="${(1.8 + rand() * 2).toFixed(1)}" fill="${c.mid}"/>`;
    }
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 96" preserveAspectRatio="none"><path d="${shape}" fill="${c.mid}" stroke="${c.strong}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${splats}</svg>`);
  });
}

// Secondary / tertiary ideas: wavy-edged rectangles in the branch colour.
function wavyShape(id, colorKey, level) {
  const dark = isDark();
  return cached(`w:${id}:${colorKey}:${level}:${dark}`, () => {
    const c = COLORS[colorKey] || COLORS.pink;
    const fill = level === 2 ? (dark ? mix(c.strong, DARK_SURFACE, 0.78) : c.bg) : (dark ? DARK_SURFACE : '#FFFFFF');
    const dash = level > 2 ? ' stroke-dasharray="5 4"' : '';
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 56" preserveAspectRatio="none"><path d="${wavyPath(rng(id + 'w'), 160, 56)}" fill="${fill}" stroke="${c.strong}" stroke-width="${level === 2 ? 2.5 : 2}" stroke-linejoin="round" vector-effect="non-scaling-stroke"${dash}/></svg>`);
  });
}

const CLOUD_PATH = 'M42 112 A26 26 0 0 1 26 68 A28 28 0 0 1 64 32 A34 34 0 0 1 124 26 A30 30 0 0 1 170 58 A27 27 0 0 1 164 108 A34 34 0 0 1 104 116 A36 36 0 0 1 42 112 Z';
const CLOUD = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" preserveAspectRatio="none">'
  + `<path d="${CLOUD_PATH}" fill="#FFE1EC" stroke="#F8C4D9" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`);

// ── Branch lines ─────────────────────────────────────────────────────────
// Each line is a gentle quadratic curve from parent to child, drawn in one of the LINES styles.
const f1 = v => v.toFixed(1);
const qAt = (a, c, b, t) => { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; };
const qTan = (a, c, b, t) => { const u = 1 - t; return { x: 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x), y: 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y) }; };

function edgeSVG(style, a, b, color, w, lvl, seed) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const c = { x: (a.x + b.x) / 2 - (b.y - a.y) * 0.12, y: (a.y + b.y) / 2 + (b.x - a.x) * 0.12 };
  const q = `M${f1(a.x)} ${f1(a.y)} Q${f1(c.x)} ${f1(c.y)} ${f1(b.x)} ${f1(b.y)}`;
  const stroke = `stroke="${color}" stroke-width="${w}"`;
  switch (style) {
    case 'straight': return `<path d="M${f1(a.x)} ${f1(a.y)} L${f1(b.x)} ${f1(b.y)}" ${stroke}/>`;
    case 'dashed': return `<path d="${q}" ${stroke} stroke-dasharray="${f1(w * 2.6)} ${f1(w * 2)}"/>`;
    case 'dotted': return `<path d="${q}" ${stroke} stroke-dasharray="0.1 ${f1(w * 2.3)}"/>`;
    case 'wavy': {
      const n = Math.max(12, Math.round(len / 3)), amp = 2.5 + w * 0.7, waves = Math.max(2, Math.round(len / 26));
      let d = '';
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = qAt(a, c, b, t), tg = qTan(a, c, b, t), tl = Math.hypot(tg.x, tg.y) || 1;
        const off = Math.sin(t * waves * Math.PI * 2) * amp * Math.min(1, t * 6, (1 - t) * 6);   // calm at the ends
        d += (i ? 'L' : 'M') + f1(p.x - tg.y / tl * off) + ' ' + f1(p.y + tg.x / tl * off);
      }
      return `<path d="${d}" ${stroke} stroke-linejoin="round"/>`;
    }
    case 'sketch': {   // two loose pencil strokes
      const r = rng(seed + 'sk'), j = k => (r() - 0.5) * k;
      const line = () => `M${f1(a.x + j(4))} ${f1(a.y + j(4))} Q${f1(c.x + j(16))} ${f1(c.y + j(16))} ${f1(b.x + j(4))} ${f1(b.y + j(4))}`;
      const sw = f1(Math.max(1.4, w * 0.55));
      return `<path d="${line()}" stroke="${color}" stroke-width="${sw}"/><path d="${line()}" stroke="${color}" stroke-width="${sw}" opacity=".7"/>`;
    }
    case 'vine': {   // a thin stem with leaves on alternating sides
      let out = `<path d="${q}" stroke="${color}" stroke-width="${f1(Math.max(1.6, w * 0.6))}"/>`;
      const count = Math.floor(len / 24), sz = 4 + w * 1.1;
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1), p = qAt(a, c, b, t), tg = qTan(a, c, b, t);
        const ang = Math.atan2(tg.y, tg.x) * 180 / Math.PI + (i % 2 ? -50 : 50);
        out += `<path d="M0 0Q${f1(sz * 0.5)} ${f1(-sz * 0.45)} ${f1(sz)} 0Q${f1(sz * 0.5)} ${f1(sz * 0.45)} 0 0Z" style="fill:${color}" transform="translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(ang)})"/>`;
      }
      return out;
    }
    default: return `<path class="e${lvl}" d="${q}" ${stroke}/>`;   // curvy (the smallest ones dotted, as always)
  }
}
const linePreview = id => `<svg viewBox="0 0 56 22" aria-hidden="true">${edgeSVG(id, { x: 5, y: 15 }, { x: 51, y: 9 }, 'currentColor', 3, 1, 'preview')}</svg>`;

const tilt = (id, max) => ((rng(id + '~')() * 2 - 1) * max).toFixed(1);
const ICON = {
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  color: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="15.5" cy="8" r="1.2"/></svg>',
  del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c3-7 6 3 9-4s6 3 9-4"/></svg>',
};

export function createMap(root) {
  let owner = 'me';
  let doc = null;
  let byId = new Map(), meta = new Map();
  let v = { x: 0, y: 0, z: 1 };
  let sel = null, editingId = null, pendingNew = null;
  let decor = false;
  let gesture = null;
  let rich = null;   // the text style bar while a bubble is being edited
  const pointers = new Map();
  let shownOnce = false;

  root.innerHTML = `
    <div class="view-bar">
      <div class="seg" id="m-owner"></div>
      <button type="button" class="btn small" data-act="add-core">＋ core need</button>
    </div>
    <div class="map-canvas" id="m-canvas">
      <div class="map-world" id="m-world">
        <svg class="map-edges" id="m-edges" aria-hidden="true"></svg>
        <div class="map-nodes" id="m-nodes"></div>
        <div class="sticker-layer" id="m-stickers"></div>
      </div>
      <div class="node-toolbar" id="m-toolbar" hidden></div>
      <div class="canvas-msg" id="m-msg" hidden></div>
      <p class="canvas-hint" id="m-hint">tap a bubble to edit · drag to move · pinch to zoom</p>
      <div class="float-controls">
        <button type="button" class="icon-btn" data-act="zoom-in" aria-label="Zoom in">＋</button>
        <button type="button" class="icon-btn" data-act="zoom-out" aria-label="Zoom out">－</button>
        <button type="button" class="icon-btn" data-act="fit" aria-label="Fit map to screen">⤢</button>
        <button type="button" class="icon-btn sticker-btn" data-act="stickers" aria-label="Decorate with stickers">${STICKER_ICON}</button>
      </div>
    </div>`;

  const canvas = $('#m-canvas', root), world = $('#m-world', root), edgesEl = $('#m-edges', root),
    nodesEl = $('#m-nodes', root), toolbar = $('#m-toolbar', root), msg = $('#m-msg', root);

  const editable = () => owner === 'me';
  const slot = () => (owner === 'me' ? store.me() : store.partner());
  const save = () => { if (editable()) store.writeMine('map', doc); };

  // Stickers on this map: the owner's own, plus any their person gave them
  // (kept in the giver's "gifts" so each of you only writes your own data).
  const partnerName = () => store.readPartner('profile', null)?.name || 'your person';
  const layer = createStickerLayer({
    el: $('#m-stickers', root),
    sources: () => {
      if (!doc) return [];
      return editable()
        ? [{ list: doc.stickers, editable: decor, save, primary: true },
          { list: giftList(theirGifts(), 'map'), editable: false, movable: decor, from: partnerName() }]
        : [{ list: doc.stickers, editable: false, movable: decor },
          { list: giftList(myGifts(), 'map'), editable: decor, save: saveGifts, primary: true, from: 'you' }];
    },
    moves: stickerMoves,   // your person's stickers can be moved (not removed)
    posToPx: s => ({ x: s.x, y: s.y }),
    pxToPos: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    clientToLayer: (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
    },
    active: () => decor,
    scale: () => 1 / v.z,
  });

  // ── data ───────────────────────────────────────────────────────────────
  function load() {
    let d = store.read(store.keyFor(slot(), 'map'), null);
    if (!d && editable()) { d = seedMap(); store.writeMine('map', d); }
    doc = d ? clone(d) : null;
    if (doc) { doc.nodes = doc.nodes || []; doc.stickers = doc.stickers || []; }
  }

  function computeMeta() {
    byId = new Map(doc.nodes.map(n => [n.id, n]));
    meta = new Map();
    const walk = n => {
      if (meta.has(n.id)) return meta.get(n.id);
      let m;
      const p = n.parent && byId.get(n.parent);
      if (!p) m = { depth: 0, color: n.color || 'pink', line: n.line || 'curve' };
      else {
        const pm = walk(p);
        m = { depth: pm.depth + 1, color: n.color || (pm.depth === 0 ? 'pink' : pm.color), line: n.line || pm.line };
      }
      meta.set(n.id, m);
      return m;
    };
    doc.nodes.forEach(walk);
  }

  const kidsOf = id => doc.nodes.filter(n => n.parent === id);
  function subtree(id) {
    const out = [id];
    for (let i = 0; i < out.length; i++) kidsOf(out[i]).forEach(k => out.push(k.id));
    return out;
  }

  // ── rendering ──────────────────────────────────────────────────────────
  function nodeHTML(n) {
    const m = meta.get(n.id);
    const lvl = Math.min(m.depth, 3);
    const look = lvl === 0 ? `--shape:${CLOUD};`
      : lvl === 1 ? `--shape:${paintBlob(n.id, m.color)};--tilt:${tilt(n.id, 3)}deg;`
      : `--shape:${wavyShape(n.id, m.color, lvl)};--tilt:${tilt(n.id, 2)}deg;`;
    return `<div class="node l${lvl}${n.id === sel ? ' sel' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;--fs:${n.fs || 1};${colorVars(m.color)}${look}">
      <div class="txt rich">${n.text ? richHTML(n.text) : '<span class="ph">new idea</span>'}</div></div>`;
  }

  function renderEdges() {
    edgesEl.innerHTML = doc.nodes.filter(n => n.parent && byId.has(n.parent)).map(n => {
      const m = meta.get(n.id);
      const lvl = Math.min(m.depth, 3);
      return edgeSVG(m.line, byId.get(n.parent), n, COLORS[m.color].strong, [0, 5, 3.5, 2.5][lvl], lvl, n.id);
    }).join('');
  }

  function renderOwner() {
    const them = store.readPartner('profile', null);
    $('#m-owner', root).innerHTML = `
      <button type="button" data-owner="me" class="${owner === 'me' ? 'on' : ''}" aria-pressed="${owner === 'me'}">My map</button>
      <button type="button" data-owner="partner" class="${owner === 'partner' ? 'on' : ''}" aria-pressed="${owner === 'partner'}">${esc(them ? them.name + "'s" : 'Their')} map</button>`;
    root.classList.toggle('readonly', !editable());
  }

  function render() {
    renderOwner();
    if (!doc) {
      nodesEl.innerHTML = '';
      edgesEl.innerHTML = '';
      $('#m-stickers', root).innerHTML = '';
      hideToolbar();
      const them = store.readPartner('profile', null);
      msg.hidden = false;
      msg.innerHTML = them
        ? `<div class="empty-art">🗺️</div><p>${esc(them.name)} hasn't made their map yet.</p>`
        : `<div class="empty-art">💌</div><p>Your person's map will appear here once they join.</p>`;
      return;
    }
    msg.hidden = true;
    computeMeta();
    nodesEl.innerHTML = doc.nodes.map(nodeHTML).join('');
    renderEdges();
    layer.render();
    applyView();
    positionToolbar();
  }

  // ── view (pan / zoom) ──────────────────────────────────────────────────
  function applyView() {
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    world.style.setProperty('--inv-z', (1 / v.z).toFixed(3));
  }
  function saveView() {
    const views = prefs.mapViews || {};
    views[owner] = { x: Math.round(v.x), y: Math.round(v.y), z: +v.z.toFixed(3) };
    setPref('mapViews', views);
  }
  function restoreView() {
    const saved = (prefs.mapViews || {})[owner];
    if (saved) { v = { ...saved }; applyView(); } else fit();
  }

  function fit() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !doc || !doc.nodes.length) return;
    // Bounds from the real bubble sizes (offsetWidth ignores the zoom transform).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, hw, hh) => { x0 = Math.min(x0, x - hw); y0 = Math.min(y0, y - hh); x1 = Math.max(x1, x + hw); y1 = Math.max(y1, y + hh); };
    doc.nodes.forEach(n => {
      const el = nodesEl.querySelector(`[data-id="${n.id}"]`);
      grow(n.x, n.y, (el ? el.offsetWidth : 120) / 2, (el ? el.offsetHeight : 40) / 2);
    });
    doc.stickers.forEach(s => grow(s.x, s.y, s.size / 2, s.size / 2));
    const bw = x1 - x0 + 36, bh = y1 - y0 + 36;
    const z = clamp(Math.min(r.width / bw, (r.height - 50) / bh), 0.25, 1.25);
    v = { z, x: r.width / 2 - ((x0 + x1) / 2) * z, y: r.height / 2 - ((y0 + y1) / 2) * z };
    applyView();
    positionToolbar();
    saveView();
  }

  function zoomAt(sx, sy, f) {
    const z = clamp(v.z * f, 0.2, 2.5);
    const wx = (sx - v.x) / v.z, wy = (sy - v.y) / v.z;
    v = { z, x: sx - wx * z, y: sy - wy * z };
    applyView();
    positionToolbar();
  }

  function ensureVisible(n) {
    const r = canvas.getBoundingClientRect();
    const sx = n.x * v.z + v.x, sy = n.y * v.z + v.y;
    const m = 90;
    let dx = 0, dy = 0;
    if (sx < m) dx = m - sx; else if (sx > r.width - m) dx = r.width - m - sx;
    if (sy < m + 40) dy = m + 40 - sy; else if (sy > r.height - m) dy = r.height - m - sy;
    if (dx || dy) { v.x += dx; v.y += dy; applyView(); saveView(); }
  }

  // ── selection toolbar ──────────────────────────────────────────────────
  function hideToolbar() { toolbar.hidden = true; }

  function showToolbar(mode = '') {
    if (!sel || !editable() || editingId || decor) { hideToolbar(); return; }
    const n = byId.get(sel);
    if (!n) { hideToolbar(); return; }
    const isRoot = !n.parent;
    toolbar.className = 'node-toolbar' + (mode === 'line' ? ' lines' : '');
    toolbar.innerHTML = mode === 'color'
      ? `<div class="tb-swatches">${COLOR_KEYS.map(k => `<button type="button" class="sw" data-color="${k}" style="${colorVars(k)}" aria-label="${COLORS[k].name}"></button>`).join('')}</div>`
      : mode === 'line'
        ? `<p class="tb-cap">${isRoot ? 'Lines for the whole map' : 'Lines for this branch'}</p>
           <div class="tb-lines">${LINES.map(l => `<button type="button" class="ln-opt${l.id === meta.get(n.id).line ? ' on' : ''}" data-line="${l.id}" aria-label="${l.label} lines">${linePreview(l.id)}<span>${l.label}</span></button>`).join('')}</div>`
        : `<button type="button" data-act="edit" aria-label="Edit text">${ICON.edit}<span>edit</span></button>
         <button type="button" data-act="add" aria-label="Add a branch">${ICON.add}<span>branch</span></button>
         <button type="button" data-act="lines" aria-label="Line style">${ICON.line}<span>lines</span></button>
         ${isRoot ? '' : `<button type="button" data-act="color" aria-label="Change colour">${ICON.color}<span>colour</span></button>
         <button type="button" data-act="delete" aria-label="Delete">${ICON.del}<span>delete</span></button>`}`;
    toolbar.hidden = false;
    positionToolbar();
  }

  // While editing a bubble: bold, dot points, numbers, text size.
  function showStyleBar(n) {
    const i = SIZES.indexOf(n.fs || 1);
    toolbar.className = 'node-toolbar styling';
    toolbar.innerHTML = `${fmtButtons()}<span class="tb-sep"></span>
      <button type="button" class="fmt-btn" data-size="-1" aria-label="Smaller text"${i === 0 ? ' disabled' : ''}>A<small>−</small></button>
      <button type="button" class="fmt-btn big" data-size="1" aria-label="Bigger text"${i === SIZES.length - 1 ? ' disabled' : ''}>A<small>+</small></button>
      <button type="button" class="fmt-btn done" data-act="done-edit" aria-label="Done">✓</button>`;
    toolbar.hidden = false;
    positionToolbar();
  }

  function positionToolbar() {
    if (toolbar.hidden || !sel) return;
    const el = nodesEl.querySelector(`[data-id="${sel}"]`);
    if (!el) return;
    const c = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    const tw = toolbar.offsetWidth || 200;
    let x = clamp(r.left + r.width / 2 - c.left, tw / 2 + 6, c.width - tw / 2 - 6);
    const above = r.top - c.top > (toolbar.offsetHeight || 50) + 20;
    toolbar.classList.toggle('below', !above);
    toolbar.style.left = x + 'px';
    toolbar.style.top = (above ? r.top - c.top - 10 : r.bottom - c.top + 10) + 'px';
  }

  function select(id) {
    sel = id;
    nodesEl.querySelectorAll('.node').forEach(e => e.classList.toggle('sel', e.dataset.id === id));
    if (id) showToolbar(); else hideToolbar();
  }

  // ── editing ────────────────────────────────────────────────────────────
  function startEdit(id) {
    const el = nodesEl.querySelector(`[data-id="${id}"]`);
    const n = byId.get(id);
    if (!el || !n) return;
    editingId = id;
    select(id);
    el.classList.add('editing');
    const t = el.querySelector('.txt');
    t.setAttribute('contenteditable', 'true');   // first, so bionic reading leaves the text alone
    t.innerHTML = n.text ? richHTML(n.text) : '';
    showStyleBar(n);
    t.focus();
    const range = document.createRange();
    range.selectNodeContents(t);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(range);
    rich = wireRich(t, toolbar, () => positionToolbar(), { max: TEXT_MAX });
    t.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(true); return; }
      // Enter finishes, except in a list (where it starts the next point). Shift+Enter: a new line.
      const at = getSelection().anchorNode;
      const inList = (at && (at.nodeType === 1 ? at : at.parentElement))?.closest('li');
      if (e.key === 'Enter' && !e.shiftKey && !inList) { e.preventDefault(); finishEdit(); }
    };
    t.onblur = () => setTimeout(() => {
      if (editingId !== id || document.activeElement === t) return;
      if (rich && rich.busy()) { t.focus(); return; }   // a tap on the style bar
      finishEdit();
    }, 0);
  }

  function finishEdit(cancel = false) {
    if (!editingId) return;
    const id = editingId;
    editingId = null;
    rich?.stop();
    rich = null;
    const el = nodesEl.querySelector(`[data-id="${id}"]`);
    const t = el && el.querySelector('.txt');
    if (t) { t.onblur = null; t.onkeydown = null; }
    const n = byId.get(id);
    if (!n) return;
    const val = cancel || !t ? '' : richFromEditor(t).slice(0, TEXT_MAX);
    if (plainText(val)) n.text = val;
    if (!plainText(n.text)) {
      doc.nodes = doc.nodes.filter(x => x.id !== id);
      if (sel === id) sel = null;
    }
    pendingNew = null;
    save();
    render();
    if (sel) showToolbar();
  }

  // ── structure ──────────────────────────────────────────────────────────
  function nextColor() {
    const used = new Set(doc.nodes.filter(n => meta.get(n.id)?.depth === 1).map(n => n.color));
    return COLOR_KEYS.find(k => !used.has(k)) || COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
  }

  function placeChild(p) {
    const gp = p.parent ? byId.get(p.parent) : null;
    const used = kidsOf(p.id).map(k => Math.atan2(k.y - p.y, k.x - p.x));
    const gapOf = a => (used.length ? Math.min(...used.map(u => angDiff(a, u))) : Math.PI);
    const dist = gp ? 115 : 200;
    let cands;
    if (gp) {
      const base = Math.atan2(p.y - gp.y, p.x - gp.x);
      cands = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2].map(o => base + o);
      const ok = cands.find(a => gapOf(a) > 0.45);
      if (ok !== undefined) return { x: Math.round(p.x + Math.cos(ok) * dist), y: Math.round(p.y + Math.sin(ok) * dist * 0.9) };
    } else {
      cands = Array.from({ length: 24 }, (_, i) => -Math.PI / 2 + i * Math.PI / 12);
    }
    const best = cands.reduce((b, a) => (gapOf(a) > gapOf(b) + 1e-6 ? a : b));
    return { x: Math.round(p.x + Math.cos(best) * dist), y: Math.round(p.y + Math.sin(best) * dist * 0.9) };
  }

  function addChild(pid) {
    const p = byId.get(pid);
    if (!p) return;
    const pos = placeChild(p);
    const n = { id: uid(), parent: pid, text: '', ...pos };
    if (meta.get(pid).depth === 0) n.color = nextColor();
    doc.nodes.push(n);
    pendingNew = n.id;
    sel = n.id;
    render();
    ensureVisible(n);
    startEdit(n.id);
  }

  async function removeNode(id) {
    const ids = subtree(id);
    if (ids.length > 1) {
      const ok = await confirmSheet('Remove this branch?', `This will also remove the ${ids.length - 1} idea${ids.length > 2 ? 's' : ''} growing from it.`, { ok: 'Remove', danger: true });
      if (!ok) return;
    }
    const drop = new Set(ids);
    doc.nodes = doc.nodes.filter(n => !drop.has(n.id));
    sel = null;
    save();
    render();
  }

  // ── gestures ───────────────────────────────────────────────────────────
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  canvas.addEventListener('pointerdown', e => {
    if (e.target.closest('.node-toolbar, .float-controls, .canvas-msg')) return;
    if (editingId && e.target.closest('.node.editing')) return;
    if (editingId) finishEdit();
    if (!doc) return;
    pointers.set(e.pointerId, local(e));
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (pointers.size === 2) {
      if (gesture && gesture.type === 'node' && gesture.moved) save();
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d0: dist(a, b) || 1, m0: mid(a, b), v0: { ...v } };
      return;
    }
    if (pointers.size > 2) return;
    const nodeEl = e.target.closest('.node');
    if (nodeEl && editable() && !decor) {
      const id = nodeEl.dataset.id;
      const orig = new Map(subtree(id).map(i => [i, { x: byId.get(i).x, y: byId.get(i).y }]));
      gesture = { type: 'node', id, start: local(e), moved: false, orig };
    } else {
      gesture = { type: 'pan', start: local(e), v0: { ...v }, moved: false };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const g = gesture, m = mid(a, b);
      const z = clamp(g.v0.z * dist(a, b) / g.d0, 0.2, 2.5);
      const wx = (g.m0.x - g.v0.x) / g.v0.z, wy = (g.m0.y - g.v0.y) / g.v0.z;
      v = { z, x: m.x - wx * z, y: m.y - wy * z };
      applyView();
      positionToolbar();
      return;
    }
    const p = local(e);
    const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    if (!gesture.moved) { gesture.moved = true; if (gesture.type === 'node') { hideToolbar(); canvas.classList.add('dragging'); } }
    if (gesture.type === 'pan') {
      v.x = gesture.v0.x + dx;
      v.y = gesture.v0.y + dy;
      applyView();
      positionToolbar();
    } else if (gesture.type === 'node') {
      for (const [id, o] of gesture.orig) {
        const n = byId.get(id);
        n.x = Math.round(o.x + dx / v.z);
        n.y = Math.round(o.y + dy / v.z);
        const el = nodesEl.querySelector(`[data-id="${id}"]`);
        if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
      }
      renderEdges();
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size < 2) { gesture = null; saveView(); }
      return;
    }
    const g = gesture;
    gesture = null;
    canvas.classList.remove('dragging');
    if (g.type === 'node') {
      if (g.moved) { save(); select(g.id); }
      else if (e.type !== 'pointercancel') {
        if (sel === g.id) startEdit(g.id); else select(g.id);
      }
    } else if (g.type === 'pan') {
      if (g.moved) saveView();
      else if (e.type !== 'pointercancel') {
        if (decor) tapAway(layer);   // 1st tap away sets a sticker down, the next finishes
        else { select(null); layer.deselect(); }
      }
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    clearTimeout(canvas._wheelT);
    canvas._wheelT = setTimeout(saveView, 300);
  }, { passive: false });

  // ── buttons ────────────────────────────────────────────────────────────
  function setDecor(on) {
    decor = on;
    root.classList.toggle('decorating', on);
    layer.setActive(on);
    if (on) { select(null); } else layer.deselect();
  }

  const trayTarget = {
    rectEl: canvas,
    get note() { return editable() ? '' : `Stickers you add here show on ${partnerName()}'s map with a little "from you" 💌`; },
    add(k, cx, cy) {
      if (cx == null) {
        const r = canvas.getBoundingClientRect();
        cx = r.left + r.width / 2 + (Math.random() * 80 - 40);
        cy = r.top + r.height * 0.4 + (Math.random() * 80 - 40);
      }
      layer.add(k, layer.clientToLayer(cx, cy));
    },
    onClose: () => setDecor(false),
  };

  root.addEventListener('click', e => {
    const ob = e.target.closest('[data-owner]');
    if (ob) {
      if (ob.dataset.owner === owner) return;
      if (editingId) finishEdit();
      if (tray.target === trayTarget) tray.close();
      owner = ob.dataset.owner;
      sel = null;
      load();
      render();
      restoreView();
      return;
    }
    const ln = e.target.closest('.tb-lines [data-line]');
    if (ln && sel) {
      // This bubble's line and everything growing from it.
      subtree(sel).forEach(i => { delete byId.get(i).line; });
      byId.get(sel).line = ln.dataset.line;
      save();
      render();
      showToolbar('line');
      return;
    }
    const size = e.target.closest('[data-size]');
    if (size && editingId) {
      const n = byId.get(editingId);
      const i = SIZES.indexOf(n.fs || 1);
      n.fs = SIZES[clamp((i < 0 ? 1 : i) + Number(size.dataset.size), 0, SIZES.length - 1)];
      if (n.fs === 1) delete n.fs;
      nodesEl.querySelector(`[data-id="${n.id}"]`)?.style.setProperty('--fs', n.fs || 1);
      const j = SIZES.indexOf(n.fs || 1);
      toolbar.querySelector('[data-size="-1"]').disabled = j === 0;
      toolbar.querySelector('[data-size="1"]').disabled = j === SIZES.length - 1;
      renderEdges();
      positionToolbar();
      return;
    }
    const sw = e.target.closest('.tb-swatches .sw');
    if (sw && sel) {
      const n = byId.get(sel);
      n.color = sw.dataset.color;
      save();
      render();
      showToolbar();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const r = canvas.getBoundingClientRect();
    switch (act) {
      case 'edit': if (sel) startEdit(sel); break;
      case 'add': if (sel) addChild(sel); break;
      case 'color': showToolbar('color'); break;
      case 'lines': showToolbar('line'); break;
      case 'done-edit': finishEdit(); break;
      case 'delete': if (sel) removeNode(sel); break;
      case 'add-core': {
        if (!editable() || !doc) break;
        if (tray.target === trayTarget) tray.close();
        const rootNode = doc.nodes.find(n => !n.parent);
        if (rootNode) addChild(rootNode.id);
        break;
      }
      case 'zoom-in': zoomAt(r.width / 2, r.height / 2, 1.25); saveView(); break;
      case 'zoom-out': zoomAt(r.width / 2, r.height / 2, 0.8); saveView(); break;
      case 'fit': fit(); break;
      case 'stickers':
        if (tray.target === trayTarget) tray.close();
        else { setDecor(true); tray.open(trayTarget); }
        break;
    }
  });

  store.on((k, source) => {
    if (k === store.keyFor(store.partner(), 'profile')) renderOwner();
    // Gift stickers (from either of you) or new photo stickers: just redraw stickers.
    if (source === 'remote' && /:(gifts|stickerbox)$/.test(k)) { if (doc && !layer.busy()) layer.render(); return; }
    if (source !== 'remote' || k !== store.keyFor(slot(), 'map')) return;
    if (gesture || editingId) return;
    const hadDoc = !!doc;
    load();
    render();
    if (!hadDoc && doc && root.closest('.view.active')) fit();
  });

  window.addEventListener('resize', () => positionToolbar());

  return {
    show() {
      load();
      render();
      if (!shownOnce) { restoreView(); shownOnce = true; }
      positionToolbar();
      if (prefs.mapHintSeen) $('#m-hint', root).hidden = true;
      else setPref('mapHintSeen', true);
    },
  };
}
