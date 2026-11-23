/* Schnautz (Schwimmen, 31) mit 32 Karten. */
import { newDeck, rankOf, rnd, shuffle, suitOf } from './cards';
import { RANK_VAL, SUITS } from './constants';
import { activeList, addLog, nextActive, pIdx } from './state';
import type { ActResult, Card, HandValue, LifeChange, Rng, Rules, SchnautzReason, State, Suit } from './types';

/** Wert einer Hand: Summe der stärksten Farbe, drei Gleiche 30,5, drei Asse (Feuer) 33. */
export function handValue(cards: readonly Card[] | number | undefined, rules?: Pick<Rules, 'feuer'>): HandValue {
  if (!Array.isArray(cards) || cards.length !== 3) return { v: 0, kind: 'none', suit: null };
  const r0 = rankOf(cards[0]);
  if (cards.every((c) => rankOf(c) === r0)) {
    if (r0 === 'A' && rules?.feuer) return { v: 33, kind: 'feuer', suit: null };
    return { v: 30.5, kind: 'drei', suit: null };
  }
  let best = 0;
  let suit: Suit | null = null;
  SUITS.forEach((s) => {
    const sum = cards.filter((c) => suitOf(c) === s).reduce((acc, c) => acc + RANK_VAL[rankOf(c)], 0);
    if (sum > best) {
      best = sum;
      suit = s;
    }
  });
  return { v: best, kind: best === 31 ? 'schnautz' : 'normal', suit };
}

export function startGame(st: State, rng?: Rng): ActResult {
  const keep = st.players.filter((p) => p.id === st.host || (st.phase === 'lobby' ? p.online : !p.gone));
  if (keep.length < 2) return 'Ihr braucht mindestens zwei Leute am Tisch.';
  st.players = keep;
  st.players.forEach((p) => {
    p.lives = st.rules.lives;
    p.out = false;
    p.ready = false;
    delete p.gone;
  });
  st.games++;
  st.round = 0;
  st.winner = null;
  st.result = null;
  st.dealer = Math.floor(rnd(rng) * st.players.length);
  addLog(st, { k: 'game', g: st.games });
  startRound(st, rng, true);
  return null;
}

export function startRound(st: State, rng: Rng | undefined, first: boolean): void {
  st.round++;
  if (!first || st.players[st.dealer].out) st.dealer = nextActive(st, st.dealer);
  st.deck = newDeck(rng);
  st.discard = [];
  st.hands = {};
  st.middle = [];
  st.spare = null;
  st.knocker = null;
  st.afterKnock = 0;
  st.passes = 0;
  st.turns = 0;
  st.last = null;
  st.result = null;
  st.players.forEach((p) => {
    p.ready = false;
  });
  activeList(st).forEach((p) => {
    st.hands[p.id] = st.deck.splice(0, 3);
  });
  addLog(st, { k: 'round', r: st.round, p: st.players[st.dealer].id });
  if (st.rules.dealerChoice) {
    st.spare = st.deck.splice(0, 3);
    st.phase = 'choose';
    st.turn = st.dealer;
  } else {
    st.middle = st.deck.splice(0, 3);
    st.phase = 'play';
    st.turn = nextActive(st, st.dealer);
    checkInstant(st);
  }
}

/** Beendet die Runde sofort, wenn jemand schon beim Austeilen Feuer oder 31 hat. */
export function checkInstant(st: State): boolean {
  let feuer: string | null = null;
  let s31: string | null = null;
  activeList(st).forEach((p) => {
    const hv = handValue(st.hands[p.id], st.rules);
    if (hv.kind === 'feuer' && !feuer) feuer = p.id;
    else if (hv.v === 31 && !s31) s31 = p.id;
  });
  if (feuer) {
    finishRound(st, 'feuer', feuer);
    return true;
  }
  if (s31) {
    finishRound(st, 'schnautz', s31);
    return true;
  }
  return false;
}

/** Alle haben geschoben: Die Mitte wird abgelegt und drei neue Karten kommen. */
export function renewMiddle(st: State, rng?: Rng): void {
  const oldMid = st.middle.slice();
  st.discard.push(...st.middle);
  st.middle = [];
  if (st.deck.length < 3) st.deck.push(...shuffle(st.discard.splice(0), rng));
  st.middle = st.deck.splice(0, 3);
  st.passes = 0;
  addLog(st, { k: 'renew' });
  st.last = { k: 'renew', n: st.n, old: oldMid };
}

export function endTurn(st: State, pid: string): ActResult {
  st.turns++;
  const hv = handValue(st.hands[pid], st.rules);
  if (hv.kind === 'feuer') {
    finishRound(st, 'feuer', pid);
    return null;
  }
  if (hv.v === 31) {
    finishRound(st, 'schnautz', pid);
    return null;
  }
  if (st.knocker && pid !== st.knocker) {
    st.afterKnock--;
    if (st.afterKnock <= 0) {
      finishRound(st, 'knock', st.knocker);
      return null;
    }
  }
  st.turn = nextActive(st, st.turn);
  return null;
}

export function finishRound(st: State, reason: SchnautzReason, by: string | null): void {
  const active = activeList(st);
  const vals: Record<string, HandValue> = {};
  active.forEach((p) => {
    vals[p.id] = handValue(st.hands[p.id], st.rules);
  });
  let losers: string[];
  if (reason === 'feuer') {
    losers = active.filter((p) => vals[p.id].kind !== 'feuer').map((p) => p.id);
  } else {
    const min = Math.min(...active.map((p) => vals[p.id].v));
    losers = active.filter((p) => vals[p.id].v === min).map((p) => p.id);
    if (losers.length === active.length) losers = [];
  }
  const changes: Record<string, LifeChange> = {};
  losers.forEach((id) => {
    const p = st.players[pIdx(st, id)];
    const n = reason !== 'feuer' && st.rules.knockDouble && id === st.knocker ? 2 : 1;
    for (let i = 0; i < n && !p.out; i++) {
      if (p.lives > 0) p.lives--;
      else p.out = true;
    }
    changes[id] = { n, to: p.out ? 'out' : p.lives === 0 ? 'swim' : 'life' };
  });
  const hands: Record<string, Card[]> = {};
  active.forEach((p) => {
    hands[p.id] = st.hands[p.id].slice();
  });
  st.result = { reason, by, knocker: st.knocker, hands, vals, losers, changes, round: st.round };
  const names = Object.fromEntries(st.players.map((p) => [p.id, p.name]));
  addLog(st, { k: 'result', reason, by, changes, tie: losers.length === 0, names });
  st.turn = -1;
  st.players.forEach((p) => {
    p.ready = false;
  });
  const alive = activeList(st);
  if (alive.length <= 1) {
    declareWinner(st, alive[0] ?? null);
  } else st.phase = 'end';
}

/** Schnautz ist vorbei: Wer übrig bleibt, gewinnt die Partie. */
export function declareWinner(st: State, winner: { id: string; wins: number } | null): void {
  st.phase = 'over';
  st.turn = -1;
  st.winner = winner ? winner.id : null;
  if (winner) winner.wins = (winner.wins || 0) + 1;
  st.players.forEach((p) => {
    p.ready = false;
  });
  st.reign = { win: st.winner, game: 'schnautz' };
  addLog(st, { k: 'winner', p: st.winner ?? undefined });
}
