/*
 * Rückmeldestufen je Logart, ohne DOM, damit Vitest die Tabelle prüfen kann. `src/ui/feedback.ts` setzt sie um.
 * Klein ist ein kurzer Hinweis am Platz ohne Ton, mittel derselbe Hinweis mit Klang und auf Wunsch Spruch,
 * groß ist die Ansage mit Zeichen in der Spielfläche. Was nur klingt (Karten legen) oder eine eigene Ebene hat
 * (Chat, Reaktionen, Klänge, Dev), bekommt keine Stufe.
 * Die Tabelle beschreibt die Stufe unabhängig vom Weg. Bei Shithead zeigt der Ablauf (`seqd`) dasselbe wie der Weg
 * ohne Ablauf, die Stufe hängt nicht daran.
 */
import { shBetsOn } from '../game/bets';
import { unreachable } from '../game/games';
import type { LogEntry, View } from '../game/types';

export type Level = 'small' | 'mid' | 'big';

export interface Cue {
  level: Level;
  /**
   * Takt: Rundenstart, Rundenende, Fertig vor der Zeremonie, Revanche, Unentschieden, eigene Zeit um.
   * Zählt nicht gegen „ein Großes pro Zug“.
   */
  beat?: true;
  /** Ein Spruch gehört dazu (Schwellen in SAY) */
  taunt?: true;
  /**
   * Klein, aber mit leisem Ton. Was automatisch passiert (die KI übernimmt, die Uhr läuft ab), wird nach CLAUDE.md
   * mit Text und Ton gemeldet, auch wenn es sonst klein wäre.
   */
  sound?: true;
}

export interface LevelCtx {
  prev: View;
  v: View;
  fresh: readonly LogEntry[];
  me: string;
  /** Shithead: der Ablauf hat Karten, Verbrennen und Aufnehmen schon gezeigt */
  seqd: boolean;
}

/** Spruch- und Hinweisschwellen, die heute verstreut in effects.ts, sequence.ts und log.ts stehen. */
export const SAY = {
  /** Shithead ohne Ablauf: Hinweis „nimmt n Karten“ heute erst ab so vielen Karten (effects.ts) */
  pickupLabel: 5,
  /** Aufnehmen (Shithead und Durak): ab so vielen Karten Spruch und mittlere Stufe */
  pickupTaunt: 6,
  /** Durak: Spruch zum Aufnehmen anderer bei jeder so vielten Lognummer */
  dkTakeEvery: 3,
  /** Cabo: Spruch zum Spionieren bei mir bei jeder so vielten Lognummer */
  cbSpyEvery: 2,
  /** Durak: eigener Spruch zu Bito ab so vielen Karten */
  bitoTaunt: 6,
  /** Shithead: Verbrennen ab so vielen Karten ist groß, darunter mittel */
  burnBig: 10,
  /** Durak: Verlauf „Schöner Fächer.“ ab so vielen Karten */
  fan: 8,
} as const;

const SMALL: Cue = { level: 'small' };
const MID: Cue = { level: 'mid' };
const BIG: Cue = { level: 'big' };
const BEAT: Cue = { level: 'big', beat: true };
/** Klein mit leisem Ton für Automatisches */
const AUTO: Cue = { level: 'small', sound: true };

const withTaunt = (c: Cue, on: boolean): Cue => (on ? { ...c, taunt: true } : c);

/** Arten ohne eigene Bedeutung für den Ablauf (Chat und Co.), sie stehen zwischen Zügen im selben Schub */
const SIDE: ReadonlySet<string> = new Set(['chat', 'emote', 'toss', 'sound', 'dev', 'shbet']);

/** Hat die KI bei Durak nach Ablauf der Uhr nur gepasst? Dann reicht der kleine Hinweis statt der roten Ansage. */
function onlyPassAfter(e: LogEntry, fresh: readonly LogEntry[]): boolean {
  let pass = false;
  for (const x of fresh) {
    if (x.n <= e.n || SIDE.has(x.k)) continue;
    if (x.k === 'timeout') break;
    if (x.p !== e.p) continue;
    if (x.k !== 'dkpass') return false;
    pass = true;
  }
  return pass;
}

/** Eigene Zeit um je Spiel: groß als Takt, bei Durak nach reinem Passen klein. */
function ownTimeout(e: LogEntry, c: LevelCtx): Cue {
  switch (c.v.game) {
    case 'durak':
      return onlyPassAfter(e, c.fresh) ? AUTO : BEAT;
    case 'shithead':
    case 'cabo':
    case 'schnautz':
      return BEAT;
    default:
      return unreachable(c.v.game);
  }
}

/** Tipp bei Shithead und Durak: Tippt jemand auf mich, ist es mittel (der erste mit Spruch), sonst klein. */
function betCue(e: Extract<LogEntry, { k: 'shbet' }>, c: LevelCtx): Cue | null {
  switch (c.v.game) {
    case 'shithead':
    case 'durak': {
      if (e.on !== c.me || e.p === c.me) return SMALL;
      // Nur der erste Tipp auf mich hat einen Spruch (betEffect in src/ui/render/bets.ts)
      return withTaunt(MID, shBetsOn(c.v, c.me)[0]?.n === e.n);
    }
    case 'cabo':
    case 'schnautz':
      return null;
    default:
      return unreachable(c.v.game);
  }
}

/** Fertig bei Shithead und Durak: eigenes und Platz 1 groß, weitere Plätze anderer mittel, vor der Zeremonie Takt. */
function doneCue(e: Extract<LogEntry, { k: 'shdone' | 'dkout' }>, c: LevelCtx): Cue {
  const end = e.k === 'shdone' ? 'shend' : 'dkend';
  const toEnd = c.fresh.some((x) => x.k === end && x.p);
  const mine = e.p === c.me;
  const shared = e.k === 'dkout' && c.fresh.some((x) => x.k === 'dkout' && x.place === e.place && x.p !== e.p);
  const solo = e.place === 1 && !shared;
  if (toEnd) return BEAT;
  if (mine || e.place === 1) return withTaunt(BIG, mine && solo);
  return MID;
}

/** Partieende mit Zeremonie oder Unentschieden, nur beim Wechsel nach „over“. */
function endCue(e: Extract<LogEntry, { k: 'shend' | 'dkend' | 'cbend' }>, c: LevelCtx): Cue | null {
  if (c.prev.phase === 'over' || c.v.phase !== 'over') return null;
  if (e.p) return BIG;
  // Shithead ohne Shithead zeigt heute nichts, Durak und Cabo melden das Unentschieden
  return e.k === 'shend' ? null : BEAT;
}

/** Wie stark meldet dieser Browser den Eintrag? `null` heißt keine Meldung (nur Ton, eigene Ebene oder nichts). */
export function cueOf(e: LogEntry, c: LevelCtx): Cue | null {
  const mine = e.p === c.me;
  const lobby = c.v.phase === 'lobby';
  const ending = (k: 'dkend' | 'cbend') => c.fresh.some((x) => x.k === k);
  switch (e.k) {
    // Kommen und Gehen: in der Lobby ein Toast (lobbyPeople), am Tisch klein
    case 'join':
    case 'leave':
    case 'back':
      return lobby || mine || !e.p ? null : SMALL;
    case 'takeover':
    case 'tobot':
      return lobby || mine || !e.p ? null : AUTO;
    case 'quit':
    case 'game':
    case 'lobby':
    case 'abort':
    case 'ffwd':
      return null;
    case 'timeout':
      return mine ? ownTimeout(e, c) : AUTO;
    // Eigene Ebenen außerhalb der Stufen
    case 'chat':
    case 'emote':
    case 'sound':
    case 'dev':
      return null;
    case 'toss':
      return e.to === c.me && !mine ? SMALL : null;
    case 'shbet':
      return betCue(e, c);
    case 'rematch':
      return BEAT;
    case 'rematchend':
      return c.v.players.length > 2 && [e.p, e.to].some((id) => !c.v.players.find((p) => p.id === id)?.bot)
        ? BEAT
        : null;
    // Schnautz
    case 'round':
    case 'swap':
      return null;
    case 'keep':
    case 'take':
    case 'pass':
    case 'swapAll':
      return mine ? null : SMALL;
    case 'renew':
      return SMALL;
    case 'knock':
      return BIG;
    case 'result': {
      if (e.reason === 'quit') return null;
      const taunt = Object.keys(e.changes || {}).length > 0;
      return withTaunt(e.reason === 'schnautz' || e.reason === 'feuer' ? BIG : BEAT, taunt);
    }
    case 'winner':
      return e.p ? withTaunt(BEAT, true) : null;
    // Shithead
    case 'shdeal':
    case 'shstart':
      return null;
    case 'shplay':
      return e.src === 'down' ? SMALL : null;
    case 'shthrow':
    case 'shbomb':
      return SMALL;
    case 'shburn': {
      if (e.four) return BIG;
      const n = (c.v.sh?.burned ?? 0) - (c.prev.sh?.burned ?? 0);
      return n >= SAY.burnBig ? BIG : MID;
    }
    case 'shpickup':
      return e.cnt >= SAY.pickupTaunt ? withTaunt(MID, true) : SMALL;
    case 'shblindfail':
      return withTaunt(MID, true);
    case 'shdone':
      return doneCue(e, c);
    case 'shend':
      return endCue(e, c);
    // Durak
    case 'dkdeal':
      return BEAT;
    case 'dkattack':
    case 'dkdefend':
    case 'dkpass':
      return null;
    case 'dktransfer':
      return e.to === c.me && !mine ? withTaunt(BIG, true) : MID;
    case 'dktake': {
      // Folgt das Aufnehmen sofort, sprechen Hinweis und Spruch dort
      if (c.fresh.some((x) => x.k === 'dkpickup' && x.n > e.n)) return null;
      return withTaunt(SMALL, !ending('dkend') && (mine || e.n % SAY.dkTakeEvery === 0));
    }
    case 'dkbito': {
      const limit = c.prev.dk?.limit ?? 0;
      const full = limit > 0 && e.cnt >= 2 * limit;
      return withTaunt(full ? BIG : MID, mine && e.cnt >= SAY.bitoTaunt && !ending('dkend'));
    }
    case 'dkpickup':
      return e.cnt >= SAY.pickupTaunt ? withTaunt(MID, !ending('dkend')) : SMALL;
    case 'dkout':
      return doneCue(e, c);
    case 'dkend':
      return endCue(e, c);
    // Cabo
    case 'cbdeal':
      return BEAT;
    case 'cblook':
    case 'cbskip':
      return null;
    case 'cbdraw':
      return !mine && e.from === 'pile' ? SMALL : null;
    case 'cbswap':
      if (!e.ok) return MID;
      return e.slots > 1 ? SMALL : null;
    case 'cbdiscard':
      return e.power ? SMALL : null;
    case 'cbpeek':
      return mine ? null : SMALL;
    case 'cbspy':
      if (mine) return null;
      return e.to === c.me ? withTaunt(MID, e.n % SAY.cbSpyEvery === 0) : SMALL;
    case 'cbblind':
      return e.to === c.me && !mine ? withTaunt(MID, true) : SMALL;
    case 'cbcabo':
      return withTaunt(BIG, true);
    case 'cbsnap':
      return e.ok ? SMALL : withTaunt(MID, mine);
    case 'cbround':
      return e.kami ? BIG : BEAT;
    case 'cbreset':
      return SMALL;
    case 'cbend':
      return endCue(e, c);
    default: {
      // Der Compiler meldet jede fehlende Art. Eine unbekannte Art von einem neueren Gastgeber bleibt still
      const unknown: never = e;
      void unknown;
      return null;
    }
  }
}

export const levelOf = (e: LogEntry, c: LevelCtx): Level | null => cueOf(e, c)?.level ?? null;
