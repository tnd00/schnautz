import type { Rank, Rules, Suit } from './types';

export const SUITS: readonly Suit[] = ['C', 'S', 'H', 'D'];
export const SUIT_SYM: Record<Suit, string> = { C: '♣', S: '♠', H: '♥', D: '♦' };

/** Schnautz spielt mit 32 Karten. */
export const RANKS: readonly Rank[] = ['7', '8', '9', '10', 'B', 'D', 'K', 'A'];
export const RANK_VAL: Readonly<Record<Rank, number>> = { 7: 7, 8: 8, 9: 9, 10: 10, B: 10, D: 10, K: 10, A: 11 };

export const DEFAULT_RULES: Readonly<Rules> = {
  lives: 3,
  feuer: true,
  dealerChoice: true,
  knockFirst: false,
  knockDouble: false,
  sh: { two: true, three: true, seven: true, ten: true, eight: false, four: true, cut: true },
};

export const EMOTES: readonly string[] = ['😂', '🫵', '🤡', '💩', '🔥', '😭'];
/** So lange dürfen alle am Anfang einer Shithead-Partie ihre 4er reinwerfen. */
export const SH_WIN_MS = 6000;
export const MAX_PLAYERS = 4;
export const LOG_LIMIT = 150;

/** Shithead spielt mit 52 Karten, das Ass ist am höchsten. */
export const SH_RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K', 'A'];
export const SH_ORD: Readonly<Record<Rank, number>> = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  B: 11,
  D: 12,
  K: 13,
  A: 14,
};
export const SUIT_ORD: Readonly<Record<Suit, number>> = { C: 0, S: 1, H: 2, D: 3 };

export function cloneRules(r: Readonly<Rules> = DEFAULT_RULES): Rules {
  return { ...r, sh: { ...r.sh } };
}
