import { strict as assert } from 'node:assert';
import type { Action, Card, Rng, SchnautzResult, State } from '../../src/game/types';

/** Reproduzierbarer Zufall (LCG), damit fehlschlagende Partien nachspielbar sind. */
export function rngF(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function schnautzResult(st: State): SchnautzResult {
  assert.ok(st.result && st.result.reason !== 'shithead', 'Schnautz-Ergebnis erwartet');
  return st.result as SchnautzResult;
}

/** Alle 52 Shithead-Karten genau einmal im Spiel? */
export function shCardsOk(st: State): void {
  const S = st.sh;
  assert.ok(S);
  const all: Card[] = [...S.deck, ...S.pile, ...S.burned];
  Object.values(S.P).forEach((P) => all.push(...P.hand, ...P.up, ...P.down));
  assert.equal(all.length, 52, `Kartenzahl ${all.length}`);
  assert.equal(new Set(all).size, 52, 'doppelte Karten');
}

export const action = (a: Action): Action => a;
