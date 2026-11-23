// First-run flow: start a new space for the two of you, or join your
// partner's with their code (also how you sign in on a new device).

import * as store from './store.js';
import { COLOR_KEYS, colorVars, copyText, esc, toast } from './util.js';
import { AVATARS, AVATAR_IDS, avatarHTML, avatarPickerHTML } from './avatars.js';
import { markSwatch, swatchesHTML } from './ui.js';
import { seedMap } from './map.js';
import { seedSchedules } from './plan.js';
import { inviteText } from './today.js';
import { canShare, shareText } from './native.js';

export function showOnboarding(done) {
  const el = document.createElement('div');
  el.className = 'onboard';
  document.body.append(el);

  const draft = {
    name: '',
    color: COLOR_KEYS[Math.floor(Math.random() * 3)],
    avatar: AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)],
  };
  let mode = null;      // 'start' | 'join'
  let joinCode = '', joinSlot = null, peek = {};

  const screens = {
    welcome: () => `
      <div class="ob-art"><span class="ob-heart">💗</span><span class="ob-s s1">🌷</span><span class="ob-s s2">✨</span><span class="ob-s s3">☁️</span></div>
      <h1 class="ob-title">Human Being</h1>
      <p class="ob-sub">a soft little space for the two of you — check in on each other's needs, map out your self-care, and plan your days together.</p>
      <button type="button" class="btn big" data-go="choice">Let's begin</button>`,

    choice: () => `
      <h2 class="ob-h">Hello, lovely 👋</h2>
      <p class="ob-sub">Is this the first phone in your little space?</p>
      <button type="button" class="ob-choice" data-go="start" style="${colorVars('pink')}">
        <span class="ob-choice-art">🌱</span><span><b>Start our space</b><small>I'll invite my person with a code</small></span></button>
      <button type="button" class="ob-choice" data-go="join" style="${colorVars('lavender')}">
        <span class="ob-choice-art">💌</span><span><b>I have a code</b><small>Join my person, or sign in on a new device</small></span></button>
      <button type="button" class="link-btn" data-go="welcome">‹ back</button>`,

    profile: () => `
      <h2 class="ob-h">Tell us about you</h2>
      <form class="ob-form" data-form="profile" style="${colorVars(draft.color)}">
        <label class="field"><span>What should we call you?</span>
          <input class="inp" name="nick" maxlength="24" value="${esc(draft.name)}" placeholder="your name or nickname" autocomplete="nickname" required></label>
        <div class="field"><span>Pick your colour</span>${swatchesHTML(draft.color)}</div>
        <div class="field"><span>And your little character</span>${avatarPickerHTML(draft.avatar, '')}</div>
        <button type="submit" class="btn big">${mode === 'start' ? 'Create our space' : 'Join our space'}</button>
      </form>
      <button type="button" class="link-btn" data-go="${mode === 'start' ? 'choice' : 'join'}">‹ back</button>`,

    created: () => `
      <div class="ob-art small"><span class="ob-heart">🎉</span></div>
      <h2 class="ob-h">Your space is ready!</h2>
      <p class="ob-sub">Send your person this code. When they open Human Being and tap “I have a code”, your check-ins will appear side by side.</p>
      <div class="code-pill big">${esc(store.getSession().space)}</div>
      <div class="btn-row center">
        <button type="button" class="btn" data-act="copy">Copy invite</button>
        ${canShare() ? '<button type="button" class="btn ghost" data-act="share">Share…</button>' : ''}
      </div>
      <button type="button" class="btn big" data-act="enter" style="${colorVars('mint')}">Open Human Being 💗</button>`,

    join: () => `
      <h2 class="ob-h">Enter your code</h2>
      <p class="ob-sub">It looks like <b>sunny-otter-4821</b>.</p>
      <form class="ob-form" data-form="join">
        <input class="inp code-inp" name="code" value="${esc(joinCode)}" placeholder="your-space-code" autocomplete="off" autocapitalize="none" spellcheck="false" required>
        <p class="ob-err" hidden></p>
        <button type="submit" class="btn big">Find our space</button>
      </form>
      <button type="button" class="link-btn" data-go="choice">‹ back</button>`,

    who: () => {
      const opts = ['a', 'b'].map(s => peek[s]
        ? `<button type="button" class="ob-choice" data-slot="${s}" data-existing="1" style="${colorVars(peek[s].color)}">
             <span class="ob-choice-art">${avatarHTML(peek[s])}</span><span><b>I'm ${esc(peek[s].name)}</b><small>signing in on another device</small></span></button>`
        : `<button type="button" class="ob-choice" data-slot="${s}" style="${colorVars('mint')}">
             <span class="ob-choice-art">🌱</span><span><b>I'm new here</b><small>join this space as the second person</small></span></button>`).join('');
      return `
        <h2 class="ob-h">Found it! 💞</h2>
        <p class="ob-sub">Who are you?</p>
        ${opts}
        <p class="ob-err" hidden></p>
        <button type="button" class="link-btn" data-go="join">‹ back</button>`;
    },
  };

  function show(name) {
    el.innerHTML = `<div class="ob-card">${screens[name]()}</div>`;
    el.dataset.screen = name;
    const first = el.querySelector('input');
    if (first && name !== 'profile') setTimeout(() => first.focus(), 50);
  }

  function seedMine() {
    store.writeMine('profile', { name: draft.name, color: draft.color, avatar: draft.avatar, emoji: AVATARS[draft.avatar].emoji });
    store.writeMine('checkins', {});
    store.writeMine('hugs', {});
    store.writeMine('map', seedMap());
    store.writeMine('schedules', seedSchedules());
  }

  function finish() {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
    done();
  }

  el.addEventListener('click', async e => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (go === 'start' || go === 'join') mode = go;
    if (go === 'start') { show('profile'); return; }
    if (go) { show(go); return; }

    const sw = e.target.closest('.sw');
    if (sw) {
      draft.color = sw.dataset.color;
      markSwatch(el, draft.color);
      el.querySelector('.ob-form')?.setAttribute('style', colorVars(draft.color));
      return;
    }
    const av = e.target.closest('[data-avatar]');
    if (av) {
      draft.avatar = av.dataset.avatar;
      el.querySelectorAll('.avatar-pick').forEach(b => { const on = b === av; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      return;
    }
    const slotBtn = e.target.closest('[data-slot]');
    if (slotBtn) {
      joinSlot = slotBtn.dataset.slot;
      if (!slotBtn.dataset.existing) { show('profile'); return; }
      // Signing in on another device: everything must come down from the
      // server first, or blank starter data could overwrite the real thing.
      store.setSession({ space: joinCode, slot: joinSlot, joined: Date.now() });
      slotBtn.disabled = true;
      if (await store.pull({ force: true }) && store.readMine('profile')) { finish(); return; }
      store.signOut();
      slotBtn.disabled = false;
      const err = el.querySelector('.ob-err');
      err.hidden = false;
      err.textContent = "Couldn't download your things — check your connection and try again.";
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'copy') {
      const ok = await copyText(inviteText());
      toast(ok ? 'Invite copied 💌' : 'Could not copy — share the code instead');
    } else if (act === 'share') {
      shareText('Human Being', inviteText());
    } else if (act === 'enter') {
      finish();
    }
  });

  el.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form === 'profile') {
      const nick = form.elements.namedItem('nick');
      draft.name = nick.value.trim();
      if (!draft.name) { nick.focus(); return; }
      if (mode === 'start') {
        store.setSession({ space: store.makeSpaceCode(), slot: 'a', joined: Date.now() });
        seedMine();
        store.flush();
        show('created');
      } else {
        store.setSession({ space: joinCode, slot: joinSlot, joined: Date.now() });
        seedMine();
        store.flush();
        await store.pull({ force: true });
        toast(`You're connected with ${peek[joinSlot === 'a' ? 'b' : 'a']?.name || 'your person'} 💞`);
        finish();
      }
    } else if (form.dataset.form === 'join') {
      const code = store.normalizeCode(form.elements.namedItem('code').value);
      const err = form.querySelector('.ob-err');
      const btn = form.querySelector('[type=submit]');
      if (!code) return;
      joinCode = code;
      btn.disabled = true;
      btn.textContent = 'Looking…';
      try {
        peek = await store.peekSpace(code);
        if (!peek.a && !peek.b) {
          err.hidden = false;
          err.textContent = "Hmm, we couldn't find a space with that code. Check the spelling?";
        } else {
          show('who');
          return;
        }
      } catch (ex) {
        err.hidden = false;
        err.textContent = "Couldn't reach the server — check your connection and try again.";
      }
      btn.disabled = false;
      btn.textContent = 'Find our space';
    }
  });

  show('welcome');
}
