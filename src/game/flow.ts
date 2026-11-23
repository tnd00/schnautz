/* Spielübergreifender Ablauf: bereit melden, neue Partie, Spieler verlässt den Tisch, zurück zur Lobby. */
import { checkInstant, declareWinner, finishRound, handValue, startGame, startRound } from './schnautz';
import { shBegin, shQuit, shStart } from './shithead';
import { activeList, addLog, nextActive, pIdx, removePlayer } from './state';
import type { ActResult, Card, HandValue, Rng, State } from './types';

export function checkReady(st: State, rng?: Rng): ActResult {
  if (st.phase === 'swap') {
    const needS = st.players.filter((p) => !p.out);
    if (needS.length && needS.every((p) => p.ready)) shBegin(st);
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
  startRound(st, rng, false);
  return null;
}

export const beginGame = (st: State, rng?: Rng): ActResult =>
  st.game === 'shithead' ? shStart(st, rng) : startGame(st, rng);

export function quitPlayer(st: State, pid: string, rng?: Rng): void {
  const i = pIdx(st, pid);
  if (i < 0) return;
  const p = st.players[i];
  p.online = false;
  if (st.phase === 'lobby') {
    removePlayer(st, pid);
    return;
  }
  p.gone = true;
  p.ready = false;
  if (st.game === 'shithead') {
    shQuit(st, i, pid, rng);
    return;
  }
  if (st.phase === 'over') {
    if (!p.out) addLog(st, { k: 'quit', p: pid });
    p.out = true;
    checkReady(st, rng);
    return;
  }
  if (p.out) {
    checkReady(st, rng);
    return;
  }
  p.out = true;
  p.lives = 0;
  addLog(st, { k: 'quit', p: pid });
  if (st.hands[pid] && (st.phase === 'choose' || st.phase === 'play')) {
    st.discard.push(...st.hands[pid]);
    delete st.hands[pid];
  }
  const alive = activeList(st);
  if (alive.length <= 1) {
    if (st.phase !== 'end' || !st.result) {
      const hands: Record<string, Card[]> = {};
      const vals: Record<string, HandValue> = {};
      alive.forEach((a) => {
        if (st.hands[a.id]) {
          hands[a.id] = st.hands[a.id].slice();
          vals[a.id] = handValue(hands[a.id], st.rules);
        }
      });
      st.result = { reason: 'quit', by: pid, knocker: null, hands, vals, losers: [], changes: {}, round: st.round };
    }
    declareWinner(st, alive[0] ?? null);
    return;
  }
  if (st.phase === 'choose' && st.dealer === i) {
    st.middle = st.spare ?? [];
    st.spare = null;
    st.phase = 'play';
    st.turn = nextActive(st, i);
    checkInstant(st);
    return;
  }
  if (st.phase === 'play') {
    if (st.knocker === pid) {
      st.knocker = null;
      st.afterKnock = 0;
    }
    if (st.turn === i) st.turn = nextActive(st, i);
    if (st.knocker) {
      // Wie viele Züge bleiben noch bis zum Klopfer?
      let c = 0;
      let j = st.turn;
      let guard = 0;
      while (st.players[j].id !== st.knocker && guard++ < st.players.length) {
        c++;
        j = nextActive(st, j);
      }
      st.afterKnock = c;
      if (c <= 0) finishRound(st, 'knock', st.knocker);
    }
    return;
  }
  if (st.phase === 'end') checkReady(st, rng);
}

export function toLobby(st: State): void {
  st.phase = 'lobby';
  st.players = st.players.filter((p) => p.online || p.id === st.host);
  st.players.forEach((p) => {
    p.lives = st.rules.lives;
    p.out = false;
    p.ready = false;
    p.place = 0;
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
  } satisfies Partial<State>);
  addLog(st, { k: 'lobby' });
}
