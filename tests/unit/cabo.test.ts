import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act, fallbackMove } from '../../src/game/actions';
import { takeSeat } from '../../src/game/seats';
import { clockTurn } from '../../src/game/clock';
import { cbKamikaze, cbPower } from '../../src/game/cabo';
import { cbVal } from '../../src/game/cards';
import { reignOf } from '../../src/game/games';
import { addPlayer, newState } from '../../src/game/state';
import type { Action, CaboResult, Card, CbState, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { codeOf, msgOf, rngF } from './helpers';

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
    expect(['HA', 'C2', 'S10', 'DB', 'HD', 'CK', 'SK', 'HK', 'DK'].map(cbVal)).toEqual([
      1, 2, 10, 11, 12, 13, 13, 0, 0,
    ]);
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
    expect(msgOf(act(st, 'h', { type: 'cblook', ids: [C.P.h[0].id] }))).toBe('Wähle zwei deiner Karten.');
    expect(msgOf(act(st, 'h', { type: 'cblook', ids: [C.P.h[0].id, C.P.p1[0].id] }))).toBe('Wähle zwei deiner Karten.');
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
    expect(msgOf(act(st, b, { type: 'cbdiscard' }))).toBe('Eine Karte von der Ablage musst du tauschen.');
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
    expect(codeOf(act(st, a, { type: 'cbspy', to: b, id: C.P[b][0].id }))).toBe('cb.noSpy');
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

  it('merkt im Verlauf, welche Plätze angesehen oder getauscht wurden und ob der König die Krone verteidigt', () => {
    const { st, C } = table(2, 16, { target: 50 });
    const a = cur(st);
    const b = st.players.find((p) => p.id !== a)!.id;
    const ids = C.P[a].slice(0, 2).map((s) => s.id);
    act(st, a, { type: 'cblook', ids });
    expect([...st.log].reverse().find((e) => e.k === 'cblook')).toMatchObject({ p: a, ids });
    act(st, b, { type: 'cblook', ids: C.P[b].slice(0, 2).map((s) => s.id) });
    act(st, a, { type: 'cbdraw', from: 'deck' });
    const sid = C.P[a][3].id;
    act(st, a, { type: 'cbswap', ids: [sid] });
    expect([...st.log].reverse().find((e) => e.k === 'cbswap')).toMatchObject({ ids: [sid], ok: true });
    // Der amtierende König gewinnt noch einmal
    st.reigns = { cabo: { win: a, lose: null, game: 'cabo' } };
    st.players.find((p) => p.id === b)!.cbp = 45;
    C.P[a].forEach((s) => (s.c = 'HK'));
    C.P[b].forEach((s) => (s.c = 'S10'));
    act(st, b, { type: 'cbcabo' });
    act(st, a, { type: 'cbdraw', from: 'deck' });
    act(st, a, { type: 'cbdiscard' });
    if (C.power) act(st, a, { type: 'cbskip' });
    expect(st.phase).toBe('over');
    expect(st.log.find((e) => e.k === 'cbend')).toMatchObject({ p: a, again: true });
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
    expect(msgOf(act(off.st, 'h', { type: 'cbsnap', id: off.C.P.h[0].id }))).toBe('Schnappen ist an diesem Tisch aus.');
  });

  it('Schnappen mit gesehener Oberkarte: veraltet ohne Strafkarte und ohne Log, passend und ohne wie heute', () => {
    const { st, C } = table(2, 17, { snap: true });
    lookAll(st);
    const b = st.players.find((p) => p.id !== cur(st))!.id;
    const top = C.pile.at(-1)!;
    const wrong = C.P[b].find((s) => cbVal(s.c) !== cbVal(top))!;
    const before = { n: st.n, deck: C.deck.length, row: C.P[b].length, pile: C.pile.length };
    // Jemand hat inzwischen eine andere Karte abgelegt: verlorenes Rennen kostet nichts
    for (const stale of ['HA:2', C.deck[0], null, 7]) {
      const r = act(st, b, { type: 'cbsnap', id: wrong.id, top: stale as Card });
      expect(codeOf(r)).toBe('cb.snapLate');
      expect(msgOf(r)).toBe('Zu spät, oben liegt schon eine andere Karte.');
    }
    expect({ n: st.n, deck: C.deck.length, row: C.P[b].length, pile: C.pile.length }).toEqual(before);
    expect(wrong.up).toBeUndefined();
    // Dieselbe Oberkarte: daneben kostet wie heute eine Strafkarte
    expect(act(st, b, { type: 'cbsnap', id: wrong.id, top })).toBeNull();
    expect(wrong.up).toBe(true);
    expect(C.P[b]).toHaveLength(before.row + 1);
    cardsOk(st);
  });

  it('Ablage direkt auf eigene Karten: nehmen und tauschen in einem Aufruf, ungültig passiert nichts', () => {
    const { st, C } = table(3, 21);
    lookAll(st);
    const a = cur(st);
    const top = C.pile.at(-1)!;
    const slot = C.P[a][1];
    const old = slot.c;
    const other = st.players.find((p) => p.id !== a)!.id;
    const snapshot = JSON.stringify({ C, n: st.n, turn: st.turn });
    for (const into of [[], [C.P[other][0].id], [999], 'x', [slot.id, slot.id, 998]] as unknown[]) {
      expect(codeOf(act(st, a, { type: 'cbdraw', from: 'pile', into } as Action))).toBe('cb.pickSwap');
    }
    // into gibt es nur von der Ablage
    expect(codeOf(act(st, a, { type: 'cbdraw', from: 'deck', into: [slot.id] } as unknown as Action))).toBe(
      'any.unknown',
    );
    expect(JSON.stringify({ C, n: st.n, turn: st.turn })).toBe(snapshot);
    const n0 = st.n;
    expect(act(st, a, { type: 'cbdraw', from: 'pile', into: [slot.id] })).toBeNull();
    const fresh = st.log.filter((e) => e.n > n0);
    expect(fresh.map((e) => e.k)).toEqual(['cbdraw', 'cbswap']);
    expect(fresh[0]).toMatchObject({ p: a, from: 'pile', c: top });
    expect(fresh[1]).toMatchObject({ p: a, ok: true, ids: [slot.id], out: [old], up: true });
    expect(slot).toMatchObject({ c: top, up: true });
    expect(C.pile.at(-1)).toBe(old);
    expect(C.hold).toBeNull();
    expect(cur(st)).not.toBe(a);
    cardsOk(st);
  });
});

describe('Cabo: Grenzfälle', () => {
  it('ohne eigene Karten gibt es keine Ablage, nur den Stapel, und der Ersatzzug bleibt nicht hängen', () => {
    const { st, C } = table(2, 30, { snap: true });
    lookAll(st);
    const a = cur(st);
    C.P[a] = [];
    expect(codeOf(act(st, a, { type: 'cbdraw', from: 'pile' }))).toBe('cb.pileNoCards');
    expect(act(st, a, { type: 'cbdraw', from: 'deck' })).toBeNull();
    expect(act(st, a, { type: 'cbswap', ids: [1] })).not.toBeNull();
    // Der Ersatzzug legt ab und überspringt eine Fähigkeit
    fallbackMove(st, a);
    if (C.power) fallbackMove(st, a);
    expect(cur(st)).not.toBe(a);
  });

  it('mitten im eigenen Zug darf man nicht schnappen', () => {
    const { st, C } = table(2, 39, { snap: true });
    lookAll(st);
    const a = cur(st);
    act(st, a, { type: 'cbdraw', from: 'pile' });
    expect(msgOf(act(st, a, { type: 'cbsnap', id: C.P[a][0].id }))).toBe('Spiel erst deinen Zug zu Ende.');
    expect(act(st, a, { type: 'cbswap', ids: [C.P[a][0].id] })).toBeNull();
  });

  it('leert falsches Schnappen den Stapel, bevor jemand zieht, ist die Runde vorbei', () => {
    const { st, C } = table(2, 31, { snap: true });
    lookAll(st);
    const b = st.players.find((p) => p.id !== cur(st))!.id;
    const top = C.pile.at(-1)!;
    const wrong = C.P[b].find((s) => cbVal(s.c) !== cbVal(top))!;
    // Bis auf eine Karte wandert der Stapel unter die oberste Ablage
    C.pile.splice(C.pile.length - 1, 0, ...C.deck.splice(0, C.deck.length - 1));
    expect(C.pile.at(-1)).toBe(top);
    expect(C.deck).toHaveLength(1);
    expect(act(st, b, { type: 'cbsnap', id: wrong.id })).toBeNull();
    expect(C.deck).toHaveLength(0);
    expect(st.phase === 'end' || st.phase === 'over').toBe(true);
    cardsOk(st);
  });

  it('zeigt die Einblendung nur bis zum Ende des nächsten Zugs, bei Übernahme gar nicht', () => {
    const { st } = table(3, 32);
    lookAll(st);
    const h = 'h';
    expect(viewFor(st, h).cb?.reveal?.items).toHaveLength(2);
    // Zwei Züge später ist sie weg
    for (let k = 0; k < 2; k++) {
      const p = cur(st);
      act(st, p, { type: 'cbdraw', from: 'deck' });
      act(st, p, { type: 'cbdiscard' });
      if (st.cb?.power) act(st, p, { type: 'cbskip' });
    }
    expect(viewFor(st, h).cb?.reveal).toBeUndefined();
    const { st: s2 } = table(3, 33);
    lookAll(s2);
    s2.players[1].bot = true;
    takeSeat(s2, s2.players[1].id, 'Neu');
    expect(viewFor(s2, s2.players[1].id).cb?.reveal).toBeUndefined();
  });

  it('nimmt beim Spionieren und Blindtauschen nur echte fremde Reihen', () => {
    const { st, C } = table(2, 34);
    lookAll(st);
    const a = cur(st);
    C.power = { by: a, kind: 'spy', c: 'S9' };
    const id = C.P[a][0].id;
    for (const to of ['constructor', '__proto__', 'toString', [a], a] as unknown[])
      expect(msgOf(act(st, a, { type: 'cbspy', to, id } as unknown as Action))).toBe(
        'Wähle eine Karte von jemand anderem.',
      );
    C.power = { by: a, kind: 'swap', c: 'SB' };
    expect(msgOf(act(st, a, { type: 'cbblind', id, to: [a], oid: C.P[a][1].id } as unknown as Action))).toBe(
      'Wähle eine Karte von jemand anderem.',
    );
  });

  it('Gleichstand: Stichentscheid bestimmt auch die Plätze, ganz gleich bleibt der alte König im Amt', () => {
    /** Runde endet mit leerem Stapel, ohne Cabo: Die Summen sind die Punkte dieser Runde */
    const end = (sums: [number, number], before: [number, number]) => {
      const { st, C } = table(2, 35, { target: 50 });
      lookAll(st);
      const a = cur(st);
      const b = st.players.find((p) => p.id !== a)!.id;
      st.reigns = { cabo: { win: 'alt', lose: null, game: 'cabo' } };
      st.players.find((p) => p.id === a)!.cbp = before[0];
      st.players.find((p) => p.id === b)!.cbp = before[1];
      const hand = (n: number) => (n === 0 ? ['HK', 'DK', 'HK:2', 'DK:2'] : ['SA', 'CA', 'HA', `S${n - 3}`]);
      C.P[a].forEach((s, i) => (s.c = hand(sums[0])[i]));
      C.P[b].forEach((s, i) => (s.c = hand(sums[1])[i]));
      C.deck.splice(0, C.deck.length - 1);
      act(st, a, { type: 'cbdraw', from: 'deck' });
      act(st, a, { type: 'cbdiscard' });
      if (C.power) act(st, a, { type: 'cbskip' });
      return { st, a, b };
    };
    // Gleiche Gesamtpunkte, a hatte in der letzten Runde weniger
    const t1 = end([0, 7], [55, 48]);
    expect(t1.st.phase).toBe('over');
    expect(t1.st.winner).toBe(t1.a);
    expect(t1.st.players.map((p) => [p.id, p.place])).toEqual(
      expect.arrayContaining([
        [t1.a, 1],
        [t1.b, 2],
      ]),
    );
    // Ganz gleich: kein Sieger, die Krone bleibt beim alten König, niemand darf fordern
    const t2 = end([7, 7], [48, 48]);
    expect(t2.st.phase).toBe('over');
    expect(t2.st.winner).toBeNull();
    expect(reignOf(t2.st)?.win).toBe('alt');
    expect(t2.st.players.every((p) => p.place === 1)).toBe(true);
  });

  it('die Uhr gilt für den ganzen Zug, Schnappen setzt sie nicht zurück', () => {
    const { st, C } = table(3, 37, { snap: true });
    st.rules.turnSecs = 20;
    lookAll(st);
    const a = cur(st);
    const k0 = clockTurn(st).key;
    expect(clockTurn(st).ids).toEqual([a]);
    act(st, a, { type: 'cbdraw', from: 'deck' });
    expect(clockTurn(st).key).toBe(k0);
    // Jemand anderes schnappt daneben
    const b = st.players.find((p) => p.id !== a)!.id;
    const top = C.pile.at(-1)!;
    const wrong = C.P[b].find((s) => cbVal(s.c) !== cbVal(top));
    if (wrong) act(st, b, { type: 'cbsnap', id: wrong.id });
    expect(clockTurn(st).key).toBe(k0);
    act(st, a, { type: 'cbdiscard' });
    if (C.power) act(st, a, { type: 'cbskip' });
    expect(clockTurn(st).key).not.toBe(k0);
  });

  it('wer beim Ansehen einen KI-Platz übernimmt, sieht selbst zwei Karten an', () => {
    const { st } = table(3, 38);
    const seat = st.players[1];
    seat.bot = true;
    act(st, seat.id, { type: 'cblook', ids: st.cb!.P[seat.id].slice(0, 2).map((s) => s.id) });
    expect(seat.ready).toBe(true);
    takeSeat(st, seat.id, 'Neu');
    expect(seat.ready).toBe(false);
    expect(st.phase).toBe('peek');
  });

  it('zwei Kamikaze-Hände mit zwei Decks bekommen beide 0', () => {
    const { st, C } = table(7, 36);
    lookAll(st);
    const [x, y] = st.players.map((p) => p.id);
    C.P[x].forEach((s, i) => (s.c = ['HD', 'DD', 'SK', 'CK'][i]));
    C.P[y].forEach((s, i) => (s.c = ['HD:2', 'DD:2', 'SK:2', 'CK:2'][i]));
    // Alle anderen rufen nichts, der Stapel ist gleich leer
    C.deck.splice(0, C.deck.length - 1);
    const p = cur(st);
    act(st, p, { type: 'cbdraw', from: 'deck' });
    act(st, p, { type: 'cbdiscard' });
    if (C.power) act(st, p, { type: 'cbskip' });
    const r = st.result as CaboResult;
    expect(r.scores[x]).toBe(0);
    expect(r.scores[y]).toBe(0);
    st.players.slice(2).forEach((q) => expect(r.scores[q.id]).toBe(50));
  });
});

/** Alle erlaubten Züge (zufällig, ohne Wissen). */
function moves(st: State, pid: string): Action[] {
  const C = st.cb as CbState;
  const row = C.P[pid];
  const out: Action[] = [];
  if (!row) return out;
  if (st.phase === 'peek') {
    if (!st.players.find((p) => p.id === pid)?.ready)
      out.push({ type: 'cblook', ids: row.slice(0, 2).map((s) => s.id) });
    return out;
  }
  if (st.phase !== 'play') return out;
  const busy = C.hold?.by === pid || C.power?.by === pid;
  if (st.rules.cb.snap && C.pile.length && row.length && !busy) out.push({ type: 'cbsnap', id: row[0].id });
  if (cur(st) !== pid) return out;
  const others = st.players.filter((p) => p.id !== pid && C.P[p.id]?.length);
  if (C.power) {
    out.push({ type: 'cbskip' });
    if (C.power.kind === 'peek' && row.length) out.push({ type: 'cbpeek', id: row[0].id });
    if (C.power.kind === 'spy' && others.length)
      out.push({ type: 'cbspy', to: others[0].id, id: C.P[others[0].id][0].id });
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
  if (C.pile.length && row.length) out.push({ type: 'cbdraw', from: 'pile' });
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
        const pool = all
          .filter(([, a]) => a.type !== 'cbsnap' || rng() < 0.05)
          .filter(([, a]) => a.type !== 'cbcabo' || rng() < 0.08);
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

  // Lange Schleife: auf den CI-Rechnern dauert sie bis 80 s, deshalb eine eigene Zeitgrenze statt der 60 s aus vite.config.ts
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
  }, 180_000);

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
