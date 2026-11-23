// This app: its name, version, what's new in it (shown once after an update,
// see nudges.js), its website, and where a reminder from your person leads.

export const APP = 'Human Being';
export const NS = 'tend';   // local storage prefix
export const VERSION = '1.5';
export const WEBSITE = 'https://turdlefish.github.io/human-being/';
// What's new, by version, newest first. A phone that skipped versions sees
// them all, 🔔 Tell sends your person everything after their version, and Us
// lists every one.
export const WHATS_NEW = {
  '1.5': [
    '🔐 Your check-ins and everything else are now locked to your space: only phones with your code can see or change them',
    '✨ Skipped an update? What\'s new now shows everything you missed, and 🔔 Tell sends your person everything they\'re missing',
    '📜 Every update is listed at the bottom of Us',
    '🍎 Using the iPhone widget? Copy its script again from Us (On an iPhone?) so it keeps updating',
  ],
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
  '1.2': [
    '💭 App feedback on Us: note what to fix or add, and tick it off together',
  ],
  '1.1': [
    '🥱 How tired are you? A new scale in your check-in',
    '😊 Pick several moods a day, and make your own',
    '👉 Boop your person, and get a notification when they finish their check-in',
    '😷 The Unwell face wears a mask now',
  ],
};
// A phone that has never shown What's new ran this version or older (What's new came in 1.3).
export const OLDEST_SEEN = '1.2';
// A reminder's "Do it now" opens…
export const NUDGE_ROUTES = { checkin: 'today', map: 'map' };
