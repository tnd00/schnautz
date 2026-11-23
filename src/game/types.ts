/**
 * Zentrale Typen für Spielzustand, Ansicht und Nachrichten.
 *
 * Der Gastgeber hält den vollständigen `State`. Alle Mitspieler (und die KI) sehen nur eine
 * gefilterte `View`, in der fremde Handkarten und verdeckte Karten durch Anzahlen ersetzt sind.
 */

export type Suit = 'C' | 'S' | 'H' | 'D';
/** Karte als Kürzel aus Farbe und Wert, zum Beispiel `H10` oder `SA`. */
export type Card = string;
export type Rank = string;
export type Rng = () => number;

export type GameKind = 'schnautz' | 'shithead';
export type Phase = 'lobby' | 'choose' | 'play' | 'end' | 'over' | 'swap';

export interface ShRules {
  two: boolean;
  three: boolean;
  seven: boolean;
  ten: boolean;
  eight: boolean;
  four: boolean;
  cut: boolean;
}

export interface Rules {
  lives: number;
  feuer: boolean;
  dealerChoice: boolean;
  knockFirst: boolean;
  knockDouble: boolean;
  sh: ShRules;
}

export interface Player {
  id: string;
  name: string;
  lives: number;
  out: boolean;
  ready: boolean;
  online: boolean;
  wins: number;
  bot?: boolean;
  gone?: boolean;
  offSince?: number;
  place?: number;
  shc?: number;
}

export type HandKind = 'none' | 'feuer' | 'drei' | 'schnautz' | 'normal';
export interface HandValue {
  v: number;
  kind: HandKind;
  suit: Suit | null;
}

export interface LifeChange {
  n: number;
  to: 'out' | 'swim' | 'life';
}

export type SchnautzReason = 'feuer' | 'schnautz' | 'knock' | 'quit';

export interface SchnautzResult {
  reason: SchnautzReason;
  by: string | null;
  knocker: string | null;
  hands: Record<string, Card[]>;
  vals: Record<string, HandValue>;
  losers: string[];
  changes: Record<string, LifeChange>;
  round: number;
}

export interface ShitheadResult {
  reason: 'shithead';
  ranking: string[];
  shithead: string | null;
  quit: string | null;
  names: Record<string, string>;
}

export type Result = SchnautzResult | ShitheadResult;

/** Zeitfenster am Anfang einer Shithead-Partie, in dem alle ihre 4er reinwerfen dürfen. */
export interface ShWindow {
  r: Rank;
  start: number;
  by: string[];
  id: number;
  /** Ablaufzeit beim Gastgeber (nur im Zustand des Gastgebers). */
  until?: number;
  /** Restzeit in ms zum Zeitpunkt des Versands (nur in Ansichten). */
  left?: number;
  /** Lokale Ablaufzeit beim Empfänger (nur in Ansichten). */
  at?: number;
}

export interface ShPlayerState {
  hand: Card[];
  up: Card[];
  down: Card[];
}

export interface ShState {
  deck: Card[];
  pile: Card[];
  burned: Card[];
  P: Record<string, ShPlayerState>;
  finished: string[];
  shithead: string | null;
  win?: ShWindow | null;
}

export interface Reign {
  win: string | null;
  sh?: string | null;
  game: GameKind;
}

/** Letzter Zug, damit die Oberfläche passende Animationen abspielen kann. */
export interface LastMove {
  k: string;
  n: number;
  p?: string;
  h?: number;
  m?: number;
  take?: Card | Card[];
  give?: Card | Card[] | null;
  old?: Card[];
  cards?: Card[];
  src?: ShSource;
  cnt?: number;
  open?: boolean;
  thrown?: boolean;
}

export type ShSource = 'hand' | 'up' | 'down';

interface LogBase {
  n: number;
  p?: string;
  name?: string;
}

export type LogEntry = LogBase &
  (
    | { k: 'join'; bot?: boolean }
    | { k: 'leave' }
    | { k: 'quit' }
    | { k: 'game'; g: number; game?: GameKind }
    | { k: 'round'; r: number }
    | { k: 'keep' }
    | { k: 'take' }
    | { k: 'swap'; take: Card; give: Card }
    | { k: 'swapAll' }
    | { k: 'pass' }
    | { k: 'renew' }
    | { k: 'knock' }
    | {
        k: 'result';
        reason: SchnautzReason;
        by: string | null;
        changes: Record<string, LifeChange>;
        tie: boolean;
        names: Record<string, string>;
      }
    | { k: 'winner' }
    | { k: 'lobby' }
    | { k: 'chat'; text: string; bot?: boolean }
    | { k: 'emote'; e: string }
    | { k: 'shdeal' }
    | { k: 'shstart'; card: Card | null }
    | { k: 'shplay'; cards: Card[]; src: ShSource; open?: boolean }
    | { k: 'shthrow'; cards: Card[] }
    | { k: 'shbomb'; cards: Card[]; src: ShSource; out: boolean }
    | { k: 'shburn'; four: boolean; cut: boolean }
    | { k: 'shpickup'; cnt: number }
    | { k: 'shblindfail'; card: Card; cnt: number }
    | { k: 'shdone'; place: number }
    | { k: 'shend' }
    | { k: 'shwinend'; cnt: number }
  );

export type LogKind = LogEntry['k'];
/** Log-Eintrag vor dem Einfügen, die laufende Nummer vergibt `addLog`. */
export type LogInput = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, 'n'> : never) : never;

export interface State {
  phase: Phase;
  game: GameKind;
  sh: ShState | null;
  host: string;
  rules: Rules;
  players: Player[];
  round: number;
  dealer: number;
  turn: number;
  deck: Card[];
  discard: Card[];
  hands: Record<string, Card[]>;
  middle: Card[];
  spare: Card[] | null;
  knocker: string | null;
  afterKnock: number;
  passes: number;
  turns: number;
  last: LastMove | null;
  result: Result | null;
  winner: string | null;
  log: LogEntry[];
  n: number;
  games: number;
  reign?: Reign;
}

/** Shithead-Spieler aus Sicht eines Mitspielers: fremde Hand und verdeckte Karten nur als Anzahl. */
export interface ShPlayerView {
  hand: Card[] | number;
  up: Card[];
  down: Card[] | number;
}

export interface ShView extends Omit<ShState, 'deck' | 'burned' | 'P'> {
  deck: number;
  burned: number;
  P: Record<string, ShPlayerView>;
}

export interface View extends Omit<State, 'deck' | 'discard' | 'spare' | 'hands' | 'sh'> {
  deck: number;
  discard: number;
  spare: number;
  hands: Record<string, Card[] | number>;
  sh: ShView | null;
  me: string;
}

/** Alles, was sowohl im vollen Zustand als auch in einer Ansicht vorkommt. */
export type Table = State | View;

export type Action =
  | { type: 'chat'; text: string; bot?: boolean }
  | { type: 'emote'; e: string; bot?: boolean }
  | { type: 'rules'; rules: Partial<Omit<Rules, 'sh'>> & { sh?: Partial<ShRules> } }
  | { type: 'game'; game: GameKind }
  | { type: 'start' }
  | { type: 'addbot' }
  | { type: 'rmbot'; id: string }
  | { type: 'tolobby' }
  | { type: 'skip' }
  | { type: 'force' }
  | { type: 'ready' }
  | { type: 'keep' }
  | { type: 'take' }
  | { type: 'swap'; h: number; m: number }
  | { type: 'swapAll' }
  | { type: 'pass' }
  | { type: 'knock' }
  | { type: 'shswap'; h: number; u: number }
  | { type: 'shready' }
  | { type: 'shplay'; from: 'hand' | 'up'; idx: number[] }
  | { type: 'shpickup' }
  | { type: 'shblind'; i: number }
  | { type: 'shthrow' }
  | { type: 'shbomb' }
  | { type: 'shwinend'; id: number };

export type ActionType = Action['type'];

/** Ergebnis einer Aktion: `null` bei Erfolg, sonst eine Fehlermeldung für die Person. */
export type ActResult = string | null;
