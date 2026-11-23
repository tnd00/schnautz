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

/** Nimmt eine Karte dort weg, wo sie liegt. Bei Spielern rückt eine Karte vom Nachziehstapel nach. */
function takeCard(S: ShState, c: Card): void {
  for (const arr of [S.deck, S.burned, S.pile]) {
    const i = arr.indexOf(c);
    if (i >= 0) {
      arr.splice(i, 1);
      return;
    }
  }
  for (const P of Object.values(S.P)) {
    for (const arr of [P.hand, P.up, P.down]) {
      const i = arr.indexOf(c);
      if (i >= 0) {
        arr[i] = S.deck.pop() as Card;
        return;
      }
    }
  }
  throw new Error(`Karte ${c} nicht gefunden`);
}

/** Gibt einem Spieler genau diese Handkarten, alle 52 Karten bleiben im Spiel. */
function give(S: ShState, pid: string, hand: Card[]): void {
  const P = S.P[pid];
  S.deck.push(...P.hand);
  P.hand = [];
  hand.forEach((c) => takeCard(S, c));
  P.hand = hand.slice();
}

function setPile(S: ShState, cards: Card[]): void {
  S.burned.push(...S.pile);
  S.pile = [];
  cards.forEach((c) => takeCard(S, c));
  S.pile = cards.slice();
}

/** Alle machen in der Tauschrunde sofort fertig. */
function readyAll(st: State, rng: () => number): void {
  st.players.forEach((p) => act(st, p.id, { type: 'shready' }, rng));
}

describe('Shithead: 4er reinwerfen und Bombe', () => {
  it('öffnet am Anfang ein Fenster, die Person am Zug wartet die Sperre ab', () => {
    const { st, S, take, rest } = shTable(['h', 'p1'], 77);
    const rng = rngF(1);
    S.P.h.hand = ['C4', 'H9', 'SK'].map(take);
    S.P.p1.hand = ['D4', 'S4', 'H5'].map(take);
    S.P.h.up = ['HA', 'SA', 'DA'].map(take);
    S.P.p1.up = ['CA', 'HK', 'DK'].map(take);
    S.P.h.down = ['C9', 'D9', 'S9'].map(take);
    S.P.p1.down = ['CK', 'C8', 'D8'].map(take);
    S.deck = rest;
    readyAll(st, rng);
    expect(st.phase).toBe('play');
    // Beide haben eine 4, p1 sitzt in dieser Partie vorne und fängt an
    expect(st.players[st.turn].id).toBe('p1');
    assert.ok(S.win, 'Fenster offen');
    expect(S.win.lock).toBe(true);
    expect(S.pile).toEqual([]);
    expect(act(st, 'p1', { type: 'shplay', from: 'hand', idx: [0] }, rng)).toMatch(/warten/);
    // Auch wer dran ist, dürfte reinwerfen, muss aber nicht
    expect(shCanThrow(st, 'p1')).toEqual({ src: 'hand', idx: [0, 1] });
    expect(shCanThrow(st, 'h')).toEqual({ src: 'hand', idx: [0] });

    // Reinwerfen ändert nichts an der Reihenfolge
    expect(act(st, 'h', { type: 'shthrow' }, rng)).toBeNull();
    expect(S.pile).toEqual(['C4']);
    expect(S.win.by).toEqual(['h']);
    expect(st.players[st.turn].id).toBe('p1');
    expect(S.P.h.hand.some((c) => rank(c) === '4')).toBe(false);
    expect(act(st, 'h', { type: 'shthrow' }, rng)).toMatch(/keine 4/);

    // Nur der Gastgeber hebt die Sperre auf und nur für dieses Fenster
    const id = S.win.id;
    act(st, 'p1', { type: 'shunlock', id }, rng);
    expect(S.win.lock).toBe(true);
    act(st, 'h', { type: 'shunlock', id: id + 1 }, rng);
    expect(S.win.lock).toBe(true);
    act(st, 'h', { type: 'shunlock', id }, rng);
    expect(S.win.lock).toBe(false);

    // Die erste Karte schließt das Fenster, auch wenn es eine normale 4 ist
    const fours = S.P.p1.hand.flatMap((c, i) => (rank(c) === '4' ? [i] : []));
    expect(act(st, 'p1', { type: 'shplay', from: 'hand', idx: fours }, rng)).toBeNull();
    expect(S.win).toBeNull();
    expect(S.pile).toEqual(['C4', 'D4', 'S4']);
    expect(st.players[st.turn].id).toBe('h');
    expect(act(st, 'h', { type: 'shthrow' }, rng)).toMatch(/Zu spät/);
  });

  it('lässt auch die Person am Zug reinwerfen, danach spielt sie normal', () => {
    const { st, S } = shTable(['h', 'p1', 'p2'], 81);
    const rng = rngF(5);
    readyAll(st, rng);
    assert.ok(S.win);
    st.turn = 1;
    give(S, 'p1', ['C4', 'H9', 'SK']);
    shCardsOk(st);
    expect(act(st, 'p1', { type: 'shthrow' }, rng)).toBeNull();
    expect(S.pile).toEqual(['C4']);
    expect(st.players[st.turn].id).toBe('p1');
    expect(S.win.by).toEqual(['p1']);
    // Die Sperre gilt weiter, gespielt wird erst danach
    const nine = () => S.P.p1.hand.indexOf('H9');
    expect(act(st, 'p1', { type: 'shplay', from: 'hand', idx: [nine()] }, rng)).toMatch(/warten/);
    act(st, 'h', { type: 'shunlock', id: S.win.id }, rng);
    expect(act(st, 'p1', { type: 'shplay', from: 'hand', idx: [nine()] }, rng)).toBeNull();
    expect(S.pile).toEqual(['C4', 'H9']);
    expect(S.win).toBeNull();
    expect(st.players[st.turn].id).toBe('p2');
    shCardsOk(st);
  });

  it('gibt weiter, wenn die Person am Zug mit dem Reinwerfen fertig wird', () => {
    const { st, S } = shTable(['h', 'p1', 'p2'], 82);
    const rng = rngF(6);
    readyAll(st, rng);
    assert.ok(S.win);
    st.turn = 1;
    const P = S.P.p1;
    // Nur noch eine offene 4 auf dem Tisch, sonst nichts
    const four = [...S.deck, ...Object.values(S.P).flatMap((x) => [...x.hand, ...x.up, ...x.down])].find(
      (c) => rank(c) === '4' && !P.up.includes(c),
    ) as Card;
    takeCard(S, four);
    S.burned.push(...S.deck, ...P.hand, ...P.up, ...P.down);
    S.deck = [];
    P.hand = [];
    P.up = [four];
    P.down = [];
    shCardsOk(st);
    expect(act(st, 'p1', { type: 'shthrow' }, rng)).toBeNull();
    expect(S.finished).toEqual(['p1']);
    expect(st.players[st.turn].id).toBe('p2');
    shCardsOk(st);
  });

  it('macht aus der vierten 4 eine Bombe, wer sie reinwirft, ist dran', () => {
    const { st, S } = shTable(['h', 'p1', 'p2'], 78);
    const rng = rngF(2);
    readyAll(st, rng);
    assert.ok(S.win);
    give(S, 'h', ['C4', 'H4', 'SK']);
    give(S, 'p1', ['H9', 'H5', 'HK']);
    give(S, 'p2', ['S4', 'D4', 'S5']);
    shCardsOk(st);
    st.turn = 1;
    expect(act(st, 'h', { type: 'shthrow' }, rng)).toBeNull();
    expect(S.pile).toEqual(['C4', 'H4']);
    expect(st.players[st.turn].id).toBe('p1');
    const oldId = S.win.id;
    expect(act(st, 'p2', { type: 'shthrow' }, rng)).toBeNull();
    expect(S.pile).toEqual([]);
    expect(S.burned).toHaveLength(4);
    expect(st.players[st.turn].id).toBe('p2');
    expect(st.log.filter((x) => x.k === 'shburn').pop()).toMatchObject({ p: 'p2', four: true, cut: true });
    // Nach der Bombe beginnt ein neuer Stapel mit neuem Fenster
    assert.ok(S.win, 'neues Fenster');
    expect(S.win.id).not.toBe(oldId);
    expect(S.win.lock).toBe(true);
    expect(S.win.by).toEqual([]);
    shCardsOk(st);
  });

  it('öffnet das Fenster nach 10, vier Gleichen, Aufnehmen und Bombe, aber nicht nach einer 2', () => {
    const { st, S } = shTable(['h', 'p1'], 79);
    const rng = rngF(3);
    readyAll(st, rng);
    const unlock = () => {
      if (S.win?.lock) act(st, 'h', { type: 'shunlock', id: S.win.id }, rng);
    };
    unlock();
    const tp = () => st.players[st.turn].id;

    // 2: kein neuer Stapel
    give(S, tp(), ['H2', 'S6', 'S7']);
    expect(act(st, tp(), { type: 'shplay', from: 'hand', idx: [0] }, rng)).toBeNull();
    expect(S.pile.length).toBeGreaterThan(0);
    expect(S.win).toBeNull();

    // Aufnehmen: Der Nächste beginnt einen neuen Stapel
    const picker = tp();
    expect(act(st, picker, { type: 'shpickup' }, rng)).toBeNull();
    expect(S.win?.lock).toBe(true);
    expect(tp()).not.toBe(picker);
    unlock();

    // 10 verbrennt: Wer sie gelegt hat, ist dran und wartet die Sperre ab
    const ten = tp();
    give(S, ten, ['H10', 'S6', 'S8']);
    expect(act(st, ten, { type: 'shplay', from: 'hand', idx: [0] }, rng)).toBeNull();
    expect(S.pile).toEqual([]);
    expect(S.win?.lock).toBe(true);
    expect(tp()).toBe(ten);
    unlock();

    // Bombe außer der Reihe
    S.win = null;
    setPile(S, ['H7', 'S7']);
    const other = st.players.find((p) => p.id !== tp())?.id as string;
    give(S, other, ['C7', 'D7', 'HK']);
    shCardsOk(st);
    expect(shCanBomb(st, other)?.idx).toHaveLength(2);
    expect(act(st, other, { type: 'shbomb' }, rng)).toBeNull();
    expect(tp()).toBe(other);
    // Eigene Abfrage, weil TypeScript nach S.win = null sonst kein Fenster mehr erwartet
    const win = (): ShState['win'] => S.win;
    expect(win()?.lock).toBe(true);

    // Regel aus: kein Fenster
    st.rules.sh.four = false;
    unlock();
    give(S, tp(), ['C10', 'S6', 'S9']);
    expect(act(st, tp(), { type: 'shplay', from: 'hand', idx: [0] }, rng)).toBeNull();
    expect(S.pile).toEqual([]);
    expect(S.win).toBeNull();
    shCardsOk(st);
  });

  it('wirft bei leerer Hand die 4 vom Tisch rein', () => {
    const { st, S } = shTable(['h', 'p1'], 80);
    const rng = rngF(4);
    readyAll(st, rng);
    assert.ok(S.win);
    const other = st.players.find((p) => p.id !== st.players[st.turn].id)?.id as string;
    const P = S.P[other];
    const four = [...S.deck, ...Object.values(S.P).flatMap((x) => x.hand)].find((c) => rank(c) === '4') ?? 'C4';
    if (!P.up.includes(four)) {
      takeCard(S, four);
      S.burned.push(P.up[0]);
      P.up[0] = four;
    }
    // Nachziehstapel und Hand sind leer, jetzt zählen die offenen Tischkarten
    S.burned.push(...S.deck, ...P.hand);
    S.deck = [];
    P.hand = [];
    shCardsOk(st);
    const t = shCanThrow(st, other);
    expect(t?.src).toBe('up');
    expect(act(st, other, { type: 'shthrow' }, rng)).toBeNull();
    expect(st.log.at(-1)).toMatchObject({ k: 'shthrow', src: 'up' });
    expect(P.up.includes(four)).toBe(false);
    shCardsOk(st);
  });

  it('kennt die Bombe außer der Reihe auch ohne Fenster', () => {
    const { st, S, take, rest } = shTable(['h', 'p1'], 81);
    const rng = rngF(5);
    readyAll(st, rng);
    S.win = null;
    S.pile = ['H7', 'S7'].map(take);
    S.P.h.hand = ['C7', 'D7', 'HK'].map(take);
    S.P.p1.hand = ['H8', 'S8', 'DD'].map(take);
    st.turn = 1;
    expect(shCanBomb(st, 'h')?.idx).toHaveLength(2);
    expect(shCanBomb(st, 'p1')).toBeNull();
    expect(act(st, 'h', { type: 'shbomb' }, rng)).toBeNull();
    expect(S.pile).toHaveLength(0);
    expect(st.players[st.turn].id).toBe('h');
    expect(act(st, 'p1', { type: 'shbomb' }, rng)).not.toBeNull();
    const burn = st.log.filter((x) => x.k === 'shburn').pop();
    expect(burn).toMatchObject({ four: true, cut: true });
    expect(rest.length).toBeGreaterThan(0);

    // Regel aus
    S.win = null;
    S.pile = ['H8', 'S8'];
    S.P.p1.hand = ['C8', 'D8', 'HK'];
    st.rules.sh.cut = false;
    expect(shCanBomb(st, 'p1')).toBeNull();
    st.rules.sh.cut = true;
    expect(shCanBomb(st, 'p1')).not.toBeNull();
  });

  it('zählt Partien, Siege, Plätze und Shithead pro Spiel', () => {
    const { st, S } = shTable(['h', 'p1'], 82);
    const rng = rngF(6);
    readyAll(st, rng);
    if (S.win) act(st, 'h', { type: 'shunlock', id: S.win.id }, rng);
    // Gastgeber hat nur noch eine Karte und legt sie: fertig, p1 ist Shithead
    S.burned.push(...S.deck, ...S.P.h.hand, ...S.P.h.up, ...S.P.h.down, ...S.pile);
    S.deck = [];
    S.pile = [];
    S.P.h.up = [];
    S.P.h.down = [];
    S.P.h.hand = [
      S.burned.splice(
        S.burned.findIndex((c) => rank(c) === '5'),
        1,
      )[0],
    ];
    st.turn = 0;
    S.win = null;
    expect(act(st, 'h', { type: 'shplay', from: 'hand', idx: [0] }, rng)).toBeNull();
    expect(st.phase).toBe('over');
    const [h, p1] = st.players;
    expect(h.stats?.shithead).toEqual({ games: 1, wins: 1, places: 1 });
    expect(p1.stats?.shithead).toEqual({ games: 1, wins: 0, places: 2 });
    expect(p1.shc).toBe(1);
    expect(h.stats?.schnautz).toBeUndefined();
  });

  it('hat 8 aussetzen standardmäßig an', () => {
    expect(newState('h', 'H').rules.sh.eight).toBe(true);
  });
});

describe('Shithead: zufällige Partien', () => {
  it('spielt 3000 Partien mit allen Regelkombinationen fehlerfrei durch', () => {
    const stats = { games: 0, burn10: 0, burn4: 0, blind: 0, blindfail: 0, win: 0, thrown: 0, bomb: 0, long: 0 };
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
          const turn0 = st.turn;
          for (const p of st.players) {
            if (S.win && st.phase === 'play' && shCanThrow(st, p.id) && rng() < 0.5) {
              const w0: number = S.win.id;
              assert.equal(act(st, p.id, { type: 'shthrow' }, rng), null);
              stats.thrown++;
              shCardsOk(st);
              // Ohne Bombe bleibt die Reihenfolge, außer wer dran war, ist damit fertig
              if (S.win?.id === w0 && !S.finished.includes(p.id))
                assert.equal(st.turn, turn0, 'Reinwerfen ändert die Reihenfolge');
            }
          }
          if (st.phase !== 'play') break;
        }
        if (S.win?.lock) {
          stats.win++;
          const tp = st.players[st.turn];
          assert.ok(act(st, tp.id, { type: 'shpickup' }, rng), 'Sperre gilt');
          if (!shCanThrow(st, tp.id)) assert.ok(act(st, tp.id, { type: 'shthrow' }, rng), 'ohne 4 kein Reinwerfen');
          assert.equal(act(st, 'h', { type: 'shunlock', id: S.win.id }, rng), null);
          assert.equal(S.win.lock, false);
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
            continue;
          }
        }
        steps++;
        // Wer wahllos legt, kann sich mit zwei Leuten im Kreis drehen. Das ist kein Fehler, darf aber selten sein
        if (steps >= 20000) break;
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
      if (st.phase === 'play') {
        stats.long++;
        continue;
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
    console.log('Shithead-Fuzz', stats);
    expect(stats.long).toBeLessThan(15);
    expect(stats.games + stats.long).toBe(3000);
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
        if (S.win?.lock) {
          act(st, 'h', { type: 'shunlock', id: S.win.id }, rng);
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
