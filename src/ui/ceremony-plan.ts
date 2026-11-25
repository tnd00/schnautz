/*
 * Drehbuch der Zeremonie am Partieende, ohne DOM, damit Node-Tests und die KI beim Host es nutzen können.
 * Bei Shithead fliegt die letzte Karte in Zeitlupe, danach steht kurz die Fertig-Meldung, dann kommt die Enthüllung.
 * Aussehen, Klang und Sprüche je Spiel stehen in `planOf`, die Wartezeit der KI in `revealDelayOf`.
 */
import { LOSER_NAME, unreachable } from '../game/games';
import type { Card, GameKind, LogEntry, View } from '../game/types';

/** Zusätzliche Flugzeit der entscheidenden Karte in Zeitlupe */
export const ZER_SLOW_FLIGHT_MS = 1500;
/** Abstand zwischen mehreren Karten eines Zugs */
export const SEQ_CARD_GAP_MS = 110;
/** So kurz steht die Fertig-Meldung direkt vor der Enthüllung */
export const ZER_SHDONE_MS = 1100;
/** So lange läuft die Enthüllung */
export const ZER_REVEAL_MS = 3800;

/** Logart, mit der eine Partie samt Zeremonie endet */
export type EndKind = 'shend' | 'dkend' | 'cbend';

type PlayEntry = Extract<LogEntry, { k: 'shplay' | 'shthrow' | 'shbomb' }>;

/** Eine Zeremonie: Schande für den Verlierer oder Krönung für den Sieger. */
export interface Stage {
  kind: 'shame' | 'crown';
  endKind: EndKind;
  /** Kurze Fertig-Meldung direkt davor, sie steht dann ZER_SHDONE_MS */
  doneKind: 'shdone' | 'dkout' | null;
  /** Was auf den Platz fällt */
  mark: string;
  /** Titel in der Meldung */
  what: string;
  tone: 'brown' | 'red' | 'gold';
  /** Farben des Konfettis */
  colors: readonly string[];
  /** Posaune bei Schande, Fanfare bei Krönung */
  sfx: 'trombone' | 'crown';
  /** Spruchtöpfe, `stays` wenn der Cabo-König die Krone verteidigt */
  taunts: { self: string; other: string; stays?: string };
  /** Wie oft diese Person den Titel schon hat */
  count: (v: View, pid: string) => number;
  /** Zug für die Zeitlupe, heute nur Shithead */
  slow: (fresh: readonly LogEntry[]) => PlayEntry | null;
}

export type CeremonyPlan = { kind: 'none' } | Stage;

const BROWN = ['#9c6b3a', '#b07a42', '#c08a50', '#d9a96b', '#e8c9a0'];
/** Narrenfarben für den Durak */
const JESTER = ['#e0362b', '#f3cd7d', '#2e8b57', '#4a6fd1', '#f6efdf', '#b3312a'];
/** Gold für den Cabo-König */
const GOLD = ['#f3cd7d', '#e8b64c', '#fff1c7', '#c9962e', '#f6efdf'];

/** Zahl aus unsicherer Quelle, sonst 0 (wie `num` in src/ui/dom.ts) */
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const seat = (v: View, id: string) => v.players.find((p) => p.id === id);

/** Der Zug, mit dem die vorletzte Person fertig wurde und damit den Shithead festgelegt hat. */
export function decisivePlay(fresh: readonly LogEntry[]): PlayEntry | null {
  let end = -1;
  for (let i = fresh.length - 1; i >= 0; i--)
    if (fresh[i].k === 'shend' && fresh[i].p) {
      end = i;
      break;
    }
  if (end < 1) return null;
  const done = fresh[end - 1];
  if (done.k !== 'shdone') return null;
  for (let i = end - 2; i >= 0; i--) {
    const e = fresh[i];
    if ((e.k === 'shplay' || e.k === 'shthrow' || e.k === 'shbomb') && e.p === done.p) return e;
  }
  return null;
}

export const slowExtraMs = (e: { cards?: Card[] }): number =>
  ZER_SLOW_FLIGHT_MS + Math.max(0, (e.cards?.length ?? 1) - 1) * SEQ_CARD_GAP_MS;

const noSlow = (): null => null;

/** Wie die Zeremonie in diesem Spiel aussieht und klingt. Schnautz hat (noch) keine. */
export function planOf(game: GameKind): CeremonyPlan {
  switch (game) {
    case 'shithead':
      return {
        kind: 'shame',
        endKind: 'shend',
        doneKind: 'shdone',
        mark: '💩',
        what: LOSER_NAME.shithead,
        tone: 'brown',
        colors: BROWN,
        sfx: 'trombone',
        taunts: { self: 'shLoserSelf', other: 'shLoserOther' },
        count: (v, id) => num(seat(v, id)?.shc),
        slow: decisivePlay,
      };
    case 'durak':
      return {
        kind: 'shame',
        endKind: 'dkend',
        doneKind: 'dkout',
        mark: '🤡',
        what: LOSER_NAME.durak,
        tone: 'red',
        colors: JESTER,
        sfx: 'trombone',
        taunts: { self: 'dkLoserSelf', other: 'dkLoserOther' },
        count: (v, id) => num(seat(v, id)?.dkc),
        slow: noSlow,
      };
    case 'cabo':
      return {
        kind: 'crown',
        endKind: 'cbend',
        doneKind: null,
        mark: '👑',
        what: 'Cabo-König',
        tone: 'gold',
        colors: GOLD,
        sfx: 'crown',
        taunts: { self: 'cbKingSelf', other: 'cbKingOther', stays: 'cbKingStays' },
        count: (v, id) => num(seat(v, id)?.stats?.cabo?.wins),
        slow: noSlow,
      };
    case 'schnautz':
      // Schnautz schreibt kein Partieende mit Zeremonie, ein alter Eintrag im Verlauf darf keine 💩-Show auslösen
      return { kind: 'none' };
    default:
      return unreachable(game);
  }
}

/** Ungefähr ab hier läuft die Shithead-Enthüllung. Die KI wartet so lange mit Spott und Würfen. */
export function zerRevealDelay(fresh: readonly LogEntry[], seqMs: number): number {
  return delayOf(decisivePlay, fresh, seqMs);
}

function delayOf(slow: Stage['slow'], fresh: readonly LogEntry[], seqMs: number): number {
  const d = seqMs > 0 ? slow(fresh) : null;
  // Lief im letzten Zug die Uhr ab, steht vorher noch „Zeit um!“ da (src/ui/effects.ts, 2000 ms plus Pause)
  const late = fresh.some((e) => e.k === 'timeout') ? 2240 : 0;
  return seqMs + (d ? slowExtraMs(d) : 0) + late + ZER_SHDONE_MS + 240 + 600;
}

/**
 * Ab wann ungefähr die Enthüllung läuft, 0 ohne Partieende dieses Spiels im Schub. Ohne View, weil der Gastgeber
 * mit State rechnet. Für Shithead genau `zerRevealDelay`, Durak und Cabo nutzen dieselben Zeiten ohne Zeitlupe.
 */
export function revealDelayOf(game: GameKind, entries: readonly LogEntry[], seqMs: number): number {
  const plan = planOf(game);
  if (plan.kind === 'none' || !entries.some((e) => e.k === plan.endKind)) return 0;
  return delayOf(plan.slow, entries, seqMs);
}
