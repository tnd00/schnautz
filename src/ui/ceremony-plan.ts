/*
 * Drehbuch der Zeremonie am Partieende, ohne DOM, damit Node-Tests und die KI beim Host es nutzen können.
 * Bei Shithead fliegt die letzte Karte in Zeitlupe, danach steht kurz die Fertig-Meldung, dann kommt die Enthüllung.
 * Aussehen, Klang und Sprüche je Spiel stehen in `planOf`, die Wartezeit der KI in `revealDelayOf`.
 */
import { LOSER_NAME, unreachable } from '../game/games';
import type { Card, GameKind, LogEntry, View } from '../game/types';
import type { PaletteName } from './look';

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
  /** Farben des Konfettis, je Look aus paletteOf (src/ui/look.ts) */
  palette: PaletteName;
  /** Posaune bei Schande, Fanfare bei Krönung */
  sfx: 'trombone' | 'crown';
  /** Spruchtöpfe, `stays` wenn der Cabo-König die Krone verteidigt */
  taunts: { self: string; other: string; stays?: string };
  /** Wie oft diese Person den Titel schon hat */
  count: (v: View, pid: string) => number;
  /** Zug für die Zeitlupe, heute nur Shithead */
  slow: (fresh: readonly LogEntry[]) => PlayEntry | null;
  /** So lange nach dem Ablauf (und einer Zeitlupe) beginnt ungefähr die Enthüllung */
  leadMs: number;
}

export type CeremonyPlan = { kind: 'none' } | Stage;

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

/** Fertig-Meldung, kurze Pause und Anlauf der Bühne bis zur Enthüllung */
const DONE_LEAD_MS = ZER_SHDONE_MS + 240 + 600;
/** Lief im letzten Zug die Uhr ab, steht vorher noch „Zeit um!“ da (src/ui/effects.ts, 2000 ms plus Pause) */
const TIMEOUT_LEAD_MS = 2240;

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
        palette: 'brown',
        sfx: 'trombone',
        taunts: { self: 'shLoserSelf', other: 'shLoserOther' },
        count: (v, id) => num(seat(v, id)?.shc),
        slow: decisivePlay,
        leadMs: DONE_LEAD_MS,
      };
    case 'durak':
      return {
        kind: 'shame',
        endKind: 'dkend',
        doneKind: 'dkout',
        mark: '🤡',
        what: LOSER_NAME.durak,
        tone: 'red',
        palette: 'jester',
        sfx: 'trombone',
        taunts: { self: 'dkLoserSelf', other: 'dkLoserOther' },
        count: (v, id) => num(seat(v, id)?.dkc),
        slow: noSlow,
        // Wer zuletzt rausgeht, steht wie bei Shithead kurz als Fertig-Meldung da
        leadMs: DONE_LEAD_MS,
      };
    case 'cabo':
      return {
        kind: 'crown',
        endKind: 'cbend',
        doneKind: null,
        mark: '👑',
        what: 'Cabo-König',
        tone: 'gold',
        palette: 'gold',
        sfx: 'crown',
        taunts: { self: 'cbKingSelf', other: 'cbKingOther', stays: 'cbKingStays' },
        count: (v, id) => num(seat(v, id)?.stats?.cabo?.wins),
        slow: noSlow,
        // Vor der Krönung steht die Rundenmeldung (1600 ms plus Pause), das trifft ungefähr dieselbe Zeit
        leadMs: DONE_LEAD_MS,
      };
    case 'schnautz':
      // Schnautz schreibt kein Partieende mit Zeremonie, ein alter Eintrag im Verlauf darf keine 💩-Show auslösen
      return { kind: 'none' };
    default:
      return unreachable(game);
  }
}

/**
 * Ab wann ungefähr die Enthüllung läuft, 0 ohne Partieende dieses Spiels im Schub. Ohne View, weil der Gastgeber
 * mit State rechnet. Die KI wartet so lange mit Sprüchen, Würfen und Klängen, der Countdown zur nächsten Runde
 * ebenso. `seqMs` ist die Dauer des Shithead-Ablaufs, nur dann gibt es eine Zeitlupe.
 */
export function revealDelayOf(game: GameKind, entries: readonly LogEntry[], seqMs: number): number {
  const plan = planOf(game);
  if (plan.kind === 'none' || !entries.some((e) => e.k === plan.endKind)) return 0;
  const d = seqMs > 0 ? plan.slow(entries) : null;
  const late = entries.some((e) => e.k === 'timeout') ? TIMEOUT_LEAD_MS : 0;
  return seqMs + (d ? slowExtraMs(d) : 0) + late + plan.leadMs;
}
