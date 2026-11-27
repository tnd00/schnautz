/*
 * Durak ziehen (ziehen.md 4.2 und 7): jede Zeile der Tabelle, Grenzfälle und die gemeinsamen Prüfungen aus
 * helpers.ts (Menge, Gastgeber, Geheimnis, Tipp-Wege) über Zufallspartien. Dazu: dkRoleOf bleibt gleich dkRole.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { rankOf } from '../../src/game/cards';
import { canDrag, dropOf, dropsFor, type DragKey, type DropKey } from '../../src/game/drop';
import { dkRoleOf } from '../../src/game/drop/durak';
import { addPlayer, newState } from '../../src/game/state';
import type { Card, State, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { dkRole } from '../../src/ui/render/durak';
import { dropProblems, dropStates, rngF, type DropCase, type TapWays } from './helpers';

/** Tipp-Wege: Karte wählen, dann Knopf oder Angriff (WCAG 2.5.7) */
const TAP: TapWays = {
  dkattack: ['dkh', 'dkgo'],
  dkdefend: ['dkh', 'dkt'],
  dktransfer: ['dkh', 'dktransfer'],
};

/** Drei Leute, Trumpf Herz, h greift a an, feste Hände */
function table(transfer = false): State {
  const rng = rngF(3);
  const st = newState('h', 'Tina');
  act(st, 'h', { type: 'game', game: 'durak' }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 0, dk: { transfer } } }, rng);
  addPlayer(st, 'a', 'Lena');
  addPlayer(st, 'b', 'Tom');
  expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
  const D = st.dk!;
  D.trump = 'H6';
  D.P = { h: ['C7', 'D7', 'S8', 'DK'], a: ['C9', 'S7', 'D6', 'H9'], b: ['H7', 'S10', 'CA'] };
  Object.assign(D, { att: 'h', def: 'a', table: [], take: false, done: [], limit: 4, finished: [] });
  return st;
}

const k = (...cards: Card[]): DragKey => ({ g: 'durak', cards });
const T: DropKey = { z: 'table' };
const X: DropKey = { z: 'transfer' };
const P = (i: number): DropKey => ({ z: 'pair', i });
const step = (st: State, pid: string, a: Parameters<typeof act>[2]): void =>
  expect(act(st, pid, a, rngF(1))).toBeNull();
const drop = (st: State, me: string, src: DragKey, dst: DropKey) => dropOf(viewFor(st, me), me, src, dst);
const why = (st: State, me: string, src: DragKey, dst: DropKey) => {
  const r = drop(st, me, src, dst);
  return r.ok ? 'ok' : r.r.e;
};

describe('Durak ziehen, Tabelle ziehen.md 4.2', () => {
  it('lead: Handkarte auf die Tischfläche greift an', () => {
    const st = table();
    expect(drop(st, 'h', k('C7'), T)).toEqual({
      ok: true,
      a: { type: 'dkattack', idx: [0], cards: ['C7'] },
      say: { k: 'dk.attack', a: { n: 1 } },
    });
    expect(dropsFor(viewFor(st, 'h'), 'h', k('C7'))).toEqual([T]);
  });

  it('lead: Bündel gleicher Werte heißt „Angreifen ×2“, gemischte Werte nennen den Grund', () => {
    const st = table();
    const r = drop(st, 'h', k('D7', 'C7'), T);
    expect(r).toEqual({
      ok: true,
      a: { type: 'dkattack', idx: [1, 0], cards: ['D7', 'C7'] },
      say: { k: 'dk.attack', a: { n: 2 } },
    });
    expect(why(st, 'h', k('C7', 'S8'), T)).toBe('any.sameRank');
  });

  it('lead: kein anderes Ziel, wer nicht angreift, zieht nichts', () => {
    const st = table();
    expect(why(st, 'h', k('C7'), P(0))).toBe('any.noDrop');
    expect(why(st, 'h', k('C7'), X)).toBe('any.noDrop');
    for (const me of ['a', 'b']) {
      const v = viewFor(st, me);
      const src = k(st.dk!.P[me][0]);
      expect(canDrag(v, me, src)).toBe(false);
      expect(dropsFor(v, me, src)).toEqual([]);
    }
  });

  it('throw: Nachlegen auf die Tischfläche, falscher Wert und Passen nennen den Grund', () => {
    const st = table();
    step(st, 'h', { type: 'dkattack', idx: [0] });
    expect(drop(st, 'b', k('H7'), T)).toEqual({
      ok: true,
      a: { type: 'dkattack', idx: [0], cards: ['H7'] },
      say: { k: 'dk.throw', a: { n: 1 } },
    });
    expect(why(st, 'b', k('S10'), T)).toBe('dk.rankNotOnTable');
    // Ausgegraut heißt nicht ziehbar, der Tipp nennt den Grund (wie in allen vier Spielen)
    expect(canDrag(viewFor(st, 'b'), 'b', k('S10'))).toBe(false);
    expect(canDrag(viewFor(st, 'b'), 'b', k('H7', 'S10'))).toBe(false);
    expect(canDrag(viewFor(st, 'b'), 'b', k('H7'))).toBe(true);
    // Nachlegen nie auf einen Angriff, das wäre Schlagen
    expect(why(st, 'b', k('H7'), P(0))).toBe('any.noDrop');
    step(st, 'a', { type: 'dkdefend', a: 0, i: 0 });
    step(st, 'b', { type: 'dkpass' });
    expect(why(st, 'b', k('H7'), T)).toBe('dk.passed');
  });

  it('defend: Karte auf einen offenen Angriff schlägt ihn mit den gemeinten Karten', () => {
    const st = table();
    step(st, 'h', { type: 'dkattack', idx: [0] });
    expect(drop(st, 'a', k('C9'), P(0))).toEqual({
      ok: true,
      a: { type: 'dkdefend', a: 0, i: 0, ac: 'C7', c: 'C9' },
      say: { k: 'dk.beat', a: { on: 'C7' } },
    });
    expect(why(st, 'a', k('D6'), P(0))).toBe('dk.noBeat');
    // Pik Sieben schlägt nichts und Schieben ist aus: ausgegraut, nicht ziehbar
    expect(canDrag(viewFor(st, 'a'), 'a', k('S7'))).toBe(false);
    expect(dropsFor(viewFor(st, 'a'), 'a', k('S7'))).toEqual([]);
  });

  it('defend: freie Tischfläche nennt nur den Grund, schlagen geht über das Paar', () => {
    const st = table();
    step(st, 'h', { type: 'dkattack', idx: [0] });
    expect(why(st, 'a', k('C9'), T)).toBe('dk.dropPair');
    expect(why(st, 'a', k('C9'), P(0))).toBe('ok');
    expect(why(st, 'a', k('D6'), T)).toBe('dk.noBeat');
    const two = table();
    step(two, 'h', { type: 'dkattack', idx: [0, 1] });
    expect(why(two, 'a', k('C9'), T)).toBe('dk.dropPair');
    expect(why(two, 'a', k('C9'), P(0))).toBe('ok');
    expect(why(two, 'a', k('C9'), P(1))).toBe('dk.noBeat');
    expect(why(two, 'a', k('H9'), P(1))).toBe('ok');
    expect(dropsFor(viewFor(two, 'a'), 'a', k('H9'))).toEqual([P(0), P(1)]);
  });

  it('defend: ein Bündel schlägt nicht', () => {
    const st = table();
    step(st, 'h', { type: 'dkattack', idx: [0] });
    expect(why(st, 'a', k('C9', 'H9'), P(0))).toBe('dk.oneCard');
    expect(why(st, 'a', k('C9', 'H9'), T)).toBe('dk.oneCard');
  });

  it('defend: Schiebefeld schiebt an den Nächsten, ausgeschaltet leuchtet es nicht', () => {
    const st = table(true);
    step(st, 'h', { type: 'dkattack', idx: [0] });
    expect(drop(st, 'a', k('S7'), X)).toEqual({
      ok: true,
      a: { type: 'dktransfer', idx: [1], cards: ['S7'] },
      say: { k: 'dk.transfer', a: { p: 'b', n: 1 } },
    });
    expect(dropsFor(viewFor(st, 'a'), 'a', k('S7'))).toEqual([X]);
    // Karte zum Schlagen: kein Schiebefeld
    expect(dropsFor(viewFor(st, 'a'), 'a', k('C9'))).toEqual([P(0)]);
    const off = table();
    step(off, 'h', { type: 'dkattack', idx: [0] });
    expect(why(off, 'a', k('S7'), X)).toBe('dk.transferOff');
    expect(dropsFor(viewFor(off, 'a'), 'a', k('S7'))).toEqual([]);
  });

  it('taking, wait und done: nichts ist ziehbar', () => {
    const st = table();
    step(st, 'h', { type: 'dkattack', idx: [0] });
    step(st, 'a', { type: 'dktake' });
    const v = viewFor(st, 'a');
    expect(dkRoleOf(v, 'a')).toBe('taking');
    expect(canDrag(v, 'a', k('C9'))).toBe(false);
    expect(dropsFor(v, 'a', k('C9'))).toEqual([]);
    const done = table();
    done.dk!.P.b = [];
    done.dk!.finished = ['b'];
    expect(dkRoleOf(viewFor(done, 'b'), 'b')).toBe('done');
  });

  it('Karte nicht mehr in der Hand: nicht ziehbar, Abwurf sagt warum', () => {
    const st = table();
    const v = viewFor(st, 'h');
    expect(canDrag(v, 'h', k('HA'))).toBe(false);
    expect(canDrag(v, 'h', k('C7', 'C7'))).toBe(false);
    expect(why(st, 'h', k('HA'), T)).toBe('any.cardGone');
  });
});

/** Quellen aus der eigenen Hand: jede Karte einzeln, dazu gleiche Werte als Bündel */
function dkSources(v: View): DragKey[] {
  const hand = v.dk?.P[v.me];
  if (!Array.isArray(hand)) return [];
  const byRank = new Map<string, Card[]>();
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  return [...hand.map((c) => k(c)), ...[...byRank.values()].filter((g) => g.length > 1).map((g) => k(...g))];
}

describe('Durak ziehen, gemeinsame Prüfungen über Zufallspartien', () => {
  // Dazu der feste Tisch mit Weiterschieben, in Zufallspartien ist das selten
  const shove = table(true);
  step(shove, 'h', { type: 'dkattack', idx: [0] });
  const cases: DropCase[] = [
    ...dropStates('durak', 4, { every: 3, max: 60 }),
    ...dropStates('durak', 9, { players: 4, every: 2, max: 120, rules: { dk: { transfer: true } } }),
    ...['h', 'a', 'b'].map((me) => ({ st: shove, me })),
  ].map(({ st, me }) => ({ st, me, srcs: dkSources(viewFor(st, me)) }));

  it('es gibt Fälle mit gültigen Abwürfen aller drei Arten', () => {
    const types = new Set<string>();
    for (const c of cases) {
      const v = viewFor(c.st, c.me);
      for (const src of c.srcs)
        for (const d of dropsFor(v, c.me, src)) {
          const r = dropOf(v, c.me, src, d);
          if (r.ok) types.add(r.a.type);
        }
    }
    expect([...types].sort()).toEqual(['dkattack', 'dkdefend', 'dktransfer']);
  });

  it('Menge, Gastgeber, Geheimnis und Tipp-Wege', () => {
    expect(dropProblems(cases, TAP)).toEqual([]);
  });

  afterEach(() => {
    App.me = '';
  });

  it('dkRoleOf ist dieselbe Rolle wie dkRole am Tisch', () => {
    for (const c of cases) {
      App.me = c.me;
      const v = viewFor(c.st, c.me);
      expect(dkRoleOf(v, c.me)).toBe(dkRole(v));
    }
  });
});
