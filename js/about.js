// This app: its name, version, what's new in it (shown once after an update,
// see nudges.js), its website, and where a reminder from your person leads.

export const APP = 'Human Being';
export const NS = 'tend';   // local storage prefix
export const VERSION = '1.4';
export const WEBSITE = 'https://turdlefish.github.io/human-being/';
// What's new, by version, newest first (a phone that skipped a version sees both).
export const WHATS_NEW = {
  '1.4': [
    '✋ Plan: hold an event for a moment before it moves or stretches, so scrolling past never changes its time',
    '↩️ Moved one by mistake? Tap Undo at the top',
    '💭 App feedback now also reaches the person who makes Human Being',
  ],
  '1.3': [
    '🗓️ Plan shows the whole week at a glance (🔍 Zoom in for more room)',
    '💻 On a computer it\'s laid out like a normal webpage, with the sections down the left',
    '👉 Remind your person to check in, drink some water or rest (on Us)',
    '📲 Us tells you when one of you has an older version of the app',
  ],
};
// A reminder's "Do it now" opens…
export const NUDGE_ROUTES = { checkin: 'today', map: 'map' };
