// This app: its name, version, what's new in it (shown once after an update,
// see nudges.js), its website, and where a reminder from your person leads.

export const APP = 'Human Being';
export const NS = 'tend';   // local storage prefix
export const VERSION = '1.3';
export const WEBSITE = 'https://turdlefish.github.io/human-being/';
export const WHATS_NEW = [
  '🗓️ Plan shows the whole week at a glance (🔍 Zoom in for more room)',
  '💻 On a computer it\'s laid out like a normal webpage, with the sections down the left',
  '👉 Remind your person to check in, drink some water or rest (on Us)',
  '📲 Us tells you when one of you has an older version of the app',
];
// A reminder's "Do it now" opens…
export const NUDGE_ROUTES = { checkin: 'today', map: 'map' };
