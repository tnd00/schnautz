import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { dkBeats, rankOf, suitOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { clockTurn } from '../../src/game/clock';
import { dkLive, dkTableRanks, dkWaiting } from '../../src/game/durak';
import { reignOf } from '../../src/game/games';
import { addPlayer, newState } from '../../src/game/state';
import { seatGuest, takeSeat } from '../../src/game/seats';
import type { Action, Card, DkState, State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { codeOf, msgOf, rngF } from './helpers';

/** Durak-Tisch mit `n` Leuten, gestartet. */
function table(n: number, seed: number, transfer = false): { st: State; D: DkState; rng: () => number } {
  const rng = rngF(seed);
  const st = newState('h', 'Host');
  act(st, 'h', { type: 'game', game: 'durak' }, rng);
  act(st, 'h', { type: 'rules', rules: { turnSecs: 20, seats: Math.max(4, n), dk: { transfer } } }, rng);
  for (let i = 1; i < n; i++) addPlayer(st, `p${i}`, `P${i}`);
  assert.equal(st.players.length, n);
  assert.equal(act(st, 'h', { type: 'start' }, rng), null);
  assert.ok(st.dk);
  return { st, D: st.dk, rng };
}

/** Alle Karten genau einmal im Spiel? */
function cardsOk(st: State): void {
  const D = st.dk as DkState;
  const all: Card[] = [...D.deck, ...D.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]))];
  Object.values(D.P).forEach((h) => all.push(...h));
  assert.equal(all.length + D.discard, D.size, `Kartenzahl ${all.length} + ${D.discard}`);
  assert.equal(new Set(all).size, all.length, 'doppelte Karten');
}

/** Alle erlaubten Züge einer Person (ohne Tipps). */
function moves(st: State, pid: string): Action[] {
  const D = st.dk as DkState;
  if (st.phase !== 'play' || !dkLive(st, pid)) return [];
  const hand = D.P[pid];
  const out: Action[] = [];
  const open = D.table.map((p, i) => [p, i] as const).filter(([p]) => !p.d);
  if (pid === D.def) {
    if (D.take || !open.length) return [];
    open.forEach(([p, i]) =>
      hand.forEach((c, j) => {
        if (dkBeats(c, p.a, suitOf(D.trump))) out.push({ type: 'dkdefend', a: i, i: j });
      }),
    );
    out.push({ type: 'dktake' });
    // Weiterschieben: vor dem ersten Schlagen, gleicher Wert, der Nächste muss genug Karten haben
    const ids = st.players.map((p) => p.id).filter((id) => dkLive(st, id));
    const nd = ids[(ids.indexOf(pid) + 1) % ids.length];
    const fresh = !D.table.some((p) => p.d);
    hand.forEach((c, j) => {
      const total = D.table.length + 1;
      if (st.rules.dk.transfer && fresh && rankOf(c) === rankOf(D.table[0].a) && total <= 6 && nd !== pid)
        if (D.P[nd].length >= total) out.push({ type: 'dktransfer', idx: [j] });
    });
    return out;
  }
  if (!D.table.length) {
    if (pid !== D.att) return [];
    hand.forEach((_, j) => out.push({ type: 'dkattack', idx: [j] }));
    return out;
  }
  const ranks = new Set(D.table.flatMap((p) => (p.d ? [rankOf(p.a), rankOf(p.d)] : [rankOf(p.a)])));
  if (D.table.length < D.limit && !D.done.includes(pid))
    hand.forEach((c, j) => ranks.has(rankOf(c)) && out.push({ type: 'dkattack', idx: [j] }));
  if ((D.take || !open.length) && hand.length && !D.done.includes(pid)) out.push({ type: 'dkpass' });
  return out;
}

describe('Durak: Geben und Anfang', () => {
  it('gibt 36 Karten bis sechs Leute und 52 ab sieben, sechs pro Hand, Trumpf unten', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const { st, D } = table(n, 10 + n);
      expect(D.size).toBe(n >= 7 ? 52 : 36);
      Object.values(D.P).forEach((h) => expect(h).toHaveLength(6));
      if (D.deck.length) expect(D.deck[0]).toBe(D.trump);
      else expect(D.P[st.players[n - 1].id]).toContain(D.trump);
      if (n <= 6) expect([...Object.values(D.P).flat(), ...D.deck].every((c) => !/^.[2-5]$/.test(c))).toBe(true);
      cardsOk(st);
      expect(st.phase).toBe('play');
      expect(D.def).toBe(st.players[(st.players.findIndex((p) => p.id === D.att) + 1) % n].id);
      expect(D.limit).toBe(6);
    }
  });

  it('lässt den niedrigsten Trumpf anfangen und greift danach zuerst den Durak an', () => {
    const { st, D } = table(4, 3);
    const ts = suitOf(D.trump);
    let low = '';
    let lo = 99;
    st.players.forEach((p) =>
      D.P[p.id].forEach((c) => {
        if (suitOf(c) === ts && SH_ORD[rankOf(c)] < lo) {
          lo = SH_ORD[rankOf(c)];
          low = p.id;
        }
      }),
    );
    if (low) expect(D.att).toBe(low);
    // Nächste Partie: Die Person vor dem Durak greift ihn an
    st.reigns = { durak: { win: 'p1', lose: 'p2', game: 'durak' } };
    st.phase = 'over';
    st.players.forEach((p) => act(st, p.id, { type: 'ready' }));
    expect(st.dk?.def).toBe('p2');
    expect(st.dk?.att).toBe('p1');
    expect(st.log.filter((e) => e.k === 'dkdeal').at(-1)).toMatchObject({ prev: true });
  });
});

describe('Durak: Angreifen, Schlagen, Aufnehmen', () => {
  const PASSED = 'Du hast gepasst. Nachlegen geht erst wieder bei einem neuen Wert oder wenn aufgenommen wird.';
  const PASSED_TAKE = 'Du hast gepasst. In diesen Angriff legst du nichts mehr nach.';
  function fixed(): { st: State; D: DkState } {
    const { st, D } = table(3, 7);
    // Feste Karten: Trumpf Herz, h greift p1 an, p2 legt nach
    D.trump = 'H6';
    D.deck = ['H6', 'C6', 'S6', 'D6', 'C9', 'CK', 'SB', 'DA', 'HK'];
    D.P.h = ['C7', 'S7', 'D9', 'DB', 'SK', 'H7'];
    D.P.p1 = ['C8', 'S9', 'D10', 'H8', 'HA', 'SD'];
    D.P.p2 = ['D7', 'S10', 'CB', 'CD', 'DK', 'H9'];
    D.att = 'h';
    D.def = 'p1';
    D.limit = 6;
    D.table = [];
    D.done = [];
    D.take = false;
    D.discard = 36 - 9 - 18;
    st.turn = 0;
    return { st, D };
  }

  it('erlaubt Angriff nur dem Angreifer mit gleichen Werten und Nachlegen nur mit Werten vom Tisch', () => {
    const { st, D } = fixed();
    expect(msgOf(act(st, 'p2', { type: 'dkattack', idx: [0] }))).toBe('Zuerst greift jemand anderes an.');
    expect(msgOf(act(st, 'p1', { type: 'dkattack', idx: [0] }))).toBe('Du verteidigst gerade.');
    expect(msgOf(act(st, 'h', { type: 'dkattack', idx: [0, 2] }))).toBe('Zusammen geht nur mit gleichem Wert.');
    expect(act(st, 'h', { type: 'dkattack', idx: [0, 1] })).toBeNull();
    expect(D.table.map((p) => p.a)).toEqual(['C7', 'S7']);
    expect(codeOf(act(st, 'p2', { type: 'dkattack', idx: [1] }))).toBe('dk.rankNotOnTable');
    expect(act(st, 'p2', { type: 'dkattack', idx: [0] })).toBeNull();
    expect(dkWaiting(st)).toEqual(['p1']);
    expect(clockTurn(st).ids).toEqual(['p1']);
    expect(msgOf(act(st, 'h', { type: 'dkpass' }))).toBe('Erst muss alles geschlagen sein.');
  });

  it('schlägt höher in derselben Farbe oder mit Trumpf, Trumpf nur mit höherem Trumpf', () => {
    expect(dkBeats('C8', 'C7', 'H')).toBe(true);
    expect(dkBeats('C6', 'C7', 'H')).toBe(false);
    expect(dkBeats('S9', 'C7', 'H')).toBe(false);
    expect(dkBeats('H6', 'CA', 'H')).toBe(true);
    expect(dkBeats('H8', 'H9', 'H')).toBe(false);
    expect(dkBeats('HA', 'H9', 'H')).toBe(true);
    const { st, D } = fixed();
    act(st, 'h', { type: 'dkattack', idx: [0] });
    expect(msgOf(act(st, 'p1', { type: 'dkdefend', a: 0, i: 1 }))).toBe('Die Karte schlägt das nicht.');
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0 })).toBeNull();
    expect(D.table[0]).toMatchObject({ a: 'C7', d: 'C8' });
    // Jetzt darf die 8 nachgelegt werden, aber nicht vom Verteidiger
    expect(act(st, 'h', { type: 'dkpass' })).toBeNull();
    expect(dkWaiting(st)).toEqual(['p2']);
    expect(act(st, 'p2', { type: 'dkpass' })).toBeNull();
    // Alle fertig: geschlagen, weg damit, der Verteidiger greift als Nächstes an
    expect(D.discard).toBe(9 + 2);
    expect(D.att).toBe('p1');
    expect(D.def).toBe('p2');
    expect(st.log.some((e) => e.k === 'dkbito' && e.p === 'p1' && e.cnt === 2)).toBe(true);
    // Nachziehen: Angreifer zuerst, Verteidiger zuletzt, alle wieder auf sechs
    expect(D.P.h).toHaveLength(6);
    expect(D.P.p1).toHaveLength(6);
    expect(D.deck).toHaveLength(9 - 2);
    cardsOk(st);
  });

  it('beim Aufnehmen dürfen alle noch nachlegen, dann setzt der Verteidiger aus', () => {
    const { st, D } = fixed();
    act(st, 'h', { type: 'dkattack', idx: [0] });
    expect(act(st, 'p1', { type: 'dktake' })).toBeNull();
    expect(D.take).toBe(true);
    expect(dkWaiting(st).sort()).toEqual(['h', 'p2']);
    expect(act(st, 'p2', { type: 'dkattack', idx: [0] })).toBeNull();
    expect(msgOf(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0 }))).toBe('Du nimmst schon auf.');
    act(st, 'h', { type: 'dkpass' });
    act(st, 'p2', { type: 'dkpass' });
    expect(D.P.p1).toEqual(expect.arrayContaining(['C7', 'D7']));
    expect(D.P.p1).toHaveLength(8);
    expect(D.att).toBe('p2');
    expect(D.def).toBe('h');
    expect(st.log.some((e) => e.k === 'dkpickup' && e.p === 'p1' && e.cnt === 2)).toBe(true);
    cardsOk(st);
  });

  it('gepasst bleibt, solange der Verteidiger mit Werten schlägt, die schon liegen', () => {
    const { st, D } = fixed();
    expect(act(st, 'h', { type: 'dkattack', idx: [0] })).toBeNull(); // C7
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'C7', c: 'C8' })).toBeNull(); // 8 ist neu
    expect(act(st, 'h', { type: 'dkpass' })).toBeNull();
    expect(act(st, 'p2', { type: 'dkattack', idx: [], cards: ['D7'] })).toBeNull();
    // Dieselbe Zahl noch einmal hebt das Passen nicht auf
    expect(D.done).toEqual(['h']);
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'D7', c: 'H8' })).toBeNull(); // 8 liegt schon
    expect(D.done).toEqual(['h']);
    expect(dkWaiting(st)).toEqual(['p2']);
    // h hat die Pik 7 und die 7 liegt, nachlegen darf h trotzdem nicht
    expect(msgOf(act(st, 'h', { type: 'dkattack', idx: [], cards: ['S7'] }))).toBe(PASSED);
    expect(act(st, 'p2', { type: 'dkpass' })).toBeNull();
    // Bito, ohne dass h ein zweites Mal passen muss
    expect(st.log.some((e) => e.k === 'dkbito' && e.p === 'p1' && e.cnt === 4)).toBe(true);
  });

  it('ein neuer Wert auf dem Tisch holt alle zurück', () => {
    const { st, D } = fixed();
    act(st, 'h', { type: 'dkattack', idx: [0] });
    act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'C7', c: 'C8' });
    act(st, 'h', { type: 'dkpass' });
    act(st, 'p2', { type: 'dkattack', idx: [], cards: ['D7'] });
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'D7', c: 'D10' })).toBeNull(); // 10 ist neu
    expect(D.done).toEqual([]);
    expect(dkWaiting(st).sort()).toEqual(['h', 'p2']);
    // Jetzt darf h wieder nachlegen, auch einen Wert, der schon vorher lag
    expect(act(st, 'h', { type: 'dkattack', idx: [], cards: ['S7'] })).toBeNull();
  });

  it('wer gepasst hat, legt erst nach dem Aufnehmen wieder nach, wer nicht gepasst hat, die ganze Zeit', () => {
    const { st, D } = fixed();
    act(st, 'h', { type: 'dkattack', idx: [0] }); // C7
    act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'C7', c: 'C8' });
    act(st, 'h', { type: 'dkpass' });
    // Dieselbe Zahl noch einmal hebt das Passen nicht auf
    expect(msgOf(act(st, 'h', { type: 'dkattack', idx: [], cards: ['S7'] }))).toBe(PASSED);
    expect(D.table).toHaveLength(1);
    // Wer nicht gepasst hat, darf weiter nachlegen, das Passen der anderen bleibt stehen
    expect(act(st, 'p2', { type: 'dkattack', idx: [], cards: ['D7'] })).toBeNull();
    expect(D.done).toEqual(['h']);
    expect(act(st, 'p1', { type: 'dktake' })).toBeNull();
    expect(D.done).toEqual([]);
    expect(dkWaiting(st).sort()).toEqual(['h', 'p2']);
    // Beim Aufnehmen dürfen alle wieder nachschieben
    expect(act(st, 'h', { type: 'dkattack', idx: [], cards: ['S7'] })).toBeNull();
    // Wer jetzt passt, ist für diesen Angriff fertig
    expect(act(st, 'h', { type: 'dkpass' })).toBeNull();
    expect(msgOf(act(st, 'h', { type: 'dkattack', idx: [], cards: ['H7'] }))).toBe(PASSED_TAKE);
    expect(dkWaiting(st)).toEqual(['p2']);
    expect(act(st, 'p2', { type: 'dkpass' })).toBeNull();
    expect(st.log.some((e) => e.k === 'dkpickup' && e.p === 'p1' && e.cnt === 4)).toBe(true);
    expect(D.P.h).toContain('H7');
    cardsOk(st);
  });

  it('nie mehr Angriffskarten als sechs oder als der Verteidiger zu Beginn hatte', () => {
    const { st, D } = fixed();
    D.P.p1 = ['C8', 'S9'];
    D.limit = 2;
    D.P.h = ['C7', 'S7', 'D7', 'H7', 'SK', 'DB'];
    D.discard += 4;
    expect(act(st, 'h', { type: 'dkattack', idx: [0, 1, 2] })).toEqual({ e: 'dk.room', a: { n: 2 } });
    expect(act(st, 'h', { type: 'dkattack', idx: [0, 1] })).toBeNull();
    expect(msgOf(act(st, 'p2', { type: 'dkattack', idx: [0] }))).toBe('Dieser Angriff ist voll.');
  });
});

describe('Durak: Weiterschieben', () => {
  it('nur mit Schalter, gleichem Wert, vor dem Schlagen und wenn der Nächste genug Karten hat', () => {
    const { st, D } = table(3, 21, true);
    D.trump = 'H6';
    D.P.h = ['C7', 'S8', 'D9', 'DB', 'SK', 'H7'];
    D.P.p1 = ['D7', 'S7', 'D10', 'H8', 'HA', 'SD'];
    D.P.p2 = ['D6', 'S10', 'CB', 'CD', 'DK', 'H9'];
    D.att = 'h';
    D.def = 'p1';
    D.limit = 6;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    expect(msgOf(act(st, 'p1', { type: 'dktransfer', idx: [2] }))).toBe(
      'Weiterschieben geht nur mit dem gleichen Wert.',
    );
    expect(act(st, 'p1', { type: 'dktransfer', idx: [0, 1] })).toBeNull();
    expect(D.def).toBe('p2');
    expect(D.att).toBe('h');
    expect(D.table.map((p) => p.a)).toEqual(['C7', 'D7', 'S7']);
    expect(st.log.at(-1)).toMatchObject({ k: 'dktransfer', p: 'p1', to: 'p2' });
    // p2 hat nur noch 6 Karten, mit einer weiteren 7 wären es 4 Angriffskarten: geht, aber p2 hat keine 7
    expect(msgOf(act(st, 'p2', { type: 'dkdefend', a: 0, i: 4 }))).toBe('Die Karte schlägt das nicht.');
    const off = table(3, 22, false);
    off.D.att = 'h';
    off.D.def = 'p1';
    off.D.P.h = ['C7', ...off.D.P.h.slice(1)];
    off.D.P.p1 = ['D7', ...off.D.P.p1.slice(1)];
    act(off.st, 'h', { type: 'dkattack', idx: [0] });
    expect(msgOf(act(off.st, 'p1', { type: 'dktransfer', idx: [0] }))).toBe('Weiterschieben ist an diesem Tisch aus.');
  });

  it('nicht, wenn der Nächste zu wenige Karten hat', () => {
    const { st, D } = table(3, 23, true);
    D.trump = 'H6';
    D.deck = [];
    D.P.h = ['C7', 'S7', 'SK'];
    D.P.p1 = ['D7', 'H8', 'HA'];
    D.P.p2 = ['D6', 'S10'];
    D.att = 'h';
    D.def = 'p1';
    D.limit = 3;
    act(st, 'h', { type: 'dkattack', idx: [0, 1] });
    expect(msgOf(act(st, 'p1', { type: 'dktransfer', idx: [0] }))).toBe('Der Nächste hat dafür zu wenige Karten.');
  });
});

describe('Durak: Ende', () => {
  it('wer zuletzt Karten hat, ist der Durak, mit Krone, Kappe, Bilanz und Ende im Verlauf', () => {
    const { st, D } = table(3, 31);
    D.trump = 'H6';
    D.deck = [];
    D.P.h = ['C7'];
    D.P.p1 = ['C8', 'D9'];
    D.P.p2 = ['S6', 'S7', 'S8'];
    D.discard = 36 - 6;
    D.att = 'h';
    D.def = 'p1';
    D.limit = 2;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    act(st, 'p1', { type: 'dkdefend', a: 0, i: 0 });
    // h ist leer, p2 legt nichts nach: Angriff abgewehrt, h allein als Erster raus
    act(st, 'p2', { type: 'dkpass' });
    expect(D.finished).toEqual(['h']);
    expect(st.players.find((p) => p.id === 'h')?.place).toBe(1);
    // p1 greift p2 mit der letzten Karte an, p2 hat weder Karo noch Trumpf
    expect(D.att).toBe('p1');
    act(st, 'p1', { type: 'dkattack', idx: [0] });
    act(st, 'p2', { type: 'dktake' });
    expect(st.phase).toBe('over');
    expect(D.finished).toEqual(['h', 'p1']);
    expect(D.durak).toBe('p2');
    expect(st.result).toMatchObject({ reason: 'durak', durak: 'p2', ranking: ['h', 'p1'] });
    expect(reignOf(st)).toMatchObject({ win: 'h', lose: 'p2' });
    expect(st.players.find((p) => p.id === 'p2')?.dkc).toBe(1);
    expect(st.players.find((p) => p.id === 'p2')?.place).toBe(3);
    expect(st.players.find((p) => p.id === 'h')?.stats?.durak).toMatchObject({ games: 1, wins: 1, places: 1 });
    const ks = st.log.map((e) => e.k);
    expect(ks.slice(-3)).toEqual(['dkpickup', 'dkout', 'dkend']);
    expect(st.log.at(-1)).toMatchObject({ k: 'dkend', p: 'p2' });
    // Am Ende sieht jeder alle Hände
    expect(viewFor(st, 'h').dk?.P.p2).toEqual(expect.arrayContaining(['S6', 'S7', 'S8', 'D9']));
  });

  it('wer im selben Angriff fertig wird, teilt sich den Platz, ohne Einzelsieger gibt es keine Krone', () => {
    const { st, D } = table(3, 32);
    D.trump = 'H6';
    D.deck = [];
    D.P.h = ['C7'];
    D.P.p1 = ['C8'];
    D.P.p2 = ['S6', 'S7', 'S8'];
    D.discard = 36 - 5;
    D.att = 'h';
    D.def = 'p1';
    D.limit = 1;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    act(st, 'p1', { type: 'dkdefend', a: 0, i: 0 });
    expect(st.phase).toBe('over');
    expect(D.durak).toBe('p2');
    expect(st.players.filter((p) => p.place === 1).map((p) => p.id)).toEqual(['h', 'p1']);
    expect(st.players.find((p) => p.id === 'p2')?.place).toBe(3);
    expect(st.winner).toBeNull();
    expect(reignOf(st)).toMatchObject({ win: null, lose: 'p2' });
    expect(st.players.find((p) => p.id === 'h')?.stats?.durak).toMatchObject({ games: 1, wins: 0 });
  });

  it('gehen die Letzten gleichzeitig raus, ist es unentschieden, auch im Revanche-Duell', () => {
    const { st, D } = table(2, 33);
    st.rematchDuel = { by: 'p1', vs: 'h', game: st.games, n: 1 };
    D.trump = 'H6';
    D.deck = [];
    D.P.h = ['C7'];
    D.P.p1 = ['C8'];
    D.discard = 34;
    D.att = 'h';
    D.def = 'p1';
    D.limit = 1;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    act(st, 'p1', { type: 'dkdefend', a: 0, i: 0 });
    expect(st.phase).toBe('over');
    expect(D.durak).toBeNull();
    const end = st.log.find((e) => e.k === 'dkend');
    expect(end).toBeTruthy();
    expect(end?.p).toBeUndefined();
    // Keiner allein vorn: keine Krone, kein Sieg, das Duell ist unentschieden
    expect(st.winner).toBeNull();
    expect(reignOf(st)?.win).toBeNull();
    expect(st.log.at(-1)).toMatchObject({ k: 'rematchend', res: 'tie' });
  });
});

describe('Durak: zufällige Partien', () => {
  it('spielt 600 Partien mit 2 bis 8 Leuten fehlerfrei bis zum Ende, Karten bleiben vollständig', () => {
    const stats = { games: 0, bito: 0, pickup: 0, transfer: 0, draws: 0, long: 0 };
    for (let g = 0; g < 600; g++) {
      const n = 2 + (g % 7);
      const { st, rng } = table(n, 1000 + g, g % 2 === 0);
      let steps = 0;
      while (st.phase === 'play' && steps < 4000) {
        steps++;
        const all = st.players.flatMap((p) => moves(st, p.id).map((a) => [p.id, a] as const));
        assert.ok(all.length, 'festgefahren: niemand kann etwas tun');
        // Meist verteidigen und fertig sagen, damit die Partien enden
        const pref = all.filter(([, a]) => a.type === 'dkdefend' || a.type === 'dkpass');
        const pool = pref.length && rng() < 0.8 ? pref : all;
        const [pid, a] = pool[Math.floor(rng() * pool.length)];
        const bout = st.dk?.bout;
        const before = [...(st.dk?.done ?? [])];
        const ranks = dkTableRanks(st.dk as DkState);
        const card = a.type === 'dkdefend' ? st.dk?.P[pid][a.i ?? -1] : undefined;
        assert.equal(act(st, pid, a, rng), null, `${a.type} von ${pid}`);
        // Passen verfällt beim Schlagen nur durch einen neuen Wert, das hängt allein am Tisch
        if (card && st.dk?.bout === bout && st.dk?.table.length)
          assert.deepEqual(st.dk.done, ranks.has(rankOf(card)) ? before : [], 'Passen nach dem Schlagen');
        if (a.type === 'dktransfer') stats.transfer++;
        cardsOk(st);
        // Fremde Hände bleiben geheim
        if (st.phase === 'play') {
          const v = viewFor(st, 'h');
          st.players.forEach((p) => p.id !== 'h' && assert.equal(typeof v.dk?.P[p.id], 'number'));
          assert.equal(typeof v.dk?.deck, 'number');
        }
      }
      if (st.phase === 'play') {
        stats.long++;
        continue;
      }
      stats.games++;
      const D = st.dk as DkState;
      if (!D.durak) stats.draws++;
      stats.bito += st.log.filter((e) => e.k === 'dkbito').length;
      stats.pickup += st.log.filter((e) => e.k === 'dkpickup').length;
      expect(D.finished.length).toBe(D.durak ? n - 1 : n);
      if (D.durak) expect(D.P[D.durak].length).toBeGreaterThan(0);
    }
    console.log('Durak-Fuzz', stats);
    expect(stats.long).toBeLessThan(10);
    expect(stats.transfer).toBeGreaterThan(0);
    expect(stats.draws).toBeGreaterThan(0);
  });

  it('bleibt nie hängen, wenn alle offline sind: Der Host überspringt sie', () => {
    for (let g = 0; g < 40; g++) {
      const { st, rng } = table(2 + (g % 5), 5000 + g, g % 2 === 1);
      st.players.forEach((p) => (p.online = false));
      let guard = 0;
      while (st.phase === 'play' && guard++ < 3000) assert.equal(act(st, 'h', { type: 'skip' }, rng), null);
      expect(st.phase).toBe('over');
    }
  });
});

describe('Durak: KI', () => {
  it('spielt 200 Partien mit 2 bis 8 KIs zu Ende, ohne abgelehnte Züge', () => {
    let transfers = 0;
    for (let g = 0; g < 200; g++) {
      const n = 2 + (g % 7);
      const { st, rng } = table(n, 7000 + g, g % 3 === 0);
      st.players.forEach((p) => (p.bot = true));
      let guard = 0;
      while (st.phase === 'play' && guard++ < 3000) {
        let moved = false;
        for (const p of st.players) {
          const a = botDecide(viewFor(st, p.id), rng, 'normal');
          if (!a) continue;
          assert.equal(act(st, p.id, a, rng), null, `KI ${a.type} abgelehnt`);
          if (a.type === 'dktransfer') transfers++;
          moved = true;
          break;
        }
        assert.ok(moved, 'keine KI will etwas tun');
        cardsOk(st);
      }
      expect(st.phase).toBe('over');
    }
    expect(transfers).toBeGreaterThan(0);
  });

  it('bleibt beim eigenen Passen, bis ein neuer Wert kommt', () => {
    /** h greift p1 mit der Kreuz 7 an, p1 schlägt mit der 8, h passt, p2 legt die Karo 7 nach. */
    const start = (): { st: State; D: DkState } => {
      const { st, D } = table(3, 78);
      D.trump = 'H6';
      D.deck = ['H6', 'C6', 'S6', 'D6', 'C9', 'CK', 'SB', 'DA', 'HK'];
      D.P.h = ['C7', 'S7', 'D9', 'DB', 'SK', 'H7'];
      D.P.p1 = ['C8', 'S9', 'D10', 'H8', 'HA', 'SD'];
      D.P.p2 = ['D7', 'S10', 'CB', 'CD', 'DK', 'H9'];
      D.att = 'h';
      D.def = 'p1';
      D.limit = 6;
      act(st, 'h', { type: 'dkattack', idx: [0] });
      act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'C7', c: 'C8' });
      act(st, 'h', { type: 'dkpass' });
      act(st, 'p2', { type: 'dkattack', idx: [], cards: ['D7'] });
      return { st, D };
    };
    for (let seed = 1; seed <= 40; seed++) {
      // Die 8 liegt schon: h hat noch die Pik 7, legt sie aber nicht nach
      const same = start();
      act(same.st, 'p1', { type: 'dkdefend', a: 1, i: 0, ac: 'D7', c: 'H8' });
      expect(same.D.done).toEqual(['h']);
      expect(botDecide(viewFor(same.st, 'h'), rngF(seed), 'normal')).toBeNull();
      // Die 10 ist neu: h ist wieder gefragt
      const fresh = start();
      act(fresh.st, 'p1', { type: 'dkdefend', a: 1, i: 0, ac: 'D7', c: 'D10' });
      expect(botDecide(viewFor(fresh.st, 'h'), rngF(seed), 'normal')).not.toBeNull();
    }
  });

  it('nimmt auf, wenn sie nicht schlagen kann, und legt dem Aufnehmenden etwas obendrauf', () => {
    const { st, D } = table(3, 77);
    D.trump = 'H6';
    D.deck = ['H6', 'C6', 'S6', 'D6', 'C9', 'CK', 'SB', 'DA', 'HK'];
    D.P.h = ['C7', 'S7', 'D9', 'DB', 'SK', 'H7'];
    // Mit dem Kreuz-Ass kann p1 die Kreuz 7 schlagen
    D.P.p1 = ['S8', 'S9', 'D10', 'SD', 'CA', 'DD'];
    D.P.p2 = ['D7', 'S10', 'CB', 'CD', 'DK', 'H9'];
    D.att = 'h';
    D.def = 'p1';
    D.limit = 6;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    expect(botDecide(viewFor(st, 'p1'), rngF(1), 'normal')).toMatchObject({ type: 'dkdefend' });
    // Ohne Kreuz und ohne Trumpf bleibt nur Aufnehmen
    D.P.p1 = ['S8', 'S9', 'D10', 'SD', 'DD', 'D8'];
    expect(botDecide(viewFor(st, 'p1'), rngF(1), 'normal')).toEqual({ type: 'dktake' });
    act(st, 'p1', { type: 'dktake' });
    expect(botDecide(viewFor(st, 'p2'), rngF(1), 'normal')).toEqual({ type: 'dkattack', idx: [0] });
  });
});

describe('Durak: Übernahme, Zeitablauf, Weiterschieben am Ende', () => {
  it('ein Gast übernimmt einen KI-Platz, der noch spielt, ohne deren Tipp und Kappen', () => {
    const { st, D } = table(4, 61);
    st.players.slice(1).forEach((p) => (p.bot = true));
    const [, b1, b2, b3] = st.players;
    // b3 ist fertig und hat getippt, b2 hat schon drei Kappen
    D.deck = [];
    D.P[b3.id] = [];
    D.finished = [b3.id];
    b3.place = 1;
    D.bets = { [b3.id]: { on: b1.id, q: 1, n: st.n } };
    b2.dkc = 3;
    const seat = seatGuest(st, 'p-lena00000000', 'Lena');
    expect(seat && 'id' in seat ? seat.id : null).toBe(b2.id);
    expect(b2.dkc).toBe(0);
    // Übernimmt jemand den fertigen Platz direkt, gehört der Tipp nicht mit dazu
    takeSeat(st, b3.id, 'Mia');
    expect(D.bets[b3.id]).toBeUndefined();
  });

  it('beim Weiterschieben zählt nicht als Nächster, wer bei leerem Stapel schon leer ist', () => {
    const { st, D } = table(3, 62, true);
    D.trump = 'H6';
    D.deck = [];
    D.P.h = ['C7', 'S9', 'D10', 'SD'];
    D.P.p1 = ['D7', 'CB', 'CD', 'DK', 'H9'];
    D.P.p2 = ['S7'];
    D.discard = 36 - 10;
    D.att = 'h';
    D.def = 'p1';
    D.limit = 5;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    act(st, 'p2', { type: 'dkattack', idx: [0] });
    // p2 ist leer und damit raus, p1 schiebt an h weiter (h hat 3 Karten, Angriff dann 3)
    expect(act(st, 'p1', { type: 'dktransfer', idx: [0] })).toBeNull();
    expect(D.def).toBe('h');
  });

  it('st.turn zeigt auf jemanden, auf den die Partie wirklich wartet', () => {
    const { st, D } = table(2, 63, true);
    D.trump = 'H6';
    D.P.h = ['C7', 'C9', 'SA', 'DB', 'SK', 'H7'];
    D.P.p1 = ['D7', 'S8', 'D10', 'SD', 'CA', 'DD'];
    D.att = 'h';
    D.def = 'p1';
    D.limit = 6;
    act(st, 'h', { type: 'dkattack', idx: [0] });
    expect(st.players[st.turn].id).toBe('p1');
    act(st, 'p1', { type: 'dkdefend', a: 0, i: 4 });
    expect(dkWaiting(st)).toEqual(['h']);
    expect(st.players[st.turn].id).toBe('h');
  });
});

describe('Durak: Karten statt Indizes', () => {
  it('spielt die gemeinte Karte, auch wenn sich die Hand verschoben hat, und lehnt fehlende ab', () => {
    const { st, D } = table(2, 71);
    D.trump = 'H6';
    D.P.h = ['S7', 'C7', 'DB', 'SK', 'D8', 'H7'];
    D.P.p1 = ['S9', 'C10', 'HA', 'SD', 'CA', 'DD'];
    D.att = 'h';
    D.def = 'p1';
    D.limit = 6;
    act(st, 'h', { type: 'dkattack', idx: [0, 1] });
    // Erster Schlag mit S9, dann ein veralteter Index 1 (jetzt HA), gemeint war C10 gegen C7
    expect(act(st, 'p1', { type: 'dkdefend', a: 0, i: 0, ac: 'S7', c: 'S9' })).toBeNull();
    expect(act(st, 'p1', { type: 'dkdefend', a: 1, i: 1, ac: 'C7', c: 'C10' })).toBeNull();
    expect(D.table.map((p) => p.d)).toEqual(['S9', 'C10']);
    expect(D.P.p1).toContain('HA');
    expect(msgOf(act(st, 'h', { type: 'dkattack', idx: [0], cards: ['S7'] }))).toBe('Die Karte ist nicht mehr da.');
  });
});
