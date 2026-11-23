/* Eingaben: Klicks auf Karten und Knöpfe (über data-act), Tastatur, Formulare. */
import { rankOf } from '../game/cards';
import { shCanBomb, shCanThrow } from '../game/shithead';
import { seatLimit } from '../game/state';
import { TURN_SECS } from '../game/constants';
import type { Action, GameKind } from '../game/types';
import { doAct } from '../net/dispatch';
import { guestLeave, guestStart, guestStop, guestWake } from '../net/guest';
import { hostCancel, hostClose, hostNew, hostResume } from '../net/host';
import { cleanCode, genId } from '../net/ids';
import { asSavedGuest, asSavedHost, HOST_RESUME_MS } from '../net/protocol';
import { App } from './app';
import { initCarousel, layoutOpps } from './carousel';
import { $, esc } from './dom';
import { shakeEl, toast } from './feedback';
import { myTurn, pById } from './helpers';
import { boardHTML } from './render/board';
import { renderEmotes } from './render/emotes';
import { render } from './render/index';
import { legendOn, renderLegend } from './render/legend';
import { renderLobby, turnLabel } from './render/lobby';
import { renderLog } from './render/log';
import { rulesHTML } from './render/rules';
import { renderGame } from './render/schnautz';
import { layoutSwapOpps, renderSh, shMine, shSrc } from './render/shithead';
import { renderTurnNote } from './render/turnnote';
import { updatesHTML } from './render/updates';
import { resetTableUI } from './reset';
import { copyLink, setNet, shareLink, showScreen, updateTitle } from './screens';
import { fitHand, grabRects } from './shithead/hand';
import { renderSoundBtn, sfx, unlockAudio } from './sound';
import { initStart, readName, renderResume, showStartError } from './start';
import { LS, SS } from './storage';

/** Shithead: Karte antippen (Tauschrunde oder Auswahl zum Ausspielen). */
function shTap(kind: 'h' | 'u', i: number): void {
  const v = App.view;
  if (!v || v.game !== 'shithead') return;
  unlockAudio();
  const me = pById(v, App.me);
  const P = shMine(v);
  if (!P || !me) return;
  if (v.phase === 'swap' && !me.ready) {
    if (kind === 'h') App.sw.h = App.sw.h === i ? null : i;
    else App.sw.u = App.sw.u === i ? null : i;
    if (App.sw.h != null && App.sw.u != null) {
      const a: Action = { type: 'shswap', h: App.sw.h, u: App.sw.u };
      App.sw = { h: null, u: null };
      sfx('card');
      doAct(a);
      return;
    }
    // Nur die Auswahl ändert sich, die Karten sollen nicht noch einmal hereinfliegen
    App.anim = {};
    renderSh(v);
    return;
  }
  if (!myTurn(v)) return;
  const src = kind === 'h' ? 'hand' : 'up';
  const arr = P[src];
  if (!arr[i] || shSrc(v) !== src) return;
  const cur = App.ss;
  // Gleiche Werte lassen sich zusammen auswählen, ein anderer Wert startet neu
  if (cur.src !== src || !cur.idx.length || rankOf(arr[cur.idx[0]]) !== rankOf(arr[i])) App.ss = { src, idx: [i] };
  else {
    const k = cur.idx.indexOf(i);
    if (k >= 0) cur.idx.splice(k, 1);
    else cur.idx.push(i);
  }
  App.anim = {};
  renderSh(v);
}

/** Shithead: alle Karten mit dem gewählten Wert markieren. */
function shSelectAll(): void {
  const v = App.view;
  const P = v ? shMine(v) : null;
  const src = App.ss.src;
  if (!v || !P || !src || !App.ss.idx.length) return;
  const arr = P[src];
  const r = rankOf(arr[App.ss.idx[0]]);
  App.ss.idx = arr.flatMap((c, i) => (rankOf(c) === r ? [i] : []));
  App.anim = {};
  renderSh(v);
}

/** Schnautz: Karte aus Hand oder Mitte zum Tauschen wählen. */
function selCard(kind: 'h' | 'm', i: number): void {
  const v = App.view;
  if (!v || !myTurn(v)) return;
  unlockAudio();
  if (kind === 'h') App.sel.h = App.sel.h === i ? null : i;
  else App.sel.m = App.sel.m === i ? null : i;
  App.anim = {};
  renderGame(v);
}

export function confirmBox(text: string, ok: string, cb: () => void): void {
  $('#modal').innerHTML =
    `<div class="modal"><div class="paper sheet" style="max-width:420px"><h2 style="font-size:26px">${esc(text)}</h2>` +
    '<div class="foot" style="margin-top:14px"><button class="btn ghost" data-act="closemodal">Abbrechen</button>' +
    `<button class="btn primary" id="cfm-ok">${esc(ok)}</button></div></div></div>`;
  $('#cfm-ok').onclick = () => {
    $('#modal').innerHTML = '';
    cb();
  };
}

/** Ton an oder aus, aus der Kopfzeile oder mobil aus dem Menü. */
function toggleSound(): void {
  App.muted = !App.muted;
  LS.set('muted', App.muted);
  renderSoundBtn();
  if (!App.muted) {
    unlockAudio();
    sfx('card');
  }
}

function leaveTable(): void {
  resetTableUI();
  if (App.role === 'host') hostClose();
  else guestLeave();
  App.role = null;
  App.view = null;
  App.unread = 0;
  setNet('off');
  history.replaceState(null, '', location.pathname + location.search);
  $('#overlay').innerHTML = '';
  showScreen('start');
  initStart();
  showStartError('');
}

/** Kurze Sperre gegen Doppelklicks bei schnellen Aktionen (4er, Bombe). */
function quickLock(): boolean {
  if (App.throwing) return false;
  App.throwing = true;
  setTimeout(() => {
    App.throwing = false;
  }, 1500);
  return true;
}

function onAction(a: string, t: HTMLElement): void {
  const v = App.view;
  const i = Number(t.dataset.i);
  switch (a) {
    case 'hand':
      selCard('h', i);
      break;
    case 'mid':
      selCard('m', i);
      break;
    case 'shh':
      shTap('h', i);
      break;
    case 'shu':
      shTap('u', i);
      break;
    case 'shd':
      if (App.busy) break;
      App.busy = true;
      sfx('card');
      App.playRects = { t: Date.now(), src: 'down', rects: [t.getBoundingClientRect()] };
      doAct({ type: 'shblind', i });
      break;
    case 'shplay': {
      const { src, idx } = App.ss;
      if (App.busy || !src || !idx.length) break;
      App.busy = true;
      sfx('card');
      grabRects(src, idx);
      App.ss = { src: null, idx: [] };
      doAct({ type: 'shplay', from: src, idx: idx.slice() });
      break;
    }
    case 'shthrow': {
      if (!v || !quickLock()) break;
      sfx('card');
      const ti = shCanThrow(v, App.me);
      if (ti) grabRects(ti.src, ti.idx);
      doAct({ type: 'shthrow' });
      break;
    }
    case 'shbomb': {
      if (!v || !quickLock()) break;
      const bm = shCanBomb(v, App.me);
      if (bm) grabRects(bm.src, bm.idx);
      doAct({ type: 'shbomb' });
      break;
    }
    case 'shselall':
      shSelectAll();
      break;
    case 'shpickup':
      if (App.busy) break;
      App.busy = true;
      doAct({ type: 'shpickup' });
      break;
    case 'shready':
      doAct({ type: 'shready' });
      break;
    case 'legend': {
      const mobile = t.dataset.m === '1';
      LS.set(mobile ? 'legendM' : 'legend', !legendOn(mobile));
      if (v) renderLegend(v, true);
      break;
    }
    case 'emotes':
      document.body.classList.toggle('emoopen');
      break;
    case 'emote':
      document.body.classList.remove('emoopen');
      if (App.emoBlock || !v) break;
      App.emoBlock = true;
      renderEmotes();
      setTimeout(() => {
        App.emoBlock = false;
        renderEmotes();
      }, 1300);
      doAct({ type: 'emote', e: String(t.dataset.e) });
      break;
    case 'game':
      doAct({ type: 'game', game: t.dataset.g as GameKind });
      break;
    case 'addbot':
      doAct({ type: 'addbot' });
      break;
    case 'rmbot':
      doAct({ type: 'rmbot', id: String(t.dataset.id) });
      break;
    case 'rulestab':
      $('#modal').innerHTML = rulesHTML(t.dataset.g as GameKind);
      break;
    case 'swap':
      if (App.sel.h != null && App.sel.m != null) {
        sfx('card');
        doAct({ type: 'swap', h: App.sel.h, m: App.sel.m });
      }
      break;
    case 'swapAll':
      sfx('card');
      doAct({ type: 'swapAll' });
      break;
    case 'pass':
      doAct({ type: 'pass' });
      break;
    case 'knock':
      sfx('knock');
      doAct({ type: 'knock' });
      break;
    case 'keep':
      doAct({ type: 'keep' });
      break;
    case 'take':
      sfx('card');
      doAct({ type: 'take' });
      break;
    case 'ready':
    case 'force':
    case 'skip':
    case 'start':
      doAct({ type: a });
      break;
    case 'lives':
      if (v) doAct({ type: 'rules', rules: { lives: v.rules.lives + Number(t.dataset.d) } });
      break;
    case 'seats':
      if (v) doAct({ type: 'rules', rules: { seats: seatLimit(v) + Number(t.dataset.d) } });
      break;
    case 'ltab':
      App.ltab = t.dataset.t === 'game' ? 'game' : 'table';
      if (v?.phase === 'lobby') renderLobby(v);
      break;
    case 'peek':
      App.peek = true;
      render();
      break;
    case 'unpeek':
      App.peek = false;
      render();
      break;
    case 'copylink':
      $('#menu').hidden = true;
      copyLink();
      break;
    case 'sound':
      $('#menu').hidden = true;
      toggleSound();
      break;
    case 'share':
      navigator
        .share?.({ title: 'Kartentisch', text: 'Komm an meinen Kartentisch!', url: shareLink() })
        .catch(() => {});
      break;
    case 'openlog':
      document.body.classList.add('logopen');
      App.unread = 0;
      renderTurnNote();
      if (v) renderLog(v);
      setTimeout(() => {
        const l = $('#log');
        l.scrollTop = l.scrollHeight;
      }, 50);
      break;
    case 'closelog':
      document.body.classList.remove('logopen');
      renderTurnNote();
      break;
    case 'closemodal':
      $('#modal').innerHTML = '';
      break;
    case 'play':
      // Am Handy öffnet "Spielen" das Popup mit Name, Tisch eröffnen und Beitreten
      document.body.classList.add('startform');
      $<HTMLInputElement>('#name').focus();
      break;
    case 'startclose':
      document.body.classList.remove('startform');
      break;
    case 'updates':
      $('#menu').hidden = true;
      $('#modal').innerHTML = updatesHTML();
      break;
    case 'tolobby':
      $('#menu').hidden = true;
      confirmBox('Partie abbrechen und zurück in die Lobby?', 'Ja, zur Lobby', () => doAct({ type: 'tolobby' }));
      break;
    case 'leave': {
      $('#menu').hidden = true;
      const host = App.role === 'host';
      const text = host
        ? 'Tisch auflösen? Alle anderen fliegen dann raus.'
        : v && v.phase !== 'lobby'
          ? 'Tisch verlassen? Du scheidest dann aus der Partie aus.'
          : 'Tisch wirklich verlassen?';
      confirmBox(text, host ? 'Auflösen' : 'Verlassen', leaveTable);
      break;
    }
    case 'resumehost': {
      const hs = asSavedHost(LS.get<unknown>('host', null));
      if (hs) hostResume(hs);
      break;
    }
    case 'resumeguest': {
      const gs = asSavedGuest(LS.get<unknown>('guest', null));
      if (gs) {
        $<HTMLInputElement>('#name').value = gs.name;
        guestStart(gs.code, gs.name, gs.pid, gs.key);
      }
      break;
    }
    case 'dropresume':
      LS.del(String(t.dataset.k));
      renderResume();
      break;
  }
}

function startHost(): void {
  const n = readName();
  if (!n) return;
  showStartError('');
  unlockAudio();
  const hs = asSavedHost(LS.get<unknown>('host', null));
  if (hs && hs.st.phase !== 'lobby' && Date.now() - hs.ts < HOST_RESUME_MS) {
    confirmBox(`Dein laufender Tisch ${hs.code} geht dann verloren. Trotzdem neu anfangen?`, 'Neu anfangen', () =>
      hostNew(n),
    );
  } else hostNew(n);
}

function startJoin(): void {
  const n = readName();
  if (!n) return;
  const codeInput = $<HTMLInputElement>('#joincode');
  const c = cleanCode(codeInput.value);
  if (c.length !== 5) {
    shakeEl(codeInput);
    toast('Der Code hat fünf Zeichen.');
    return;
  }
  showStartError('');
  unlockAudio();
  let pid = SS.get<string | null>(`pid:${c}`, null);
  let key = SS.get<string | null>(`key:${c}`, null);
  if (!pid || !key) {
    pid = genId('p');
    key = genId('k');
  }
  guestStart(c, n, pid, key);
}

function cancelConnect(): void {
  resetTableUI();
  if (App.role === 'host') hostCancel();
  if (App.role === 'guest') guestStop();
  App.role = null;
  App.view = null;
  setNet('off');
  showScreen('start');
  renderResume();
}

/** Alle Ereignis-Listener einmal beim Start registrieren. */
export function initEvents(): void {
  initCarousel();
  document.addEventListener('visibilitychange', () => {
    updateTitle();
    if (!document.hidden) guestWake();
  });
  window.addEventListener('resize', () => {
    const v = App.view;
    if (v?.game === 'shithead' && v.phase !== 'lobby') {
      fitHand();
      layoutSwapOpps(v);
    }
    if (v && v.phase !== 'lobby') layoutOpps(v);
    if (v && v.phase !== 'lobby') renderLegend(v);
  });
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const menu = $('#menu');
    if (!menu.hidden && !target.closest('#menu') && !target.closest('#btn-menu')) menu.hidden = true;
    if (!target.closest('#emotes') && !target.closest('#emofab')) document.body.classList.remove('emoopen');
    const t = target.closest<HTMLElement>('[data-act]');
    if (t?.dataset.act) onAction(t.dataset.act, t);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#modal').innerHTML = '';
      $('#menu').hidden = true;
      document.body.classList.remove('logopen', 'emoopen', 'startform');
    }
    // Karten sind per Tastatur bedienbar
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('.card[data-act]')) {
      e.preventDefault();
      t.click();
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset?.shrule) {
      doAct({ type: 'rules', rules: { sh: { [t.dataset.shrule]: t.checked } } });
      return;
    }
    if (t.dataset?.rule) doAct({ type: 'rules', rules: { [t.dataset.rule]: t.checked } });
    if (t.dataset?.range === 'turnSecs') doAct({ type: 'rules', rules: { turnSecs: TURN_SECS[Number(t.value)] ?? 0 } });
  });
  // Regler: Wert schon beim Ziehen anzeigen, gesendet wird beim Loslassen
  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset?.range !== 'turnSecs') return;
    const s = TURN_SECS[Number(t.value)] ?? 0;
    const val = document.querySelector('#tval');
    if (val) val.textContent = turnLabel(s);
  });
  $('#btn-host').onclick = startHost;
  $('#btn-join').onclick = startJoin;
  const codeInput = $<HTMLInputElement>('#joincode');
  codeInput.addEventListener('input', () => {
    codeInput.value = cleanCode(codeInput.value);
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-join').click();
  });
  $('#name').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (cleanCode(codeInput.value).length === 5) $('#btn-join').click();
    else $('#btn-host').click();
  });
  $('#btn-cancel').onclick = cancelConnect;
  $('#btn-rules').onclick = () => {
    $('#modal').innerHTML = rulesHTML();
  };
  $('#modal').addEventListener('click', (e) => {
    if ((e.target as Element).classList.contains('modal')) $('#modal').innerHTML = '';
  });
  $('#btn-sound').onclick = toggleSound;
  $('#btn-board').onclick = () => {
    if (App.view) $('#modal').innerHTML = boardHTML(App.view);
  };
  $('#btn-menu').onclick = () => {
    const m = $('#menu');
    m.hidden = !m.hidden;
  };
  $('#codechip').onclick = copyLink;
  $('#chatform').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $<HTMLInputElement>('#chatin');
    const text = inp.value.trim();
    if (!text) return;
    doAct({ type: 'chat', text });
    inp.value = '';
  });
}
