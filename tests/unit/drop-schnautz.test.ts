/*
 * Schnautz ziehen (ziehen.md 4.3 und 7): jede Zeile der Tabelle, Grenzfälle und die gemeinsamen Prüfungen aus
 * helpers.ts (Menge, Gastgeber, Geheimnis, Tipp-Wege) über Zufallspartien.
 */
import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { canDrag, dropOf, dropsFor, type DragKey, type DropKey } from '../../src/game/drop';
import { addPlayer, newState } from '../../src/game/state';
import type { Card, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { dropProblems, dropStates, rngF, type DropCase, type TapWays } from './helpers';

/** Tauschen mit Tippen: Handkarte, Mittelkarte, Knopf „Tauschen“ */
const TAP: TapWays = { swap: ['hand', 'mid', 'swap'] };

const SRCS: DragKey[] = [0, 1, 2].flatMap((i) => [
  { g: 'schnautz', from: 'hand', i } as const,
  { g: 'schnautz', from: 'mid', i } as const,
]);

/** Drei Leute, Spiel läuft, wer dran ist, hat die gewünschte Hand und die Mitte liegt fest */
function table(hand: Card[], middle: Card[]): { st: State; me: string; other: string } {
  const rng = rngF(7);
  const st = newState('h', 'Hanna');
  assert.equal(addPlayer(st, 'a', 'Anna'), null);
  assert.equal(addPlayer(st, 'b', 'Ben'), null);
  assert.equal(act(st, 'h', { type: 'game', game: 'schnautz' }, rng), null);
  assert.equal(act(st, 'h', { type: 'rules', rules: { turnSecs: 0, dealerChoice: false } }, rng), null);
  assert.equal(act(st, 'h', { type: 'start' }, rng), null);
  assert.equal(st.phase, 'play');
  const me = st.players[st.turn].id;
  const other = st.players.find((p) => p.id !== me)!.id;
  // Die Karten tauschen nur ihre Plätze, damit keine doppelt im Spiel ist
  const pool = [...st.deck, ...st.middle, ...Object.values(st.hands).flat()].filter(
    (c) => !hand.includes(c) && !middle.includes(c),
  );
  for (const p of st.players) st.hands[p.id] = p.id === me ? hand : pool.splice(0, 3);
  st.middle = middle;
  st.deck = pool;
  return { st, me, other };
}

describe('Schnautz ziehen, Tabelle ziehen.md 4.3', () => {
  const { st, me, other } = table(['H7', 'S8', 'C9'], ['HA', 'HK', 'D7']);
  const v = viewFor(st, me);

  it('am Zug: Handkarte auf Mittelkarte tauscht, das Etikett nennt den Wert danach', () => {
    const r = dropOf(v, me, { g: 'schnautz', from: 'hand', i: 1 }, { z: 'mid', i: 0 });
    expect(r).toEqual({ ok: true, a: { type: 'swap', h: 1, m: 0 }, say: { k: 'sz.swap', a: { v: 18 } } });
  });

  it('am Zug: Mittelkarte auf Handkarte tauscht genauso', () => {
    const r = dropOf(v, me, { g: 'schnautz', from: 'mid', i: 1 }, { z: 'hand', i: 2 });
    expect(r).toEqual({ ok: true, a: { type: 'swap', h: 2, m: 1 }, say: { k: 'sz.swap', a: { v: 17 } } });
  });

  it('Wert wie die Pille: drei Gleiche 30,5, Feuer 33', () => {
    const t = table(['HA', 'SA', 'C9'], ['CA', 'H8', 'D7']);
    const vv = viewFor(t.st, t.me);
    const say = (h: number) => dropOf(vv, t.me, { g: 'schnautz', from: 'mid', i: 0 }, { z: 'hand', i: h });
    const feuer = t.st.rules.feuer ? 33 : 30.5;
    expect(say(2)).toMatchObject({ ok: true, say: { a: { v: feuer } } });
  });

  it('jede Mittelkarte leuchtet für eine Handkarte, jede Handkarte für eine Mittelkarte', () => {
    expect(dropsFor(v, me, { g: 'schnautz', from: 'hand', i: 0 })).toEqual([
      { z: 'mid', i: 0 },
      { z: 'mid', i: 1 },
      { z: 'mid', i: 2 },
    ]);
    expect(dropsFor(v, me, { g: 'schnautz', from: 'mid', i: 2 })).toEqual([
      { z: 'hand', i: 0 },
      { z: 'hand', i: 1 },
      { z: 'hand', i: 2 },
    ]);
  });

  it('auf dieselbe Seite oder anderswohin passt es nicht', () => {
    const no = (src: DragKey, dst: DropKey) => dropOf(v, me, src, dst);
    expect(no({ g: 'schnautz', from: 'hand', i: 0 }, { z: 'hand', i: 1 })).toEqual({
      ok: false,
      r: { e: 'any.noDrop' },
    });
    expect(no({ g: 'schnautz', from: 'mid', i: 0 }, { z: 'mid', i: 1 })).toEqual({ ok: false, r: { e: 'any.noDrop' } });
    expect(no({ g: 'schnautz', from: 'hand', i: 0 }, { z: 'pile' })).toEqual({ ok: false, r: { e: 'any.noDrop' } });
    expect(no({ g: 'schnautz', from: 'hand', i: 0 }, { z: 'mid', i: 3 })).toEqual({
      ok: false,
      r: { e: 'any.noDrop' },
    });
  });

  it('außerhalb des eigenen Zugs nicht ziehbar, der Grund wie beim Tippen', () => {
    const vo = viewFor(st, other);
    const src: DragKey = { g: 'schnautz', from: 'hand', i: 0 };
    expect(canDrag(vo, other, src)).toBe(false);
    expect(dropsFor(vo, other, src)).toEqual([]);
    expect(dropOf(vo, other, src, { z: 'mid', i: 0 })).toEqual({
      ok: false,
      r: { e: 'any.notYourTurn', a: { p: me } },
    });
  });

  it('beim Wählen des Gebers und am Rundenende nichts ziehbar', () => {
    const rng = rngF(3);
    const s = newState('h', 'Hanna');
    assert.equal(addPlayer(s, 'a', 'Anna'), null);
    assert.equal(act(s, 'h', { type: 'game', game: 'schnautz' }, rng), null);
    assert.equal(act(s, 'h', { type: 'rules', rules: { turnSecs: 0, dealerChoice: true } }, rng), null);
    assert.equal(act(s, 'h', { type: 'start' }, rng), null);
    assert.equal(s.phase, 'choose');
    for (const p of s.players) for (const src of SRCS) expect(canDrag(viewFor(s, p.id), p.id, src)).toBe(false);
    const end = { ...structuredClone(st), phase: 'end' as const };
    for (const src of SRCS) expect(canDrag(viewFor(end, me), me, src)).toBe(false);
  });

  it('fehlende Karte ist keine Quelle', () => {
    expect(canDrag(v, me, { g: 'schnautz', from: 'hand', i: 3 })).toBe(false);
    expect(canDrag(v, me, { g: 'schnautz', from: 'mid', i: -1 })).toBe(false);
  });
});

describe('Schnautz ziehen, gemeinsame Prüfungen', () => {
  const cases: DropCase[] = [3, 11, 29].flatMap((seed) =>
    dropStates('schnautz', seed, { players: 3, every: 2, max: 60 }).map(({ st, me }) => ({ st, me, srcs: SRCS })),
  );

  it('Menge, Gastgeber, Geheimnis und Tipp-Wege halten', () => {
    expect(cases.some((c) => c.st.phase === 'play')).toBe(true);
    expect(dropProblems(cases, TAP)).toEqual([]);
  });

  it('über die Zufallspartien gibt es gültige Abwürfe', () => {
    const ok = cases.some((c) => SRCS.some((s) => dropsFor(viewFor(c.st, c.me), c.me, s).length > 0));
    expect(ok).toBe(true);
  });
});
