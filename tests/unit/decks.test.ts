import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { rankOf } from '../../src/game/cards';
import { shCanBomb } from '../../src/game/shithead';
import { addPlayer, newState, seatLimit } from '../../src/game/state';
import type { Card, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { msgOf, rngF, shCardsOk } from './helpers';

function table(n: number, game: 'schnautz' | 'shithead', seed: number, rules: object = {}): State {
  const rng = rngF(seed);
  const st = newState('h', 'Host');
  act(st, 'h', { type: 'rules', rules: { seats: n, ...rules } }, rng);
  act(st, 'h', { type: 'game', game }, rng);
  for (let i = 1; i < n; i++) assert.equal(addPlayer(st, `p${i}`, `P${i}`), null);
  return st;
}

/** Alle Plätze spielen mit der KI, bis die Partie vorbei ist. */
function playOut(st: State, rng: () => number, check: () => void): void {
  for (let guard = 0; st.phase !== 'over' && guard < 40000; guard++) {
    if (st.sh?.win?.lock) act(st, st.host, { type: 'shunlock', id: st.sh.win.id }, rng);
    let moved = false;
    for (const p of st.players) {
      const a = botDecide(viewFor(st, p.id), rng, 'normal');
      if (a && !act(st, p.id, a, rng)) moved = true;
      if (moved && a?.type !== 'ready') break;
    }
    if (!moved) break;
    check();
  }
}

describe('Mehr Leute und zweites Deck', () => {
  it('erlaubt bei allen Spielen bis zu 8 Leute', () => {
    const st = table(2, 'shithead', 1);
    act(st, 'h', { type: 'rules', rules: { seats: 12 } }, rngF(1));
    expect(seatLimit(st)).toBe(8);
    act(st, 'h', { type: 'game', game: 'schnautz' }, rngF(1));
    expect(seatLimit(st)).toBe(8);

    // Ein neunter Mensch findet keinen Platz mehr
    const full = table(8, 'shithead', 2);
    expect(msgOf(addPlayer(full, 'p9', 'P9'))).toBe('Der Tisch ist voll.');
    // Ein alter Shithead-Tisch aus 2.5 mit neun Menschen kann nicht zu Schnautz wechseln
    full.players.push({ ...structuredClone(full.players[1]), id: 'p9', name: 'P9' });
    expect(msgOf(act(full, 'h', { type: 'game', game: 'schnautz' }, rngF(2)))).toMatch(/höchstens 8/);
    expect(full.game).toBe('shithead');
  });

  it('spielt Shithead ab 6 Leuten mit zwei Decks, ab 5 nur mit Einstellung', () => {
    const six = table(6, 'shithead', 3);
    act(six, 'h', { type: 'start' }, rngF(3));
    assert.ok(six.sh);
    expect(six.sh.decks).toBe(2);
    shCardsOk(six);
    const all: Card[] = [...six.sh.deck, ...Object.values(six.sh.P).flatMap((P) => [...P.hand, ...P.up, ...P.down])];
    expect(all.filter((c) => rankOf(c) === 'A')).toHaveLength(8);

    const five = table(5, 'shithead', 4);
    act(five, 'h', { type: 'start' }, rngF(4));
    expect(five.sh?.decks ?? 1).toBe(1);
    const five2 = table(5, 'shithead', 5, { sh: { deck5: true } });
    act(five2, 'h', { type: 'start' }, rngF(5));
    expect(five2.sh?.decks).toBe(2);
    shCardsOk(five2);
  });

  it('lässt eine Bombe einwerfen, auch wenn man mehr als die fehlenden Karten hat', () => {
    const st = table(6, 'shithead', 6);
    const rng = rngF(6);
    act(st, 'h', { type: 'start' }, rng);
    st.players.forEach((p) => act(st, p.id, { type: 'shready' }, rng));
    const S = st.sh;
    assert.ok(S);
    S.win = null;
    S.pile = ['H7', 'S7', 'C7'];
    const other = st.players.find((_, i) => i !== st.turn) as (typeof st.players)[number];
    S.P[other.id].hand = ['D7', 'H7:2', 'S7:2', 'CK'];
    const bm = shCanBomb(st, other.id);
    expect(bm?.idx).toHaveLength(1);
    expect(act(st, other.id, { type: 'shbomb' }, rng)).toBeNull();
    expect(S.pile).toEqual([]);
    expect(S.P[other.id].hand.filter((c) => rankOf(c) === '7')).toHaveLength(2);
  });

  it('spielt Partien mit 6 bis 8 Leuten bis zum Ende, ohne Karten zu verlieren', () => {
    for (let g = 0; g < 25; g++) {
      const n = 6 + (g % 3);
      const st = table(n, 'shithead', 100 + g);
      const rng = rngF(100 + g);
      act(st, 'h', { type: 'start' }, rng);
      playOut(st, rng, () => {
        if (st.phase === 'play') shCardsOk(st);
      });
      expect(st.phase).toBe('over');
    }
  });

  it('spielt Schnautz mit 8 Leuten bis zum Ende', () => {
    for (let g = 0; g < 10; g++) {
      const st = table(8, 'schnautz', 200 + g, { dealerChoice: g % 2 === 0 });
      const rng = rngF(200 + g);
      act(st, 'h', { type: 'start' }, rng);
      playOut(st, rng, () => {
        if (st.phase !== 'choose' && st.phase !== 'play') return;
        const all: Card[] = [...st.deck, ...st.discard, ...st.middle, ...(st.spare ?? [])];
        Object.values(st.hands).forEach((h) => all.push(...h));
        assert.equal(new Set(all).size, 32);
        assert.equal(all.length, 32);
      });
      expect(st.phase).toBe('over');
    }
  });
});
