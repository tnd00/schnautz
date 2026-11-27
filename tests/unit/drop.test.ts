/*
 * Regelrahmen fürs Ziehen (src/game/drop.ts, ziehen.md 7), ohne DOM. Weiche nach Spiel, Schlüssel aus den Attributen
 * eines Ziels, Vergleich von Quellen und Zielen, Fangradius, Etiketten zu jedem Code und die gemeinsamen Prüfungen aus
 * tests/unit/helpers.ts (dropProblems und Teile). Die Regeln je Spiel prüft jedes Spiel selbst in
 * tests/unit/drop-<spiel>.test.ts mit seinen Spielständen, hier laufen die Prüfungen nur mit festen Quellen über
 * Zufallspartien aller vier Spiele, damit die Weiche und die Prüfungen selbst stimmen.
 */
import { describe, expect, it } from 'vitest';
import { dragLabel, DRAG_SR } from '../../src/content/texts/drag';
import { act } from '../../src/game/actions';
import {
  canDrag,
  catches,
  DROP_SAY_CODES,
  dropKeyOf,
  dropOf,
  dropsFor,
  sameDrag,
  sameDrop,
  type DragKey,
  type DropKey,
} from '../../src/game/drop';
import { GAMES } from '../../src/game/games';
import type { RejectArgs } from '../../src/game/reject';
import { addPlayer, newState } from '../../src/game/state';
import type { GameKind, View } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import {
  argLeaks,
  cardsSeen,
  dropCandidates,
  dropHostProblems,
  dropSecretProblems,
  dropSetProblems,
  dropStates,
  dropTapProblems,
  rngF,
  tapActs,
  type DropCase,
} from './helpers';

/** Gestartete Partie zu dritt aus Sicht des Gastgebers */
function viewOf(game: GameKind): View {
  const rng = rngF(7);
  const st = newState('h', 'Tina');
  act(st, 'h', { type: 'game', game }, rng);
  addPlayer(st, 'a', 'Lena');
  addPlayer(st, 'b', 'Tom');
  expect(act(st, 'h', { type: 'start' }, rng)).toBeNull();
  return viewFor(st, 'h');
}

/** Quellen je Spiel, für die Weiche und die Eigenschaft */
const SOURCES: Readonly<Record<GameKind, readonly DragKey[]>> = {
  shithead: [
    { g: 'shithead', from: 'hand', cards: ['H7'] },
    { g: 'shithead', from: 'up', cards: ['HA:2', 'SA'] },
    { g: 'shithead', from: 'down', i: 0 },
  ],
  durak: [
    { g: 'durak', cards: ['C7'] },
    { g: 'durak', cards: ['C7', 'S7:2'] },
  ],
  cabo: [
    { g: 'cabo', from: 'slot', ids: [0, 2] },
    { g: 'cabo', from: 'hold' },
    { g: 'cabo', from: 'pile' },
    { g: 'cabo', from: 'deck' },
  ],
  schnautz: [
    { g: 'schnautz', from: 'hand', i: 1 },
    { g: 'schnautz', from: 'mid', i: 2 },
  ],
};

/** Jedes Ziel einmal */
const DROPS: readonly DropKey[] = [
  { z: 'pile' },
  { z: 'up', i: 0 },
  { z: 'hand', i: 1 },
  { z: 'table' },
  { z: 'pair', i: 0 },
  { z: 'transfer' },
  { z: 'hold' },
  { z: 'slot', owner: 'h', id: 1 },
  { z: 'slot', owner: 'a', id: 3 },
  { z: 'mid', i: 2 },
];

describe('Weiche nach Spiel', () => {
  for (const game of GAMES) {
    const v = viewOf(game);
    const other = GAMES.find((g) => g !== game)!;

    it(`${game}: fremde Quelle ist nie ziehbar und nie ein Ziel`, () => {
      for (const src of SOURCES[other]) {
        expect(canDrag(v, 'h', src)).toBe(false);
        expect(dropsFor(v, 'h', src)).toEqual([]);
        expect(dropOf(v, 'h', src, { z: 'pile' })).toEqual({ ok: false, r: { e: 'any.unknown' } });
      }
    });

    it(`${game}: dropsFor ist genau die Menge der Ziele, für die dropOf ok liefert`, () => {
      for (const me of ['h', 'a', 'b']) {
        for (const src of SOURCES[game]) {
          const ok = DROPS.filter((d) => dropOf(v, me, src, d).ok);
          const listed = dropsFor(v, me, src);
          expect(listed.every((d) => dropOf(v, me, src, d).ok)).toBe(true);
          expect(ok.every((d) => listed.some((l) => sameDrop(l, d)))).toBe(true);
          // Wer nicht ziehen darf, hat kein Ziel
          if (!canDrag(v, me, src)) expect(listed).toEqual([]);
        }
      }
    });
  }
});

describe('Gemeinsame Prüfungen fürs Ziehen (helpers.ts)', () => {
  const cases = (game: GameKind): DropCase[] =>
    dropStates(game, 5, { every: 7, max: 30 }).map(({ st, me }) => ({ st, me, srcs: SOURCES[game] }));

  for (const game of GAMES)
    it(`${game}: Menge, Gastgeber und Geheimnis halten über eine Zufallspartie`, () => {
      const c = cases(game);
      // Wirklich verschiedene Stände, Schnautz ist nach wenigen Zügen vorbei
      expect(new Set(c.map((x) => x.st.n)).size).toBeGreaterThan(2);
      expect(dropSetProblems(c)).toEqual([]);
      expect(dropHostProblems(c)).toEqual([]);
      expect(dropSecretProblems(c)).toEqual([]);
    });

  it('dropCandidates hat jede Zielart und die Plätze aller Leute', () => {
    const v = viewOf('cabo');
    const all = dropCandidates(v);
    for (const z of ['pile', 'up', 'hand', 'table', 'pair', 'transfer', 'hold', 'slot', 'mid'])
      expect(all.some((d) => d.z === z)).toBe(true);
    for (const p of v.players) expect(all).toContainEqual({ z: 'slot', owner: p.id, id: 3 });
  });

  it('argLeaks meldet verdeckte Karten und fremde Plätze, sichtbare nicht', () => {
    const v = viewOf('durak');
    const seen = [...cardsSeen(v)];
    expect(seen.length).toBeGreaterThan(0);
    const hidden = ['HA', 'S6', 'C10', 'DK', 'H7:2'].find((c) => !seen.includes(c))!;
    expect(argLeaks({ c: seen[0], p: 'a', n: 2 }, v)).toEqual([]);
    expect(argLeaks({ c: hidden }, v)).toEqual([`c=${hidden} ist eine verdeckte Karte`]);
    expect(argLeaks({ p: 'k-0123456789ab' }, v)).toEqual(['p=k-0123456789ab sitzt nicht am Tisch']);
  });

  it('Tipp-Wege: Namen müssen in onAction stehen, jede gültige Aktion braucht einen', () => {
    for (const n of ['hand', 'mid', 'swap', 'shh', 'shu', 'shd', 'shplay', 'dkh', 'dkt', 'cbm', 'cbo', 'cbpile'])
      expect(tapActs().has(n), n).toBe(true);
    expect(dropTapProblems([], { cbsnap: ['cbsnapmode', 'gibtsnicht'] })).toEqual([
      'cbsnap: data-act „gibtsnicht“ kennt onAction nicht',
    ]);
  });
});

describe('dropKeyOf liest die Attribute eines Ziels', () => {
  it('Ziele ohne Index', () => {
    for (const z of ['pile', 'table', 'transfer', 'hold'] as const) expect(dropKeyOf({ drop: z }, 'h')).toEqual({ z });
  });

  it('Ziele mit Index aus data-i', () => {
    for (const z of ['up', 'hand', 'pair', 'mid'] as const) {
      expect(dropKeyOf({ drop: z, i: '2' }, 'h')).toEqual({ z, i: 2 });
      expect(dropKeyOf({ drop: z }, 'h')).toBeNull();
      expect(dropKeyOf({ drop: z, i: '-1' }, 'h')).toBeNull();
      expect(dropKeyOf({ drop: z, i: '1.5' }, 'h')).toBeNull();
      expect(dropKeyOf({ drop: z, i: 'x' }, 'h')).toBeNull();
    }
  });

  it('Cabo-Platz: fremd mit data-o, eigener ohne', () => {
    expect(dropKeyOf({ drop: 'slot', o: 'a', sid: '3' }, 'h')).toEqual({ z: 'slot', owner: 'a', id: 3 });
    expect(dropKeyOf({ drop: 'slot', sid: '0' }, 'h')).toEqual({ z: 'slot', owner: 'h', id: 0 });
    expect(dropKeyOf({ drop: 'slot', o: 'a' }, 'h')).toBeNull();
    expect(dropKeyOf({ drop: 'slot', sid: '1' }, '')).toBeNull();
  });

  it('Unbekanntes oder Fehlendes ist kein Ziel', () => {
    expect(dropKeyOf({}, 'h')).toBeNull();
    expect(dropKeyOf({ drop: 'deck' }, 'h')).toBeNull();
    expect(dropKeyOf({ drop: '' }, 'h')).toBeNull();
    expect(dropKeyOf({ drop: 'constructor' }, 'h')).toBeNull();
  });
});

describe('Vergleich und Fangradius', () => {
  it('sameDrag und sameDrop vergleichen Werte, Deck 2 zählt mit', () => {
    expect(sameDrag({ g: 'durak', cards: ['HA:2'] }, { g: 'durak', cards: ['HA:2'] })).toBe(true);
    expect(sameDrag({ g: 'durak', cards: ['HA:2'] }, { g: 'durak', cards: ['HA'] })).toBe(false);
    expect(sameDrag({ g: 'schnautz', from: 'hand', i: 0 }, { g: 'schnautz', from: 'mid', i: 0 })).toBe(false);
    expect(sameDrag(null, null)).toBe(false);
    expect(sameDrop({ z: 'slot', owner: 'a', id: 1 }, { z: 'slot', owner: 'a', id: 1 })).toBe(true);
    expect(sameDrop({ z: 'slot', owner: 'a', id: 1 }, { z: 'slot', owner: 'b', id: 1 })).toBe(false);
  });

  it('nur die Cabo-Ablage beim Schnappen fängt nicht daneben', () => {
    expect(catches({ g: 'cabo', from: 'slot', ids: [1] }, { z: 'pile' })).toBe(false);
    expect(catches({ g: 'cabo', from: 'hold' }, { z: 'pile' })).toBe(true);
    expect(catches({ g: 'cabo', from: 'slot', ids: [1] }, { z: 'slot', owner: 'a', id: 0 })).toBe(true);
    expect(catches({ g: 'shithead', from: 'hand', cards: ['H7'] }, { z: 'pile' })).toBe(true);
  });
});

describe('Etiketten am Geist', () => {
  const ctx = { card: (c: string) => `Karte ${c}`, name: (id: string) => ({ a: 'Lena' })[id] };

  it('jeder Code hat einen Satz, mit und ohne Argumente, im Stil von CLAUDE.md', () => {
    for (const k of DROP_SAY_CODES) {
      for (const a of [undefined, { n: 3, on: 'S6', p: 'a' }, { p: 'zz' }] as (RejectArgs | undefined)[]) {
        const s = dragLabel({ k, a }, ctx);
        expect(s, k).toMatch(/\S/);
        expect(s, k).not.toMatch(/[–—]|, und |undefined|null|NaN|\{/);
      }
    }
  });

  it('Etiketten aus ziehen.md 4 mit ihren Argumenten', () => {
    expect(dragLabel({ k: 'dk.attack', a: { n: 2 } }, ctx)).toBe('Angreifen ×2');
    expect(dragLabel({ k: 'dk.throw' }, ctx)).toBe('Nachlegen');
    expect(dragLabel({ k: 'dk.transfer', a: { p: 'a', n: 2 } }, ctx)).toBe('Schieben → Lena ×2');
    expect(dragLabel({ k: 'cb.swap', a: { n: 3, odd: 1 } }, ctx)).toBe('3 eintauschen · nur gleiche');
    expect(dragLabel({ k: 'cb.swap' }, ctx)).toBe('Eintauschen');
    expect(dragLabel({ k: 'cb.takeSwap', a: { n: 2 } }, ctx)).toBe('Nehmen und 2 tauschen');
    expect(dragLabel({ k: 'cb.discard', a: { f: 'peek' } }, ctx)).toBe('Ablegen + 👁️ Ansehen');
    expect(dragLabel({ k: 'cb.discard', a: { f: 'toString' } }, ctx)).toBe('Ablegen');
    expect(dragLabel({ k: 'cb.snap' }, ctx)).toBe('⚡ Schnappen');
    expect(dragLabel({ k: 'sz.swap', a: { v: 30.5, on: 'HA' } }, ctx)).toBe('Tauschen → 30,5');
    expect(dragLabel({ k: 'sh.blind' }, ctx)).toBe('Aufdecken');
  });

  it('Argumente landen im Satz', () => {
    expect(dragLabel({ k: 'dk.beat', a: { on: 'S6' } }, ctx)).toBe('Karte S6 schlagen');
    expect(dragLabel({ k: 'sz.swap', a: { on: 'HA' } }, ctx)).toBe('Gegen Karte HA tauschen');
    expect(dragLabel({ k: 'sh.play', a: { n: 3 } }, ctx)).toBe('Alle 3 ablegen');
    expect(dragLabel({ k: 'sh.play' }, ctx)).toBe('Ablegen');
    expect(dragLabel({ k: 'cb.blind', a: { p: 'a' } }, ctx)).toBe('🔀 mit Lena tauschen');
    expect(dragLabel({ k: 'cb.blind', a: { p: 'zz' } }, ctx)).toBe('🔀 mit Jemand tauschen');
  });

  it('Ansagen für den Vorleser', () => {
    expect(DRAG_SR.lift('Herz Sieben', 1)).toBe('Herz Sieben aufgenommen');
    expect(DRAG_SR.lift('Herz Sieben', 2)).toBe('2 Karten aufgenommen');
  });
});
