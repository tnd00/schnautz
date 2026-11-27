/*
 * Shithead ziehen (Plan 2.8 Nachtrag nach Runde 0 Punkt 9, ziehen.md 4.4 und 7): auf den Stapel aus Hand, offenen und
 * verdeckten Tischkarten, gleiche Werte zusammen, in der Tauschrunde Handkarte auf Tischkarte und zurück. Dazu die
 * Grenzfälle (4er-Sperre, fremder Zug, falsche Reihe, Deck 2) und die gemeinsamen Prüfungen aus helpers.ts (Menge,
 * Gastgeber, Geheimnis, Tipp-Wege) über Zufallspartien mit einem und mit zwei Decks.
 */
import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { rankOf } from '../../src/game/cards';
import { canDrag, dropOf, dropsFor, type DragKey, type DropKey } from '../../src/game/drop';
import { addPlayer, newState } from '../../src/game/state';
import type { Card, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { dropProblems, dropStates, rngF, type DropCase, type TapWays } from './helpers';

/** Tipp-Wege: Karten antippen und „Legen“, verdeckte Karte antippen, in der Tauschrunde zwei Karten antippen */
const TAP: TapWays = { shplay: ['shh', 'shu', 'shplay'], shblind: ['shd'], shswap: ['shh', 'shu'] };

const sh = (from: 'hand' | 'up', ...cards: Card[]): DragKey => ({ g: 'shithead', from, cards });
const down = (i: number): DragKey => ({ g: 'shithead', from: 'down', i });
const PILE: DropKey = { z: 'pile' };

/** Drei Leute in der Tauschrunde, ohne 4er-Fenster-Regel nur wenn gewünscht */
function swapTable(): State {
  const rng = rngF(11);
  const st = newState('h', 'Hanna');
  assert.equal(addPlayer(st, 'a', 'Anna'), null);
  assert.equal(addPlayer(st, 'b', 'Ben'), null);
  assert.equal(act(st, 'h', { type: 'game', game: 'shithead' }, rng), null);
  assert.equal(act(st, 'h', { type: 'rules', rules: { turnSecs: 0 } }, rng), null);
  assert.equal(act(st, 'h', { type: 'start' }, rng), null);
  assert.equal(st.phase, 'swap');
  return st;
}

/** Partie läuft, `h` ist dran mit den gewünschten Karten, auf dem Stapel liegt `pile`, kein 4er-Fenster */
function playTable(o: { hand: Card[]; up?: Card[]; down?: Card[]; pile?: Card[] }): State {
  const st = swapTable();
  for (const p of st.players) assert.equal(act(st, p.id, { type: 'shready' }), null);
  assert.equal(st.phase, 'play');
  const S = st.sh!;
  Object.assign(S.P.h, { hand: o.hand, up: o.up ?? ['C5', 'D6', 'S8'], down: o.down ?? ['C2', 'D3', 'SK'] });
  S.pile = o.pile ?? ['H6'];
  S.win = null;
  st.turn = 0;
  return st;
}

/** Abwurf auf einer Kopie beim Gastgeber: muss durchgehen */
const hostOk = (st: State, me: string, r: ReturnType<typeof dropOf>): void => {
  assert.ok(r.ok);
  expect(act(structuredClone(st), me, r.a, rngF(1))).toBeNull();
};

describe('Shithead ziehen: auf den Stapel', () => {
  it('Handkarte, die passt: Ablegen, nur der Stapel leuchtet', () => {
    const st = playTable({ hand: ['H7', 'S9', 'CK'] });
    const v = viewFor(st, 'h');
    const r = dropOf(v, 'h', sh('hand', 'S9'), PILE);
    expect(r).toEqual({ ok: true, a: { type: 'shplay', from: 'hand', idx: [1] }, say: { k: 'sh.play', a: { n: 1 } } });
    hostOk(st, 'h', r);
    expect(dropsFor(v, 'h', sh('hand', 'S9'))).toEqual([PILE]);
    expect(canDrag(v, 'h', sh('hand', 'S9'))).toBe(true);
  });

  it('gewählte gleiche Werte gehen zusammen, auch aus Deck 2', () => {
    const st = playTable({ hand: ['H9', 'S9', 'C9:2', 'CK'] });
    const v = viewFor(st, 'h');
    const r = dropOf(v, 'h', sh('hand', 'C9:2', 'H9'), PILE);
    expect(r).toEqual({
      ok: true,
      a: { type: 'shplay', from: 'hand', idx: [2, 0] },
      say: { k: 'sh.play', a: { n: 2 } },
    });
    hostOk(st, 'h', r);
  });

  it('ungleiche Werte im Bündel lehnt es ab, wie der Gastgeber', () => {
    const v = viewFor(playTable({ hand: ['H9', 'SK'] }), 'h');
    expect(dropOf(v, 'h', sh('hand', 'H9', 'SK'), PILE)).toEqual({ ok: false, r: { e: 'any.sameRank' } });
    expect(canDrag(v, 'h', sh('hand', 'H9', 'SK'))).toBe(false);
  });

  it('Karte, die nicht passt, ist nicht ziehbar, der Grund wie beim Tippen', () => {
    const v = viewFor(playTable({ hand: ['H5', 'SK'], pile: ['D9'] }), 'h');
    expect(canDrag(v, 'h', sh('hand', 'H5'))).toBe(false);
    expect(dropOf(v, 'h', sh('hand', 'H5'), PILE)).toEqual({
      ok: false,
      r: { e: 'sh.noFit', a: { c: 'H5', top: 'D9' } },
    });
  });

  it('offene Tischkarte erst, wenn die Hand leer ist', () => {
    const v = viewFor(playTable({ hand: ['H7'], up: ['SA', 'C8'] }), 'h');
    expect(canDrag(v, 'h', sh('up', 'SA'))).toBe(false);
    expect(dropOf(v, 'h', sh('up', 'SA'), PILE)).toEqual({ ok: false, r: { e: 'sh.handFirst' } });
    const st = playTable({ hand: [], up: ['SA', 'C8', 'HA'] });
    const r = dropOf(viewFor(st, 'h'), 'h', sh('up', 'HA', 'SA'), PILE);
    expect(r).toMatchObject({ ok: true, a: { type: 'shplay', from: 'up', idx: [2, 0] }, say: { a: { n: 2 } } });
    hostOk(st, 'h', r);
  });

  it('verdeckte Tischkarte einzeln und nur zuletzt: Aufdecken', () => {
    const st = playTable({ hand: [], up: [], down: ['C2', 'D3'] });
    const v = viewFor(st, 'h');
    const r = dropOf(v, 'h', down(1), PILE);
    expect(r).toEqual({ ok: true, a: { type: 'shblind', i: 1 }, say: { k: 'sh.blind' } });
    hostOk(st, 'h', r);
    expect(canDrag(v, 'h', down(2))).toBe(false);
    const early = viewFor(playTable({ hand: [], up: ['C8'] }), 'h');
    expect(canDrag(early, 'h', down(0))).toBe(false);
    expect(dropOf(early, 'h', down(0), PILE)).toEqual({ ok: false, r: { e: 'sh.blindLast' } });
  });

  it('nicht am Zug oder während der 4er-Sperre startet nichts', () => {
    const st = playTable({ hand: ['H7', 'S9'], pile: [] });
    st.sh!.win = { r: '4', by: [], id: st.n, lock: true };
    const v = viewFor(st, 'h');
    expect(canDrag(v, 'h', sh('hand', 'S9'))).toBe(false);
    expect(dropOf(v, 'h', sh('hand', 'S9'), PILE)).toEqual({ ok: false, r: { e: 'sh.winLock' } });
    st.sh!.win = null;
    const va = viewFor(st, 'a');
    const a = st.sh!.P.a.hand[0];
    expect(canDrag(va, 'a', sh('hand', a))).toBe(false);
    expect(dropOf(va, 'a', sh('hand', a), PILE)).toEqual({ ok: false, r: { e: 'any.notYourTurn', a: { p: 'h' } } });
  });

  it('fehlende Karte und andere Ziele: kein Ziel', () => {
    const v = viewFor(playTable({ hand: ['H7', 'S9'] }), 'h');
    expect(dropOf(v, 'h', sh('hand', 'DA'), PILE)).toEqual({ ok: false, r: { e: 'any.cardGone' } });
    expect(dropOf(v, 'h', sh('hand', 'S9'), { z: 'up', i: 0 })).toEqual({ ok: false, r: { e: 'any.noDrop' } });
    expect(dropOf(v, 'h', sh('hand', 'S9'), { z: 'hand', i: 0 })).toEqual({ ok: false, r: { e: 'any.noDrop' } });
  });
});

describe('Shithead ziehen: Tauschrunde', () => {
  const st = swapTable();
  const P = st.sh!.P.h;
  const v = viewFor(st, 'h');

  it('Handkarte auf offene Tischkarte tauscht, das Etikett nennt die Tischkarte', () => {
    const r = dropOf(v, 'h', sh('hand', P.hand[1]), { z: 'up', i: 2 });
    expect(r).toEqual({ ok: true, a: { type: 'shswap', h: 1, u: 2 }, say: { k: 'sh.swap', a: { on: P.up[2] } } });
    hostOk(st, 'h', r);
  });

  it('offene Tischkarte auf Handkarte tauscht genauso', () => {
    const r = dropOf(v, 'h', sh('up', P.up[0]), { z: 'hand', i: 2 });
    expect(r).toEqual({ ok: true, a: { type: 'shswap', h: 2, u: 0 }, say: { k: 'sh.swap', a: { on: P.hand[2] } } });
    hostOk(st, 'h', r);
  });

  it('jede Karte der anderen Reihe leuchtet, Stapel und eigene Reihe nicht', () => {
    expect(dropsFor(v, 'h', sh('hand', P.hand[0]))).toEqual(P.up.map((_, i) => ({ z: 'up', i })));
    expect(dropsFor(v, 'h', sh('up', P.up[1]))).toEqual(P.hand.map((_, i) => ({ z: 'hand', i })));
    expect(dropOf(v, 'h', sh('hand', P.hand[0]), PILE)).toEqual({ ok: false, r: { e: 'any.noDrop' } });
    expect(dropOf(v, 'h', sh('hand', P.hand[0]), { z: 'hand', i: 1 })).toEqual({ ok: false, r: { e: 'any.noDrop' } });
  });

  it('nur einzeln, nie verdeckt, nach „Bereit“ nichts mehr', () => {
    expect(canDrag(v, 'h', sh('hand', P.hand[0], P.hand[1]))).toBe(false);
    expect(canDrag(v, 'h', down(0))).toBe(false);
    const ready = structuredClone(st);
    assert.equal(act(ready, 'h', { type: 'shready' }), null);
    const vr = viewFor(ready, 'h');
    expect(canDrag(vr, 'h', sh('hand', P.hand[0]))).toBe(false);
    expect(dropOf(vr, 'h', sh('hand', P.hand[0]), { z: 'up', i: 0 })).toEqual({ ok: false, r: { e: 'any.ready' } });
  });

  it('fremde Karten sind keine Quelle', () => {
    const other = st.sh!.P.a.hand[0];
    expect(canDrag(v, 'h', sh('hand', other))).toBe(false);
  });
});

/** Quellen aus der eigenen Ansicht: jede Karte einzeln, Paare gleicher Werte, ein gemischtes Bündel, jede verdeckte */
function srcsOf(st: State, me: string): DragKey[] {
  const P = st.sh?.P[me];
  if (!P) return [];
  const out: DragKey[] = [];
  for (const from of ['hand', 'up'] as const) {
    const arr = P[from];
    for (const c of arr) out.push(sh(from, c));
    for (let i = 0; i < arr.length; i++)
      for (let k = i + 1; k < arr.length; k++) {
        if (rankOf(arr[i]) === rankOf(arr[k])) out.push(sh(from, arr[i], arr[k]));
        else if (i === 0 && k === 1) out.push(sh(from, arr[i], arr[k]));
      }
  }
  for (let i = 0; i <= P.down.length; i++) out.push(down(i));
  return out;
}

describe('Shithead ziehen: gemeinsame Prüfungen über Zufallspartien', () => {
  const cases = (seed: number, players: number): DropCase[] =>
    dropStates('shithead', seed, { players, every: 4, max: 40, rules: { seats: 8 } }).map(({ st, me }) => ({
      st,
      me,
      srcs: srcsOf(st, me),
    }));

  it('drei Leute, ein Deck: Menge, Gastgeber, Geheimnis und Tipp-Wege', () => {
    const c = cases(3, 3);
    expect(new Set(c.map((x) => x.st.phase))).toEqual(new Set(['swap', 'play']));
    // Es gibt wirklich gültige Abwürfe aller drei Arten
    const types = new Set(
      c.flatMap(({ st, me, srcs }) => {
        const v = viewFor(st, me);
        return srcs.flatMap((s) =>
          dropsFor(v, me, s).map((d) => (dropOf(v, me, s, d) as { a: { type: string } }).a.type),
        );
      }),
    );
    expect(types).toEqual(new Set(['shswap', 'shplay']));
    expect(dropProblems(c, TAP)).toEqual([]);
  });

  it('sechs Leute, zwei Decks', () => {
    const c = cases(8, 6);
    expect(c.some(({ st }) => JSON.stringify(st.sh).includes(':2'))).toBe(true);
    expect(dropProblems(c, TAP)).toEqual([]);
  });

  it('bis zu den verdeckten Karten', () => {
    // Lange Partie, damit jemand bei den verdeckten Karten ankommt
    const all = dropStates('shithead', 4, { players: 2, every: 1, max: 400 });
    const late = all.filter(({ st, me }) => {
      const P = st.sh?.P[me];
      return st.phase === 'play' && P && !P.hand.length && !P.up.length && P.down.length;
    });
    expect(late.length).toBeGreaterThan(0);
    const c = late.map(({ st, me }) => ({ st, me, srcs: srcsOf(st, me) }));
    expect(dropProblems(c, TAP)).toEqual([]);
  });
});
