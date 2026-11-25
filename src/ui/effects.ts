import { unreachable } from '../game/games';
import type { LogEntry, View } from '../game/types';
import { emojiFly } from './animations';
import { App } from './app';
import { $opt, listJoin } from './dom';
import { REMATCH_ANN_MS } from '../game/constants';
import { announce, chatBubble, fixedLabel, holdForAnnouncements, tauntLabel, toast } from './feedback';
import { myMoveNow, myTurn, nameOf, pById } from './helpers';
import { betEffect, BETUI } from './render/bets';
import { duelResult, duelRunning, rematchAnn } from './render/rematch';
import { updateTitle } from './screens';
import { sfx, sfxCalm } from './sound';
import { shitheadEffect } from './shithead/effects';
import { durakEffect } from './durak/effects';
import { caboEffect } from './cabo/effects';
import { schnautzEffect } from './schnautz/effects';

/**
 * Reagiert auf neue Log-Einträge: Töne, große Meldungen, Sprechblasen, Emojis.
 * Hier steht nur, was alle Spiele teilen (Zeit um, Chat, Reaktionen, Revanche, Tipps, Zug-Ton, Lobby).
 * Was nur ein Spiel kennt, liegt in `src/ui/<spiel>/effects.ts`.
 * `seqd` heißt: Die Shithead-Sequenz hat Karten, Verbrennen und Aufnehmen schon gezeigt.
 */
export function effects(prev: View, v: View, seqd = false): void {
  const fresh = v.log.filter((e) => e.n > App.seenN);
  fresh.forEach((e) => {
    const mine = e.p === App.me;
    if (e.k === 'emote') emojiFly(e.p, e.e);
    if (e.k === 'timeout' && mine) {
      // Zu lange gebraucht: Damit klar ist, warum plötzlich etwas passiert ist
      sfx('timeout');
      try {
        navigator.vibrate?.([60, 60, 60]);
      } catch {
        // Manche Browser verbieten Vibration ohne vorherige Geste
      }
      announce({
        icon: '⏰',
        tone: 'red',
        title: 'Zeit um!',
        // Ein Satz für alle Spiele, nur beim Ansehen zu Beginn einer Cabo-Runde zeigt die KI zwei Karten
        sub: prev.phase === 'peek' ? 'Die KI hat dir zwei Karten gezeigt.' : 'Die KI hat einmal für dich gespielt.',
        ms: 2000,
      });
    }
    if (e.k === 'chat' && e.p !== App.me) {
      setTimeout(() => {
        chatBubble(e.p, e.text);
      }, 30);
      if (!e.bot && !document.body.classList.contains('logopen')) App.unread++;
    }
    gameEffect(prev, v, e, fresh, seqd);
    if (e.k === 'rematch') {
      sfx('duel');
      const a = rematchAnn(v, e);
      announce({ icon: '⚔️', tone: 'red', title: a.title, sub: a.sub, ms: REMATCH_ANN_MS });
    }
    if (e.k === 'rematchend' && v.players.length > 2 && [e.p, e.to].some((id) => !pById(v, id ?? '')?.bot)) {
      const full = duelResult(v, { by: e.p ?? '', vs: e.to, res: e.res }, e.name, e.tn);
      const cut = full.indexOf('! ');
      announce({
        icon: '⚔️',
        tone: e.res === 'won' ? 'gold' : e.res === 'lost' ? 'red' : '',
        title: full.slice(0, cut + 1),
        sub: full.slice(cut + 2),
        ms: 2200,
      });
      holdForAnnouncements(300);
    }
    if (e.k === 'shbet') betEffect(v, e);
  });
  if (prev.phase === 'lobby' && v.phase === 'lobby') lobbyPeople(prev, v, fresh);
  // Zu Beginn der Revanche-Partie ein kurzer Hinweis am Tisch
  const started = fresh.some(
    (e) => e.k === 'shdeal' || e.k === 'dkdeal' || ((e.k === 'round' || e.k === 'cbdeal') && e.r === 1),
  );
  const duel = started ? duelRunning(v) : '';
  if (duel) {
    const wait = fresh.some((e) => e.k === 'rematch') ? REMATCH_ANN_MS + 300 : 600;
    setTimeout(() => fixedLabel('duellbl', duel, $opt('#center'), 3200), wait);
  }
  // Ein Spruch zum ersten Tipp auf mich wartet, bis ich nicht mehr dran bin
  if (BETUI.pend && (BETUI.pend.games !== v.games || v.phase !== 'play')) BETUI.pend = null;
  if (BETUI.pend && !myTurn(v)) {
    tauntLabel(BETUI.pend.text);
    BETUI.pend = null;
  }
  const was = myMoveNow(prev) && !prev.sh?.win?.lock;
  if (myMoveNow(v) && !v.sh?.win?.lock && !was) {
    sfx('turn');
    try {
      navigator.vibrate?.(60);
    } catch {
      // Manche Browser verbieten Vibration ohne vorherige Geste
    }
  }
  updateTitle();
}

/** Weiche nach Spiel: Jedes Spiel reagiert auf seine eigenen Logarten. */
function gameEffect(prev: View, v: View, e: LogEntry, fresh: readonly LogEntry[], seqd: boolean): void {
  switch (v.game) {
    case 'shithead':
      shitheadEffect(prev, v, e, fresh, seqd);
      return;
    case 'durak':
      durakEffect(prev, v, e, fresh, seqd);
      return;
    case 'cabo':
      caboEffect(prev, v, e, fresh);
      return;
    case 'schnautz':
      schnautzEffect(v, e);
      return;
    default:
      return unreachable(v.game);
  }
}

/**
 * Lobby: Wer kommt oder geht, bekommt eine kurze Meldung und einen leisen Ton. KIs kommen und gehen still,
 * mehrere auf einmal stehen in einer Meldung.
 */
function lobbyPeople(prev: View, v: View, fresh: LogEntry[]): void {
  const came: string[] = [];
  const went: string[] = [];
  fresh.forEach((e) => {
    if (!e.p || e.p === App.me) return;
    if ((e.k === 'join' && !e.bot) || e.k === 'takeover' || e.k === 'back') came.push(nameOf(v, e.p, e.name));
    const was = pById(prev, e.p);
    if (e.k === 'leave' && was && !was.bot) went.push(e.name ?? was.name);
  });
  if (came.length) {
    sfxCalm('msg', 400);
    toast(`${listJoin(came)} ${came.length === 1 ? 'sitzt' : 'sitzen'} jetzt mit am Tisch.`);
  }
  if (went.length) {
    sfxCalm('card', 400, 0.7);
    toast(`${listJoin(went)} ${went.length === 1 ? 'ist' : 'sind'} gegangen.`);
  }
}
