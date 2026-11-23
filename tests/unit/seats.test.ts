import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { quitPlayer, toBot } from '../../src/game/flow';
import { finishRound } from '../../src/game/schnautz';
import { reclaimSeat, seatGuest } from '../../src/game/seats';
import { addPlayer, newState, pIdx } from '../../src/game/state';
import type { Card, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF, shCardsOk } from './helpers';

const bots = (st: State) => st.players.filter((p) => p.bot);
const seatId = (r: ReturnType<typeof seatGuest>): string => {
  assert.ok('id' in r, 'err' in r ? r.err : '');
  return r.id;
};

/** Alle Plätze spielen mit der KI weiter, bis die Partie vorbei ist. */
function playOut(st: State, rng: () => number): void {
  for (let guard = 0; st.phase !== 'over' && guard < 20000; guard++) {
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

describe('Plätze am Tisch', () => {
  it('füllt freie Plätze mit KI, gibt sie an Gäste ab und räumt bei weniger Plätzen auf', () => {
    const rng = rngF(1);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 4 } }, rng);
    expect(st.players).toHaveLength(4);
    expect(bots(st)).toHaveLength(3);

    // Wer beitritt, übernimmt einen KI-Platz, die Zahl der Plätze bleibt
    const anna = seatId(seatGuest(st, 'p-anna', 'Anna'));
    expect(anna).not.toBe('p-anna');
    const ap = st.players[pIdx(st, anna)];
    expect(ap.bot).toBeUndefined();
    expect(ap.name).toBe('Anna');
    expect(st.players).toHaveLength(4);
    expect(st.log.at(-1)).toMatchObject({ k: 'takeover', name: 'Anna' });

    // Weniger Plätze: Erst gehen die KIs, nie die Menschen
    act(st, 'h', { type: 'rules', rules: { seats: 2 } }, rng);
    expect(st.players.map((p) => p.id)).toEqual(['h', anna]);
    act(st, 'h', { type: 'rules', rules: { seats: 1 } }, rng);
    expect(st.rules.seats).toBe(2);

    // Mehr Plätze werden wieder gefüllt, wer in der Lobby geht, macht Platz für eine KI
    act(st, 'h', { type: 'rules', rules: { seats: 3 } }, rng);
    expect(bots(st)).toHaveLength(1);
    quitPlayer(st, anna, rng);
    expect(st.players).toHaveLength(3);
    expect(bots(st)).toHaveLength(2);

    // Eine KI entfernen heißt beim Auffüllen: ein Platz weniger
    act(st, 'h', { type: 'rmbot', id: bots(st)[0].id }, rng);
    expect(st.rules.seats).toBe(2);
    expect(st.players).toHaveLength(2);
  });

  it('lässt freie Plätze ohne Auffüllen leer und meldet einen vollen Tisch', () => {
    const rng = rngF(2);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { seats: 3 } }, rng);
    expect(st.players).toHaveLength(1);
    expect(seatId(seatGuest(st, 'p-1', 'Eins'))).toBe('p-1');
    expect(seatId(seatGuest(st, 'p-2', 'Zwei'))).toBe('p-2');
    expect(seatGuest(st, 'p-3', 'Drei')).toEqual({ err: 'Der Tisch ist voll.' });
  });

  it('nimmt beim Übernehmen den KI-Platz mit dem eigenen Namen', () => {
    const rng = rngF(3);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 4 } }, rng);
    const first = bots(st)[0];
    expect(seatId(seatGuest(st, 'p-x', first.name))).toBe(first.id);
  });

  it('übernimmt mitten in Shithead einen KI-Platz mit Karten und Reihenfolge, Bilanz bei null', () => {
    const rng = rngF(4);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 3 } }, rng);
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    st.players.forEach((p) => act(st, p.id, { type: 'shready' }, rng));
    expect(st.phase).toBe('play');
    const S = st.sh;
    assert.ok(S);
    const b = bots(st)[1];
    b.stats = { shithead: { games: 3, wins: 2 } };
    b.shc = 1;
    st.reign = { win: b.id, sh: null, game: 'shithead' };
    const cards = structuredClone(S.P[b.id]);
    const turn = st.turn;
    const n = st.players.length;

    expect(seatId(seatGuest(st, 'p-lena', 'Lena'))).toBe(b.id);
    expect(b.bot).toBeUndefined();
    expect(b.name).toBe('Lena');
    expect(b.stats).toEqual({});
    expect(b.shc).toBe(0);
    expect(st.reign.win).toBeNull();
    expect(S.P[b.id]).toEqual(cards);
    expect(st.turn).toBe(turn);
    expect(st.players).toHaveLength(n);
    shCardsOk(st);

    // Ohne freien KI-Platz kommt mitten im Spiel niemand mehr dazu
    const last = bots(st)[0];
    seatId(seatGuest(st, 'p-mo', 'Mo'));
    expect(last.bot).toBeUndefined();
    expect('err' in seatGuest(st, 'p-zu', 'Zu spät')).toBe(true);
  });

  it('übernimmt mitten in Schnautz das Blatt eines KI-Platzes', () => {
    const rng = rngF(5);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 3, dealerChoice: false } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const before: Record<string, Card[]> = structuredClone(st.hands);
    const id = seatId(seatGuest(st, 'p-ole', 'Ole'));
    expect(before[id]).toBeDefined();
    expect(st.hands).toEqual(before);
    expect(st.players[pIdx(st, id)].bot).toBeUndefined();
  });

  it('macht aus jemandem, der mitten in der Partie geht, eine KI, die bis zum Ende spielt', () => {
    for (const game of ['schnautz', 'shithead'] as const) {
      const rng = rngF(game === 'shithead' ? 6 : 7);
      const st = newState('h', 'Host');
      addPlayer(st, 'p1', 'Paul');
      addPlayer(st, 'p2', 'Pia');
      act(st, 'h', { type: 'game', game }, rng);
      act(st, 'h', { type: 'start' }, rng);
      quitPlayer(st, 'p1', rng);
      const p1 = st.players[pIdx(st, 'p1')];
      expect(p1).toMatchObject({ bot: true, name: 'Paul', online: true, out: false });
      expect(st.log.at(-1)).toMatchObject({ k: 'tobot', p: 'p1' });
      playOut(st, rng);
      expect(st.phase).toBe('over');
      // Die KI führt die Bilanz weiter, die Partie zählt für den Platz
      expect(p1.stats?.[game]?.games).toBe(1);
    }
  });

  it('wartet nicht mehr auf jemanden, der vor dem Weiterspielen geht', () => {
    const rng = rngF(8);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    addPlayer(st, 'p2', 'Pia');
    act(st, 'h', { type: 'rules', rules: { dealerChoice: false } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    finishRound(st, 'knock', 'h');
    expect(st.phase).toBe('end');
    act(st, 'h', { type: 'ready' }, rng);
    act(st, 'p2', { type: 'ready' }, rng);
    expect(st.phase).toBe('end');
    toBot(st, 'p1', rng);
    expect(st.phase).toBe('play');
  });

  it('gibt den eigenen Platz zurück, wenn jemand wiederkommt', () => {
    const rng = rngF(9);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    act(st, 'h', { type: 'start' }, rng);
    const p1 = st.players[1];
    p1.stats = { schnautz: { games: 2, wins: 1 } };
    toBot(st, 'p1', rng);
    reclaimSeat(st, 'p1');
    expect(p1.bot).toBeUndefined();
    expect(p1.stats).toEqual({ schnautz: { games: 2, wins: 1 } });
    expect(st.log.at(-1)).toMatchObject({ k: 'back', p: 'p1' });

    // Mit neuem Browser zählt der Name: Der verlassene Platz kommt samt Bilanz zurück
    toBot(st, 'p1', rng);
    expect(seatId(seatGuest(st, 'p-neu', 'paul'))).toBe('p1');
    expect(p1.bot).toBeUndefined();
    expect(p1.left).toBeUndefined();
    expect(p1.stats).toEqual({ schnautz: { games: 2, wins: 1 } });
    expect(st.log.at(-1)).toMatchObject({ k: 'back' });
  });
});

describe('Neue Partie, wenn nur noch KIs spielen', () => {
  it('startet sofort eine frische Partie, nur der Host darf das', () => {
    const rng = rngF(12);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 4 } }, rng);
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const games = st.games;
    expect(act(st, 'p1', { type: 'restart' }, rng)).toBe('Nur der Gastgeber startet eine neue Partie.');
    expect(act(st, 'h', { type: 'restart' }, rng)).toBeNull();
    expect(st.phase).toBe('swap');
    expect(st.games).toBe(games + 1);
    expect(st.players).toHaveLength(4);
    act(st, 'h', { type: 'tolobby' }, rng);
    expect(act(st, 'h', { type: 'restart' }, rng)).toBe('Die Partie hat noch gar nicht angefangen.');
  });
});
