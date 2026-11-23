// "What would help?" on the daily check-in: the built-in choices, plus any a
// person adds themselves (kept in their profile as helpTags, so their partner
// and the widget can show them too).

export const SUPPORT_TAGS = [
  { id: 'rest', label: 'Rest', emoji: '😴' },
  { id: 'reassure', label: 'Reassurance', emoji: '🫶' },
  { id: 'time', label: 'Quality time', emoji: '💞' },
  { id: 'space', label: 'Some space', emoji: '🫧' },
  { id: 'help', label: 'Help with tasks', emoji: '🧺' },
  { id: 'touch', label: 'Cuddles', emoji: '🤗' },
  { id: 'words', label: 'Encouragement', emoji: '💌' },
  { id: 'food', label: 'Food & water', emoji: '🍓' },
  { id: 'listen', label: 'Just listen', emoji: '👂' },
  { id: 'fun', label: 'Something fun', emoji: '🎈' },
  { id: 'patience', label: 'Patience', emoji: '🐢' },
  { id: 'quiet', label: 'Quiet', emoji: '🤫' },
];

export const helpTagsFor = profile => [...SUPPORT_TAGS, ...(profile && Array.isArray(profile.helpTags) ? profile.helpTags : [])];

/** "🧋 Bubble tea" for a tag id, or '' if it's unknown (e.g. since removed). */
export function helpTagLabel(id, profile) {
  const t = helpTagsFor(profile).find(x => x.id === id);
  return t ? `${t.emoji} ${t.label}` : '';
}
