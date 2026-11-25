/*
 * Vorspulen: Spielen nur noch KIs, drückt der Gastgeber „⏩ Vorspulen“ und die KIs spielen die Partie zügig aus.
 * Hier stehen die Takte als reine Funktionen ohne DOM, `src/net/bots.ts` setzt sie ein. Die Abläufe am Tisch
 * dürfen nicht abreißen, deshalb wartet jeder Zug mindestens, bis der letzte zu sehen war (Animationsboden).
 */
import { livePlayers, onlyBotsPlaying, unreachable } from '../game/games';
import type { GameKind, LogEntry, State } from '../game/types';

/** Takte beim Vorspulen in Millisekunden */
export const FAST = {
  /** Pause vor jedem regulären Zug, dazu kommt der Animationsboden */
  turn: 300,
  /** Schnautz: Das Rundenergebnis steht mindestens so lange, und so lange nach den Meldungen */
  readyMin: 800,
  readyAfterHold: 500,
  /** 4er reinwerfen und Bombe: so schnell bemerkt es die KI, plus Animationsboden */
  reactMin: 100,
  reactSpan: 200,
  /** Tauschrunde und Ansehen bei Cabo: Streuung über den kurzen Takt */
  swapSpan: 300,
  /** Tipps fertiger KIs */
  betMin: 300,
  betSpan: 600,
  /** 4er-Sperre bei einem neuen Stapel statt SH_WIN_MS */
  win: 500,
  /** Durak: ein Zug fliegt so lange, nach Bito oder Aufnehmen fliegt das Nachziehen erst verzögert */
  dkMove: 450,
  dkClear: 1200,
  /** Schnautz: Tausch und Klopfen */
  szMove: 600,
  /** Cabo: Ziehen, Tauschen, Ablegen */
  cbMove: 700,
} as const;

/** Nur Chat, Reaktionen, Würfe, Klänge und Einträge drumherum: daran läuft keine Spielanimation. */
const QUIET: ReadonlySet<string> = new Set(['chat', 'emote', 'toss', 'sound', 'dev', 'ffwd', 'shbet']);

/**
 * Wie lange die Seiten noch an den neuen Einträgen zeigen. Bei Shithead die Länge der Abläufe (`seqNew` aus
 * `seqMsOf`, nicht `seqLeft`, das ist bei verdecktem Tab des Gastgebers null), sonst feste Böden je Spiel.
 */
export function animFloor(game: GameKind, fresh: readonly LogEntry[], seqNew: number): number {
  const moved = fresh.some((e) => !QUIET.has(e.k));
  switch (game) {
    case 'shithead':
      return Math.max(0, seqNew);
    case 'durak':
      if (fresh.some((e) => e.k === 'dkbito' || e.k === 'dkpickup')) return FAST.dkClear;
      return moved ? FAST.dkMove : 0;
    case 'schnautz':
      return moved ? FAST.szMove : 0;
    case 'cabo':
      return moved ? FAST.cbMove : 0;
    default:
      return unreachable(game);
  }
}

export type PaceKind = 'turn' | 'ready' | 'react' | 'swap' | 'bet';

export interface PaceIn {
  kind: PaceKind;
  /** Zufall zwischen 0 und 1 */
  r: number;
  /** So lange läuft der Animationsboden noch (ab jetzt) */
  floor: number;
  /** So lange laufen beim Gastgeber noch Meldungen (`App.holdUntil` minus jetzt) */
  hold?: number;
}

/** Pause vor dem nächsten KI-Schritt beim Vorspulen. */
export function fastDelay({ kind, r, floor, hold = 0 }: PaceIn): number {
  const f = Math.max(0, floor);
  switch (kind) {
    case 'turn':
      return FAST.turn + f;
    case 'ready':
      return Math.max(FAST.readyMin, hold + FAST.readyAfterHold, f);
    case 'react':
      return FAST.reactMin + r * FAST.reactSpan + f;
    case 'swap':
      return FAST.turn + r * FAST.swapSpan;
    case 'bet':
      return FAST.betMin + r * FAST.betSpan;
  }
}

/**
 * Steht im Verlauf, dass der Gastgeber diese Partie vorspult? Der jüngste `ffwd` zählt, solange danach keine neue
 * Partie, keine Lobby und keine Übernahme durch einen Menschen kam. So lesen es Gäste, und der Gastgeber nach dem
 * Neuladen, denn `BOTS.fast` lebt nur im Speicher.
 */
export function ffwdInLog(log: readonly LogEntry[]): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    const k = log[i].k;
    if (k === 'ffwd') return true;
    if (k === 'game' || k === 'takeover' || k === 'back' || k === 'lobby') return false;
  }
  return false;
}

/**
 * Darf das Vorspulen für diese Partie weiterlaufen? Dieselbe Partie, sie läuft noch (bei Schnautz auch zwischen
 * zwei Runden) und es spielen nur KIs. Übernimmt ein Mensch einen Platz, ist es vorbei.
 */
export function fastOk(st: State, fast: number | null): boolean {
  if (fast === null || fast !== st.games) return false;
  if (onlyBotsPlaying(st)) return true;
  if (st.phase !== 'end') return false;
  const live = livePlayers(st);
  return live.length > 0 && live.every((p) => p.bot);
}
