import { strict as assert } from 'node:assert';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import type { Action, Card, Rng, SchnautzResult, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { szResult } from '../../src/game/games';

/** Reproduzierbarer Zufall (LCG), damit fehlschlagende Partien nachspielbar sind. */
export function rngF(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function schnautzResult(st: State): SchnautzResult {
  const r = szResult(st.result);
  assert.ok(r, 'Schnautz-Ergebnis erwartet');
  return r;
}

/** Alle Shithead-Karten (52 je Deck) genau einmal im Spiel? */
export function shCardsOk(st: State): void {
  const S = st.sh;
  assert.ok(S);
  const want = 52 * (S.decks ?? 1);
  const all: Card[] = [...S.deck, ...S.pile, ...S.burned];
  Object.values(S.P).forEach((P) => all.push(...P.hand, ...P.up, ...P.down));
  assert.equal(all.length, want, `Kartenzahl ${all.length}`);
  assert.equal(new Set(all).size, want, 'doppelte Karten');
}

export const action = (a: Action): Action => a;

/** Alle spielen wie die KI, bis die Partie vorbei ist. `stop` bricht vorher ab. */
export function playOut(st: State, rng: Rng, stop?: (st: State) => boolean): void {
  for (let guard = 0; st.phase !== 'over' && guard < 20000; guard++) {
    if (stop?.(st)) return;
    if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
    let moved = false;
    for (const p of st.players) {
      const a = botDecide(viewFor(st, p.id), rng, 'normal');
      if (a && !act(st, p.id, a, rng)) moved = true;
      if (moved && a?.type !== 'ready') break;
    }
    if (!moved) break;
  }
}
