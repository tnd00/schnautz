import { unreachable } from '../game/games';
import type { LogEntry, View } from '../game/types';
import { emojiFly } from './animations';
import { haptic } from './a11y/haptic';
import { App } from './app';
import { $opt, listJoin } from './dom';
import { REMATCH_ANN_MS } from '../game/constants';
import { beginBatch, chatBubble, emit, fixedLabel, noteBig, tauntLabel, toast } from './feedback';
import { cueOf, type LevelCtx } from './levels';
import { seatVia } from './band';
import { SEAT } from '../content/texts/seat';
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
  // Der Shithead-Ablauf hat seinen Schub schon begonnen (src/ui/apply.ts), dort zählt sein Großes mit
  if (!seqd) beginBatch(fresh);
  const c: LevelCtx = { prev, v, fresh, me: App.me, seqd };
  // Der Ablauf zeigt Verbrennen und Bombe selbst, ein großes davon belegt das Große dieses Zugs
  if (seqd && fresh.some((e) => e.k === 'shburn' && cueOf(e, c)?.level === 'big')) noteBig();
  fresh.forEach((e) => {
    if (e.k === 'emote') emojiFly(e.p, e.e);
    if (e.k === 'timeout') timeoutEffect(c, e);
    seatEffect(c, e);
    if (e.k === 'chat' && e.p !== App.me) {
      setTimeout(() => {
        chatBubble(e.p, e.text);
      }, 30);
      if (!e.bot && !document.body.classList.contains('logopen')) App.unread++;
    }
    gameEffect(c, e);
    if (e.k === 'rematch') {
      const a = rematchAnn(v, e);
      emit(cueOf(e, c), {
        text: 'Revanche!',
        icon: '⚔️',
        tone: 'red',
        title: a.title,
        sub: a.sub,
        ms: REMATCH_ANN_MS,
        sfx: 'duel',
      });
    }
    if (e.k === 'rematchend') {
      const full = duelResult(v, { by: e.p ?? '', vs: e.to, res: e.res }, e.name, e.tn);
      const cut = full.indexOf('! ');
      emit(cueOf(e, c), {
        text: full,
        icon: '⚔️',
        tone: e.res === 'won' ? 'gold' : e.res === 'lost' ? 'red' : '',
        title: full.slice(0, cut + 1),
        sub: full.slice(cut + 2),
        ms: 2200,
        hold: 300,
      });
    }
    if (e.k === 'shbet') betEffect(c, e);
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
    sfxCalm('msg', 500, 0.7);
    tauntLabel(BETUI.pend.text);
    BETUI.pend = null;
  }
  const was = myMoveNow(prev) && !prev.sh?.win?.lock;
  if (myMoveNow(v) && !v.sh?.win?.lock && !was) {
    sfx('turn');
    haptic('big');
  }
  updateTitle();
}

/** Weiche nach Spiel: Jedes Spiel reagiert auf seine eigenen Logarten. */
function gameEffect(c: LevelCtx, e: LogEntry): void {
  switch (c.v.game) {
    case 'shithead':
      shitheadEffect(c, e);
      return;
    case 'durak':
      durakEffect(c, e);
      return;
    case 'cabo':
      caboEffect(c, e);
      return;
    case 'schnautz':
      schnautzEffect(c, e);
      return;
    default:
      return unreachable(c.v.game);
  }
}

/**
 * Zeit um: Die eigene ist ein Takt mit Ton und Vibration (Durak nach reinem Passen klein), fremde klein mit leisem
 * Ton, weil die KI automatisch gezogen hat.
 */
function timeoutEffect(c: LevelCtx, e: Extract<LogEntry, { k: 'timeout' }>): void {
  const cue = cueOf(e, c);
  if (e.p !== App.me) {
    emit(cue, { text: SEAT.timeout(nameOf(c.v, e.p, e.name)) });
    return;
  }
  // Zu lange gebraucht: Damit klar ist, warum plötzlich etwas passiert ist
  haptic('big');
  emit(cue, {
    text: cue?.level === 'big' ? SEAT.timeoutTitle : SEAT.timeoutPassSelf,
    icon: '⏰',
    tone: 'red',
    // Ein Satz für alle Spiele, nur beim Ansehen zu Beginn einer Cabo-Runde zeigt die KI zwei Karten
    sub: c.prev.phase === 'peek' ? SEAT.timeoutPeekSub : SEAT.timeoutSub,
    ms: 2000,
    sfx: 'timeout',
  });
}

/**
 * Kommen, Gehen, Zurück und Übernahme am Tisch: klein in der Spielfläche, Automatisches mit leisem Ton. Bei offenem
 * Ergebnisblatt (Rundenende, Partieende) als Toast wie in der Lobby, sonst stünden sie unter dem Blatt.
 */
function seatEffect(c: LevelCtx, e: LogEntry): void {
  const nm = () => nameOf(c.v, e.p, e.name);
  const asToast = seatVia({ phase: c.v.phase, sheet: !!$opt('#overlay .modal') }) === 'toast';
  switch (e.k) {
    case 'takeover':
      emit(cueOf(e, c), { text: SEAT.takeover(e.name ?? nm(), e.from), toast: asToast });
      return;
    case 'tobot':
      emit(cueOf(e, c), { text: SEAT.tobot(nm()), toast: asToast });
      return;
    case 'back':
      emit(cueOf(e, c), { text: SEAT.back(nm()), toast: asToast });
      return;
    case 'join':
      emit(cueOf(e, c), { text: SEAT.join(nm()), toast: asToast });
      return;
    default:
      return;
  }
}

/**
 * Lobby: Wer kommt oder geht, bekommt eine kurze Meldung und einen leisen Ton. KIs kommen und gehen still,
 * mehrere auf einmal stehen in einer Meldung.
 */
function lobbyPeople(prev: View, v: View, fresh: LogEntry[]): void {
  const came: string[] = [];
  const went: string[] = [];
  /** Übernahmen nennen den Platz, in der Lobby ohne „samt Karten“ */
  const taken: string[] = [];
  fresh.forEach((e) => {
    if (!e.p || e.p === App.me) return;
    if (e.k === 'takeover') taken.push(SEAT.takeover(nameOf(v, e.p, e.name), e.from));
    else if ((e.k === 'join' && !e.bot) || e.k === 'back') came.push(nameOf(v, e.p, e.name));
    const was = pById(prev, e.p);
    if (e.k === 'leave' && was && !was.bot) went.push(e.name ?? was.name);
  });
  if (came.length || taken.length) sfxCalm('msg', 400);
  for (const t of taken) toast(t);
  if (came.length) {
    toast(`${listJoin(came)} ${came.length === 1 ? 'sitzt' : 'sitzen'} jetzt mit am Tisch.`);
  }
  if (went.length) {
    sfxCalm('card', 400, 0.7);
    toast(`${listJoin(went)} ${went.length === 1 ? 'ist' : 'sind'} gegangen.`);
  }
}
