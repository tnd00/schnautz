import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { addPlayer, newState } from '../../src/game/state';
import type { View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { viewSig } from '../../src/ui/viewsig';
import { rngF } from './helpers';

function base(): View {
  const rng = rngF(9);
  const st = newState('h', 'Host');
  addPlayer(st, 'p1', 'Paul');
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  const v = viewFor(st, 'h');
  v.clock = { ids: ['h'], left: 18000, total: 40000, at: 123 };
  v.sh!.win = { r: '4', by: [], id: 3, lock: true, left: 1500, at: 999 };
  return v;
}

describe('Fingerabdruck der Ansicht', () => {
  it('ignoriert Restzeiten, Verlauf und Zähler', () => {
    const a = base();
    const b = structuredClone(a);
    b.clock!.left = 3000;
    b.clock!.at = 456;
    b.sh!.win!.left = 200;
    b.sh!.win!.at = 1000;
    b.sh!.win!.until = 5;
    b.log = [...b.log, { k: 'toss', n: 99, p: 'p1', to: 'h', item: 'egg' }];
    b.n = 99;
    expect(viewSig(b)).toBe(viewSig(a));
  });

  it('merkt echte Änderungen an Uhr und 4er-Fenster', () => {
    const a = base();
    const ids = structuredClone(a);
    ids.clock!.ids = ['p1'];
    const total = structuredClone(a);
    total.clock!.total = 20000;
    const lock = structuredClone(a);
    lock.sh!.win!.lock = false;
    const id = structuredClone(a);
    id.sh!.win!.id = 4;
    for (const x of [ids, total, lock, id]) expect(viewSig(x)).not.toBe(viewSig(a));
  });

  it('lässt die übergebene Ansicht unverändert', () => {
    const a = base();
    const copy = structuredClone(a);
    viewSig(a);
    expect(a).toEqual(copy);
  });
});
