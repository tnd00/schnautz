import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { quitPlayer } from '../../src/game/flow';
import { finishRound, handValue, startRound } from '../../src/game/schnautz';
import { activeList, addPlayer, newState } from '../../src/game/state';
import type { Action, Card, Rules, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { msgOf, rngF, schnautzResult } from './helpers';

function cardsOk(st: State): void {
  if (!['choose', 'play'].includes(st.phase)) return;
  const all: Card[] = [...st.deck, ...st.discard, ...st.middle, ...(st.spare ?? [])];
  Object.values(st.hands).forEach((h) => all.push(...h));
  assert.equal(new Set(all).size, all.length, 'doppelte Karten');
  assert.equal(all.length, 32, `Kartenzahl ${all.length}`);
}

describe('handValue', () => {
  const R = { feuer: true };
  const R0 = { feuer: false };
  it.each([
    [['HA', 'HK', 'H10'], R, 31, 'schnautz'],
    [['HA', 'SA', 'CA'], R, 33, 'feuer'],
    [['HA', 'SA', 'CA'], R0, 30.5, 'drei'],
    [['HB', 'SB', 'CB'], R, 30.5, 'drei'],
    [['H7', 'S8', 'C9'], R, 9, 'normal'],
    [['H7', 'H8', 'C9'], R, 15, 'normal'],
    [['D9', 'DA', 'S10'], R, 20, 'normal'],
    [['C10', 'CB', 'CD'], R, 30, 'normal'],
  ] as const)('%j zählt %#', (cards, rules, v, kind) => {
    const hv = handValue([...cards], rules);
    expect(hv.v).toBe(v);
    expect(hv.kind).toBe(kind);
  });
});

describe('Schnautz', () => {
  it('spielt 4000 zufällige Partien mit allen Regelkombinationen sauber durch', () => {
    const stats = { games: 0, rounds: 0, renews: 0, doubleLoss: 0 };
    for (let g = 0; g < 4000; g++) {
      const rng = rngF(g + 1);
      const n = 2 + (g % 3);
      const st = newState('h', 'Host');
      for (let i = 1; i < n; i++) assert.equal(addPlayer(st, `p${i}`, `P${i}`), null);
      const rules: Partial<Rules> = {
        lives: 1 + (g % 4),
        feuer: g % 2 === 0,
        dealerChoice: g % 3 !== 0,
        knockFirst: g % 5 === 0,
        knockDouble: g % 7 === 0,
      };
      assert.equal(act(st, 'h', { type: 'rules', rules }, rng), null);
      assert.notEqual(act(st, 'p1', { type: 'start' }, rng), null, 'nur der Gastgeber startet');
      assert.equal(act(st, 'h', { type: 'start' }, rng), null);
      let steps = 0;
      while (st.phase !== 'over') {
        steps++;
        assert.ok(steps < 20000, 'Partie endet nie');
        cardsOk(st);
        st.players.forEach((p) => assert.ok(p.lives >= 0));
        if (st.phase === 'choose') {
          const d = st.players[st.dealer].id;
          const other = st.players.find((p) => p.id !== d && !p.out);
          assert.ok(other);
          assert.ok(act(st, other.id, { type: 'keep' }, rng), 'nur der Geber entscheidet');
          assert.equal(act(st, d, { type: rng() < 0.5 ? 'keep' : 'take' }, rng), null);
        } else if (st.phase === 'play') {
          const pid = st.players[st.turn].id;
          assert.ok(!st.players[st.turn].out, 'Zug bei ausgeschiedenem Spieler');
          const other = st.players.find((p) => p.id !== pid && !p.out);
          assert.ok(other);
          assert.ok(act(st, other.id, { type: 'pass' }, rng), 'andere dürfen nicht ziehen');
          const r = rng();
          const a: Action =
            r < 0.45
              ? { type: 'swap', h: Math.floor(rng() * 3), m: Math.floor(rng() * 3) }
              : r < 0.55
                ? { type: 'swapAll' }
                : r < 0.85
                  ? { type: 'pass' }
                  : { type: 'knock' };
          const before = st.n;
          const err = act(st, pid, a, rng);
          if (err) {
            assert.equal(a.type, 'knock', `unerwarteter Fehler ${msgOf(err)}`);
            assert.equal(act(st, pid, { type: 'pass' }, rng), null);
          }
          if (st.log.some((e) => e.n > before && e.k === 'renew')) stats.renews++;
        } else if (st.phase === 'end') {
          stats.rounds++;
          const res = schnautzResult(st);
          Object.values(res.changes).forEach((c) => {
            if (c.n === 2) stats.doubleLoss++;
          });
          if (res.reason !== 'feuer' && res.losers.length) {
            const min = Math.min(...Object.values(res.vals).map((x) => x.v));
            res.losers.forEach((id) => assert.equal(res.vals[id].v, min));
          }
          for (const p of st.players) assert.equal(act(st, p.id, { type: 'ready' }, rng), null);
        }
      }
      assert.equal(activeList(st).length, 1, 'genau ein Sieger');
      assert.equal(st.winner, activeList(st)[0].id);
      for (const p of st.players) act(st, p.id, { type: 'ready' }, rng);
      assert.ok(['choose', 'play', 'end'].includes(st.phase), `neue Partie gestartet: ${st.phase}`);
      stats.games++;
    }
    expect(stats.games).toBe(4000);
    expect(stats.renews).toBeGreaterThan(0);
    expect(stats.doubleLoss).toBeGreaterThan(0);
  });

  it('versteckt fremde Karten in der Ansicht', () => {
    const rng = rngF(99);
    const st = newState('h', 'H');
    addPlayer(st, 'p1', 'A');
    act(st, 'h', { type: 'start' }, rng);
    const v = viewFor(st, 'p1');
    expect(Array.isArray(v.hands.p1)).toBe(true);
    expect(typeof v.hands.h).toBe('number');
    expect(typeof v.deck).toBe('number');
    expect(typeof v.spare).toBe('number');
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(st.hands.h));
  });

  it('erlaubt Klopfen erst nach der ersten Runde, danach hat jeder genau einen Zug', () => {
    const rng = rngF(5);
    const st = newState('h', 'H');
    addPlayer(st, 'p1', 'A');
    addPlayer(st, 'p2', 'B');
    act(st, 'h', { type: 'rules', rules: { dealerChoice: false, feuer: true } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    expect(st.phase).toBe('play');
    st.hands = { h: ['C7', 'S8', 'H9'], p1: ['C8', 'S9', 'D7'], p2: ['H7', 'D8', 'S7'] };
    st.middle = ['D9', 'C9', 'H8'];
    const turnId = () => st.players[st.turn].id;
    assert.ok(act(st, turnId(), { type: 'knock' }, rng), 'erste Runde: Klopfen verboten');
    for (let i = 0; i < 3; i++) act(st, turnId(), { type: 'pass' }, rng);
    expect(st.log.some((e) => e.k === 'renew')).toBe(true);
    st.middle = ['D10', 'C10', 'H10'];
    assert.equal(act(st, turnId(), { type: 'knock' }, rng), null);
    assert.ok(act(st, turnId(), { type: 'knock' }, rng), 'zweites Klopfen verboten');
    act(st, turnId(), { type: 'pass' }, rng);
    expect(st.phase).toBe('play');
    act(st, turnId(), { type: 'pass' }, rng);
    expect(st.phase).toBe('end');
    expect(schnautzResult(st).reason).toBe('knock');
  });

  it('bleibt nie hängen, wenn jemand mitten im Spiel geht', () => {
    for (let g = 0; g < 3000; g++) {
      const rng = rngF(1000 + g);
      const n = 2 + (g % 3);
      const st = newState('h', 'Host');
      for (let i = 1; i < n; i++) addPlayer(st, `p${i}`, `P${i}`);
      act(st, 'h', { type: 'rules', rules: { dealerChoice: g % 2 === 0, knockFirst: g % 3 === 0 } }, rng);
      act(st, 'h', { type: 'start' }, rng);
      const quitAt = Math.floor(rng() * 12);
      let steps = 0;
      let quitted = false;
      while (st.phase !== 'over' && steps < 3000) {
        steps++;
        if (!quitted && steps === quitAt + 1) {
          const cands = st.players.filter((p) => !p.out && p.id !== 'h');
          if (cands.length) {
            quitPlayer(st, cands[Math.floor(rng() * cands.length)].id, rng);
            quitted = true;
            continue;
          }
        }
        cardsOk(st);
        if (st.phase === 'choose') act(st, st.players[st.dealer].id, { type: 'keep' }, rng);
        else if (st.phase === 'play') {
          const tp = st.players[st.turn];
          assert.ok(!tp.out, 'Zug bei ausgeschiedenem Spieler nach Verlassen');
          const r = rng();
          const a: Action = r < 0.5 ? { type: 'swap', h: 0, m: 1 } : r < 0.8 ? { type: 'pass' } : { type: 'knock' };
          if (act(st, tp.id, a, rng)) act(st, tp.id, { type: 'pass' }, rng);
        } else if (st.phase === 'end') st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
      }
      assert.equal(st.phase, 'over', `Partie hängt nach Verlassen, Phase ${st.phase}`);
      assert.ok(st.result, 'vorbei ohne Ergebnis');
    }
  });

  it('lässt den Gastgeber für Offline-Spieler ziehen', () => {
    const rng = rngF(77);
    const st = newState('h', 'H');
    addPlayer(st, 'p1', 'A');
    act(st, 'h', { type: 'rules', rules: { dealerChoice: true } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    st.players[1].online = false;
    let guard = 0;
    while (st.phase === 'choose' || st.phase === 'play') {
      assert.ok(guard++ < 200, 'Endlosschleife');
      const actor = st.phase === 'choose' ? st.players[st.dealer] : st.players[st.turn];
      if (actor.id === 'p1') assert.equal(act(st, 'h', { type: 'skip' }, rng), null);
      else if (st.phase === 'choose') assert.equal(act(st, 'h', { type: 'keep' }, rng), null);
      else if (act(st, 'h', { type: 'knock' }, rng)) assert.equal(act(st, 'h', { type: 'pass' }, rng), null);
    }
    expect(['end', 'over']).toContain(st.phase);
  });

  it('lässt den letzten Verlierer anfangen, auch in der nächsten Partie', () => {
    const rng = rngF(41);
    const st = newState('h', 'H');
    addPlayer(st, 'p1', 'A');
    addPlayer(st, 'p2', 'B');
    act(st, 'h', { type: 'rules', rules: { dealerChoice: false, lives: 1 } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const turnId = () => st.players[st.turn].id;

    // p1 hat am wenigsten und fängt die nächste Runde an
    st.hands = { h: ['HA', 'HK', 'H9'], p1: ['C7', 'S8', 'D9'], p2: ['SA', 'SK', 'S7'] };
    finishRound(st, 'knock', 'h');
    expect(schnautzResult(st).losers).toEqual(['p1']);
    startRound(st, rng, false);
    expect(turnId()).toBe('p1');
    expect(st.players[st.dealer].id).toBe('h');
    expect(st.log.at(-1)).toMatchObject({ k: 'round', p: 'h', start: 'p1' });

    // Mit zweitem Blatt gibt der Platz davor und der Verlierer ist nach der Wahl dran
    st.rules.dealerChoice = true;
    st.hands = { h: ['C7', 'S8', 'D9'], p1: ['HA', 'HK', 'H9'], p2: ['SA', 'SK', 'S7'] };
    finishRound(st, 'knock', 'p1');
    startRound(st, rng, false);
    expect(st.phase).toBe('choose');
    expect(st.players[st.dealer].id).toBe('p2');
    act(st, 'p2', { type: 'keep' }, rng);
    expect(turnId()).toBe('h');

    // Gleichstand: niemand hat verloren, es geht reihum weiter
    st.rules.dealerChoice = false;
    st.hands = { h: ['C7', 'S8', 'D9'], p1: ['H7', 'S9', 'D8'], p2: ['S7', 'C8', 'H9'] };
    const dealer = st.dealer;
    finishRound(st, 'knock', 'p1');
    expect(schnautzResult(st).losers).toEqual([]);
    startRound(st, rng, false);
    expect(st.dealer).toBe((dealer + 1) % 3);

    // Ist der Verlierer raus, fängt der Nächste nach ihm an
    st.hands = { h: ['HA', 'HK', 'H9'], p1: ['SA', 'SK', 'S7'], p2: ['C7', 'S8', 'D9'] };
    st.players[2].lives = 0;
    finishRound(st, 'knock', 'h');
    expect(st.players[2].out).toBe(true);
    startRound(st, rng, false);
    expect(turnId()).toBe('h');

    // Neue Partie: Wer zuletzt verloren hat, fängt wieder an
    st.hands = { h: ['HA', 'HK', 'H9'], p1: ['C7', 'S8', 'D9'] };
    st.players[1].lives = 0;
    finishRound(st, 'knock', 'h');
    expect(st.phase).toBe('over');
    st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
    expect(st.phase).toBe('play');
    expect(turnId()).toBe('p1');
  });

  it('zählt Partien, Siege, verlorene Bierdeckel und 31 pro Spiel', () => {
    const rng = rngF(43);
    const st = newState('h', 'H');
    addPlayer(st, 'p1', 'A');
    act(st, 'h', { type: 'rules', rules: { dealerChoice: false, lives: 1 } }, rng);
    act(st, 'h', { type: 'start' }, rng);
    st.hands = { h: ['C7', 'S8', 'D9'], p1: ['HA', 'HK', 'H10'] };
    finishRound(st, 'schnautz', 'p1');
    st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
    st.hands = { h: ['C7', 'S8', 'D9'], p1: ['HA', 'HK', 'H9'] };
    finishRound(st, 'knock', 'p1');
    expect(st.phase).toBe('over');
    const [h, p1] = st.players;
    expect(h.stats?.schnautz).toEqual({ games: 1, wins: 0, coasters: 2 });
    expect(p1.stats?.schnautz).toEqual({ games: 1, wins: 1, hot: 1 });
    expect(h.stats?.shithead).toBeUndefined();

    // Wer mitten in der Partie geht, wird zur KI. Sie spielt unter dem Namen weiter und führt die Bilanz fort
    st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
    quitPlayer(st, 'p1', rng);
    expect(p1.bot).toBe(true);
    expect(p1.name).toBe('A');
    expect(st.phase).not.toBe('over');
    st.hands = { h: ['C7', 'S8', 'D9'], p1: ['HA', 'HK', 'H10'] };
    finishRound(st, 'schnautz', 'p1');
    st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
    st.hands = { h: ['C7', 'S8', 'D9'], p1: ['HA', 'HK', 'H9'] };
    finishRound(st, 'knock', 'p1');
    expect(st.phase).toBe('over');
    expect(h.stats?.schnautz).toMatchObject({ games: 2, wins: 0 });
    expect(p1.stats?.schnautz).toMatchObject({ games: 2, wins: 2 });
  });

  it('hängt bei doppelten Namen eine Zahl an', () => {
    const st = newState('h', 'Max');
    addPlayer(st, 'p1', 'max');
    expect(st.players[1].name).toBe('max 2');
  });
});
