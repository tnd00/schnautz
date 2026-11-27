/* Eingaben: Klicks auf Karten und Knöpfe (über data-act), Tastatur, Formulare. */
import { rankOf } from '../game/cards';
import { rj } from '../game/reject';
import { szWhyNot } from '../game/schnautz';
import { shCanBomb, shCanThrow } from '../game/shithead';
import { seatLimit } from '../game/state';
import { EMOTE_GAP_MS, SOUND_GAP_MS, SOUNDS, TOSS_ITEMS, TURN_SECS } from '../game/constants';
import type { Action, GameKind, TossItem, View } from '../game/types';
import { betPart, hasBets } from '../game/bets';
import { unreachable } from '../game/games';
import { fastForward } from '../net/bots';
import { doAct } from '../net/dispatch';
import { guestLeave, guestStart, guestStop, guestWake } from '../net/guest';
import { hostCancel, hostClose, hostNew, hostNewVsBots, hostResume, sendHostClaim } from '../net/host';
import { cleanCode, genId } from '../net/ids';
import { asSavedGuest, asSavedHost, GUEST_RESUME_MS, HOST_RESUME_MS, type SavedHost } from '../net/protocol';
import {
  browserLocks,
  CLAIM_WAIT_MS,
  hostLockElsewhere,
  releaseHostLock,
  takeHostLock,
  tryHostLock,
  waitHostLock,
} from '../net/tablock';
import { App, type EmoTab } from './app';
import { burst } from './burst';
import { CAR, initCarousel, layoutOpps } from './carousel';
import { fitDesktop } from './fit';
import { FX_WAKE_MS } from './livefx';
import { $, $opt, esc, isMobile } from './dom';
import { initLazy, openRules, openUpdates } from './lazy';
import { noteTap, shakeEl, showReject, skipAnnouncement, toast } from './feedback';
import { ceremonyOn, ZER } from './ceremony';
import { myTurn, pById } from './helpers';
import { boardHTML } from './render/board';
import { renderEmotes } from './render/emotes';
import { render } from './render/index';
import { legendOn, renderLegend } from './render/legend';
import { fitLobby, renderLobby, turnLabel, turnText } from './render/lobby';
import { openGameSettings, resetRulesFor } from './render/gamesettings';
import { renderLog } from './render/log';
import { FFWD_ON_HTML } from './render/result';
import { renderGame } from './render/schnautz';
import { layoutSwapOpps, renderSh, shBtnTap, shMine, shSrc } from './render/shithead';
import { barGuard } from './table/bar';
import { renderTurnNote } from './render/turnnote';
import { openBetModal, renderBetModal } from './render/bets';
import { inviteHTML } from './render/invite';
import { netInfoHTML } from './render/netinfo';
import { armBackHint, type BackMark, closeUpdate, reloadApp } from './update';
import { resetTableUI } from './reset';
import { copyLink, setNet, setWait, shareLink, showScreen, updateTitle } from './screens';
import { fitHand, grabRects } from './shithead/hand';
import { shWhyTap } from './shithead/input';
import { setSbBlock } from './soundboard';
import { renderSoundBtn, setSbVolume, sfx, unlockAudio } from './sound';
import { initStart, lastGame, leaveInvite, readName, renderResume, showStartError } from './start';
import { LS, SS } from './storage';
import { closePick, openPick, placePick, sendToss, TOSS } from './toss';
import { dkButton, dkTapHand, dkTapTable } from './durak/input';
import { cbButton, cbTapMine, cbTapOpp } from './cabo/input';
import { openDesign } from './look';
import { openPrefs, prefs } from './prefs';
import { dragCancel } from './table/drag';
import { dragOn } from './table/index';

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
  // Ausgegraute Karte: Grund am Tisch statt stiller Auswahl
  if (shWhyTap(kind, i)) return;
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

/**
 * Shithead: Knopf vor der Aktion (shBtnTap). Ein gesperrter Knopf nennt seinen Grund aus der Spiellogik, ohne einen
 * Zug als Probe zu schicken. true heißt: weiter mit der Aktion.
 */
function shBtnOk(v: View | null, act: 'shplay' | 'shpickup' | 'skip', t: HTMLElement): boolean {
  const r = shBtnTap(v, act, t.getAttribute('aria-disabled') === 'true');
  if (typeof r === 'boolean') return r;
  noteTap(act, [`#me [data-act="${act}"]`]);
  showReject(r, act);
  return false;
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
  if (!v) return;
  if (!myTurn(v)) {
    // Grund am Tisch: Wer nicht dran ist, erfährt warum, statt dass nichts passiert
    const why = v.phase === 'play' || v.phase === 'choose' ? szWhyNot(v, App.me, 'swap') : null;
    if (why) {
      noteTap('swap', [
        kind === 'h' ? `#me [data-act="hand"][data-i="${i}"]` : `#center [data-act="mid"][data-i="${i}"]`,
      ]);
      showReject(why, 'swap');
    }
    return;
  }
  unlockAudio();
  if (kind === 'h') App.sel.h = App.sel.h === i ? null : i;
  else App.sel.m = App.sel.m === i ? null : i;
  App.anim = {};
  renderGame(v);
}

/** Läuft gerade eine Partie, die ein Abbruch ohne Ergebnis beenden würde? */
const running = (v: View): boolean =>
  v.phase === 'play' || v.phase === 'choose' || v.phase === 'swap' || v.phase === 'peek' || v.phase === 'end';

/** Rückfrage vor „Neue Partie“ oder „Zur Lobby“ mitten in der Partie. Tipps erwähnt sie nur, wenn welche liegen. */
function abortQuestion(v: View): string {
  const bets = hasBets(v.game) && Object.keys(betPart(v)?.bets ?? {}).length > 0 ? ' Tipps verfallen.' : '';
  switch (v.game) {
    case 'shithead':
      return `Partie ohne Shithead beenden?${bets}`;
    case 'durak':
      return `Partie ohne Durak beenden?${bets}`;
    case 'schnautz':
      return 'Partie ohne Sieger beenden?';
    case 'cabo':
      return 'Partie ohne Cabo-König beenden?';
    default:
      return unreachable(v.game);
  }
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
      noteTap('shblind', [`#me [data-act="shd"][data-i="${i}"]`]);
      doAct({ type: 'shblind', i });
      break;
    case 'shplay': {
      const { src, idx } = App.ss;
      if (!shBtnOk(v, 'shplay', t) || !src || !idx.length) break;
      App.busy = true;
      sfx('card');
      grabRects(src, idx);
      noteTap(
        'shplay',
        idx.map((k) => `#me [data-act="${src === 'hand' ? 'shh' : 'shu'}"][data-i="${k}"]`),
      );
      App.ss = { src: null, idx: [] };
      doAct({ type: 'shplay', from: src, idx: idx.slice() });
      break;
    }
    case 'shthrow': {
      if (!v || !quickLock()) break;
      sfx('card');
      const ti = shCanThrow(v, App.me);
      if (ti) grabRects(ti.src, ti.idx);
      noteTap('shthrow', ['#me [data-act="shthrow"]']);
      doAct({ type: 'shthrow' });
      break;
    }
    case 'shbomb': {
      if (!v || !quickLock()) break;
      const bm = shCanBomb(v, App.me);
      if (bm) grabRects(bm.src, bm.idx);
      noteTap('shbomb', ['#me [data-act="shbomb"]']);
      doAct({ type: 'shbomb' });
      break;
    }
    case 'shselall':
      if (!barGuard('shselall')) shSelectAll();
      break;
    case 'shpickup':
      if (!shBtnOk(v, 'shpickup', t)) break;
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
      openRules(t.dataset.g as GameKind);
      break;
    case 'menurules':
      openRules(undefined, () => ($('#menu').hidden = true));
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
        noteTap('swap', [
          `#me [data-act="hand"][data-i="${App.sel.h}"]`,
          `#center [data-act="mid"][data-i="${App.sel.m}"]`,
        ]);
        doAct({ type: 'swap', h: App.sel.h, m: App.sel.m });
      } else if (v) showReject(szWhyNot(v, App.me, 'swap') ?? rj('any.pickCard'), 'swap');
      break;
    case 'swapAll':
      sfx('card');
      doAct({ type: 'swapAll' });
      break;
    case 'pass':
      doAct({ type: 'pass' });
      break;
    case 'knock': {
      // Gleicher Code wie beim Gastgeber, aber ohne Klopfgeräusch und ohne Umweg übers Netz
      const why = v ? szWhyNot(v, App.me, 'knock') : null;
      if (why) {
        showReject(why, 'knock');
        break;
      }
      sfx('knock');
      doAct({ type: 'knock' });
      break;
    }
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
      // Gesperrt gezeichnet (Shithead „Für X spielen“ in der 4er-Sperre): Grund aus dem Spiel statt Zug
      if (a === 'skip' ? !shBtnOk(v, a, t) : t.getAttribute('aria-disabled') === 'true') break;
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
    case 'lnext':
      // Handy: vom Tisch weiter zur Spielwahl, gestartet wird erst dort. Der Knopf ist danach weg, der Fokus geht
      // auf den Reiter, damit Tastatur und Vorleser wissen, wo sie sind
      App.ltab = 'game';
      if (v?.phase === 'lobby') renderLobby(v);
      $('#ltab-game').focus({ preventScroll: true });
      break;
    case 'gsreset': {
      const g = t.dataset.g as GameKind;
      if (!v || v.phase !== 'lobby' || App.role !== 'host' || v.game !== g) break;
      doAct({ type: 'rules', rules: resetRulesFor(g) });
      break;
    }
    case 'gsettings': {
      const g = t.dataset.g as GameKind;
      if (!v || v.phase !== 'lobby') break;
      // Der Gastgeber stellt ein, was gespielt wird: Ein anderes Spiel wird erst gewählt, dann eingestellt
      if (App.role === 'host' && v.game !== g) {
        doAct({ type: 'game', game: g });
        // Abgelehnt (etwa zu viele Leute für das Spiel): Der Hinweis kam schon, der Bogen bleibt zu
        if (App.view?.game !== g) break;
      }
      openGameSettings(App.view ?? v, g);
      break;
    }
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
      openUpdates(() => ($('#menu').hidden = true));
      break;
    case 'design':
      $('#menu').hidden = true;
      openDesign();
      break;
    case 'prefs':
      $('#menu').hidden = true;
      openPrefs();
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
      // Nach der Partie ohne Rückfrage, mitten in der Partie mit
      if (v && running(v)) confirmBox(abortQuestion(v), 'Ja, zur Lobby', () => doAct({ type: 'tolobby' }));
      else doAct({ type: 'tolobby' });
      break;
    case 'restart':
      if (v && running(v)) confirmBox(abortQuestion(v), 'Ja, neue Partie', () => doAct({ type: 'restart' }));
      else doAct({ type: 'restart' });
      break;
    case 'ffwd':
      fastForward();
      // Nur der Verlauf ändert sich, das zeichnet nicht neu: den Knopf gleich ersetzen
      t.outerHTML = FFWD_ON_HTML;
      break;
    case 'tolobby':
      $('#menu').hidden = true;
      confirmBox('Partie abbrechen und zurück in die Lobby?', 'Ja, zur Lobby', () => doAct({ type: 'tolobby' }));
      break;
    case 'leave': {
      $('#menu').hidden = true;
      const host = App.role === 'host';
      const text = host
        ? 'Tisch auflösen? Dann ist der Tisch für alle zu.'
        : v && v.phase !== 'lobby'
          ? 'Tisch verlassen? Die KI spielt für dich weiter, später kannst du an deinen Platz zurück.'
          : 'Tisch wirklich verlassen?';
      confirmBox(text, host ? 'Auflösen' : 'Verlassen', leaveTable);
      break;
    }
    case 'resumehost': {
      const hs = asSavedHost(LS.get<unknown>('host', null));
      if (hs) void resumeHostHere(hs.code);
      break;
    }
    case 'resumeguest': {
      const gs = asSavedGuest(LS.get<unknown>('guest', null));
      if (gs) {
        armBackHint(false);
        resumeGuest(gs.code, gs.name);
      }
      break;
    }
    case 'dropresume':
      LS.del(String(t.dataset.k));
      renderResume();
      break;
  }
}

/** Zählt jeden Versuch, Gastgeber zu werden. Abbrechen macht einen laufenden Versuch ungültig. */
let hostTry = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Gastgeber in diesem Tab werden. Hält ein anderer Tab den Tisch, bekommt er einen Anspruch und tritt ab, erst dann
 * geht es weiter (`go`). `code` ist der Tisch, um den es geht, leer für einen neuen Tisch.
 */
async function asHost(code: string, go: () => void): Promise<void> {
  // Ein Doppeltipp startet keinen zweiten Versuch, der dem ersten die Sperre wieder wegnimmt
  if (hostBusy) return;
  hostBusy = true;
  const my = ++hostTry;
  try {
    const api = browserLocks();
    if (!api) {
      // Ohne Sperren weiß niemand, ob ein anderer Tab Gastgeber ist: Anspruch schicken und kurz warten
      sendHostClaim(code);
      await sleep(CLAIM_WAIT_MS);
    } else if (!(await tryHostLock(api))) {
      showScreen('wait');
      if (code) setWait('Dein Tisch wird in diesen Tab geholt…', 'Der andere Tab gibt ihn gerade ab.');
      else setWait('Dein Tisch im anderen Tab wird geschlossen…', 'Gleich geht hier der neue auf.');
      sendHostClaim(code);
      await takeHostLock(api);
    }
  } finally {
    hostBusy = false;
  }
  if (my !== hostTry) {
    releaseHostLock();
    return;
  }
  go();
}
let hostBusy = false;

/** Gespeicherten Tisch fortsetzen. Gelesen wird erst, wenn dieser Tab den Tisch hat, denn der alte speichert zuletzt. */
async function resumeHostHere(code: string): Promise<void> {
  showStartError('');
  unlockAudio();
  armBackHint(false);
  await asHost(code, () => {
    const hs = asSavedHost(LS.get<unknown>('host', null));
    if (hs) hostResume(hs);
    else {
      releaseHostLock();
      showScreen('start');
      renderResume();
      showStartError('Der Tisch ist nicht mehr gespeichert.');
    }
  });
}

/** Zurück an einen Tisch als Gast: zuerst der Platz dieses Tabs, sonst der gespeicherte Platz für diesen Tisch. */
function resumeGuest(code: string, name: string): boolean {
  const gs = asSavedGuest(LS.get<unknown>('guest', null));
  let pid = SS.get<string | null>(`pid:${code}`, null);
  let key = SS.get<string | null>(`key:${code}`, null);
  if ((!pid || !key) && gs && gs.code === code) {
    pid = gs.pid;
    key = gs.key;
  }
  if (!pid || !key) return false;
  const n = name || (gs?.code === code ? gs.name : '') || LS.get('name', '');
  if (!n) return false;
  $<HTMLInputElement>('#name').value = n;
  guestStart(code, n, pid, key, true);
  return true;
}

/**
 * Nach dem Neuladen am Tisch (Merker aus update.ts): ohne Tippen zurück. Zeigt ein Einladungslink nach einem
 * gewöhnlichen Neuladen auf einen anderen Tisch, gewinnt die Einladung. Hält beim Gastgeber ein anderer Tab den Tisch
 * (etwa ein duplizierter Tab), bleibt es bei der Rückfrage auf der Startseite.
 */
export async function resumeBack(m: BackMark): Promise<void> {
  const invite = cleanCode(location.hash.slice(1));
  if (m.why === 'hide' && invite.length === 5 && m.code && invite !== m.code) return;
  if (m.role === 'host') {
    const hs = asSavedHost(LS.get<unknown>('host', null));
    if (!hs || (m.code && hs.code !== m.code) || Date.now() - hs.ts > HOST_RESUME_MS) return;
    const my = ++hostTry;
    // Ein gerade entladenes Dokument gibt die Sperre gleich frei, darauf kurz warten
    if (!(await waitHostLock(1000))) {
      renderResume();
      return;
    }
    if (my !== hostTry || App.role) {
      releaseHostLock();
      return;
    }
    const fresh = asSavedHost(LS.get<unknown>('host', null));
    if (!fresh) {
      releaseHostLock();
      return;
    }
    armBackHint();
    hostResume(fresh);
    return;
  }
  const gs = asSavedGuest(LS.get<unknown>('guest', null));
  const code = m.code || gs?.code || '';
  if (!code || App.role) return;
  if (!m.code && gs && Date.now() - gs.ts > GUEST_RESUME_MS) return;
  armBackHint();
  // Ging die Rückkehr gar nicht erst los, kommt auch kein Hinweis
  if (!resumeGuest(code, m.name)) armBackHint(false);
}

/**
 * Neuen Tisch aufmachen. Gefragt wird nur, wenn dabei etwas verloren geht: ein eigener Tisch, der noch nicht zu Ende
 * ist und an dem außer dir noch ein Mensch sitzt, oder dein Tisch läuft gerade in einem anderen Tab. Ein Tisch nur mit
 * KIs lässt sich jederzeit neu aufmachen.
 */
async function openTable(go: (name: string) => void): Promise<void> {
  const n = readName();
  if (!n) return;
  showStartError('');
  unlockAudio();
  armBackHint(false);
  const hs: SavedHost | null = asSavedHost(LS.get<unknown>('host', null));
  const start = () => void asHost('', () => go(n));
  if (await hostLockElsewhere()) {
    confirmBox(
      hs
        ? `Dein Tisch ${hs.code} läuft in einem anderen Tab. Dort beenden und hier neu aufmachen?`
        : 'Dein Tisch läuft in einem anderen Tab. Dort beenden und hier neu aufmachen?',
      'Neu aufmachen',
      start,
    );
    return;
  }
  const others = !!hs && hs.st.players.some((p) => !p.bot && p.id !== hs.me);
  if (hs && others && hs.st.phase !== 'over' && Date.now() - hs.ts < HOST_RESUME_MS) {
    confirmBox(`Dein laufender Tisch ${hs.code} geht dann verloren. Trotzdem neu anfangen?`, 'Neu anfangen', start);
  } else start();
}

function startHost(): void {
  void openTable(hostNew);
}

/** Gegen die KI: Tisch mit dem zuletzt gespielten Spiel und drei KIs, gestartet wird in der Lobby. */
function startBots(): void {
  void openTable((n) => hostNewVsBots(n, lastGame()));
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
  armBackHint(false);
  let pid = SS.get<string | null>(`pid:${c}`, null);
  let key = SS.get<string | null>(`key:${c}`, null);
  if (!pid || !key) {
    // Neuer Tab, gleicher Tisch und gleicher Name: Das ist dieselbe Person, sie kommt auf ihren gespeicherten Platz.
    // Der alte Tab bekommt dann `replaced`. Andere Namen bleiben eigene Plätze (zwei Leute an einem Gerät).
    const gs = asSavedGuest(LS.get<unknown>('guest', null));
    const mine = !!gs && gs.code === c && gs.name.toLowerCase() === n.toLowerCase();
    if (gs && mine && Date.now() - gs.ts < GUEST_RESUME_MS) {
      pid = gs.pid;
      key = gs.key;
    } else {
      pid = genId('p');
      key = genId('k');
    }
  }
  guestStart(c, n, pid, key);
}

function cancelConnect(): void {
  // Ein Versuch, den Tisch in diesen Tab zu holen, zählt nicht mehr
  hostTry++;
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

/** Am Handy am Tisch stehen Regeln und Bestenliste schon in der Kopfzeile, dann fallen sie aus dem Menü */
function menuHead(): void {
  const head = isMobile() && document.body.classList.contains('ingame');
  $('#menu .mi-rules').hidden = head;
  $('#menu .mi-board').hidden = head;
}

/** Antippbare Karten und Felder, in deren Gruppe die Pfeiltasten wandern (gefuehl 3.5) */
const KB_ITEM = '.card[data-act], .dkpair[data-act], .cbslot[data-act]';
/** Gruppen am Tisch: neue Hand, alte Hände und Reihen aller vier Spiele, Schnautz-Mitte, Durak-Angriffe */
const KB_GROUP = '.tb-hand, .shhand, .tcards, .cbrow, .hand, .middle, .dktable';

/**
 * Tastatur in Hand und Reihen: Pfeil links und rechts, Pos1 und Ende bewegen den Fokus, Umschalt und Enter löst die
 * Hauptaktion aus. true, wenn die Taste damit erledigt ist.
 */
function tableKey(e: KeyboardEvent, t: HTMLElement): boolean {
  if (!t.matches?.(KB_ITEM) || !t.closest('#table')) return false;
  if (e.key === 'Enter' && e.shiftKey) {
    const go = $opt<HTMLElement>('#me .actions [data-intent="go"], #me .actions .btn.primary');
    if (!go) return false;
    e.preventDefault();
    go.click();
    return true;
  }
  const g = t.closest(KB_GROUP);
  const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[e.key];
  if (!g || step == null) return false;
  const items = [...g.querySelectorAll<HTMLElement>(KB_ITEM)];
  const n = items[Math.max(0, Math.min(items.length - 1, items.indexOf(t) + step))];
  if (!n || n === t) return false;
  e.preventDefault();
  // Neue Hand und eigene Tischkarten: eine Tabulatorstelle, die mit dem Fokus wandert
  if (g.classList.contains('tb-hand') || (g.classList.contains('tcards') && g.closest('#me'))) {
    t.tabIndex = -1;
    n.tabIndex = 0;
  }
  n.focus();
  return true;
}

/** Escape am Tisch hebt die Auswahl auf (gefuehl 3.5), Schnappen bei Cabo bleibt an */
function unselect(): void {
  if (!document.activeElement?.closest('#table')) return;
  const any =
    App.ss.idx.length ||
    App.ds.idx.length ||
    App.ds.pair != null ||
    App.cs.ids.length ||
    App.cs.opp ||
    App.sel.h != null ||
    App.sel.m != null ||
    App.sw.h != null ||
    App.sw.u != null;
  if (!any) return;
  App.ss = { src: null, idx: [] };
  App.ds = { idx: [], pair: null };
  App.cs = { ...App.cs, ids: [], opp: null };
  App.sel = { h: null, m: null };
  App.sw = { h: null, u: null };
  render();
}

/** Alle Ereignis-Listener einmal beim Start registrieren. */
export function initEvents(): void {
  // Regeln und Updates laden erst bei Bedarf nach (src/ui/lazy.ts)
  initLazy();
  initCarousel(aimAt, (el) => el.dataset.act && onAction(el.dataset.act, el, true));
  document.addEventListener('visibilitychange', () => {
    updateTitle();
    if (!document.hidden) {
      App.fxQuietUntil = Date.now() + FX_WAKE_MS;
      guestWake();
    }
  });
  // Jeder Tipp schaltet den Ton frei, auch im Karussell, das den Zeiger festhält
  // Am Tisch zoomen zwei Finger nur, wenn es in „Bedienung“ an ist (User 27.11.2026), sonst überall. gesturestart gibt es
  // nur in Safari
  const noZoom = (e: Event) => prefs().zoom || !document.body.classList.contains('ingame') || e.preventDefault();
  document.addEventListener('gesturestart', noZoom);
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && noZoom(e), { passive: false });
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
    if (!$('#menu').hidden) menuHead();
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
    // Während der Zeremonie überspringt ein Tipp auf die Tischmitte sie
    if (!t && ceremonyOn() && target.closest('#center')) skipAnnouncement();
    if (t?.dataset.act) onAction(t.dataset.act, t);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (App.view && dragOn(App.view)) dragCancel('cancel');
      unselect();
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
    if (tableKey(e, t)) return;
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
  $('#btn-rules').onclick = () => openRules();
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
    menuHead();
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
  $('#chatform').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $<HTMLInputElement>('#chatin');
    const text = inp.value.trim();
    if (!text) return;
    doAct({ type: 'chat', text });
    inp.value = '';
  });
}
