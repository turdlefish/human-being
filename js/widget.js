// Home-screen widget for iPhone, via the free Scriptable app.
//
// iOS only lets native apps put widgets on the home screen, and Tend is a web
// app — so we generate a small Scriptable script, personalised with your space
// code, that reads today's check-ins from the shared database and draws them.

import { CONFIG } from './config.js';
import { COLORS } from './util.js';

// Kept free of backticks and "${" so it can live inside this template string.
const TEMPLATE = `// Human Being 🌷 — check-in widget for Scriptable (iOS)
// Paste into a new Scriptable script, then add a Scriptable widget to your
// home screen and choose this script. Tapping the widget opens Human Being.

const SPACE = "%%SPACE%%";
const ME = "%%ME%%";
const APP_URL = "%%APP_URL%%";
const SB_URL = "%%SB_URL%%";
const SB_KEY = "%%SB_KEY%%";
const COLORS = %%COLORS%%;
const INK = new Color("#5B4B5E");
const SOFT = new Color("#8C7B8F");
const RATING_WORDS = ["", "a tiny bit", "a tiny bit", "a little", "a little", "a fair bit", "a fair bit", "a lot", "a lot", "nearly all of it", "all of it"];

function dayKey(d) {
  const m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

async function load() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), "tend-" + SPACE + ".json");
  const keys = [];
  ["a", "b"].forEach(function (s) {
    ["profile", "checkins", "hugs"].forEach(function (d) { keys.push('"tend:' + SPACE + ":p:" + s + ":" + d + '"'); });
  });
  const req = new Request(SB_URL + "/rest/v1/tb_store?select=key,value&key=" + encodeURIComponent("in.(" + keys.join(",") + ")"));
  req.headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
  const today = dayKey(new Date());
  try {
    const rows = await req.loadJSON();
    const raw = {};
    rows.forEach(function (r) {
      let v = r.value;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
      if (v && v.d !== undefined) raw[r.key.split(":").slice(2).join(":")] = v.d;
    });
    const out = { day: today };
    ["a", "b"].forEach(function (s) {
      out[s] = {
        profile: raw["p:" + s + ":profile"] || null,
        checkin: (raw["p:" + s + ":checkins"] || {})[today] || null,
        hug: !!(raw["p:" + s + ":hugs"] || {})[today]
      };
    });
    fm.writeString(cachePath, JSON.stringify(out));
    return out;
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      const cached = JSON.parse(fm.readString(cachePath));
      if (cached.day === today) return cached;
    }
    return { day: today, a: {}, b: {}, offline: true };
  }
}

function person(data, slot, fallbackName) {
  const d = data[slot] || {};
  const p = d.profile || {};
  return {
    name: p.name || fallbackName,
    emoji: p.emoji || "💗",
    c: COLORS[p.color] || COLORS.pink,
    ci: d.checkin,
    hug: d.hug,
    joined: !!d.profile
  };
}

function dots(parent, n, c) {
  const row = parent.addStack();
  row.spacing = 3;
  for (let i = 1; i <= 10; i++) {
    const dot = row.addStack();
    dot.size = new Size(7, 7);
    dot.cornerRadius = 3.5;
    dot.backgroundColor = i <= n ? new Color(c[2]) : new Color("#FFFFFF", 0.85);
  }
}

function card(parent, p, opts) {
  const box = parent.addStack();
  box.layoutVertically();
  box.backgroundColor = new Color(p.c[0]);
  box.cornerRadius = 16;
  box.setPadding(9, 10, 9, 10);

  const top = box.addStack();
  top.centerAlignContent();
  const nm = top.addText(p.emoji + " " + p.name);
  nm.font = Font.boldRoundedSystemFont(12);
  nm.textColor = new Color(p.c[3]);
  nm.lineLimit = 1;
  top.addSpacer();
  if (p.ci && p.ci.rating) {
    const r = top.addText(p.ci.rating + "/10");
    r.font = Font.heavyRoundedSystemFont(12);
    r.textColor = new Color(p.c[3]);
  }
  box.addSpacer(4);

  let text = "hasn't checked in yet 🌱";
  if (!p.joined) text = "hasn't joined yet 💌";
  else if (p.ci && p.ci.need) text = p.ci.need;
  else if (p.ci) text = "checked in 💗";
  const need = box.addText(text);
  need.font = Font.mediumRoundedSystemFont(opts.big ? 15 : 13);
  need.textColor = p.ci && p.ci.need ? INK : SOFT;
  need.lineLimit = opts.lines;
  need.minimumScaleFactor = 0.75;

  if (p.ci && p.ci.rating) {
    box.addSpacer(5);
    dots(box, p.ci.rating, p.c);
    if (opts.big) {
      const w = box.addText(RATING_WORDS[p.ci.rating] || "");
      w.font = Font.mediumRoundedSystemFont(10);
      w.textColor = SOFT;
    }
  }
  if (opts.support && p.ci && p.ci.support) {
    box.addSpacer(5);
    const s = box.addText("💞 " + p.ci.support);
    s.font = Font.regularRoundedSystemFont(11);
    s.textColor = INK;
    s.lineLimit = 2;
  }
  box.addSpacer();
  const fill = box.addStack();
  fill.addSpacer();
  return box;
}

const data = await load();
const PARTNER = ME === "a" ? "b" : "a";
const me = person(data, ME, "Me");
const them = person(data, PARTNER, "My person");
const family = config.widgetFamily || "medium";

const w = new ListWidget();
const g = new LinearGradient();
g.colors = [new Color("#FFF4F8"), new Color("#F1EAFF")];
g.locations = [0, 1];
w.backgroundGradient = g;
w.setPadding(12, 12, 12, 12);
w.url = APP_URL;
w.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);

const head = w.addStack();
head.centerAlignContent();
const title = head.addText("Human Being 🌷");
title.font = Font.boldRoundedSystemFont(13);
title.textColor = INK;
head.addSpacer();
const date = head.addText(new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + (data.offline ? " · offline" : ""));
date.font = Font.mediumRoundedSystemFont(10);
date.textColor = SOFT;
w.addSpacer(7);

if (family === "small") {
  card(w, them, { lines: 4, big: false });
} else if (family === "large") {
  card(w, them, { lines: 4, big: true, support: true });
  w.addSpacer(8);
  card(w, me, { lines: 3, big: true, support: true });
} else {
  const row = w.addStack();
  card(row, me, { lines: 3 });
  row.addSpacer(8);
  card(row, them, { lines: 3 });
}

if (family !== "small" && them.hug) {
  w.addSpacer(6);
  const hug = w.addText("💗 " + them.name + " sent you a hug");
  hug.font = Font.semiboldRoundedSystemFont(11);
  hug.textColor = new Color(them.c[3]);
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;

export function widgetScript({ space, slot }) {
  const colors = {};
  Object.entries(COLORS).forEach(([k, c]) => { colors[k] = [c.bg, c.mid, c.strong, c.ink]; });
  const appUrl = location.origin + location.pathname;
  return TEMPLATE
    .replace('%%SPACE%%', space)
    .replace('%%ME%%', slot)
    .replace('%%APP_URL%%', appUrl)
    .replace('%%SB_URL%%', CONFIG.supabaseUrl)
    .replace('%%SB_KEY%%', CONFIG.supabaseKey)
    .replace('%%COLORS%%', JSON.stringify(colors));
}
