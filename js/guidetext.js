// Human Being's words for the tour and the guide (guide.js shows them).
// A tour step: { tab?, at?: [selectors, first one on show wins], title, text, when? }
// (site: true is the website step: guide.js gives it its words and Open ↗ / 📋 Copy link.)
// (title and text can be functions; they're HTML, so names go through esc).
// A guide section: { icon, title, sub, color, tab?, tabName?, items: [HTML] }.

import * as store from './store.js';
import { esc } from './util.js';

const them = () => store.readPartner('profile', null);
const their = () => esc(them()?.name || 'your person');
const Their = () => esc(them()?.name || 'Your person');

export const TOUR = [
  {
    title: 'Welcome to Human Being 💗',
    text: 'A soft little space for the two of you: daily check-ins, self-care maps and cute plans. Want a quick look around? It takes about a minute.',
  },
  {
    tab: 'today', at: ['#t-me .me-card:not(.viewing) .q-block', '#t-me'],
    title: 'Your daily check-in',
    text: 'Each day, write what\'s taking up the most brain space. It saves as you go, and only the two of you can see it.',
  },
  {
    tab: 'today', at: ['#t-me [data-q="sleep"]', '#t-me'],
    title: 'How you\'re doing, 1 to 10',
    text: 'Tap a number for brain space, sleep, tiredness and spoons (tap it again to clear it). Under sleep, add <b>how many hours you slept</b> with − and +.',
  },
  {
    tab: 'today', at: ['#t-me .chips', '#t-me'],
    title: 'What would help?',
    text: () => `Pick what would help today, say how ${their()} can support you, then pick your moods, as many as fit. <b>＋ Your own</b> adds ideas and moods that fit you.`,
  },
  {
    tab: 'today', at: ['#t-me .done-btn', '#t-me .edit-btn', '#t-me'],
    title: 'Done ✓',
    text: () => `Tap <b>Done</b> when you're finished: ${their()} gets a little notification. <b>✏️ Edit</b> opens it again.`,
  },
  {
    tab: 'today', at: ['#t-them'],
    title: () => (them() ? `${esc(them().name)}'s check-in` : 'Your person'),
    text: () => (them()
      ? `${their()}'s check-in sits beside yours. <b>🤗 Send a hug</b> any day, or <b>👉 Boop</b> them as a gentle reminder to check in.`
      : 'Send your person the code here. Once they join, their check-in sits beside yours, and you can send each other hugs and boops.'),
  },
  {
    tab: 'today', at: ['#t-strip'],
    title: 'Any day',
    text: 'Swipe the days to look back. The little dots show who checked in, and <b>Looking back</b> at the bottom lists the last few days.',
  },
  {
    tab: 'map', at: ['#view-map .view-bar'],
    title: 'Your self-care map',
    text: () => `A poster of what helps you. Tap a bubble to edit it or grow a branch, drag it anywhere, pinch to zoom.${them() ? ` Switch to ${their()}'s map to see theirs.` : ''}`,
  },
  {
    tab: 'map', at: ['#view-map .sticker-btn'],
    title: 'Stickers',
    text: () => `Decorate it with stickers, words and your own photos. Stickers you put on ${their()}'s map show up as little gifts from you.`,
  },
  {
    tab: 'plan', at: ['#p-tabs'],
    title: 'Plans',
    text: 'Plan a day hour by hour, a week, or a month calendar: as many as you like. <b>＋ New</b> makes another, and ⚙ sets its hours and looks.',
  },
  {
    tab: 'plan', at: ['#view-plan .fab'],
    title: 'Events',
    text: 'Tap ＋ or an empty spot to add an event, and tap one to change it. To move one, hold it for a moment, then drag, or stretch it from its bottom edge. Slipped? Tap <b>Undo</b>.',
  },
  {
    tab: 'us', at: ['.tab[data-tab="us"]'],
    title: 'Us',
    text: () => `Your name, colour and character, your space code, <b>👉 reminders</b> for ${their()}, photo stickers, the home-screen widget, pastel or galaxy, and <b>💭 app feedback</b>.`,
  },
  { tab: 'us', at: ['#u-site'], site: true },
  {
    at: ['#help-btn'],
    title: 'Help is always here',
    text: 'Tap <b>?</b> any time to take this tour again, or read the guide to everything in Human Being.',
  },
];

export const GUIDE = {
  intro: 'Everything you can do in Human Being. Tap a section to open it.',
  sections: [
    {
      icon: '💗', title: 'Today', sub: 'your daily check-in', color: 'pink', tab: 'today', tabName: 'Today',
      items: () => [
        '✍️ <b>What\'s taking up the most brain space</b>, in your own words. Everything saves as you go.',
        '🔢 Four 1–10 scales: <b>🧠 brain space</b>, <b>🌙 sleep</b> (and <b>how many hours</b> you slept: − and +, or type it), <b>🥱 tiredness</b> and <b>🥄 spoons</b> (with what you have spoons for). Tap a number again to clear it.',
        '🤲 <b>What would help?</b> Tap as many as you like. <b>＋ Your own</b> adds yours.',
        `💬 <b>How ${their()} can support you</b>, in a sentence.`,
        '😊 <b>Moods</b>: pick several. <b>more</b> shows them all, and <b>your own</b> makes a mood with any emoji.',
        `✓ <b>Done</b> turns it into a neat card and lets ${their()} know. <b>✏️ Edit</b> opens it again.`,
        `💞 <b>${Their()}'s check-in</b> sits beside yours. <b>🤗 Send a hug</b> any day, or <b>👉 Boop</b> them when they haven't checked in yet (once every half hour).`,
        '📅 <b>Swipe the days</b> to see any day (the dots show who checked in). <b>↩ Today</b> comes back, and <b>Looking back</b> lists recent days: tap one to open it.',
      ],
    },
    {
      icon: '🌱', title: 'Self-care', sub: 'your map of what helps', color: 'mint', tab: 'map', tabName: 'Self-care',
      items: () => [
        '🫧 A poster of what helps you: your self-care in the middle, core needs around it (rest, nourish, move, connect, calm, joy) and ideas branching off them.',
        '✏️ Tap a bubble for <b>edit</b>, <b>branch</b> (a new idea off it), <b>lines</b> (curvy, wavy, dotted, vine…), <b>colour</b> and <b>delete</b>. While you\'re editing, its bar has bold, lists and text size.',
        '✋ Drag a bubble anywhere and its branch comes along. Pinch or ＋ / － to zoom, ⤢ to fit it all on screen. <b>＋ core need</b> adds a new main bubble.',
        '⭐ <b>Stickers</b>: the sticker button opens the drawer: drawn packs (cute, nature, cozy, work, travel and more), washi tape, words, emoji and your own photo stickers. Drag, turn and resize them on the page. Hold one in the drawer to keep it in <b>⭐ Favourites</b>.',
        `💞 <b>My map / ${Their()}'s map</b>: see theirs, and leave stickers on it as little gifts from you.`,
      ],
    },
    {
      icon: '🗓️', title: 'Plan', sub: 'days, weeks and months', color: 'lavender', tab: 'plan', tabName: 'Plan',
      items: () => [
        '📋 Make as many plans as you like: <b>Daily</b> (one day, hour by hour), <b>Weekly</b> (Monday to Sunday) or <b>Monthly</b> (a calendar). <b>＋ New</b> adds one; the tabs switch between them.',
        '➕ Tap ＋ or an empty spot to add an event: what it\'s for, an emoji and a sticker, the time, its colour and notes. In a week, pick several days to add it to each; on a month calendar it can repeat.',
        '✋ Hold an event for a moment, then drag it to move it (to another day, in a week), or stretch it from its bottom edge. <b>Undo</b> shows at the top after a move.',
        '🗓️ A week opens on the <b>whole week</b> at a glance. <b>🔍 Zoom in</b> gives each day more room.',
        '⚙ A plan\'s settings: its name, its hours, how events snap (every 15, 30 or 60 minutes), row size, the first day of the week, what events show (name, emoji, sticker or a mix; each event can choose too), the order of your plans, and delete.',
        '🎨 Decorate any plan with stickers, like a paper planner.',
        `💞 <b>${Their()}'s plans</b>: switch at the top to see them, and tap an event for its times and notes.`,
      ],
    },
    {
      icon: '💞', title: 'Us', sub: 'you two, and settings', color: 'peach', tab: 'us', tabName: 'Us',
      items: () => [
        '🙋 Your name, colour and character. Tapping your two faces at the top comes here too.',
        '🔑 Your <b>space code</b>: your person joins with it, and it signs you in on another phone. Keep it between you.',
        `👉 <b>Remind ${their()}</b> to check in, have water, eat, take their meds, rest or look at their self-care map, or send your own words.`,
        '📷 <b>Your sticker book</b>: turn your photos into stickers you can both use.',
        '📱 <b>On your home screen</b>: how to add the app and the check-in widget (Android, or iPhone through the Scriptable app).',
        '🎨 <b>Preferences</b>: 🌷 pastel or 🌌 galaxy, bionic reading (bolds the start of each word), and 12- or 24-hour time.',
        '💭 <b>App feedback</b>: notes on what to fix or add, ticked off together. The person who makes Human Being reads them too.',
        '☁️ <b>Sync & backup</b>: sync now, save a copy of your data, see which version you have, and the website\'s link (🌐 open it, or 📋 copy it). <b>📜 Every update</b> is at the very bottom.',
      ],
    },
    {
      icon: '🔔', title: 'On your phone', sub: 'notifications and the widget', color: 'sky',
      items: () => [
        `🔔 The Android app lets you know when ${their()} sends a hug, a boop or a reminder, or finishes their check-in, even while it's closed.`,
        '🧩 The <b>widget</b> shows both your check-ins on your home screen. Tap it to open Human Being.',
        `✨ After an update, <b>What's new</b> shows what changed, and <b>🔔 Tell</b> lets ${their()} know.`,
      ],
    },
    {
      icon: '💡', title: 'Good to know', sub: 'little tips', color: 'butter',
      items: () => [
        '📶 It works offline: your changes stay on your phone and sync when you\'re back online.',
        '🔐 Only phones with your space code can see your check-ins, maps and plans.',
        '📲 Got a new phone? Choose <b>I have a code</b> and pick yourself to sign in.',
        '📋 <b>Human Doing</b>, the sister app, uses the same code for trackers, to-dos and plans.',
        '💻 Human Being also works as a website (its link is at the top of this guide, and on Us), laid out wide on a computer. Use your space code there and it syncs with the app both ways.',
      ],
    },
  ],
  foot: 'Tap ? at the top of any screen to come back here.',
};
