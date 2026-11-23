import { pIdx } from '../game/state';
import type { Action, Rng, View } from '../game/types';
import type { BotLevel } from './config';
import { botSchnautz } from './schnautz';
import { botShithead } from './shithead';

export function botReady(v: View): Action | null {
  const p = v.players[pIdx(v, v.me)];
  if ((v.phase === 'end' || v.phase === 'over') && p && !p.ready) return { type: 'ready' };
  return null;
}

/** Nächster Zug der KI auf Basis ihrer eigenen Ansicht. `null` heißt: gerade nichts zu tun. */
export function botDecide(v: View | null, rng?: Rng, lvl: BotLevel = 'normal'): Action | null {
  if (!v || v.phase === 'lobby') return null;
  return botReady(v) ?? (v.game === 'shithead' ? botShithead(v, rng, lvl) : botSchnautz(v, rng, lvl));
}
