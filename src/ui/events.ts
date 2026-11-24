/* Eingaben: Klicks auf Karten und Knöpfe (über data-act), Tastatur, Formulare. */
import { rankOf } from '../game/cards';
import { shCanBomb, shCanThrow } from '../game/shithead';
import { seatLimit } from '../game/state';
import { EMOTE_GAP_MS, SOUND_GAP_MS, SOUNDS, TOSS_ITEMS, TURN_SECS } from '../game/constants';
import type { Action, GameKind, TossItem } from '../game/types';
import { doAct } from '../net/dispatch';
import { guestLeave, guestStart, guestStop, guestWake } from '../net/guest';
import { hostCancel, hostClose, hostNew, hostNewVsBots, hostResume } from '../net/host';
import { cleanCode, genId } from '../net/ids';
import { asSavedGuest, asSavedHost, HOST_RESUME_MS } from '../net/protocol';
import { App, type EmoTab } from './app';
import { burst } from './burst';
import { CAR, initCarousel, layoutOpps } from './carousel';
import { fitDesktop } from './fit';
import { FX_WAKE_MS } from './livefx';
import { $, esc } from './dom';
import { shakeEl, skipAnnouncement, toast } from './feedback';
import { ceremonyOn, ZER } from './ceremony';
import { myTurn, pById } from './helpers';
import { boardHTML } from './render/board';
import { renderEmotes } from './render/emotes';
import { render } from './render/index';
import { legendOn, renderLegend } from './render/legend';
import { fitLobby, renderLobby, turnLabel, turnText } from './render/lobby';
import { renderLog } from './render/log';
import { rulesHTML } from './render/rules';
import { renderGame } from './render/schnautz';
import { layoutSwapOpps, renderSh, shMine, shSrc } from './render/shithead';
import { renderTurnNote } from './render/turnnote';
import { openBetModal, renderBetModal } from './render/bets';
import { inviteHTML } from './render/invite';
import { netInfoHTML } from './render/netinfo';
import { closeUpdate, reloadApp } from './update';
import { updatesHTML } from './render/updates';
import { resetTableUI } from './reset';
import { copyLink, setNet, shareLink, showScreen, updateTitle } from './screens';
import { fitHand, grabRects } from './shithead/hand';
import { setSbBlock } from './soundboard';
import { renderSoundBtn, setSbVolume, sfx, unlockAudio } from './sound';
import { initStart, lastGame, leaveInvite, readName, renderResume, showStartError } from './start';
import { LS, SS } from './storage';
import { closePick, openPick, placePick, sendToss, TOSS } from './toss';
import { dkButton, dkTapHand, dkTapTable } from './durak/input';
import { cbButton, cbTapMine, cbTapOpp } from './cabo/input';

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

/** Dev-Menü erst beim Öffnen nachladen, normale Gäste laden es nie. */
function withDev(fn: (m: typeof import('../dev/menu')) => void): void {
  import('../dev/menu').then(fn, () => toast('Das Dev-Menü ließ sich nicht laden.'));
}

/** Fünf schnelle Tipps auf die Versionszeile unter Updates schalten das Dev-Menü frei. */
const DEVTAP = { n: 0, at: 0 };
function devTap(): void {
  const now = Date.now();
  DEVTAP.n = now - DEVTAP.at < 1500 ? DEVTAP.n + 1 : 1;
  DEVTAP.at = now;
  if (DEVTAP.n < 5) return;
  DEVTAP.n = 0;
  if (!LS.get('dev', false)) {
    LS.set('dev', true);
    toast('Dev-Menü freigeschaltet, es steht jetzt im Menü ⋯.', 3500);
  }
  withDev((m) => m.openDev());
}

/** Ton an oder aus, aus der Kopfzeile oder mobil aus dem Menü. */
function toggleSound(): void {
  App.muted = !App.muted;
  LS.set('muted', App.muted);
  renderSoundBtn();
  setSbVolume();
  renderEmotes();
  if (App.muted) ZER.stop?.();
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

/** `viaCar`: Der Tipp kam schon aufgelöst aus dem Karussell (initCarousel), dann gilt keine Doppelklick-Sperre. */
function onAction(a: string, t: HTMLElement, viaCar = false): void {
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
    case 'dkh':
      dkTapHand(i);
      break;
    case 'dkt':
      dkTapTable(i);
      break;
    case 'dkgo':
    case 'dkbeat':
    case 'dktransfer':
    case 'dktake':
    case 'dkpass':
      dkButton(a);
      break;
    case 'cbm':
      cbTapMine(Number(t.dataset.sid));
      break;
    case 'cbo':
      // Im Karussell kam der Tipp schon über initCarousel, der Klick danach zählt nicht doppelt
      if (!viaCar && Date.now() - CAR.tapAt < 400 && t.closest('.opps.car')) break;
      cbTapOpp(t.dataset.o ?? '', Number(t.dataset.sid));
      break;
    case 'cbdeck':
    case 'cbpile':
    case 'cbdiscard':
      // In der Tischmitte gibt es keinen Knopf, der wechseln könnte, deshalb ohne Sperre
      cbButton(a, t.tagName === 'BUTTON');
      break;
    case 'cbcabo':
    case 'cbswap':
    case 'cbskip':
    case 'cbblind':
    case 'cbsnapmode':
      cbButton(a);
      break;
    case 'cbtarget':
      doAct({ type: 'rules', rules: { cb: { target: Number(t.dataset.v) } } });
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
      App.aim = null;
      renderEmotes();
      document.body.classList.toggle('emoopen');
      break;
    case 'etab': {
      const tab = t.dataset.t as EmoTab;
      if (tab !== 'emo' && tab !== 'snd' && tab !== 'toss') break;
      App.etab = tab;
      App.aim = null;
      LS.set('etab', tab);
      renderEmotes();
      break;
    }
    case 'tossitem': {
      const item = t.dataset.item as TossItem;
      if (!TOSS_ITEMS.includes(item) || App.tossBlock) break;
      App.aim = item;
      renderEmotes();
      break;
    }
    case 'tosscancel':
      App.aim = null;
      renderEmotes();
      break;
    case 'toss': {
      const item = (t.dataset.item as TossItem) || App.aim;
      const to = String(t.dataset.to || '');
      if (!item || !to || !v) break;
      // Nach dem Wurf schließt die Auswahl „… auf wen?“ sofort
      App.aim = null;
      renderEmotes();
      document.body.classList.remove('emoopen');
      closePick();
      sendToss(item, to, (it, who) => doAct({ type: 'toss', item: it, to: who }), redrawToss);
      break;
    }
    case 'aim': {
      const pid = String(t.dataset.pid || '');
      // Der Tipp im Karussell kam schon über initCarousel
      if (!pid || Date.now() - CAR.tapAt < 400) break;
      aimAt(pid);
      break;
    }
    case 'sb': {
      document.body.classList.remove('emoopen');
      const s = String(t.dataset.s || '');
      if (App.sbBlock || !v || !SOUNDS.includes(s)) break;
      const r = burst('sound', SOUND_GAP_MS);
      if (!r.ok) break;
      if (r.cool) {
        setSbBlock(true);
        App.coolUntil.snd = Date.now() + r.cool;
        renderEmotes();
        setTimeout(() => {
          setSbBlock(false);
          renderEmotes();
        }, r.cool);
      }
      doAct({ type: 'sound', s });
      break;
    }
    case 'sbtoggle':
      App.sbOff = !App.sbOff;
      LS.set('sbOff', App.sbOff);
      setSbVolume();
      renderSoundBtn();
      renderEmotes();
      // Schalter im Menü: Das Menü bleibt offen, damit man den neuen Zustand sieht
      break;
    case 'emote': {
      document.body.classList.remove('emoopen');
      if (App.emoBlock || !v) break;
      const r = burst('emote', EMOTE_GAP_MS);
      if (!r.ok) break;
      if (r.cool) {
        App.emoBlock = true;
        App.coolUntil.emo = Date.now() + r.cool;
        renderEmotes();
        setTimeout(() => {
          App.emoBlock = false;
          renderEmotes();
        }, r.cool);
      }
      doAct({ type: 'emote', e: String(t.dataset.e) });
      break;
    }
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
    case 'menurules':
      $('#menu').hidden = true;
      $('#modal').innerHTML = rulesHTML();
      break;
    case 'invite':
      $('#menu').hidden = true;
      $('#modal').innerHTML = inviteHTML();
      break;
    case 'board':
      $('#menu').hidden = true;
      if (v) $('#modal').innerHTML = boardHTML(v);
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
      // Am Handy öffnet „Tisch aufmachen“ den Bogen mit Name, Tisch aufmachen, KI und Beitreten
      document.body.classList.add('startform');
      $<HTMLInputElement>('#name').focus();
      break;
    case 'playjoin':
      document.body.classList.add('startform');
      $<HTMLInputElement>('#joincode').focus();
      break;
    case 'bots':
      startBots();
      break;
    case 'noinvite':
      leaveInvite();
      break;
    case 'startclose':
      document.body.classList.remove('startform');
      break;
    case 'updates':
      $('#menu').hidden = true;
      $('#modal').innerHTML = updatesHTML();
      break;
    case 'reloadapp':
      reloadApp();
      break;
    case 'devtap':
      devTap();
      break;
    case 'devopen':
      $('#menu').hidden = true;
      withDev((m) => m.openDev());
      break;
    case 'dev':
      withDev((m) => m.devAct(t.dataset.dev ?? '', t));
      break;
    case 'closeupd':
      closeUpdate();
      break;
    case 'netinfo':
      $('#modal').innerHTML = netInfoHTML();
      break;
    case 'rematch':
      doAct({ type: 'rematch' });
      break;
    case 'betopen':
      document.body.classList.remove('logopen');
      renderTurnNote();
      if (v) openBetModal(v);
      break;
    case 'betpick':
      App.betSel = t.dataset.pid ?? null;
      if (v) renderBetModal(v);
      break;
    case 'shbet': {
      const on = App.betSel;
      if (!on || !v) break;
      App.betSel = null;
      $('#modal').innerHTML = '';
      doAct({ type: 'shbet', on });
      break;
    }
    case 'lobbynow':
      // Am Ende der Partie oder wenn nur noch KIs spielen: ohne Rückfrage
      doAct({ type: 'tolobby' });
      break;
    case 'restart':
      doAct({ type: 'restart' });
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

/** Neuen Tisch aufmachen. Läuft noch ein eigener Tisch, wird vorher gefragt. */
function openTable(go: (name: string) => void): void {
  const n = readName();
  if (!n) return;
  showStartError('');
  unlockAudio();
  const hs = asSavedHost(LS.get<unknown>('host', null));
  if (hs && hs.st.phase !== 'lobby' && Date.now() - hs.ts < HOST_RESUME_MS) {
    confirmBox(`Dein laufender Tisch ${hs.code} geht dann verloren. Trotzdem neu anfangen?`, 'Neu anfangen', () =>
      go(n),
    );
  } else go(n);
}

function startHost(): void {
  openTable(hostNew);
}

/** Gegen die KI: Tisch mit dem zuletzt gespielten Spiel, freie Plätze füllt die KI, die Partie startet sofort. */
function startBots(): void {
  openTable((n) => hostNewVsBots(n, lastGame()));
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
    // Jeder Tab ist ein eigener Platz, auch mit gleichem Namen (tests/e2e/schnautz.spec.ts, zweiter Tab)
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

/** Wurfknöpfe nach Sperre oder Ende der Sperre neu zeichnen. */
function redrawToss(): void {
  renderEmotes();
  placePick();
}

/** Tipp auf eine Kachel oder Ergebniszeile: kleine Wurfleiste für diese Person. */
function aimAt(pid: string): void {
  const v = App.view;
  if (!v || v.phase === 'lobby' || pid === App.me || !pById(v, App.me)) return;
  if (TOSS.pick === pid) closePick();
  else openPick(pid);
}

/** Alle Ereignis-Listener einmal beim Start registrieren. */
export function initEvents(): void {
  initCarousel(aimAt, (el) => el.dataset.act && onAction(el.dataset.act, el, true));
  document.addEventListener('visibilitychange', () => {
    updateTitle();
    if (!document.hidden) {
      App.fxQuietUntil = Date.now() + FX_WAKE_MS;
      guestWake();
    }
  });
  // Jeder Tipp schaltet den Ton frei, auch im Karussell, das den Zeiger festhält
  document.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
  // iPhones werten erst touchend oder click als echten Tipp, der Ton freischalten darf
  document.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
  document.addEventListener('click', unlockAudio, { capture: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
  // Die Wurfleiste folgt ihrem Ziel und schließt, wenn das Ergebnisfenster scrollt
  $('#overlay').addEventListener('scroll', closePick, { capture: true, passive: true });
  window.addEventListener('resize', () => {
    const v = App.view;
    if ((v?.game === 'shithead' || v?.game === 'durak') && v.phase !== 'lobby') fitHand();
    if (v?.game === 'shithead' && v.phase !== 'lobby') layoutSwapOpps(v);
    if (v && v.phase !== 'lobby') layoutOpps(v);
    if (v && v.phase !== 'lobby') renderLegend(v);
    if (v?.phase === 'lobby') fitLobby();
    fitDesktop();
    closePick();
  });
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const menu = $('#menu');
    if (!menu.hidden && !target.closest('#menu') && !target.closest('#btn-menu')) menu.hidden = true;
    if (!target.closest('.emotes') && !target.closest('#emofab')) {
      document.body.classList.remove('emoopen');
      if (App.aim) {
        App.aim = null;
        renderEmotes();
      }
    }
    if (
      TOSS.pick &&
      !target.closest('#tosspick') &&
      !target.closest('[data-act="aim"]') &&
      Date.now() - CAR.tapAt >= 400
    )
      closePick();
    const t = target.closest<HTMLElement>('[data-act]');
    // Während der Zeremonie überspringt ein Tipp auf Tischmitte oder Status sie
    if (!t && ceremonyOn() && target.closest('#center, #status')) skipAnnouncement();
    if (t?.dataset.act) onAction(t.dataset.act, t);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#modal').innerHTML = '';
      // Wer das Menü per Tastatur schließt, landet wieder auf dem Menüknopf
      if (!$('#menu').hidden && document.activeElement?.closest('#menu')) $('#btn-menu').focus();
      $('#menu').hidden = true;
      document.body.classList.remove('logopen', 'emoopen', 'startform');
      if (ceremonyOn()) skipAnnouncement();
      closePick();
      if (App.aim) {
        App.aim = null;
        renderEmotes();
      }
    }
    // Karten sind per Tastatur bedienbar
    const t = e.target as HTMLElement;
    // Reiter der Lobby: Pfeiltasten wechseln wie bei echten Reitern
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.matches?.('#lobby-tabs [role="tab"]')) {
      const other = $<HTMLElement>(`#lobby-tabs [data-t="${t.dataset.t === 'game' ? 'table' : 'game'}"]`);
      other.click();
      other.focus();
      return;
    }
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      t.matches?.(
        '.card[data-act], [data-act="aim"][role="button"], .dkpair[data-act], .cbslot[data-act], .cbdeck[data-act], .cbpile[data-act]',
      )
    ) {
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
    if (t.dataset?.dkrule) {
      doAct({ type: 'rules', rules: { dk: { [t.dataset.dkrule]: t.checked } } });
      return;
    }
    if (t.dataset?.cbrule) {
      doAct({ type: 'rules', rules: { cb: { [t.dataset.cbrule]: t.checked } } });
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
    t.setAttribute('aria-valuetext', turnText(s));
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
    $('#menu-dev').hidden = !LS.get('dev', false);
    m.hidden = !m.hidden;
  };
  // Menüknopf sagt, ob das Menü offen ist, egal wer es schließt
  const menuBtn = $('#btn-menu');
  menuBtn.setAttribute('aria-controls', 'menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  new MutationObserver(() => menuBtn.setAttribute('aria-expanded', String(!$('#menu').hidden))).observe($('#menu'), {
    attributes: true,
    attributeFilter: ['hidden'],
  });
  $('#codechip').onclick = () => {
    $('#modal').innerHTML = inviteHTML();
  };
  $('#chatform').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $<HTMLInputElement>('#chatin');
    const text = inp.value.trim();
    if (!text) return;
    doAct({ type: 'chat', text });
    inp.value = '';
  });
}
