import type { GameKind, Rank, Rules, Suit } from './types';

export const SUITS: readonly Suit[] = ['C', 'S', 'H', 'D'];
export const SUIT_SYM: Record<Suit, string> = { C: '♣', S: '♠', H: '♥', D: '♦' };

/** Schnautz spielt mit 32 Karten. */
export const RANKS: readonly Rank[] = ['7', '8', '9', '10', 'B', 'D', 'K', 'A'];
export const RANK_VAL: Readonly<Record<Rank, number>> = { 7: 7, 8: 8, 9: 9, 10: 10, B: 10, D: 10, K: 10, A: 11 };

export const DEFAULT_RULES: Readonly<Rules> = {
  seats: 4,
  fill: false,
  turnSecs: 20,
  lives: 3,
  feuer: true,
  dealerChoice: true,
  knockFirst: false,
  knockDouble: false,
  sh: { two: true, three: true, seven: true, ten: true, eight: true, four: true, cut: true, deck5: false },
};

export const EMOTES: readonly string[] = ['😂', '🫵', '🤡', '💩', '🔥', '😭', '👏', '🙈'];
/** So lange wartet die Person am Zug bei einem neuen Stapel, damit alle ihre 4er reinwerfen können. */
export const SH_WIN_MS = 2000;
/** Höchstzahl am Tisch je Spiel. */
export const MAX_SEATS: Readonly<Record<GameKind, number>> = { schnautz: 8, shithead: 10 };
/** Ab so vielen Leuten spielt Shithead immer mit zwei Decks, eins weniger auf Wunsch. */
export const SH_TWO_DECKS = 6;
/** Wählbare Zeiten pro Zug in Sekunden, 0 heißt aus. */
export const TURN_SECS: readonly number[] = [0, 10, 15, 20, 30, 45, 60, 90];

/** Mit weniger als zwei geht keine Partie. */
export const MIN_SEATS = 2;
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
