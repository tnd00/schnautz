import { pIdx } from '../game/state';
import type { Action, Rng, View } from '../game/types';
import type { BotLevel } from './config';
import { botSchnautz } from './schnautz';
import { botShithead } from './shithead';
import { unreachable } from '../game/games';
import { botDurak } from './durak';

export function botReady(v: View): Action | null {
  const p = v.players[pIdx(v, v.me)];
  if ((v.phase === 'end' || v.phase === 'over') && p && !p.ready) return { type: 'ready' };
  return null;
}

/** Nächster Zug der KI auf Basis ihrer eigenen Ansicht. `null` heißt: gerade nichts zu tun. */
export function botDecide(v: View | null, rng?: Rng, lvl: BotLevel = 'normal'): Action | null {
  if (!v || v.phase === 'lobby') return null;
  const ready = botReady(v);
  if (ready) return ready;
  switch (v.game) {
    case 'shithead':
      return botShithead(v, rng, lvl);
    case 'durak':
      return botDurak(v, rng, lvl);
    case 'schnautz':
      return botSchnautz(v, rng, lvl);
    default:
      return unreachable(v.game);
  }
}
