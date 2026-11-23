import { BOT_NAMES } from '../content/names';
import { rnd } from './cards';
import { cloneRules, DEFAULT_RULES, LOG_LIMIT, MAX_SEATS, MIN_SEATS, TURN_SECS } from './constants';
import type { ActResult, GameKind, LogEntry, LogInput, Player, PlayerStats, Rng, Rules, ShRules, State } from './types';

export function mkPlayer(id: string, name: string, lives = 3, bot = false): Player {
  const p: Player = { id, name, lives: lives || 3, out: false, ready: false, online: true, wins: 0 };
  if (bot) p.bot = true;
  return p;
}

export function newState(hostId: string, hostName: string): State {
  return {
    phase: 'lobby',
    game: 'schnautz',
    sh: null,
    host: hostId,
    rules: cloneRules(),
    players: [mkPlayer(hostId, hostName)],
    round: 0,
    dealer: -1,
    turn: -1,
    deck: [],
    discard: [],
    hands: {},
    middle: [],
    spare: null,
    knocker: null,
    afterKnock: 0,
    passes: 0,
    turns: 0,
    last: null,
    result: null,
    winner: null,
    log: [],
    n: 0,
    games: 0,
  };
}

/** Bilanz eines Spielers in einem Spiel, wird bei Bedarf angelegt. */
export function statsOf(p: Player, game: GameKind): PlayerStats {
  p.stats ??= {};
  return (p.stats[game] ??= { games: 0, wins: 0 });
}

/** Partie zu Ende: Wer bis zum Schluss am Tisch saß, bekommt sie gezählt, wer gegangen ist, nicht. */
export function countGame(st: State, game: GameKind, winner: string | null): void {
  st.players.forEach((p) => {
    if (p.gone) return;
    const s = statsOf(p, game);
    s.games++;
    if (p.id === winner) s.wins++;
  });
}

export function pIdx(st: { players: Player[] }, id: string | null | undefined): number {
  return st.players.findIndex((p) => p.id === id);
}

export const activeList = (st: { players: Player[] }): Player[] => st.players.filter((p) => !p.out);

/** Index des nächsten Spielers nach `i`, der noch im Spiel ist. */
export function nextActive(st: { players: Player[] }, i: number): number {
  const n = st.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (!st.players[j].out) return j;
  }
  return -1;
}

/** Index des Spielers vor `i`, der noch im Spiel ist. */
export function prevActive(st: { players: Player[] }, i: number): number {
  const n = st.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (i - k + n * 2) % n;
    if (!st.players[j].out) return j;
  }
  return -1;
}

export function addLog(st: State, input: LogInput): void {
  const e = input as LogEntry;
  if (e.p && !e.name) {
    const li = pIdx(st, e.p);
    if (li >= 0) e.name = st.players[li].name;
  }
  st.n++;
  e.n = st.n;
  st.log.push(e);
  if (st.log.length > LOG_LIMIT) st.log.splice(0, st.log.length - LOG_LIMIT);
}

/** Höchstzahl über alle Spiele, so viele Plätze lassen sich einstellen. */
export const MAX_SEATS_ALL = Math.max(...Object.values(MAX_SEATS));

/** Höchstzahl am Tisch für dieses Spiel. */
export const maxSeats = (game: GameKind): number => MAX_SEATS[game] ?? MIN_SEATS;

/** So viele Plätze hat der Tisch gerade: eingestellt, aber nie mehr als das Spiel erlaubt. */
export const seatLimit = (st: { rules: Rules; game: GameKind }): number =>
  Math.max(MIN_SEATS, Math.min(st.rules.seats || MIN_SEATS, maxSeats(st.game)));

const nameTaken = (st: State, name: string, except?: string) =>
  st.players.some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase());

/** Hängt bei doppelten Namen eine Zahl an. */
export function uniqueName(st: State, name: string, except?: string): string {
  const base = name;
  let k = 2;
  while (nameTaken(st, name, except)) name = `${base.slice(0, 13)} ${k++}`;
  return name;
}

export function addPlayer(st: State, id: string, name: string): ActResult {
  if (st.phase !== 'lobby') return 'Die Partie läuft schon. Warte, bis eine neue startet.';
  if (st.players.length >= seatLimit(st)) return 'Der Tisch ist voll.';
  name = uniqueName(st, name);
  st.players.push(mkPlayer(id, name, st.rules.lives));
  addLog(st, { k: 'join', p: id, name });
  return null;
}

export function addBot(st: State, rng?: Rng): ActResult {
  if (st.phase !== 'lobby') return 'KIs lassen sich nur in der Lobby hinzufügen.';
  if (st.players.length >= seatLimit(st)) return 'Der Tisch ist voll.';
  const pool = BOT_NAMES.filter((n) => !nameTaken(st, n));
  const name = pool.length ? pool[Math.floor(rnd(rng) * pool.length)] : `KI ${st.players.length}`;
  const id = `b-${Math.floor(rnd(rng) * 0xffffffffffff)
    .toString(16)
    .padStart(12, '0')}`;
  st.players.push(mkPlayer(id, name, st.rules.lives, true));
  addLog(st, { k: 'join', p: id, name, bot: true });
  return null;
}

export function removePlayer(st: State, id: string): void {
  if (st.phase !== 'lobby' || id === st.host) return;
  const i = pIdx(st, id);
  if (i < 0) return;
  const [p] = st.players.splice(i, 1);
  addLog(st, { k: 'leave', p: id, name: p.name });
}

const BOOL_RULES = ['feuer', 'dealerChoice', 'knockFirst', 'knockDouble'] as const;
const SH_BOOL_RULES = ['two', 'three', 'seven', 'ten', 'eight', 'four', 'cut', 'deck5'] as const;

/** Übernimmt nur bekannte Regeln mit gültigen Werten, alles andere bleibt wie vorher. */
export function sanitizeRules(r: unknown, old?: Rules): Rules {
  const o = cloneRules(old ?? DEFAULT_RULES);
  if (!r || typeof r !== 'object') return o;
  const src = r as Record<string, unknown>;
  if (src.lives != null) {
    const l = parseInt(String(src.lives), 10);
    if (!isNaN(l)) o.lives = Math.max(1, Math.min(6, l));
  }
  if (src.seats != null) {
    const s = parseInt(String(src.seats), 10);
    if (!isNaN(s)) o.seats = Math.max(MIN_SEATS, Math.min(MAX_SEATS_ALL, s));
  }
  if ('fill' in src) o.fill = !!src.fill;
  if (src.turnSecs != null) {
    const t = Number(src.turnSecs);
    // Nur die angebotenen Werte, sonst der nächstliegende
    if (Number.isFinite(t)) o.turnSecs = TURN_SECS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  }
  BOOL_RULES.forEach((k) => {
    if (k in src) o[k] = !!src[k];
  });
  if (src.sh && typeof src.sh === 'object') {
    const sh = src.sh as Record<string, unknown>;
    SH_BOOL_RULES.forEach((k) => {
      if (k in sh) o.sh[k] = !!sh[k];
    });
  }
  return o;
}

/** Bringt gespeicherte Zustände älterer Versionen auf den aktuellen Stand. */
export function migrate(st: State): void {
  if (!st.game) st.game = 'schnautz';
  // Ältere Tische kannten keine Platzzahl: so viele wie schon da sind, mindestens wie früher vier
  if (typeof st.rules.seats !== 'number') st.rules.seats = Math.max(DEFAULT_RULES.seats, st.players.length);
  if (typeof st.rules.fill !== 'boolean') st.rules.fill = DEFAULT_RULES.fill;
  if (typeof st.rules.turnSecs !== 'number') st.rules.turnSecs = DEFAULT_RULES.turnSecs;
  if (!st.rules.sh) st.rules.sh = { ...DEFAULT_RULES.sh };
  (Object.keys(DEFAULT_RULES.sh) as (keyof ShRules)[]).forEach((k) => {
    if (!(k in st.rules.sh)) st.rules.sh[k] = DEFAULT_RULES.sh[k];
  });
  // Alte Fenster kannten keine Sperre
  const w = st.sh?.win;
  if (w && typeof w.lock !== 'boolean') w.lock = true;
}
