import type { GameKind, Rank, Rules, Suit, TossItem } from './types';

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
  dk: { transfer: false },
};

export const EMOTES: readonly string[] = ['😂', '🫵', '🤡', '💩', '🔥', '😭', '👏', '🙈'];

/** Wurfgeschosse: Zeichen und wie lange sie am Ziel kleben */
export const TOSS_ITEMS: readonly TossItem[] = ['tomato', 'egg', 'poo', 'crown', 'heart', 'bunny'];
export const TOSS_ICON: Readonly<Record<TossItem, string>> = {
  tomato: '🍅',
  egg: '🥚',
  poo: '💩',
  crown: '👑',
  heart: '❤️',
  bunny: '🐰',
};
export const TOSS_LIFE_MS: Readonly<Record<TossItem, number>> = {
  tomato: 3500,
  egg: 3500,
  poo: 4000,
  crown: 5000,
  heart: 4000,
  bunny: 4500,
};
/** Soundboard in fester Reihenfolge */
export const SOUNDS: readonly string[] = ['horn', 'roll', 'ooh', 'clap', 'sad', 'crick'];
/** Am ganzen Tisch höchstens so viele hörbare Klänge in diesem Fenster, darüber fliegt nur das Symbol */
export const SOUND_TABLE_MAX = 4;
export const SOUND_TABLE_WINDOW_MS = 6000;
/** So lange steht die große Ansage einer Revanche-Forderung */
export const REMATCH_ANN_MS = 2400;
/**
 * Reaktionen, Würfe und Klänge: drei gehen schnell hintereinander, danach sperrt der Knopf. Die Pause beginnt
 * erst nach der vorigen neu und wächst bei weiterem Spammen bis höchstens 5 Sekunden. Nach 6 Sekunden Ruhe
 * gehen wieder drei auf einmal.
 */
export const BURST = 3;
export const BURST_MAX_MS = 5000;
export const BURST_CALM_MS = 6000;
/** Erste Pause nach drei schnellen, je Art */
export const EMOTE_GAP_MS = 800;
export const TOSS_GAP_MS = 2000;
export const SOUND_GAP_MS = 3000;
/** Beim Host höchstens drei pro Platz in diesem Fenster, etwas großzügiger als die Oberfläche, damit nichts verfällt */
export const EMOTE_HOST_WINDOW_MS = 550;
export const TOSS_HOST_WINDOW_MS = 1400;
export const SOUND_HOST_WINDOW_MS = 2100;
/** So lange wartet die Person am Zug bei einem neuen Stapel, damit alle ihre 4er reinwerfen können. */
export const SH_WIN_MS = 2000;
/** Höchstzahl am Tisch je Spiel. */
export const MAX_SEATS: Readonly<Record<GameKind, number>> = { schnautz: 8, shithead: 10, durak: 8 };
/** Durak: so viele Karten auf der Hand, höchstens so viele Angriffskarten, ab so vielen Leuten das volle Deck */
export const DK_HAND = 6;
export const DK_MAX_ATTACK = 6;
export const DK_FULL_DECK = 7;
/** Durak mit 36 Karten spielt von der 6 aufwärts */
export const DK_RANKS: readonly Rank[] = ['6', '7', '8', '9', '10', 'B', 'D', 'K', 'A'];
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
  return { ...r, sh: { ...r.sh }, dk: { ...(r.dk ?? DEFAULT_RULES.dk) } };
}
