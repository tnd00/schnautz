/* Tipp der KI, wer Shithead wird. Nur auf Basis der eigenen Ansicht, gewichtet nach Kartenzahl. */
import { shBetCandidates, shBetsOn, shCanBet } from '../game/bets';
import { rnd } from '../game/cards';
import type { Action, Rng, View } from '../game/types';

const count = (x: unknown): number => (Array.isArray(x) ? x.length : typeof x === 'number' ? x : 0);

/** Viele Karten heißt eher Shithead. Wer schon viele Tipps hat, wird etwas seltener gewählt. */
export function botBetWeights(v: View): { id: string; w: number }[] {
  return shBetCandidates(v).map((p) => {
    const P = v.sh?.P[p.id];
    const hand = count(P?.hand);
    let w = hand + count(P?.up) + count(P?.down) + 0.5 * Math.max(0, hand - 3);
    w = Math.max(0.5, w - 1.5 * shBetsOn(v, p.id).length);
    return { id: p.id, w: w * w };
  });
}

export function botBet(v: View, rng?: Rng): Action | null {
  if (!shCanBet(v, v.me)) return null;
  const ws = botBetWeights(v);
  const total = ws.reduce((s, x) => s + x.w, 0);
  if (!ws.length || total <= 0) return null;
  let r = rnd(rng) * total;
  for (const x of ws) {
    r -= x.w;
    if (r <= 0) return { type: 'shbet', on: x.id };
  }
  return { type: 'shbet', on: ws[ws.length - 1].id };
}
