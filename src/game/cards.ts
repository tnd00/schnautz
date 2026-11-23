import { RANKS, SH_ORD, SH_RANKS, SUIT_ORD, SUITS } from './constants';
import type { Card, Rank, Rng, Suit } from './types';

export const suitOf = (c: Card): Suit => c[0] as Suit;
export const rankOf = (c: Card): Rank => c.slice(1);

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
export const shDeck = (rng?: Rng): Card[] => shuffle(buildDeck(SH_RANKS), rng);

/** Sortiert Shithead-Karten nach Wert, bei gleichem Wert nach Farbe. */
export function shSort(a: Card[]): Card[] {
  return a.sort((x, y) => SH_ORD[rankOf(x)] - SH_ORD[rankOf(y)] || SUIT_ORD[suitOf(x)] - SUIT_ORD[suitOf(y)]);
}
