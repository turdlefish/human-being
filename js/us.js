// Us: profile, partner invite, home-screen setup (app + widget), preferences,
// sync status and backups.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { $, colorVars, copyText, dayKey, esc, prefs, setPref, toast } from './util.js';
import { confirmSheet, swatchesHTML } from './ui.js';
import { inviteText } from './today.js';
import { canShare, isNative, shareText, stopNative } from './native.js';
import { AVATARS, avatarHTML, avatarId, avatarPickerHTML } from './avatars.js';
import { usSticker } from './icons.js';
import { addFromFile, chooseShape, myItems, partnerItems, pickPhoto, removeMine } from './custom.js';
import { mountFeedback } from './feedback.js';
import { openRemind } from './remind.js';
import { openWhatsNew, tellWhatsNew, versionNote } from './nudges.js';
import { APP, VERSION } from './about.js';
import { isShortCode, startMove } from './spacemove.js';

const STATUS_TEXT = {
  idle: 'Getting ready…',
  synced: 'All synced 💞',
  saving: 'Saving…',
  offline: 'Offline — your changes are safe on this device and will sync later',
  error: "Couldn't reach the server — will keep trying",
};

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function createUs(root, { onTimeFormat, onTheme, onBionic } = {}) {
  root.innerHTML = '<div class="page us" id="u-page"></div>';
  const page = $('#u-page', root);

  function widgetPreview() {
    const me = store.readMine('profile', {});
    const them = store.readPartner('profile', null);
    const t = dayKey();
    const mine = store.readMine('checkins', {})[t];
    const theirs = store.readPartner('checkins', {})[t];
    const dotRow = (icon, n) => `<div class="wp-dots"><span>${icon}</span><div class="rdots small">${Array.from({ length: 10 }, (_, i) => `<span class="rd${i < n ? ' on' : ''}"></span>`).join('')}</div></div>`;
    const col = (p, c, fallback) => `
      <div class="wp-card" style="${colorVars(p ? p.color : 'lavender')}">
        <div class="wp-top"><b>${esc(p ? (p.emoji || '💗') + ' ' + p.name : fallback)}</b></div>
        <p>${esc(c && c.need ? c.need : (p ? "hasn't checked in yet 🌱" : "hasn't joined yet 💌"))}</p>
        ${c && c.rating ? dotRow('🧠', c.rating) : ''}
        ${c && c.sleep ? dotRow('🌙', c.sleep) : ''}
        ${c && c.tired ? dotRow('🥱', c.tired) : ''}
        ${c && c.spoons ? dotRow('🥄', c.spoons) : ''}
      </div>`;
    return `<div class="widget-preview" aria-label="Widget preview">
        <div class="wp-head"><b>Human Being 🌷</b><span>${esc(new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>
        <div class="wp-row">${col(me, mine, 'Me')}${col(them, theirs, 'My person')}</div>
      </div>`;
  }

  function render() {
    const me = store.readMine('profile', {});
    const them = store.readPartner('profile', null);
    const sess = store.getSession();
    const status = store.getStatus();
    page.innerHTML = `
      <h1 class="display">Us <span class="wave">${usSticker()}</span></h1>

      <section class="card" style="${colorVars(me.color)}">
        <div class="card-tape"></div>
        <h3 class="card-title">You</h3>
        <div class="profile-row">
          <span class="avatar big">${avatarHTML(me)}</span>
          <label class="field grow"><span>Your name</span>
            <input class="inp" id="u-name" maxlength="24" value="${esc(me.name || '')}" autocomplete="nickname"></label>
        </div>
        <div class="field"><span>Your colour</span>${swatchesHTML(me.color)}</div>
        <div class="field"><span>Your profile picture</span>${avatarPickerHTML(avatarId(me), colorVars(me.color))}</div>
      </section>

      <section class="card" style="${colorVars(them ? them.color : 'lavender')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Your person</h3>
        ${them ? `
          <div class="profile-row">
            <span class="avatar big">${avatarHTML(them)}</span>
            <div><p class="big-name">${esc(them.name)}</p><p class="muted small">connected · sharing check-ins, maps and plans</p></div>
          </div>` : `
          <p>Invite your person so you can see each other's check-ins, self-care maps and plans.</p>`}
        <p class="muted small">Your space code</p>
        <div class="code-pill">${esc(sess.space)}</div>
        ${isShortCode(sess.space) ? '<button type="button" class="btn ghost" data-act="longer-code">🔑 Make our code longer</button>' : ''}
        ${them ? '' : '<button type="button" class="btn" data-act="invite">Copy invite</button>'}
        ${canShare() && !them ? '<button type="button" class="btn ghost" data-act="share">Share…</button>' : ''}
        ${them ? `<button type="button" class="btn ghost remind-us" data-act="remind">👉 Remind ${esc(them.name)}…</button>${versionNote()}` : ''}
      </section>

      <section class="card" style="${colorVars('peach')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Your sticker book</h3>
        <p class="muted small">Turn your photos into stickers for your maps and plans. You can both use them — they're under ✨ Ours in the sticker drawer.</p>
        <div class="sbook">
          <button type="button" class="sbook-add" data-act="add-sticker">📷<small>add photo</small></button>
          ${myItems().map(i => `<div class="sbook-item"><img src="${i.src}"${i.shape ? ' class="shaped"' : ''} alt="" draggable="false"><button type="button" class="sbook-del" data-del-sticker="${i.id}" aria-label="Remove sticker">×</button></div>`).join('')}
        </div>
        ${them && partnerItems().length ? `
          <p class="muted small sbook-label">Made by ${esc(them.name)}</p>
          <div class="sbook">${partnerItems().map(i => `<div class="sbook-item"><img src="${i.src}"${i.shape ? ' class="shaped"' : ''} alt="" draggable="false"></div>`).join('')}</div>` : ''}
      </section>

      <section class="card" style="${colorVars('mint')}">
        <div class="card-tape"></div>
        <h3 class="card-title">On your home screen</h3>
        ${isNative ? `
          <h4>Add the Human Being widget</h4>
          ${widgetPreview()}
          <ol class="steps">
            <li>Long-press an empty spot on your home screen.</li>
            <li>Tap <b>Widgets</b> and find <b>Human Being</b>.</li>
            <li>Drag it onto your home screen. Make it wide to see you both side by side, or narrow to see just your person.</li>
            <li>To make it see-through or switch it to the galaxy style, long-press the widget and tap its <b>settings / ✏️</b> button.</li>
          </ol>
          <p class="muted small">It updates straight away when either of you checks in while Human Being is open, and checks for news by itself about every 30 minutes. Tap it to open Human Being.</p>` : `
          <h4>1 · Add Human Being as an app</h4>
          <ul class="steps">
            <li><b>Android:</b> open Human Being in Chrome → menu ⋮ → <b>Add to Home screen</b> (or <b>Install app</b>).</li>
            <li><b>iPhone:</b> open Human Being in Safari → Share <span aria-hidden="true">⬆️</span> → <b>Add to Home Screen</b>.</li>
          </ul>
          <h4>2 · The check-in widget</h4>
          ${widgetPreview()}
          <p>On Android, the widget comes with the <b>Human Being Android app</b> — install it and add the widget from your home screen's widget list.</p>
          <details class="more">
            <summary>On an iPhone?</summary>
            <ol class="steps">
              <li>Install the free <b>Scriptable</b> app from the App Store.</li>
              <li>Tap <b>Copy widget script</b> below.</li>
              <li>In Scriptable, tap <b>＋</b>, paste, and rename the script to <b>Human Being</b>.</li>
              <li>Long-press your home screen → <b>＋</b> → search <b>Scriptable</b> → pick a size → <b>Add Widget</b>.</li>
              <li>Long-press the new widget → <b>Edit Widget</b> → Script: <b>Human Being</b>.</li>
            </ol>
            <button type="button" class="btn" data-act="copy-widget">Copy widget script</button>
          </details>`}
      </section>

      <section class="card" style="${colorVars('butter')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Preferences</h3>
        <div class="field"><span>Look</span>
          <div class="seg wide" data-pref="theme">
            <button type="button" data-v="auto" class="${!prefs.theme || prefs.theme === 'auto' ? 'on' : ''}">Auto</button>
            <button type="button" data-v="light" class="${prefs.theme === 'light' ? 'on' : ''}">🌷 Pastel</button>
            <button type="button" data-v="dark" class="${prefs.theme === 'dark' ? 'on' : ''}">🌌 Galaxy</button>
          </div></div>
        <div class="field"><span>Reading</span>
          <div class="seg wide" data-pref="bionic">
            <button type="button" data-v="off" class="${prefs.bionic ? '' : 'on'}">Normal</button>
            <button type="button" data-v="on" class="${prefs.bionic ? 'on' : ''}"><b>Bio</b>nic <b>rea</b>ding</button>
          </div>
          <small class="muted pref-hint">Bolds the start of each word to help your eyes glide along.</small></div>
        <div class="field bionic-level"${prefs.bionic ? '' : ' hidden'}><span>Bold strength</span>
          <div class="seg wide" data-pref="bionicLevel">
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" class="${(prefs.bionicLevel || 3) === n ? 'on' : ''}">F${n}</button>`).join('')}
          </div>
          <small class="muted pref-hint">F1 bolds the most of each word, F5 the least.</small></div>
        <div class="field"><span>Time format</span>
          <div class="seg wide" data-pref="hour12">
            <button type="button" data-v="auto" class="${typeof prefs.hour12 !== 'boolean' ? 'on' : ''}">Auto</button>
            <button type="button" data-v="12" class="${prefs.hour12 === true ? 'on' : ''}">12-hour</button>
            <button type="button" data-v="24" class="${prefs.hour12 === false ? 'on' : ''}">24-hour</button>
          </div></div>
      </section>

      <section class="card fb-card" id="u-fb" style="${colorVars('lavender')}"></section>

      <section class="card" style="${colorVars('sky')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Sync & backup</h3>
        <p class="muted small app-ver">📱 You're using <b>${APP} ${VERSION}</b>, ${isNative ? 'the Android app' : 'the website'}.</p>
        <p class="sync-line" data-state="${status.state}"><span class="dot"></span><span id="u-status">${esc(STATUS_TEXT[status.state] || '')}</span></p>
        ${CONFIG.mock ? '<p class="muted small">Using the local test server (mock mode).</p>' : ''}
        <div class="btn-row">
          <button type="button" class="btn ghost" data-act="sync">Sync now</button>
          <button type="button" class="btn ghost" data-act="backup">${isNative ? 'Share a backup' : 'Download my data'}</button>
        </div>
        <button type="button" class="btn ghost danger-text" data-act="signout">Sign out on this device</button>
      </section>

      <p class="footer-note">made with 💗 for two<br><button type="button" class="link-btn" data-act="whats-new">📜 ${APP} ${VERSION}: every update</button></p>`;
    mountFeedback($('#u-fb', page));
  }

  page.addEventListener('input', e => {
    if (e.target.id === 'u-name') {
      const p = store.readMine('profile', {});
      p.name = e.target.value.trim() || p.name;
      store.writeMine('profile', p);
    }
  });

  page.addEventListener('click', async e => {
    const sw = e.target.closest('.sw');
    if (sw) {
      const p = store.readMine('profile', {});
      p.color = sw.dataset.color;
      store.writeMine('profile', p);
      render();
      return;
    }
    const av = e.target.closest('[data-avatar]');
    if (av) {
      const p = store.readMine('profile', {});
      p.avatar = av.dataset.avatar;
      p.emoji = AVATARS[p.avatar].emoji;   // text stand-in for the widget
      store.writeMine('profile', p);
      render();
      return;
    }
    const pref = e.target.closest('[data-pref] button');
    if (pref) {
      const v = pref.dataset.v;
      pref.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === pref));
      if (pref.parentElement.dataset.pref === 'theme') {
        setPref('theme', v);
        onTheme && onTheme();
      } else if (pref.parentElement.dataset.pref === 'bionic') {
        setPref('bionic', v === 'on');
        root.querySelector('.bionic-level').hidden = v !== 'on';
        onBionic && onBionic();
      } else if (pref.parentElement.dataset.pref === 'bionicLevel') {
        setPref('bionicLevel', Number(v));
        onBionic && onBionic();
      } else {
        setPref('hour12', v === 'auto' ? null : v === '12');
        onTimeFormat && onTimeFormat();
      }
      return;
    }
    const del = e.target.closest('[data-del-sticker]');
    if (del) {
      const ok = await confirmSheet('Remove this sticker?', "It'll disappear from your sticker book and anywhere it's been placed.", { ok: 'Remove', danger: true });
      if (ok) { removeMine(del.dataset.delSticker); render(); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    switch (act) {
      case 'add-sticker': {
        const file = await pickPhoto();
        if (!file) break;
        try {
          const shape = await chooseShape(file);
          if (!shape) break;
          await addFromFile(file, shape);
          render();
          toast(shape === 'own' ? 'Sticker made — it kept its own shape ✨' : 'Photo sticker made ✨');
        } catch (err) {
          toast("Couldn't use that photo — try another one");
        }
        break;
      }
      case 'remind': openRemind(); break;
      case 'longer-code': startMove(); break;
      case 'whats-new': openWhatsNew(); break;
      case 'tell-new': tellWhatsNew(); break;
      case 'invite': {
        const ok = await copyText(inviteText());
        toast(ok ? 'Invite copied — send it to your person 💌' : 'Could not copy — share the code instead');
        break;
      }
      case 'share':
        shareText('Human Being', inviteText());
        break;
      case 'copy-widget': {
        const s = store.getSession();
        const { widgetScript } = await import('./widget.js');   // iPhone only, so the Android app doesn't carry it
        const ok = await copyText(widgetScript({ space: s.space, slot: s.slot }));
        toast(ok ? 'Widget script copied — paste it into Scriptable 📱' : 'Could not copy the script');
        break;
      }
      case 'sync':
        toast('Syncing…');
        await store.syncNow();
        toast(STATUS_TEXT[store.getStatus().state] || 'Done');
        break;
      case 'backup': {
        const json = JSON.stringify(store.exportMine(), null, 2);
        if (isNative) { shareText(`Human Being backup ${dayKey()}`, json); break; }   // WebViews can't download files
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `human-being-backup-${dayKey()}.json`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        break;
      }
      case 'signout': {
        const pending = store.getStatus().pending;
        const ok = await confirmSheet('Sign out on this device?',
          pending
            ? `You have ${pending} change${pending > 1 ? 's' : ''} that haven't synced yet and would be lost. Your space stays safe — you can sign back in with your code.`
            : 'Your data stays safe in your space — sign back in any time with your code.',
          { ok: 'Sign out', danger: true });
        if (!ok) return;
        stopNative();
        store.signOut();
        location.hash = '';
        location.reload();
        break;
      }
    }
  });

  store.onStatus(s => {
    const line = page.querySelector('.sync-line');
    if (!line) return;
    line.dataset.state = s.state;
    const el = page.querySelector('#u-status');
    if (el) el.textContent = (STATUS_TEXT[s.state] || '') + (s.state === 'synced' ? ' · ' + ago(s.at) : '');
  });

  store.on((k, source) => {
    if (source === 'remote' && root.classList.contains('active')) {
      const typing = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
      if (!typing) render();
    }
  });

  return { show: render };
}
