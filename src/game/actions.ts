/* Einziger Einstiegspunkt für alle Spielzüge. Der Gastgeber ruft act() für eigene Züge, Gäste und KIs auf. */
import { EMOTES, SOUNDS, TOSS_ITEMS } from './constants';
import { beginGame, checkReady, toLobby } from './flow';
import { checkInstant, endTurn, renewMiddle, startRound } from './schnautz';
import { shAct, shAuto, shBegin } from './shithead';
import { challenge, rematchOpen } from './rematch';
import { syncSeats } from './seats';
import {
  activeList,
  addBot,
  addLog,
  maxSeats,
  migrate,
  nextActive,
  pIdx,
  removePlayer,
  sanitizeRules,
  seatLimit,
} from './state';
import type { Action, ActResult, LogEntry, Rng, State } from './types';
import { GAME_NAME, isGame, unreachable } from './games';

const MAX_EMOTES_IN_LOG = 6;
const MAX_TOSSES_IN_LOG = 6;
const MAX_SOUNDS_IN_LOG = 4;
const HOST_ONLY = 'Nur der Gastgeber kann das.';

/** Reaktionen, Würfe und Klänge haben je einen eigenen Deckel im Verlauf und verdrängen keine Spielzüge. */
function capLog(st: State, k: LogEntry['k'], max: number): void {
  const olds = st.log.filter((x) => x.k === k);
  while (olds.length >= max) st.log.splice(st.log.indexOf(olds.shift()!), 1);
}

/** Darf dieser Platz gerade diesen Klang schicken? Ohne Uhr, die Zeitsperren liegen beim Host. */
export function soundOk(st: State, pid: string, a: Action): boolean {
  if (a?.type !== 'sound' || !SOUNDS.includes(a.s) || st.phase === 'lobby') return false;
  const me = st.players[pIdx(st, pid)];
  return !!me && !!a.bot === !!me.bot;
}

/**
 * Führt eine Aktion aus. Gibt `null` zurück, wenn sie geklappt hat, sonst einen Hinweis für die Person.
 * Aktionen von Gästen kommen ungeprüft aus dem Netz, deshalb wird hier alles validiert.
 */
export function act(st: State, pid: string, a: Action, rng?: Rng): ActResult {
  if (!a || typeof a.type !== 'string') return 'Unbekannte Aktion.';
  migrate(st);
  const pi = pIdx(st, pid);
  if (pi < 0) return 'Du sitzt nicht an diesem Tisch.';
  const me = st.players[pi];
  const isHost = pid === st.host;

  switch (a.type) {
    case 'chat': {
      if (me.bot && !a.bot) return null;
      const text = String(a.text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
      if (text) addLog(st, me.bot ? { k: 'chat', p: pid, text, bot: true } : { k: 'chat', p: pid, text });
      return null;
    }
    case 'emote': {
      if (!EMOTES.includes(a.e) || st.phase === 'lobby') return null;
      if (me.bot && !a.bot) return null;
      capLog(st, 'emote', MAX_EMOTES_IN_LOG);
      addLog(st, { k: 'emote', p: pid, e: a.e });
      return null;
    }
    case 'toss': {
      // Werfen dürfen alle mit Platz, auch wer fertig oder raus ist. Zug und Uhr bleiben unberührt.
      if (!TOSS_ITEMS.includes(a.item) || st.phase === 'lobby') return null;
      if (me.bot && !a.bot) return null;
      const to = String(a.to || '');
      if (to === pid) return null;
      if (pIdx(st, to) < 0) return 'Die Person sitzt nicht mehr am Tisch.';
      capLog(st, 'toss', MAX_TOSSES_IN_LOG);
      addLog(st, { k: 'toss', p: pid, to, item: a.item });
      return null;
    }
    case 'sound': {
      if (!soundOk(st, pid, a)) return null;
      capLog(st, 'sound', MAX_SOUNDS_IN_LOG);
      addLog(st, a.quiet ? { k: 'sound', p: pid, s: a.s, quiet: true } : { k: 'sound', p: pid, s: a.s });
      return null;
    }
    case 'rules':
      if (!isHost) return 'Nur der Gastgeber kann die Regeln ändern.';
      if (st.phase !== 'lobby') return 'Regeln lassen sich nur in der Lobby ändern.';
      st.rules = sanitizeRules(a.rules, st.rules);
      st.players.forEach((p) => {
        p.lives = st.rules.lives;
      });
      syncSeats(st, rng);
      return null;
    case 'game': {
      if (!isHost) return 'Nur der Gastgeber wählt das Spiel.';
      if (st.phase !== 'lobby') return 'Das Spiel lässt sich nur in der Lobby wechseln.';
      const game = isGame(a.game) ? a.game : 'schnautz';
      const humans = st.players.filter((p) => !p.bot).length;
      if (humans > maxSeats(game)) return `${GAME_NAME[game]} geht mit höchstens ${maxSeats(game)} Leuten.`;
      st.game = game;
      syncSeats(st, rng);
      return null;
    }
    case 'start':
      if (!isHost) return 'Nur der Gastgeber startet die Partie.';
      if (st.phase !== 'lobby') return 'Die Partie läuft schon.';
      if (st.players.length > maxSeats(st.game))
        return `Mehr als ${maxSeats(st.game)} Leute gehen bei diesem Spiel nicht.`;
      return beginGame(st, rng);
    case 'addbot':
      if (!isHost) return 'Nur der Gastgeber kann KIs hinzufügen.';
      return addBot(st, rng);
    case 'rmbot': {
      if (!isHost) return HOST_ONLY;
      if (st.phase !== 'lobby') return 'KIs lassen sich nur in der Lobby entfernen.';
      const bi = pIdx(st, String(a.id || ''));
      if (bi < 0 || !st.players[bi].bot) return null;
      removePlayer(st, st.players[bi].id);
      // Beim Auffüllen käme sofort eine neue KI, also fällt der Platz weg
      if (st.rules.fill) st.rules.seats = seatLimit(st) - 1;
      syncSeats(st, rng);
      return null;
    }
    case 'tolobby':
      if (!isHost) return HOST_ONLY;
      toLobby(st);
      return null;
    case 'restart':
      if (!isHost) return 'Nur der Gastgeber startet eine neue Partie.';
      if (st.phase === 'lobby') return 'Die Partie hat noch gar nicht angefangen.';
      toLobby(st);
      return beginGame(st, rng);
    case 'skip':
      if (!isHost) return HOST_ONLY;
      return skipOffline(st, rng);
    case 'force':
      if (!isHost) return HOST_ONLY;
      if (st.phase === 'end') startRound(st, rng, false);
      else if (st.phase === 'swap') shBegin(st);
      else if (st.phase === 'over') return beginGame(st, rng);
      return null;
    case 'ready':
      if (st.phase !== 'end' && st.phase !== 'over') return null;
      me.ready = true;
      checkReady(st, rng);
      return null;
    case 'rematch':
      // Fordern zählt als bereit. Ein später oder unberechtigter Tipp ist einfach bereit, er scheitert nie
      if (st.phase !== 'over' || (me.bot && !a.bot)) return null;
      if (rematchOpen(st, pid)) challenge(st, pid);
      me.ready = true;
      checkReady(st, rng);
      return null;
  }

  switch (st.game) {
    case 'shithead':
      return a.type.startsWith('sh') ? shAct(st, pid, pi, a, rng) : 'Das geht gerade nicht.';
    case 'schnautz':
      return schnautzMove(st, pid, pi, a, rng);
    default:
      return unreachable(st.game);
  }
}

/** Einfacher Ersatzzug, wenn ein Zug der KI abgelehnt wurde. Das Spiel darf nie hängen. */
export function fallbackMove(st: State, pid: string, rng?: Rng): void {
  switch (st.game) {
    case 'shithead':
      if (st.phase === 'swap') act(st, pid, { type: 'shready' }, rng);
      else shAuto(st, pid, rng);
      return;
    case 'schnautz':
      act(st, pid, st.phase === 'choose' ? { type: 'keep' } : { type: 'pass' }, rng);
      return;
    default:
      unreachable(st.game);
  }
}

/** Der Gastgeber spielt einen einfachen Zug für jemanden, der gerade offline ist. */
function skipOffline(st: State, rng?: Rng): ActResult {
  switch (st.game) {
    case 'shithead': {
      if (st.phase !== 'play' || st.sh?.win?.lock) return null;
      const who = st.players[st.turn];
      if (!who) return null;
      if (who.online) return `${who.name} ist wieder da.`;
      return shAuto(st, who.id, rng);
    }
    case 'schnautz': {
      const who = st.phase === 'choose' ? st.players[st.dealer] : st.phase === 'play' ? st.players[st.turn] : null;
      if (!who) return null;
      if (who.online) return `${who.name} ist wieder da.`;
      return act(st, who.id, { type: st.phase === 'choose' ? 'keep' : 'pass' }, rng);
    }
    default:
      return unreachable(st.game);
  }
}

function schnautzMove(st: State, pid: string, pi: number, a: Action, rng?: Rng): ActResult {
  switch (a.type) {
    case 'keep':
    case 'take': {
      if (st.phase !== 'choose') return 'Das geht gerade nicht.';
      if (pi !== st.dealer) return 'Das entscheidet, wer gibt.';
      const oldHand = st.hands[pid].slice();
      const spare = st.spare ?? [];
      if (a.type === 'keep') {
        st.middle = spare;
      } else {
        st.middle = st.hands[pid];
        st.hands[pid] = spare;
      }
      st.spare = null;
      st.phase = 'play';
      st.turn = nextActive(st, st.dealer);
      addLog(st, { k: a.type, p: pid });
      st.last = { k: a.type, p: pid, n: st.n, give: a.type === 'take' ? oldHand : null };
      checkInstant(st);
      return null;
    }
    case 'swap':
    case 'swapAll':
    case 'pass':
    case 'knock':
      break;
    default:
      return 'Unbekannte Aktion.';
  }
  if (st.phase !== 'play') return 'Das geht gerade nicht.';
  if (pi !== st.turn) return 'Du bist gerade nicht dran.';
  const hand = st.hands[pid];
  switch (a.type) {
    case 'swap': {
      const h = a.h | 0;
      const m = a.m | 0;
      if (h < 0 || h > 2 || m < 0 || m > 2) return 'Ungültige Karte.';
      const take = st.middle[m];
      const give = hand[h];
      hand[h] = take;
      st.middle[m] = give;
      st.passes = 0;
      addLog(st, { k: 'swap', p: pid, take, give });
      st.last = { k: 'swap', p: pid, h, m, n: st.n, take, give };
      return endTurn(st, pid);
    }
    case 'swapAll': {
      const old = hand.slice();
      const took = st.middle.slice();
      st.hands[pid] = st.middle;
      st.middle = old;
      st.passes = 0;
      addLog(st, { k: 'swapAll', p: pid });
      st.last = { k: 'swapAll', p: pid, n: st.n, take: took, give: old };
      return endTurn(st, pid);
    }
    case 'pass':
      st.passes++;
      addLog(st, { k: 'pass', p: pid });
      st.last = { k: 'pass', p: pid, n: st.n };
      if (!st.knocker && st.passes >= activeList(st).length) renewMiddle(st, rng);
      return endTurn(st, pid);
    case 'knock':
      if (st.knocker) return 'Es wurde schon geklopft.';
      if (!st.rules.knockFirst && st.turns < activeList(st).length) {
        return 'Klopfen geht erst, wenn jeder einmal dran war.';
      }
      st.knocker = pid;
      st.afterKnock = activeList(st).length - 1;
      st.passes = 0;
      addLog(st, { k: 'knock', p: pid });
      st.last = { k: 'knock', p: pid, n: st.n };
      st.turns++;
      st.turn = nextActive(st, st.turn);
      return null;
  }
  return 'Unbekannte Aktion.';
}
