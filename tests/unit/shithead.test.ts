import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { quitPlayer } from '../../src/game/flow';
import { shCanBomb, shCanPlay, shCanThrow } from '../../src/game/shithead';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, Card, ShRules, ShState, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF, shCardsOk } from './helpers';

const rank = (c: Card) => c.slice(1);

function shTable(players: string[], seed: number): { st: State; S: ShState; take: (c: Card) => Card; rest: Card[] } {
  const rng = rngF(seed);
  const st = newState('h', 'H');
  players.slice(1).forEach((id, i) => addPlayer(st, id, `P${i}`));
  act(st, 'h', { type: 'game', game: 'shithead' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  const S = st.sh;
  assert.ok(S);
  const rest: Card[] = [...S.deck];
  Object.values(S.P).forEach((P) => rest.push(...P.hand, ...P.up, ...P.down));
  const take = (c: Card) => {
    const i = rest.indexOf(c);
    assert.ok(i >= 0, c);
    rest.splice(i, 1);
    return c;
  };
  return { st, S, take, rest };
}

describe('Shithead: Spielbarkeit', () => {
  const st = newState('h', 'A');
  st.game = 'shithead';
  const can = (pile: Card[], r: string, rules?: Partial<ShRules>) => {
    if (rules) Object.assign(st.rules.sh, rules);
    return shCanPlay({ rules: st.rules, sh: { pile } }, r);
  };
  it('kennt die Sonderkarten', () => {
    expect(can([], '4')).toBe(true);
    expect(can(['H9'], '9')).toBe(true);
    expect(can(['H9'], '8')).toBe(false);
    expect(can(['H9'], 'B')).toBe(true);
    expect(can(['H9'], '2')).toBe(true);
    expect(can(['H9'], '10')).toBe(true);
    expect(can(['HA'], '3')).toBe(true);
    expect(can(['H2'], '4')).toBe(true); // nach 2 alles
    expect(can(['H7'], '8')).toBe(false);
    expect(can(['H7'], '7')).toBe(true);
    expect(can(['H7'], '4')).toBe(true);
    expect(can(['H7'], '10')).toBe(true);
    expect(can(['HK', 'S3'], 'D')).toBe(false); // 3 durchsichtig
    expect(can(['HK', 'S3'], 'A')).toBe(true);
    expect(can(['H7', 'S3', 'C3'], '9')).toBe(false); // 7 wirkt durch die 3
    expect(can(['S3'], '4')).toBe(true); // nur 3er: alles
  });
  it('behandelt die 3 ohne Sonderregel wie eine normale Karte', () => {
    expect(can(['HK'], '3', { three: false })).toBe(false);
    expect(can(['H9', 'S3'], '4')).toBe(true);
    expect(can(['H9', 'S5'], '4')).toBe(false);
  });
});

describe('Shithead: 4er-Start und Bombe', () => {
  it('öffnet das 4er-Fenster und lässt nur den Gastgeber es schließen', () => {
    const { st, S, take, rest } = shTable(['h', 'p1'], 77);
    const rng = rngF(1);
    S.P.h.hand = ['C4', 'H9', 'SK'].map(take);
    S.P.p1.hand = ['D4', 'S4', 'H5'].map(take);
    S.P.h.up = ['HA', 'SA', 'DA'].map(take);
    S.P.p1.up = ['CA', 'HK', 'DK'].map(take);
    S.P.h.down = ['C9', 'D9', 'S9'].map(take);
    S.P.p1.down = ['CK', 'C8', 'D8'].map(take);
    S.deck = rest;
    act(st, 'h', { type: 'shready' }, rng);
    act(st, 'p1', { type: 'shready' }, rng);
    expect(st.phase).toBe('play');
    assert.ok(S.win, 'Fenster offen');
    expect(S.win.r).toBe('4');
    expect(st.players[st.turn].id).toBe('p1');
    expect(S.pile).toEqual(['D4', 'S4']);
    expect(S.P.p1.hand).toHaveLength(3);
    expect(act(st, 'p1', { type: 'shplay', from: 'hand', idx: [0] }, rng)).not.toBeNull();
    expect(act(st, 'p1', { type: 'shthrow' }, rng)).not.toBeNull();
    expect(act(st, 'h', { type: 'shthrow' }, rng)).toBeNull();
    expect(S.pile).toEqual(['D4', 'S4', 'C4']);
    expect(S.P.h.hand.some((c) => rank(c) === '4')).toBe(false);
    expect(act(st, 'h', { type: 'shthrow' }, rng)).not.toBeNull();
    const id = S.win.id;
    act(st, 'p1', { type: 'shwinend', id }, rng);
    expect(S.win).toBeTruthy();
    act(st, 'h', { type: 'shwinend', id: id + 1 }, rng);
    expect(S.win).toBeTruthy();
    act(st, 'h', { type: 'shwinend', id }, rng);
    expect(S.win).toBeNull();
    expect(st.players[st.turn].id).toBe('h');

    // Bombe außer der Reihe
    S.pile = ['H7', 'S7'];
    S.burned = [];
    S.P.h.hand = ['C7', 'D7', 'HK'];
    S.P.p1.hand = ['H8', 'S8', 'DD'];
    st.turn = 1;
    expect(shCanBomb(st, 'h')?.idx).toHaveLength(2);
    expect(shCanBomb(st, 'p1')).toBeNull();
    expect(act(st, 'h', { type: 'shbomb' }, rng)).toBeNull();
    expect(S.pile).toHaveLength(0);
    expect(S.burned).toHaveLength(4);
    expect(st.players[st.turn].id).toBe('h');
    expect(act(st, 'p1', { type: 'shbomb' }, rng)).not.toBeNull();
    const burn = st.log.filter((x) => x.k === 'shburn').pop();
    expect(burn).toMatchObject({ four: true, cut: true });

    // Regel aus
    S.pile = ['H8', 'S8'];
    S.P.p1.hand = ['C8', 'D8', 'HK'];
    st.rules.sh.cut = false;
    expect(shCanBomb(st, 'p1')).toBeNull();
    st.rules.sh.cut = true;
    expect(shCanBomb(st, 'p1')).not.toBeNull();
  });

  it('macht aus vier 4ern beim Start eine Bombe, der letzte Werfer spielt weiter', () => {
    const { st, S, take, rest } = shTable(['h', 'p1', 'p2'], 78);
    const rng = rngF(2);
    S.P.h.hand = ['C4', 'H4', 'SK'].map(take);
    S.P.p1.hand = ['D4', 'H9', 'H5'].map(take);
    S.P.p2.hand = ['S4', 'S9', 'S5'].map(take);
    ['h', 'p1', 'p2'].forEach((id) => {
      S.P[id].up = rest.splice(0, 3);
      S.P[id].down = rest.splice(0, 3);
    });
    S.deck = rest;
    st.players.forEach((p) => act(st, p.id, { type: 'shready' }, rng));
    assert.ok(S.win);
    const starter = st.players[st.turn].id;
    const others = ['h', 'p1', 'p2'].filter((x) => x !== starter);
    others.forEach((id) => expect(act(st, id, { type: 'shthrow' }, rng)).toBeNull());
    expect(S.win).toBeNull();
    expect(S.pile).toHaveLength(0);
    expect(S.burned).toHaveLength(4);
    expect(st.players[st.turn].id).toBe(others[1]);
  });
});

describe('Shithead: zufällige Partien', () => {
  it('spielt 3000 Partien mit allen Regelkombinationen fehlerfrei durch', () => {
    const stats = { games: 0, burn10: 0, burn4: 0, blind: 0, blindfail: 0, win: 0, thrown: 0, bomb: 0 };
    for (let g = 0; g < 3000; g++) {
      const rng = rngF(500 + g);
      const n = 2 + (g % 3);
      const st = newState('h', 'Host');
      for (let i = 1; i < n; i++) addPlayer(st, `p${i}`, `P${i}`);
      act(st, 'h', { type: 'game', game: 'shithead' }, rng);
      const sh: Partial<ShRules> = {
        two: g % 2 === 0,
        three: g % 3 !== 0,
        seven: g % 5 !== 0,
        ten: g % 7 !== 0,
        eight: g % 4 === 0,
        four: g % 6 !== 0,
        cut: g % 5 !== 1,
      };
      act(st, 'h', { type: 'rules', rules: { sh } }, rng);
      assert.equal(act(st, 'h', { type: 'start' }, rng), null);
      assert.equal(st.phase, 'swap');
      shCardsOk(st);
      for (const p of st.players) {
        if (rng() < 0.7) {
          const a: Action = { type: 'shswap', h: Math.floor(rng() * 3), u: Math.floor(rng() * 3) };
          assert.equal(act(st, p.id, a, rng), null);
        }
        assert.ok(act(st, p.id, { type: 'shpickup' }, rng), 'vor dem Start kein Spielzug');
        act(st, p.id, { type: 'shready' }, rng);
      }
      assert.equal(st.phase, 'play');
      shCardsOk(st);
      let steps = 0;
      while (st.phase === 'play') {
        const S = st.sh as ShState;
        if (S.win) {
          stats.win++;
          assert.ok(act(st, st.players[st.turn].id, { type: 'shpickup' }, rng), 'im Fenster gesperrt');
          for (const p of st.players) {
            if (S.win && shCanThrow(st, p.id) && rng() < 0.6) {
              assert.equal(act(st, p.id, { type: 'shthrow' }, rng), null);
              stats.thrown++;
              shCardsOk(st);
            }
          }
          if (S.win) assert.equal(act(st, 'h', { type: 'shwinend', id: S.win.id }, rng), null);
          assert.ok(!S.win);
          shCardsOk(st);
          continue;
        }
        if (rng() < 0.5) {
          const bomber = st.players.find((p) => p.id !== st.players[st.turn].id && shCanBomb(st, p.id));
          if (bomber) {
            assert.equal(act(st, bomber.id, { type: 'shbomb' }, rng), null);
            stats.bomb++;
            if (st.phase !== 'play') break;
            assert.equal(S.pile.length, 0);
            shCardsOk(st);
          }
        }
        steps++;
        assert.ok(steps < 20000, 'Partie endet nie');
        const tp = st.players[st.turn];
        const P = S.P[tp.id];
        assert.ok(!tp.out && !S.finished.includes(tp.id), 'Zug bei fertigem Spieler');
        const o = st.players.find((x) => x.id !== tp.id);
        assert.ok(o && act(st, o.id, { type: 'shpickup' }, rng), 'andere dürfen nicht ziehen');
        const before = st.n;
        const r = rng();
        if (P.hand.length || P.up.length) {
          const src = P.hand.length ? 'hand' : 'up';
          const arr = P[src];
          const playable = arr.map((c, i) => [c, i] as const).filter(([c]) => shCanPlay(st, rank(c)));
          if (!playable.length && !S.pile.length) throw new Error('festgefahren');
          if (playable.length && r < (g % 10 === 0 ? 0.9 : 1.01)) {
            const [c, i] = playable[Math.floor(rng() * playable.length)];
            const same = arr.flatMap((x, j) => (rank(x) === rank(c) ? [j] : []));
            assert.equal(act(st, tp.id, { type: 'shplay', from: src, idx: rng() < 0.5 ? same : [i] }, rng), null);
          } else if (S.pile.length) {
            assert.equal(act(st, tp.id, { type: 'shpickup' }, rng), null);
          }
        } else {
          assert.ok(P.down.length > 0, 'keine Karten, aber nicht fertig');
          assert.equal(act(st, tp.id, { type: 'shblind', i: Math.floor(rng() * P.down.length) }, rng), null);
        }
        st.log
          .filter((e) => e.n > before)
          .forEach((e) => {
            if (e.k === 'shburn') stats[e.four ? 'burn4' : 'burn10']++;
            if (e.k === 'shplay' && e.src === 'down') stats.blind++;
            if (e.k === 'shblindfail') stats.blindfail++;
          });
        if (st.phase === 'play') shCardsOk(st);
      }
      assert.equal(st.phase, 'over');
      const S = st.sh as ShState;
      const loser = S.shithead;
      assert.ok(loser, 'kein Shithead');
      assert.equal(S.finished.length, n - 1);
      assert.ok(!S.finished.includes(loser));
      const LP = S.P[loser];
      assert.ok(LP.hand.length + LP.up.length + LP.down.length > 0, 'Shithead ohne Karten');
      assert.equal(st.players.find((p) => p.id === loser)?.shc, 1);
      const v = viewFor(st, 'h');
      assert.ok(Array.isArray(v.sh?.P[st.players[1].id].hand), 'am Ende ist alles offen');
      st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
      assert.equal(st.phase, 'swap');
      shCardsOk(st);
      stats.games++;
    }
    expect(stats.games).toBe(3000);
    expect(stats.burn10).toBeGreaterThan(0);
    expect(stats.burn4).toBeGreaterThan(0);
    expect(stats.blindfail).toBeGreaterThan(0);
    expect(stats.win).toBeGreaterThan(0);
    expect(stats.thrown).toBeGreaterThan(0);
    expect(stats.bomb).toBeGreaterThan(0);
  });

  it('versteckt Hand und verdeckte Karten während des Spiels', () => {
    const rng = rngF(3);
    const st = newState('h', 'H');
    addPlayer(st, 'p1', 'A');
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const v = viewFor(st, 'p1');
    const S = st.sh as ShState;
    expect(typeof v.sh?.P.h.hand).toBe('number');
    expect(Array.isArray(v.sh?.P.p1.hand)).toBe(true);
    expect(typeof v.sh?.P.p1.down).toBe('number');
    expect(typeof v.sh?.deck).toBe('number');
    const js = JSON.stringify(v);
    [...S.P.h.down, ...S.P.p1.down, ...S.P.h.hand].forEach((c) => expect(js).not.toContain(`"${c}"`));
  });

  it('bleibt nie hängen, wenn jemand geht oder offline ist', () => {
    let quitOk = 0;
    for (let g = 0; g < 1500; g++) {
      const rng = rngF(9000 + g);
      const n = 2 + (g % 3);
      const st = newState('h', 'H');
      for (let i = 1; i < n; i++) addPlayer(st, `p${i}`, `P${i}`);
      act(st, 'h', { type: 'game', game: 'shithead' }, rng);
      act(st, 'h', { type: 'start' }, rng);
      const quitAt = Math.floor(rng() * 40);
      let steps = 0;
      let quitted = false;
      if (rng() < 0.3) {
        quitPlayer(st, 'p1', rng);
        quitted = true;
      }
      st.players.forEach((p) => {
        if (!p.out) act(st, p.id, { type: 'shready' }, rng);
      });
      while (st.phase === 'play' && steps < 20000) {
        const S = st.sh as ShState;
        if (S.win) {
          act(st, 'h', { type: 'shwinend', id: S.win.id }, rng);
          continue;
        }
        steps++;
        if (!quitted && steps === quitAt) {
          quitPlayer(st, `p${1 + Math.floor(rng() * (n - 1))}`, rng);
          quitted = true;
          continue;
        }
        const tp = st.players[st.turn];
        const n0 = st.n;
        if (tp.id !== 'h') {
          tp.online = false;
          assert.equal(act(st, 'h', { type: 'skip' }, rng), null);
          tp.online = true;
        } else {
          const P = S.P.h;
          const src = P.hand.length ? 'hand' : P.up.length ? 'up' : null;
          if (!src) act(st, 'h', { type: 'shblind', i: 0 }, rng);
          else {
            const pl = P[src].map((c, i) => [c, i] as const).filter(([c]) => shCanPlay(st, rank(c)));
            if (pl.length) {
              const idx = [pl[Math.floor(rng() * pl.length)][1]];
              assert.equal(act(st, 'h', { type: 'shplay', from: src, idx }, rng), null);
            } else assert.equal(act(st, 'h', { type: 'shpickup' }, rng), null);
          }
        }
        assert.ok(st.n > n0 || st.phase !== 'play', 'kein Fortschritt');
        if (st.phase === 'play') shCardsOk(st);
      }
      if (st.phase === 'play') continue; // sehr lange Partie, kein Fehler
      assert.equal(st.phase, 'over', `hängt nach Verlassen: ${st.phase}`);
      quitOk++;
    }
    expect(quitOk).toBeGreaterThan(1450);
  });
});
