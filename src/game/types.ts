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

export type GameKind = 'schnautz' | 'shithead' | 'durak';
export type Phase = 'lobby' | 'choose' | 'play' | 'end' | 'over' | 'swap';

export interface ShRules {
  two: boolean;
  three: boolean;
  seven: boolean;
  ten: boolean;
  eight: boolean;
  four: boolean;
  cut: boolean;
  /** Zweites Deck schon ab 5 Leuten (ab 6 immer) */
  deck5: boolean;
}

/** Durak: Weiterschieben (Perevodnoy) an oder aus */
export interface DkRules {
  transfer: boolean;
}

export interface Rules {
  /** Plätze am Tisch, die Höchstzahl hängt vom Spiel ab (`maxSeats`) */
  seats: number;
  /** Freie Plätze in der Lobby mit KI füllen */
  fill: boolean;
  /** Zeit pro Zug in Sekunden (0 = aus, Standard 20), in der Tauschrunde immer doppelt. Danach zieht die KI einmal */
  turnSecs: number;
  lives: number;
  feuer: boolean;
  dealerChoice: boolean;
  knockFirst: boolean;
  knockDouble: boolean;
  sh: ShRules;
  dk: DkRules;
}

/** Bilanz in einem Spiel, seit der Tisch offen ist. Wie oft jemand Shithead war, steht in `Player.shc`. */
export interface PlayerStats {
  games: number;
  wins: number;
  /** Schnautz: verlorene Bierdeckel */
  coasters?: number;
  /** Schnautz: Runden, die man mit 31 oder Feuer beendet hat */
  hot?: number;
  /** Shithead und Durak: Summe der Plätze, für den Schnitt */
  places?: number;
  /** Shithead und Durak: abgegebene Tipps, Treffer und Punkte daraus */
  bets?: number;
  betHits?: number;
  betPts?: number;
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
  /** KI-Platz, auf dem vorher ein Mensch saß (er kann ihn unter seinem Namen zurückholen) */
  left?: boolean;
  gone?: boolean;
  offSince?: number;
  place?: number;
  /** Schnautz: In dieser Runde ist der Platz rausgeflogen (für Revanche und Duelle) */
  outRound?: number;
  shc?: number;
  /** So oft Durak gewesen */
  dkc?: number;
  stats?: Partial<Record<GameKind, PlayerStats>>;
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
  /** Alle Tipps dieser Partie mit Treffer oder nicht */
  bets?: ShBetResult[];
}

/** Ein Tipp, wer Shithead wird: Ziel, festgeschriebene Punkte, Lognummer beim Tippen. */
export interface ShBet {
  on: string;
  q: number;
  n: number;
}

export interface ShBetResult {
  p: string;
  on: string;
  q: number;
  ok: boolean;
}

/** Wer nach der Partie Revanche fordern darf und ob es schon jemand getan hat. */
export interface RematchOffer {
  game: number;
  can: string[];
  by: string | null;
}

/** Das Duell in der Revanche-Partie: `by` fordert, `vs` war Sieger, `n` zählt Revanchen in Folge. */
export interface RematchDuel {
  by: string;
  vs: string;
  game: number;
  n: number;
  res?: 'won' | 'lost' | 'tie';
}

export interface DurakResult {
  reason: 'durak';
  /** Reihenfolge, in der alle fertig wurden */
  ranking: string[];
  /** null heißt unentschieden: Die Letzten sind gleichzeitig fertig geworden */
  durak: string | null;
  names: Record<string, string>;
  bets?: ShBetResult[];
}

export type Result = SchnautzResult | ShitheadResult | DurakResult;

/**
 * Neuer Stapel bei Shithead: Ist der Stapel leer, dürfen alle außer der Person am Zug ihre 4er
 * reinwerfen. Die Person am Zug wartet kurz (`lock`), danach schließt ihre erste Karte das Fenster.
 */
export interface ShWindow {
  r: Rank;
  /** Wer in diesem Fenster schon etwas reingeworfen hat. */
  by: string[];
  id: number;
  /** Solange gesperrt, darf die Person am Zug noch nicht legen. */
  lock: boolean;
  /** Ende der Sperre beim Gastgeber (nur im Zustand des Gastgebers). */
  until?: number;
  /** Restzeit der Sperre in ms zum Zeitpunkt des Versands (nur in Ansichten). */
  left?: number;
  /** Lokales Ende der Sperre beim Empfänger (nur in Ansichten). */
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
  /** Mit wie vielen Decks gespielt wird (52 Karten je Deck), fehlt bei älteren Partien */
  decks?: number;
  /** Tipps der Fertigen, Schlüssel ist die tippende Person */
  bets?: Record<string, ShBet>;
}

/** Krone für den letzten Sieger, Titel für den letzten Verlierer (Shithead), je Spiel */
/** Ein Angriff bei Durak: Angriffskarte, wer sie gelegt hat, und die Karte, die sie geschlagen hat. */
export interface DkPair {
  a: Card;
  by: string;
  d?: Card;
}

export interface DkState {
  /** Nachziehstapel, gezogen wird vom Ende. Die erste Karte ist der offene Trumpf und kommt zuletzt */
  deck: Card[];
  /** Offene Trumpfkarte. Bei sechs Leuten mit 36 Karten bleibt sie in der Hand der letzten Person */
  trump: Card;
  P: Record<string, Card[]>;
  table: DkPair[];
  /** Wer angreift (zuerst legt und als Erster nachzieht) und wer verteidigt */
  att: string;
  def: string;
  /** Der Verteidiger gibt auf und nimmt, die anderen dürfen noch nachlegen */
  take: boolean;
  /** Wer seit der letzten Änderung am Tisch nichts mehr nachlegen will */
  done: string[];
  /** Höchstens so viele Angriffskarten in diesem Angriff */
  limit: number;
  /** Zählt die Angriffe der Partie */
  bout: number;
  /** Karten, die nach geglückter Verteidigung weg sind */
  discard: number;
  finished: string[];
  durak: string | null;
  /** 36 oder 52 Karten */
  size: number;
  /** Tipps der Fertigen wie bei Shithead */
  bets?: Record<string, ShBet>;
}

export interface DkView extends Omit<DkState, 'deck' | 'P'> {
  deck: number;
  P: Record<string, Card[] | number>;
}

export interface Reign {
  win: string | null;
  lose?: string | null;
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
  thrown?: boolean;
}

export type ShSource = 'hand' | 'up' | 'down';

/** Was sich werfen lässt */
export type TossItem = 'tomato' | 'egg' | 'poo' | 'crown' | 'heart' | 'bunny';

/** Effekt aus dem Dev-Menü des Hosts, der bei allen am Tisch läuft (src/ui/devfx.ts) */
export type DevFx = 'confetti' | 'poo' | 'ann' | 'toast' | 'updbar' | 'ceremony' | 'sfx';

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
    /** Ein Mensch übernimmt einen KI-Platz, `from` ist der alte Name */
    | { k: 'takeover'; from: string }
    /** Jemand geht mitten in der Partie, die KI spielt unter dem Namen weiter */
    | { k: 'tobot' }
    /** Wer gegangen war, übernimmt den eigenen Platz wieder von der KI */
    | { k: 'back' }
    /** Zeit abgelaufen, die KI hat einen Zug für die Person gemacht */
    | { k: 'timeout' }
    | { k: 'game'; g: number; game?: GameKind }
    | { k: 'round'; r: number; start?: string }
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
    | { k: 'toss'; item: TossItem; to: string }
    | { k: 'sound'; s: string; quiet?: boolean }
    | { k: 'shdeal' }
    | { k: 'shstart'; card: Card | null }
    | { k: 'shplay'; cards: Card[]; src: ShSource }
    | { k: 'shthrow'; cards: Card[]; src?: ShSource }
    | { k: 'shbomb'; cards: Card[]; src: ShSource; out: boolean }
    | { k: 'shburn'; four: boolean; cut: boolean }
    | { k: 'shpickup'; cnt: number }
    | { k: 'shblindfail'; card: Card; cnt: number }
    | { k: 'shdone'; place: number }
    | { k: 'shend'; hits?: Record<string, { q: number; name: string }> }
    | { k: 'shbet'; on: string; onName: string; q: number }
    | { k: 'rematch'; to: string | null; tn?: string; c: number }
    | { k: 'rematchend'; to: string; tn: string; res: 'won' | 'lost' | 'tie'; c: number }
    | { k: 'dkdeal'; trump: Card; att: string; def: string; prev?: boolean; rnd?: boolean }
    | { k: 'dkattack'; cards: Card[]; lead?: boolean }
    | { k: 'dkdefend'; a: Card; d: Card }
    | { k: 'dktransfer'; cards: Card[]; to: string; tn?: string }
    | { k: 'dktake' }
    | { k: 'dkpass' }
    | { k: 'dkbito'; cnt: number }
    | { k: 'dkpickup'; cnt: number }
    | { k: 'dkout'; place: number }
    | { k: 'dkend'; hits?: Record<string, { q: number; name: string }> }
    // Nur der Host schreibt ihn direkt, es gibt keine Aktion dafür. Der Verlauf zeigt ihn nicht
    | { k: 'dev'; fx: DevFx; s?: string; to?: string }
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
  dk?: DkState | null;
  /** Krone und Verlierer-Titel je Spiel, sie bleiben, bis dort jemand Neues gewinnt (src/game/games.ts) */
  reigns?: Partial<Record<GameKind, Reign>>;
  /** Nach der Partie: Revanche anbieten */
  rematch?: RematchOffer | null;
  /** Läuft oder lief gerade ein Revanche-Duell */
  rematchDuel?: RematchDuel | null;
  /** Wer bei Schnautz zuletzt verloren hat und deshalb die nächste Runde anfängt. */
  loser?: string | null;
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

export interface View extends Omit<State, 'deck' | 'discard' | 'spare' | 'hands' | 'sh' | 'dk'> {
  deck: number;
  discard: number;
  spare: number;
  hands: Record<string, Card[] | number>;
  sh: ShView | null;
  dk?: DkView | null;
  me: string;
  /** Zeitlimit: wer gerade die Uhr hat, Restzeit und volle Zeit in ms (beim Host auch das Ende als `at`) */
  clock?: { ids: string[]; left: number; total: number; at?: number } | null;
  /** Schnautz: Millisekunden, bis der Host die nächste Runde von selbst startet */
  next?: number | null;
}

/** Alles, was sowohl im vollen Zustand als auch in einer Ansicht vorkommt. */
export type Table = State | View;

export type Action =
  | { type: 'chat'; text: string; bot?: boolean }
  | { type: 'emote'; e: string; bot?: boolean }
  /** Gegenstand auf jemanden werfen, reine Stichelei ohne Einfluss aufs Spiel */
  | { type: 'toss'; item: TossItem; to: string; bot?: boolean }
  /** Klang vom Soundboard für alle am Tisch. `quiet` setzt nur der Host, wenn am Tisch gerade zu viel los ist */
  | { type: 'sound'; s: string; bot?: boolean; quiet?: boolean }
  | { type: 'rules'; rules: Partial<Omit<Rules, 'sh' | 'dk'>> & { sh?: Partial<ShRules>; dk?: Partial<DkRules> } }
  | { type: 'game'; game: GameKind }
  | { type: 'start' }
  | { type: 'addbot' }
  | { type: 'rmbot'; id: string }
  | { type: 'tolobby' }
  /** Nach der Partie: Revanche fordern, zählt auch als bereit */
  | { type: 'rematch'; bot?: boolean }
  /** Host: laufende Partie beenden und sofort eine neue starten (etwa wenn nur noch KIs spielen) */
  | { type: 'restart' }
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
  | { type: 'shunlock'; id: number }
  /** Wer fertig ist, tippt, wer Shithead oder Durak wird */
  | { type: 'shbet'; on: string }
  /**
   * Durak: angreifen oder passende Karten nachlegen. Die Oberfläche schickt die gemeinten Karten mit,
   * dann zählen sie statt der Indizes, falls sich die Hand inzwischen verschoben hat.
   */
  | { type: 'dkattack'; idx: number[]; cards?: Card[] }
  /** Durak: Angriffskarte `a` mit der Handkarte `i` schlagen, mit Karten wie oben */
  | { type: 'dkdefend'; a: number; i: number; ac?: Card; c?: Card }
  | { type: 'dktake' }
  /** Durak: nichts mehr nachlegen */
  | { type: 'dkpass' }
  /** Durak mit Weiterschieben: gleiche Werte dazulegen und an den Nächsten geben */
  | { type: 'dktransfer'; idx: number[]; cards?: Card[] };

export type ActionType = Action['type'];

/** Ergebnis einer Aktion: `null` bei Erfolg, sonst eine Fehlermeldung für die Person. */
export type ActResult = string | null;
