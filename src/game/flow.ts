/* Spielübergreifender Ablauf: bereit melden, neue Partie, Spieler verlässt den Tisch, zurück zur Lobby. */
import { startGame, startRound } from './schnautz';
import { syncSeats } from './seats';
import { shBegin, shStart } from './shithead';
import { addLog, pIdx, removePlayer } from './state';
import type { ActResult, Rng, State } from './types';
import { unreachable } from './games';
import { dkStart } from './durak';
import { cbBegin, cbNextRound, cbStart } from './cabo';

export function checkReady(st: State, rng?: Rng): ActResult {
  if (st.phase === 'swap') {
    const needS = st.players.filter((p) => !p.out);
    if (needS.length && needS.every((p) => p.ready)) shBegin(st);
    return null;
  }
  if (st.phase === 'peek') {
    if (st.players.every((p) => p.ready || !st.cb?.P[p.id])) cbBegin(st);
    return null;
  }
  if (st.phase !== 'end' && st.phase !== 'over') return null;
  if (!st.players.some((p) => p.ready)) return null;
  let need = st.players.filter((p) => p.online && (st.phase === 'over' || !p.out));
  // KIs warten auf die Menschen, sie halten das Spiel nie auf
  const humans = need.filter((p) => !p.bot);
  if (humans.length) need = humans;
  if (!need.some((p) => p.ready) || need.some((p) => !p.ready)) return null;
  if (st.phase === 'over') return beginGame(st, rng);
  nextRound(st, rng);
  return null;
}

/** Nächste Runde in Spielen mit Runden (Schnautz, Cabo). */
export function nextRound(st: State, rng?: Rng): void {
  switch (st.game) {
    case 'schnautz':
      startRound(st, rng, false);
      return;
    case 'cabo':
      cbNextRound(st, rng);
      return;
    case 'shithead':
    case 'durak':
      return;
    default:
      unreachable(st.game);
  }
}

export function beginGame(st: State, rng?: Rng): ActResult {
  switch (st.game) {
    case 'shithead':
      st.dk = null;
      st.cb = null;
      return shStart(st, rng);
    case 'durak':
      st.cb = null;
      return dkStart(st, rng);
    case 'cabo':
      return cbStart(st, rng);
    case 'schnautz':
      st.sh = null;
      st.dk = null;
      st.cb = null;
      return startGame(st, rng);
    default:
      return unreachable(st.game);
  }
}

/**
 * Jemand verlässt den Tisch. In der Lobby wird der Platz frei (und bei Bedarf mit KI gefüllt),
 * mitten in der Partie spielt die KI unter demselben Namen weiter.
 */
export function quitPlayer(st: State, pid: string, rng?: Rng): void {
  const i = pIdx(st, pid);
  if (i < 0) return;
  if (st.phase === 'lobby') {
    st.players[i].online = false;
    removePlayer(st, pid);
    syncSeats(st, rng);
    return;
  }
  toBot(st, pid, rng);
}

/** Aus einem Menschen wird eine KI: Platz, Karten, Name und Bilanz bleiben, nur das KI-Zeichen kommt dazu. */
export function toBot(st: State, pid: string, rng?: Rng): void {
  const p = st.players[pIdx(st, pid)];
  if (!p || p.bot || pid === st.host) return;
  p.bot = true;
  p.left = true;
  p.online = true;
  delete p.offSince;
  delete p.gone;
  addLog(st, { k: 'tobot', p: pid });
  // War die Person die Letzte, auf die alle gewartet haben, geht es jetzt weiter
  if (st.phase === 'end' || st.phase === 'over' || st.phase === 'swap' || st.phase === 'peek') checkReady(st, rng);
}

export function toLobby(st: State): void {
  st.phase = 'lobby';
  st.players = st.players.filter((p) => p.online || p.id === st.host);
  st.players.forEach((p) => {
    p.lives = st.rules.lives;
    p.out = false;
    p.ready = false;
    p.place = 0;
    delete p.outRound;
  });
  Object.assign(st, {
    hands: {},
    middle: [],
    deck: [],
    discard: [],
    spare: null,
    knocker: null,
    turn: -1,
    dealer: -1,
    result: null,
    winner: null,
    round: 0,
    last: null,
    passes: 0,
    turns: 0,
    sh: null,
    dk: null,
    cb: null,
    rematch: null,
    rematchDuel: null,
  } satisfies Partial<State>);
  addLog(st, { k: 'lobby' });
  syncSeats(st);
}
