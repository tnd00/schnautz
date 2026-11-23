import { BOT_NAMES } from '../content/names';
import { rnd } from './cards';
import { cloneRules, DEFAULT_RULES, LOG_LIMIT, MAX_PLAYERS } from './constants';
import type { ActResult, LogEntry, LogInput, Player, Rng, Rules, ShRules, State } from './types';

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

const nameTaken = (st: State, name: string) => st.players.some((p) => p.name.toLowerCase() === name.toLowerCase());

export function addPlayer(st: State, id: string, name: string): ActResult {
  if (st.phase !== 'lobby') return 'Die Partie läuft schon. Warte, bis eine neue startet.';
  if (st.players.length >= MAX_PLAYERS) return 'Der Tisch ist voll. Mehr als vier Leute gehen nicht.';
  const base = name;
  let k = 2;
  while (nameTaken(st, name)) name = `${base.slice(0, 13)} ${k++}`;
  st.players.push(mkPlayer(id, name, st.rules.lives));
  addLog(st, { k: 'join', p: id, name });
  return null;
}

export function addBot(st: State, rng?: Rng): ActResult {
  if (st.phase !== 'lobby') return 'KIs lassen sich nur in der Lobby hinzufügen.';
  if (st.players.length >= MAX_PLAYERS) return 'Der Tisch ist voll.';
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
const SH_BOOL_RULES = ['two', 'three', 'seven', 'ten', 'eight', 'four', 'cut'] as const;

/** Übernimmt nur bekannte Regeln mit gültigen Werten, alles andere bleibt wie vorher. */
export function sanitizeRules(r: unknown, old?: Rules): Rules {
  const o = cloneRules(old ?? DEFAULT_RULES);
  if (!r || typeof r !== 'object') return o;
  const src = r as Record<string, unknown>;
  if (src.lives != null) {
    const l = parseInt(String(src.lives), 10);
    if (!isNaN(l)) o.lives = Math.max(1, Math.min(6, l));
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
  if (!st.rules.sh) st.rules.sh = { ...DEFAULT_RULES.sh };
  (Object.keys(DEFAULT_RULES.sh) as (keyof ShRules)[]).forEach((k) => {
    if (!(k in st.rules.sh)) st.rules.sh[k] = DEFAULT_RULES.sh[k];
  });
}
