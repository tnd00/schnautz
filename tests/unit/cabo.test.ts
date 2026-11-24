import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { cbKamikaze, cbPower } from '../../src/game/cabo';
import { cbVal } from '../../src/game/cards';
import { reignOf } from '../../src/game/games';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, Card, CbState, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { rngF } from './helpers';

/** Cabo-Tisch mit `n` Leuten, gestartet (Ansehen läuft). */
function table(n: number, seed: number, rules: { snap?: boolean; target?: number } = {}): { st: State; C: CbState } {
  const rng = rngF(seed);
  const st = newState('h', 'Host');
  act(st, 'h', { type: 'game', game: 'cabo' }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 0, seats: Math.max(4, n), cb: rules } }, rng);
  for (let i = 1; i < n; i++) addPlayer(st, `p${i}`, `P${i}`);
  assert.equal(st.players.length, n);
  assert.equal(act(st, 'h', { type: 'start' }, rng), null);
  assert.ok(st.cb);
  return { st, C: st.cb };
}

/** Alle sehen ihre ersten zwei Karten an, dann läuft die Runde. */
function lookAll(st: State): void {
  st.players.forEach((p) => act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) }));
}

function cardsOk(st: State): void {
  const C = st.cb as CbState;
  const all: Card[] = [...C.deck, ...C.pile, ...Object.values(C.P).flatMap((r) => r.map((s) => s.c))];
  if (C.hold) all.push(C.hold.c);
  assert.equal(all.length, 52 * C.decks, `Kartenzahl ${all.length}`);
  assert.equal(new Set(all).size, all.length, 'doppelte Karten');
}

const cur = (st: State) => st.players[st.turn].id;

describe('Cabo: Werte und Fähigkeiten', () => {
  it('zählt wie Cabo: Ass 1, Bube 11, Dame 12, schwarzer König 13, roter König 0', () => {
    expect(['HA', 'C2', 'S10', 'DB', 'HD', 'CK', 'SK', 'HK', 'DK'].map(cbVal)).toEqual([1, 2, 10, 11, 12, 13, 13, 0, 0]);
    expect(['H7', 'C8', 'S9', 'D10', 'HB', 'CD', 'SK', 'D6'].map(cbPower)).toEqual([
      'peek',
      'peek',
      'spy',
      'spy',
      'swap',
      'swap',
      null,
      null,
    ]);
    expect(cbKamikaze(['HD', 'CD', 'SK', 'CK'])).toBe(true);
    expect(cbKamikaze(['HD', 'CD', 'SK', 'HK'])).toBe(false);
  });
});

describe('Cabo: Runde', () => {
  it('gibt vier Karten, eine auf die Ablage, ab sieben Leuten zwei Decks, dann zwei ansehen', () => {
    for (const n of [2, 4, 6, 7, 8]) {
      const { st, C } = table(n, 10 + n);
      expect(C.decks).toBe(n >= 7 ? 2 : 1);
      Object.values(C.P).forEach((r) => expect(r).toHaveLength(4));
      expect(C.pile).toHaveLength(1);
      expect(st.phase).toBe('peek');
      cardsOk(st);
    }
    const { st, C } = table(3, 3);
    expect(act(st, 'h', { type: 'cblook', ids: [C.P.h[0].id] })).toBe('Wähle zwei deiner Karten.');
    expect(act(st, 'h', { type: 'cblook', ids: [C.P.h[0].id, C.P.p1[0].id] })).toBe('Wähle zwei deiner Karten.');
    expect(act(st, 'h', { type: 'cblook', ids: [C.P.h[1].id, C.P.h[3].id] })).toBeNull();
    // Die Einblendung bekommt nur, wer hingeschaut hat, Wissen nur die KI
    const vh = viewFor(st, 'h');
    expect(vh.cb?.reveal?.items.map((x) => x.c)).toEqual([C.P.h[1].c, C.P.h[3].c]);
    expect(vh.cb?.know).toBeUndefined();
    expect(viewFor(st, 'p1').cb?.reveal).toBeUndefined();
    expect(vh.cb?.P.h.every((s) => s.c === undefined)).toBe(true);
    lookAll(st);
    expect(st.phase).toBe('play');
  });

  it('zieht, tauscht und legt ab, die gezogene Karte sieht nur, wer zieht', () => {
    const { st, C } = table(3, 5);
    lookAll(st);
    const a = cur(st);
    const top = C.deck[C.deck.length - 1];
    expect(act(st, a, { type: 'cbdraw', from: 'deck' })).toBeNull();
    expect(viewFor(st, a).cb?.hold?.c).toBe(top);
    const other = st.players.find((p) => p.id !== a)!.id;
    expect(viewFor(st, other).cb?.hold?.c).toBeUndefined();
    const slot = C.P[a][2];
    const old = slot.c;
    expect(act(st, a, { type: 'cbswap', ids: [slot.id] })).toBeNull();
    expect(slot.c).toBe(top);
    expect(C.pile.at(-1)).toBe(old);
    expect(C.know[a][slot.id].c).toBe(top);
    expect(cur(st)).not.toBe(a);
    cardsOk(st);
    // Von der Ablage genommen liegt die Karte offen
    const b = cur(st);
    const pileTop = C.pile.at(-1)!;
    expect(act(st, b, { type: 'cbdraw', from: 'pile' })).toBeNull();
    expect(act(st, b, { type: 'cbdiscard' })).toBe('Eine Karte von der Ablage musst du tauschen.');
    act(st, b, { type: 'cbswap', ids: [C.P[b][0].id] });
    expect(C.P[b][0]).toMatchObject({ c: pileTop, up: true });
    expect(viewFor(st, a).cb?.P[b][0].c).toBe(pileTop);
  });

  it('tauscht mehrere gleiche auf einmal, daneben liegen sie offen und es gibt eine Strafkarte', () => {
    const { st, C } = table(2, 7);
    lookAll(st);
    const a = cur(st);
    C.P[a] = [
      { id: 101, c: 'H9' },
      { id: 102, c: 'S9' },
      { id: 103, c: 'D2' },
      { id: 104, c: 'C5' },
    ];
    C.deck = C.deck.filter((c) => !['H9', 'S9', 'D2', 'C5', 'HA'].includes(c));
    C.pile = C.pile.filter((c) => !['H9', 'S9', 'D2', 'C5', 'HA'].includes(c));
    C.deck.push('HA');
    act(st, a, { type: 'cbdraw', from: 'deck' });
    expect(act(st, a, { type: 'cbswap', ids: [101, 102] })).toBeNull();
    expect(C.P[a].map((s) => s.c)).toEqual(['HA', 'D2', 'C5']);
    expect(C.pile.slice(-2)).toEqual(['H9', 'S9']);
    // Nächster Zug für a: daneben
    const b = cur(st);
    act(st, b, { type: 'cbdraw', from: 'deck' });
    act(st, b, { type: 'cbdiscard' });
    if (C.power) act(st, b, { type: 'cbskip' });
    expect(cur(st)).toBe(a);
    act(st, a, { type: 'cbdraw', from: 'deck' });
    const held = C.hold!.c;
    expect(act(st, a, { type: 'cbswap', ids: [103, 104] })).toBeNull();
    expect(C.P[a].filter((s) => s.id === 103 || s.id === 104).every((s) => s.up)).toBe(true);
    expect(C.P[a]).toHaveLength(4);
    expect(C.pile.at(-1)).toBe(held);
    expect(st.log.find((e) => e.k === 'cbswap' && !e.ok)).toMatchObject({ pen: true });
  });

  it('Fähigkeiten: eigene und fremde ansehen, blind tauschen nimmt das Wissen mit', () => {
    const { st, C } = table(2, 9);
    lookAll(st);
    const a = cur(st);
    const b = st.players.find((p) => p.id !== a)!.id;
    const useCard = (c: Card) => {
      C.deck = C.deck.filter((x) => x !== c);
      C.pile = C.pile.filter((x) => x !== c);
      Object.values(C.P).forEach((r) => r.forEach((s) => s.c === c && (s.c = c === 'H7' ? 'D3' : 'D4')));
      C.deck.push(c);
    };
    useCard('H7');
    act(st, cur(st), { type: 'cbdraw', from: 'deck' });
    expect(act(st, a, { type: 'cbdiscard' })).toBeNull();
    expect(C.power?.kind).toBe('peek');
    expect(act(st, a, { type: 'cbspy', to: b, id: C.P[b][0].id })).toMatch(/9 oder 10/);
    expect(act(st, a, { type: 'cbpeek', id: C.P[a][3].id })).toBeNull();
    expect(viewFor(st, a).cb?.reveal?.items[0]).toMatchObject({ owner: a, slot: C.P[a][3].id });
    // b weiß, was auf seinem Platz 0 liegt, a tauscht blind dagegen: b weiß dann, was jetzt bei a liegt
    act(st, b, { type: 'cbdraw', from: 'deck' });
    act(st, b, { type: 'cbswap', ids: [C.P[b][1].id] });
    C.know[b] = { [C.P[b][0].id]: { c: C.P[b][0].c, t: C.t } };
    const bCard = C.P[b][0].c;
    useCard('HB');
    act(st, a, { type: 'cbdraw', from: 'deck' });
    act(st, a, { type: 'cbdiscard' });
    expect(C.power?.kind).toBe('swap');
    const myId = C.P[a][0].id;
    const myCard = C.P[a][0].c;
    expect(act(st, a, { type: 'cbblind', id: myId, to: b, oid: C.P[b][0].id })).toBeNull();
    expect(C.P[a][0].c).toBe(bCard);
    expect(C.P[b][0].c).toBe(myCard);
    expect(C.know[b][myId]?.c).toBe(bCard);
    cardsOk(st);
  });

  it('Cabo: alle anderen noch einmal, wer am wenigsten hat bekommt 0, sonst plus 10', () => {
    const { st, C } = table(3, 11);
    lookAll(st);
    const a = cur(st);
    C.P[a].forEach((s, i) => (s.c = ['HK', 'DK', 'HA', 'CA'][i]));
    expect(act(st, a, { type: 'cbcabo' })).toBeNull();
    expect(C.left).toHaveLength(2);
    for (let k = 0; k < 2; k++) {
      const p = cur(st);
      act(st, p, { type: 'cbdraw', from: 'deck' });
      act(st, p, { type: 'cbdiscard' });
      if (C.power) act(st, p, { type: 'cbskip' });
    }
    expect(st.phase).toBe('end');
    const r = st.result!;
    assert.ok(r.reason === 'cabo');
    expect(r.caller).toBe(a);
    expect(r.ok).toBe(true);
    expect(r.scores[a]).toBe(0);
    expect(st.log.some((e) => e.k === 'cbround')).toBe(true);
  });

  it('falsches Cabo kostet 10, Kamikaze gibt allen anderen 50, genau 100 fällt einmal auf 50', () => {
    const { st, C } = table(2, 13);
    lookAll(st);
    const a = cur(st);
    const b = st.players.find((p) => p.id !== a)!.id;
    C.P[a].forEach((s, i) => (s.c = ['S10', 'C10', 'D9', 'H9'][i]));
    C.P[b].forEach((s, i) => (s.c = ['HD', 'DD', 'SK', 'CK'][i]));
    st.players.find((p) => p.id === a)!.cbp = 50;
    act(st, a, { type: 'cbcabo' });
    act(st, b, { type: 'cbdraw', from: 'deck' });
    act(st, b, { type: 'cbdiscard' });
    if (C.power) act(st, b, { type: 'cbskip' });
    const r = st.result!;
    assert.ok(r.reason === 'cabo');
    // b hat Kamikaze: b 0, a 50, das geht vor dem falschen Cabo
    expect(r.kami).toBe(b);
    expect(r.scores).toEqual({ [a]: 50, [b]: 0 });
    // a hatte 50, jetzt genau 100: zurück auf 50
    expect(st.players.find((p) => p.id === a)!.cbp).toBe(50);
    expect(r.resets).toEqual([a]);
  });

  it('über den Zielpunkten ist die Partie vorbei: die wenigsten Punkte werden Cabo-König', () => {
    const { st, C } = table(2, 15, { target: 50 });
    lookAll(st);
    const a = cur(st);
    const b = st.players.find((p) => p.id !== a)!.id;
    st.players.find((p) => p.id === b)!.cbp = 45;
    C.P[a].forEach((s, i) => (s.c = ['HA', 'CA', 'D2', 'HK'][i]));
    C.P[b].forEach((s, i) => (s.c = ['S10', 'C10', 'D9', 'H9'][i]));
    act(st, a, { type: 'cbcabo' });
    act(st, b, { type: 'cbdraw', from: 'deck' });
    act(st, b, { type: 'cbdiscard' });
    if (C.power) act(st, b, { type: 'cbskip' });
    expect(st.phase).toBe('over');
    expect(st.winner).toBe(a);
    expect(reignOf(st)).toMatchObject({ win: a });
    expect(st.log.at(-1)?.k === 'rematch' || st.log.some((e) => e.k === 'cbend' && e.p === a)).toBe(true);
    expect(st.rematch?.can).toEqual([b]);
  });

  it('Schnappen: gleiche Karte fliegt raus, daneben offen plus Strafkarte, ohne Schalter gar nicht', () => {
    const { st, C } = table(2, 17, { snap: true });
    lookAll(st);
    const b = st.players.find((p) => p.id !== cur(st))!.id;
    const top = C.pile.at(-1)!;
    const same = C.P[b][0];
    const twin = [...C.deck].find((c) => cbVal(c) === cbVal(top))!;
    C.deck = C.deck.filter((c) => c !== twin);
    C.deck.unshift(same.c);
    same.c = twin;
    expect(act(st, b, { type: 'cbsnap', id: same.id })).toBeNull();
    expect(C.P[b]).toHaveLength(3);
    expect(C.pile.at(-1)).toBe(twin);
    const wrong = C.P[b].find((s) => cbVal(s.c) !== cbVal(twin))!;
    expect(act(st, b, { type: 'cbsnap', id: wrong.id })).toBeNull();
    expect(wrong.up).toBe(true);
    expect(C.P[b]).toHaveLength(4);
    cardsOk(st);
    const off = table(2, 18);
    lookAll(off.st);
    expect(act(off.st, 'h', { type: 'cbsnap', id: off.C.P.h[0].id })).toBe('Schnappen ist an diesem Tisch aus.');
  });
});

/** Alle erlaubten Züge (zufällig, ohne Wissen). */
function moves(st: State, pid: string): Action[] {
  const C = st.cb as CbState;
  const row = C.P[pid];
  const out: Action[] = [];
  if (!row) return out;
  if (st.phase === 'peek') {
    if (!st.players.find((p) => p.id === pid)?.ready) out.push({ type: 'cblook', ids: row.slice(0, 2).map((s) => s.id) });
    return out;
  }
  if (st.phase !== 'play') return out;
  if (st.rules.cb.snap && C.pile.length && row.length) out.push({ type: 'cbsnap', id: row[0].id });
  if (cur(st) !== pid) return out;
  const others = st.players.filter((p) => p.id !== pid && C.P[p.id]?.length);
  if (C.power) {
    out.push({ type: 'cbskip' });
    if (C.power.kind === 'peek' && row.length) out.push({ type: 'cbpeek', id: row[0].id });
    if (C.power.kind === 'spy' && others.length) out.push({ type: 'cbspy', to: others[0].id, id: C.P[others[0].id][0].id });
    if (C.power.kind === 'swap' && others.length && row.length)
      out.push({ type: 'cbblind', id: row[0].id, to: others[0].id, oid: C.P[others[0].id][0].id });
    return out;
  }
  if (C.hold) {
    row.forEach((s) => out.push({ type: 'cbswap', ids: [s.id] }));
    if (row.length >= 2) out.push({ type: 'cbswap', ids: [row[0].id, row[1].id] });
    if (C.hold.from === 'deck') out.push({ type: 'cbdiscard' });
    return out;
  }
  if (C.deck.length) out.push({ type: 'cbdraw', from: 'deck' });
  if (C.pile.length) out.push({ type: 'cbdraw', from: 'pile' });
  if (!C.cabo) out.push({ type: 'cbcabo' });
  return out;
}

describe('Cabo: zufällige Partien', () => {
  it('spielt 300 Partien mit 2 bis 8 Leuten zu Ende, Karten bleiben vollständig und Fremdes geheim', () => {
    const stats = { games: 0, rounds: 0, kami: 0, resets: 0, long: 0, snaps: 0 };
    for (let g = 0; g < 300; g++) {
      const n = 2 + (g % 7);
      const { st } = table(n, 2000 + g, { snap: g % 2 === 0, target: g % 3 === 0 ? 50 : 100 });
      const rng = rngF(9000 + g);
      let steps = 0;
      while (st.phase !== 'over' && steps < 20000) {
        steps++;
        if (st.phase === 'end') {
          st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
          stats.rounds++;
          continue;
        }
        const all = st.players.flatMap((p) => moves(st, p.id).map((a) => [p.id, a] as const));
        assert.ok(all.length, `festgefahren in ${st.phase}`);
        // Schnappen und Cabo selten, sonst endet nie etwas oder alles sofort
        const pool = all.filter(([, a]) => a.type !== 'cbsnap' || rng() < 0.05).filter(([, a]) => a.type !== 'cbcabo' || rng() < 0.08);
        const [pid, a] = (pool.length ? pool : all)[Math.floor(rng() * (pool.length || all.length))];
        assert.equal(act(st, pid, a, rng), null, `${a.type} von ${pid}`);
        if (a.type === 'cbsnap') stats.snaps++;
        if (st.cb) cardsOk(st);
        if (st.phase === 'play' && st.cb) {
          const v = viewFor(st, st.players[0].id);
          Object.entries(v.cb!.P).forEach(([id, row]) =>
            row.forEach((s, i) => {
              if (!st.cb!.P[id][i].up) assert.equal(s.c, undefined, 'verdeckte Karte sichtbar');
            }),
          );
          assert.equal(typeof v.cb!.deck, 'number');
        }
      }
      if (st.phase !== 'over') {
        stats.long++;
        continue;
      }
      stats.games++;
      stats.kami += st.log.filter((e) => e.k === 'cbround' && e.kami).length;
      stats.resets += st.log.filter((e) => e.k === 'cbreset').length;
      expect(st.players.some((p) => (p.cbp ?? 0) > st.rules.cb.target)).toBe(true);
    }
    console.log('Cabo-Fuzz', stats);
    expect(stats.long).toBe(0);
    expect(stats.snaps).toBeGreaterThan(0);
  });

  it('KIs spielen 100 Partien zu Ende, ohne abgelehnte Züge', () => {
    let cabos = 0;
    for (let g = 0; g < 100; g++) {
      const n = 2 + (g % 7);
      const { st } = table(n, 4000 + g, { snap: g % 2 === 0 });
      const rng = rngF(5000 + g);
      st.players.forEach((p) => (p.bot = true));
      let guard = 0;
      while (st.phase !== 'over' && guard++ < 20000) {
        if (st.phase === 'end') {
          st.players.forEach((p) => act(st, p.id, { type: 'ready' }, rng));
          continue;
        }
        let moved = false;
        for (const p of st.players) {
          const a = botDecide(viewFor(st, p.id), rng, 'normal');
          if (!a) continue;
          assert.equal(act(st, p.id, a, rng), null, `KI ${a.type} abgelehnt`);
          if (a.type === 'cbcabo') cabos++;
          moved = true;
          break;
        }
        assert.ok(moved, 'keine KI will etwas tun');
      }
      expect(st.phase).toBe('over');
    }
    expect(cabos).toBeGreaterThan(50);
  });

  it('bleibt nie hängen, wenn alle offline sind: Der Host überspringt sie', () => {
    for (let g = 0; g < 30; g++) {
      const { st } = table(2 + (g % 5), 6000 + g);
      const rng = rngF(g);
      st.players.forEach((p) => (p.online = false));
      let guard = 0;
      while (st.phase !== 'over' && guard++ < 5000) {
        // Offline zählt bereit nicht, der Host startet die nächste Runde selbst
        if (st.phase === 'end') {
          act(st, 'h', { type: 'force' }, rng);
          continue;
        }
        assert.equal(act(st, 'h', { type: 'skip' }, rng), null);
      }
      expect(st.phase).toBe('over');
    }
  });
});
