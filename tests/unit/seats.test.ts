import { strict as assert } from 'node:assert';
import { describe, expect, it } from 'vitest';
import { botDecide } from '../../src/bots/index';
import { act } from '../../src/game/actions';
import { quitPlayer, toBot } from '../../src/game/flow';
import { finishRound } from '../../src/game/schnautz';
import { reclaimSeat, seatGuest, takeSeat } from '../../src/game/seats';
import { addPlayer, migrate, newState, pIdx } from '../../src/game/state';
import { GAMES, reignOf, resetRulesFor, setReign } from '../../src/game/games';
import { DEFAULT_RULES } from '../../src/game/constants';
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
    // Krone im Shithead, Titel im Schnautz: Beides geht nicht auf den Menschen über
    st.reigns = {
      shithead: { win: b.id, lose: null, game: 'shithead' },
      schnautz: { win: null, lose: b.id, game: 'schnautz' },
    };
    const cards = structuredClone(S.P[b.id]);
    const turn = st.turn;
    const n = st.players.length;

    expect(seatId(seatGuest(st, 'p-lena', 'Lena'))).toBe(b.id);
    expect(b.bot).toBeUndefined();
    expect(b.name).toBe('Lena');
    expect(b.stats).toEqual({});
    expect(b.shc).toBe(0);
    expect(st.reigns.shithead?.win).toBeNull();
    expect(st.reigns.schnautz?.lose).toBeNull();
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

describe('Rückkehr an den eigenen Platz', () => {
  it('ein gleicher Name übernimmt in der Lobby den Offline-Platz statt eines neuen', () => {
    const rng = rngF(21);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { seats: 3 } }, rng);
    expect(seatId(seatGuest(st, 'p-lena', 'Lena'))).toBe('p-lena');
    const lena = st.players[pIdx(st, 'p-lena')];
    lena.online = false;
    lena.offSince = 123;
    const n = st.players.length;
    // Neuer Tab ohne gespeicherte IDs: andere ID, gleicher Name in anderer Schreibweise
    expect(seatId(seatGuest(st, 'p-neu', 'lena'))).toBe('p-lena');
    expect(lena.online).toBe(true);
    expect(lena.offSince).toBeUndefined();
    expect(lena.name).toBe('Lena');
    expect(st.players).toHaveLength(n);
  });

  it('findet den Offline-Platz auch, wenn der Tisch voll ist', () => {
    const rng = rngF(22);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { seats: 2 } }, rng);
    seatId(seatGuest(st, 'p-lena', 'Lena'));
    expect(seatGuest(st, 'p-tom', 'Tom')).toEqual({ err: 'Der Tisch ist voll.' });
    st.players[pIdx(st, 'p-lena')].online = false;
    expect(seatId(seatGuest(st, 'p-neu', 'Lena'))).toBe('p-lena');
  });

  it('übernimmt keinen Platz, der mit gleichem Namen online ist, und nie den des Gastgebers', () => {
    const rng = rngF(23);
    const st = newState('h', 'Lena');
    act(st, 'h', { type: 'rules', rules: { seats: 4 } }, rng);
    seatId(seatGuest(st, 'p-lena', 'Lena'));
    expect(st.players[pIdx(st, 'p-lena')].name).toBe('Lena 2');
    expect(seatId(seatGuest(st, 'p-zwei', 'Lena'))).toBe('p-zwei');
    expect(st.players[pIdx(st, 'p-zwei')].name).toBe('Lena 3');
    // Der Gastgeber gilt auch dann nicht als Geisterplatz, wenn er offline wäre
    st.players[0].online = false;
    expect(seatId(seatGuest(st, 'p-drei', 'Lena'))).toBe('p-drei');
    expect(st.players).toHaveLength(4);
  });

  it('holt mitten in der Partie den Offline-Platz über den Namen zurück, vor jedem KI-Platz', () => {
    const rng = rngF(24);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { seats: 4, fill: true } }, rng);
    const lena = seatId(seatGuest(st, 'p-lena', 'Lena'));
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    const p = st.players[pIdx(st, lena)];
    p.online = false;
    const botsBefore = bots(st).length;
    expect(seatId(seatGuest(st, 'p-neu', 'LENA'))).toBe(lena);
    expect(p.online).toBe(true);
    expect(bots(st)).toHaveLength(botsBefore);
  });

  it('lässt in der Tauschrunde tauschen, wer einen schon bereiten KI-Platz übernimmt', () => {
    const rng = rngF(13);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 3 } }, rng);
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    // Alle KIs sind bereit, der Gastgeber noch nicht
    bots(st).forEach((b) => expect(act(st, b.id, { type: 'shready' }, rng)).toBeNull());
    const id = seatId(seatGuest(st, 'p-lena', 'Lena'));
    const p = st.players[pIdx(st, id)];
    expect(p.ready).toBe(false);
    expect(act(st, id, { type: 'shswap', h: 0, u: 0 }, rng)).toBeNull();
    expect(st.phase).toBe('swap');
    expect(act(st, id, { type: 'shready' }, rng)).toBeNull();
  });

  it('lässt in der Tauschrunde wieder tauschen, wer seinen Platz von der KI zurückholt', () => {
    const rng = rngF(14);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    toBot(st, 'p1', rng);
    const p1 = st.players[pIdx(st, 'p1')];
    expect(act(st, 'p1', { type: 'shready' }, rng)).toBeNull();
    expect(p1.ready).toBe(true);
    reclaimSeat(st, 'p1');
    expect(p1.ready).toBe(false);
    expect(st.phase).toBe('swap');
    expect(act(st, 'p1', { type: 'shswap', h: 0, u: 0 }, rng)).toBeNull();
  });

  it('übernimmt beim Zurückholen im Cabo-Ansehen das Bereit der KI, damit niemand vier Karten sieht', () => {
    const rng = rngF(15);
    const st = newState('h', 'Host');
    addPlayer(st, 'p1', 'Paul');
    act(st, 'h', { type: 'game', game: 'cabo' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    expect(st.phase).toBe('peek');
    toBot(st, 'p1', rng);
    const C = st.cb;
    assert.ok(C);
    const p1 = st.players[pIdx(st, 'p1')];
    expect(act(st, 'p1', { type: 'cblook', ids: C.P.p1.slice(0, 2).map((x) => x.id) }, rng)).toBeNull();
    expect(p1.ready).toBe(true);
    reclaimSeat(st, 'p1');
    expect(p1.ready).toBe(true);
  });

  it('setzt beim Übernehmen außerhalb von Tauschrunde und Ansehen nichts zurück', () => {
    const rng = rngF(16);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 3 } }, rng);
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'start' }, rng);
    st.players.forEach((p) => act(st, p.id, { type: 'shready' }, rng));
    expect(st.phase).toBe('play');
    const b = bots(st)[0];
    b.ready = true;
    takeSeat(st, b.id, 'Mo');
    expect(b.ready).toBe(true);
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

describe('Kronen je Spiel', () => {
  it('übernimmt eine alte Krone aus gespeicherten Tischen in ihr Spiel', () => {
    const st = newState('h', 'Host');
    (st as unknown as { reign: unknown }).reign = { win: 'h', sh: 'x', game: 'shithead' };
    migrate(st);
    expect(st.reigns).toEqual({ shithead: { win: 'h', lose: 'x', game: 'shithead' } });
    expect('reign' in st).toBe(false);
  });

  it('behält die Krone eines Spiels, während ein anderes gespielt wird', () => {
    const st = newState('h', 'Host');
    setReign(st, 'shithead', 'a', 'b');
    setReign(st, 'schnautz', 'c');
    expect(reignOf(st, 'shithead')).toMatchObject({ win: 'a', lose: 'b' });
    expect(reignOf(st)).toMatchObject({ win: 'c', lose: null });
  });

  it('kürzt eine alte Shithead-Lobby mit 10 Plätzen auf 8 und startet sie', () => {
    const rng = rngF(7);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'rules', rules: { fill: true, seats: 8 } }, rng);
    expect(addPlayer(st, 'g', 'Gast')).toBe('Der Tisch ist voll.');
    // So sah ein gespeicherter Tisch aus 2.5 aus: zehn Plätze, zwei mehr als heute erlaubt
    const extra = bots(st)
      .slice(0, 2)
      .map((b, i) => ({ ...structuredClone(b), id: `alt${i}`, name: `Alt ${i}` }));
    st.players.push(...extra);
    st.rules.seats = 10;
    const back = JSON.parse(JSON.stringify(st)) as State;
    migrate(back);
    expect(back.players).toHaveLength(10);
    // Jeder nächste Schritt in der Lobby bringt Platzzahl und KIs in die neuen Grenzen, eine Regel genauso wie der Start
    const viaRule = structuredClone(back);
    expect(act(viaRule, 'h', { type: 'rules', rules: { fill: true } }, rng)).toBeNull();
    expect(viaRule.rules.seats).toBe(8);
    expect(viaRule.players).toHaveLength(8);
    expect(act(back, 'h', { type: 'start' }, rng)).toBeNull();
    expect(back.players).toHaveLength(8);
    expect(back.phase).not.toBe('lobby');
  });

  it('startet eine alte Shithead-Lobby mit neun Menschen nicht und sagt warum', () => {
    const rng = rngF(8);
    const st = newState('h', 'Host');
    act(st, 'h', { type: 'game', game: 'shithead' }, rng);
    act(st, 'h', { type: 'rules', rules: { seats: 8 } }, rng);
    for (let i = 1; i < 8; i++) expect(addPlayer(st, `g${i}`, `Gast ${i}`)).toBeNull();
    st.players.push({ ...structuredClone(st.players[1]), id: 'g9', name: 'Gast 9' });
    expect(act(st, 'h', { type: 'start' }, rng)).toMatch(/höchstens|Mehr als 8/);
    expect(st.phase).toBe('lobby');
  });

  it('setzt die Einstellungen eines Spiels auf Standard zurück und lässt die anderen Spiele in Ruhe', () => {
    const rng = rngF(9);
    const st = newState('h', 'Host');
    const changed = {
      turnSecs: 45,
      lives: 5,
      feuer: false,
      knockDouble: true,
      sh: { eight: false, seven: false },
      dk: { transfer: true },
      cb: { target: 50, snap: true },
    };
    for (const g of GAMES) {
      expect(act(st, 'h', { type: 'rules', rules: changed }, rng)).toBeNull();
      expect(act(st, 'h', { type: 'rules', rules: resetRulesFor(g) }, rng)).toBeNull();
      const r = st.rules;
      expect(r.turnSecs).toBe(DEFAULT_RULES.turnSecs);
      expect([r.lives, r.feuer, r.knockDouble]).toEqual(
        g === 'schnautz' ? [DEFAULT_RULES.lives, DEFAULT_RULES.feuer, DEFAULT_RULES.knockDouble] : [5, false, true],
      );
      expect(r.sh).toEqual(g === 'shithead' ? DEFAULT_RULES.sh : { ...DEFAULT_RULES.sh, eight: false, seven: false });
      expect(r.dk).toEqual(g === 'durak' ? DEFAULT_RULES.dk : { transfer: true });
      expect(r.cb).toEqual(g === 'cabo' ? DEFAULT_RULES.cb : { target: 50, snap: true });
    }
  });
});
