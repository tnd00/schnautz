import { RANKS, SH_ORD, SH_RANKS, SUIT_ORD, SUITS } from './constants';
import type { Card, Rank, Rng, Suit } from './types';

/** Karten aus dem zweiten Deck tragen hinten `:2`, damit jede Karte eindeutig bleibt. */
export const DECK2 = ':2';
export const suitOf = (c: Card): Suit => c[0] as Suit;
export const rankOf = (c: Card): Rank => (c.endsWith(DECK2) ? c.slice(1, -DECK2.length) : c.slice(1));

/** Zufallszahl in [0, 1). Mit `rng` reproduzierbar (Tests), sonst kryptografisch. */
export function rnd(rng?: Rng): number {
  if (rng) return rng();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  }
  return Math.random();
}

/** Mischt das Array an Ort und Stelle (Fisher-Yates) und gibt es zurück. */
export function shuffle<T>(a: T[], rng?: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const buildDeck = (ranks: readonly Rank[]): Card[] => SUITS.flatMap((s) => ranks.map((r) => s + r));

export const newDeck = (rng?: Rng): Card[] => shuffle(buildDeck(RANKS), rng);
/** Shithead-Stapel aus einem oder mehreren Decks, gut gemischt. */
export function shDeck(rng?: Rng, decks = 1): Card[] {
  const one = buildDeck(SH_RANKS);
  const all = [...one];
  for (let d = 2; d <= decks; d++) all.push(...one.map((c) => (d === 2 ? c + DECK2 : `${c}:${d}`)));
  return shuffle(all, rng);
}

/** Sortiert Shithead-Karten nach Wert, bei gleichem Wert nach Farbe. */
export function shSort(a: Card[]): Card[] {
  return a.sort((x, y) => SH_ORD[rankOf(x)] - SH_ORD[rankOf(y)] || SUIT_ORD[suitOf(x)] - SUIT_ORD[suitOf(y)]);
}
