import { describe, expect, it } from 'vitest';
import { GAMES } from '../../src/game/games';
import type { GameKind, LogEntry, LogInput, LogKind, Phase, View } from '../../src/game/types';
import { DK_MAX_ATTACK } from '../../src/game/constants';
import { levelInBatch, newBatch } from '../../src/ui/feedback-rules';
import { burnCue, cueOf, levelOf, SAY, type Cue, type Level, type LevelCtx } from '../../src/ui/levels';

const ME = 'me';

function view(game: GameKind, extra: Partial<View> = {}): View {
  return {
    game,
    phase: 'play',
    games: 1,
    turn: 0,
    dealer: 0,
    log: [],
    players: [
      { id: ME, name: 'Tahna' },
      { id: 'a', name: 'Lena' },
      { id: 'b', name: 'Bodo', bot: true },
    ],
    ...extra,
  } as unknown as View;
}

let N = 100;
const L = (x: LogInput): LogEntry => ({ n: ++N, ...x }) as LogEntry;

function ctx(game: GameKind, fresh: LogEntry[] = [], o: { prev?: Partial<View>; v?: Partial<View> } = {}): LevelCtx {
  return { prev: view(game, o.prev), v: view(game, o.v), fresh, me: ME, seqd: false };
}

const cue = (e: LogEntry, c: LevelCtx): Cue | null => cueOf(e, c);

/** Ein Schub in Logreihenfolge wie in emit: Stufe je Eintrag nach „höchstens ein Großes“. */
function batch(c: LevelCtx): (Level | null)[] {
  const b = newBatch(c.fresh);
  return c.fresh.map((e) => {
    const x = cueOf(e, c);
    return x ? levelInBatch(x, b) : null;
  });
}

/** Jede Logart braucht ein Beispiel, sonst kompiliert der Test nicht. Das hält die Tabelle vollständig. */
const SAMPLES: { [K in LogKind]: Omit<Extract<LogEntry, { k: K }>, 'n'> } = {
  join: { k: 'join', p: 'a' },
  leave: { k: 'leave', p: 'a' },
  quit: { k: 'quit', p: 'a' },
  takeover: { k: 'takeover', p: 'a', from: 'Bodo' },
  tobot: { k: 'tobot', p: 'a' },
  back: { k: 'back', p: 'a' },
  timeout: { k: 'timeout', p: 'a' },
  game: { k: 'game', g: 2 },
  round: { k: 'round', r: 1 },
  keep: { k: 'keep', p: 'a' },
  take: { k: 'take', p: 'a' },
  swap: { k: 'swap', p: 'a', take: 'HA', give: 'H7' },
  swapAll: { k: 'swapAll', p: 'a' },
  pass: { k: 'pass', p: 'a' },
  renew: { k: 'renew' },
  knock: { k: 'knock', p: 'a' },
  result: { k: 'result', reason: 'knock', by: 'a', changes: { a: { to: 'life', n: 1 } }, tie: false, names: {} },
  winner: { k: 'winner', p: 'a' },
  lobby: { k: 'lobby' },
  abort: { k: 'abort', p: ME, game: 'shithead' },
  ffwd: { k: 'ffwd', p: ME },
  chat: { k: 'chat', p: 'a', text: 'hi' },
  emote: { k: 'emote', p: 'a', e: '😂' },
  toss: { k: 'toss', p: 'a', item: 'tomato', to: ME },
  sound: { k: 'sound', p: 'a', s: 'horn' },
  shdeal: { k: 'shdeal' },
  shstart: { k: 'shstart', card: null },
  shplay: { k: 'shplay', p: 'a', cards: ['H5'], src: 'hand' },
  shthrow: { k: 'shthrow', p: 'a', cards: ['H4'] },
  shbomb: { k: 'shbomb', p: 'a', cards: ['H9', 'D9', 'S9', 'C9'], src: 'hand', out: true },
  shburn: { k: 'shburn', p: 'a', four: false, cut: false },
  shpickup: { k: 'shpickup', p: 'a', cnt: 3 },
  shblindfail: { k: 'shblindfail', p: 'a', card: 'H3', cnt: 4 },
  shdone: { k: 'shdone', p: 'a', place: 2 },
  shend: { k: 'shend', p: 'a' },
  shbet: { k: 'shbet', p: 'a', on: 'b', onName: 'Bodo', q: 1 },
  rematch: { k: 'rematch', p: 'a', to: ME, c: 1 },
  rematchend: { k: 'rematchend', p: 'a', to: ME, tn: 'Tahna', res: 'won', c: 1 },
  dkdeal: { k: 'dkdeal', trump: 'HA', att: 'a', def: ME },
  dkattack: { k: 'dkattack', p: 'a', cards: ['H6'] },
  dkdefend: { k: 'dkdefend', p: 'a', a: 'H6', d: 'H7' },
  dktransfer: { k: 'dktransfer', p: 'a', cards: ['S6'], to: 'b' },
  dktake: { k: 'dktake', p: 'a' },
  dkpass: { k: 'dkpass', p: 'a' },
  dkbito: { k: 'dkbito', p: 'a', cnt: 4 },
  dkpickup: { k: 'dkpickup', p: 'a', cnt: 3 },
  dkout: { k: 'dkout', p: 'a', place: 2 },
  dkend: { k: 'dkend', p: 'a' },
  cbdeal: { k: 'cbdeal', r: 1, start: 'a' },
  cblook: { k: 'cblook', p: ME },
  cbdraw: { k: 'cbdraw', p: 'a', from: 'pile' },
  cbswap: { k: 'cbswap', p: 'a', out: ['H5'], ok: true, slots: 1 },
  cbdiscard: { k: 'cbdiscard', p: 'a', c: 'H9', power: 'spy' },
  cbpeek: { k: 'cbpeek', p: 'a' },
  cbspy: { k: 'cbspy', p: 'a', to: 'b' },
  cbblind: { k: 'cbblind', p: 'a', to: 'b', id: 1, oid: 2 },
  cbskip: { k: 'cbskip', p: 'a' },
  cbcabo: { k: 'cbcabo', p: 'a' },
  cbsnap: { k: 'cbsnap', p: 'a', c: 'H5', ok: true },
  cbround: { k: 'cbround', scores: {}, caller: null, ok: null, kami: null },
  cbreset: { k: 'cbreset', p: 'a' },
  cbend: { k: 'cbend', p: 'a' },
  dev: { k: 'dev', fx: 'confetti' },
};

describe('Rückmeldestufen (levels.ts)', () => {
  it('kennt jede Logart in jedem Spiel und Blickwinkel, ohne zu werfen', () => {
    for (const game of GAMES)
      for (const phase of ['lobby', 'play', 'over'] as Phase[])
        for (const s of Object.values(SAMPLES)) {
          const e = L(s);
          for (const me of [ME, 'a']) {
            const c = { ...ctx(game, [e], { prev: { phase: 'play' }, v: { phase } }), me };
            const r = cueOf(e, c);
            if (r) expect(['small', 'mid', 'big']).toContain(r.level);
            expect(levelOf(e, c)).toBe(r?.level ?? null);
          }
        }
  });

  it('bleibt bei unbekannten Arten eines neueren Gastgebers still', () => {
    const e = { n: 1, k: 'zukunft', p: 'a' } as unknown as LogEntry;
    expect(cueOf(e, ctx('shithead', [e]))).toBeNull();
  });

  it('meldet Automatisches klein mit Ton, eigene Zeit um als Takt', () => {
    const take = L({ k: 'takeover', p: 'a', from: 'Bodo' });
    const gone = L({ k: 'tobot', p: 'a' });
    const late = L({ k: 'timeout', p: 'a' });
    for (const e of [take, gone, late]) expect(cue(e, ctx('shithead', [e]))).toEqual({ level: 'small', sound: true });
    const mine = L({ k: 'timeout', p: ME });
    expect(cue(mine, ctx('cabo', [mine]))).toEqual({ level: 'big', beat: true });
    // In der Lobby kommen Kommen und Gehen als Toast, dort gibt es keine Stufe
    expect(cue(take, ctx('shithead', [take], { v: { phase: 'lobby' } }))).toBeNull();
    expect(cue(L({ k: 'back', p: 'a' }), ctx('durak'))).toEqual({ level: 'small' });
  });

  it('macht eigene Zeit um bei Durak klein, wenn die KI nur gepasst hat', () => {
    const t = L({ k: 'timeout', p: ME });
    const pass = L({ k: 'dkpass', p: ME });
    expect(cue(t, ctx('durak', [t, L({ k: 'chat', p: 'a', text: 'na' }), pass]))).toEqual({
      level: 'small',
      sound: true,
    });
    const att = L({ k: 'dkattack', p: ME, cards: ['H6'] });
    expect(cue(t, ctx('durak', [t, att]))?.level).toBe('big');
  });

  it('stuft Verbrennen nach Kartenzahl, Bombe immer groß', () => {
    const burn = L({ k: 'shburn', p: 'a', four: false, cut: false });
    const sh = (burned: number) => ({ burned }) as View['sh'];
    expect(cue(burn, ctx('shithead', [burn], { prev: { sh: sh(0) }, v: { sh: sh(4) } }))?.level).toBe('mid');
    expect(cue(burn, ctx('shithead', [burn], { prev: { sh: sh(0) }, v: { sh: sh(SAY.burnBig) } }))?.level).toBe('big');
    const bomb = L({ k: 'shburn', p: 'a', four: true, cut: true });
    expect(cue(bomb, ctx('shithead', [bomb]))?.level).toBe('big');
  });

  it('nimmt Aufnehmen erst ab der Spruchschwelle mittel mit Spruch', () => {
    const few = L({ k: 'shpickup', p: 'a', cnt: SAY.pickupTaunt - 1 });
    const many = L({ k: 'shpickup', p: 'a', cnt: SAY.pickupTaunt });
    expect(cue(few, ctx('shithead', [few]))).toEqual({ level: 'small' });
    expect(cue(many, ctx('shithead', [many]))).toEqual({ level: 'mid', taunt: true });
    const dk = L({ k: 'dkpickup', p: 'a', cnt: SAY.pickupTaunt });
    expect(cue(dk, ctx('durak', [dk]))).toEqual({ level: 'mid', taunt: true });
    // Endet die Partie im selben Schub, schweigt der Spruch
    expect(cue(dk, ctx('durak', [dk, L({ k: 'dkend', p: 'b' })]))).toEqual({ level: 'mid' });
  });

  it('lässt Durak-Aufnehmen still, wenn das Aufnehmen sofort folgt', () => {
    const take = L({ k: 'dktake', p: 'a' });
    expect(cue(take, ctx('durak', [take, L({ k: 'dkpickup', p: 'a', cnt: 2 })]))).toBeNull();
    expect(cue(take, ctx('durak', [take]))?.level).toBe('small');
  });

  it('macht Bito nur nach vollem Tisch mit sechs Angriffen groß', () => {
    const dk = (limit: number) => ({ limit }) as View['dk'];
    const half = L({ k: 'dkbito', p: 'a', cnt: 4 });
    const full = L({ k: 'dkbito', p: 'a', cnt: 2 * DK_MAX_ATTACK });
    expect(cue(half, ctx('durak', [half], { prev: { dk: dk(6) } }))?.level).toBe('mid');
    expect(cue(full, ctx('durak', [full], { prev: { dk: dk(6) } }))?.level).toBe('big');
    // Kleines Limit (Verteidiger mit ein oder zwei Handkarten): alles abgewehrt, aber kein voller Tisch
    const one = L({ k: 'dkbito', p: 'a', cnt: 2 });
    const two = L({ k: 'dkbito', p: 'a', cnt: 4 });
    expect(cue(one, ctx('durak', [one], { prev: { dk: dk(1) } }))).toEqual({ level: 'mid' });
    expect(cue(two, ctx('durak', [two], { prev: { dk: dk(2) } }))).toEqual({ level: 'mid' });
    const five = L({ k: 'dkbito', p: 'a', cnt: 10 });
    expect(cue(five, ctx('durak', [five], { prev: { dk: dk(5) } }))?.level).toBe('mid');
    // Der eigene Spruch hängt weiter an SAY.bitoTaunt Karten, nicht am vollen Tisch
    const mineTwo = L({ k: 'dkbito', p: ME, cnt: 6 });
    expect(cue(mineTwo, ctx('durak', [mineTwo], { prev: { dk: dk(3) } }))).toEqual({ level: 'mid', taunt: true });
    // Endet die Partie im selben Schub, kommt kein neues Großes vor die Enthüllung
    const end = L({ k: 'dkend', p: 'b' });
    expect(cue(full, ctx('durak', [full, end], { prev: { dk: dk(6) } }))?.level).toBe('mid');
    const tr = L({ k: 'dktransfer', p: 'a', cards: ['H6'], to: ME });
    expect(cue(tr, ctx('durak', [tr, end]))).toEqual({ level: 'mid' });
  });

  it('meldet Fertig eigenes und Platz 1 groß, andere mittel, vor der Zeremonie als Takt', () => {
    const other = L({ k: 'shdone', p: 'a', place: 2 });
    const first = L({ k: 'shdone', p: 'a', place: 1 });
    const mine = L({ k: 'shdone', p: ME, place: 1 });
    expect(cue(other, ctx('shithead', [other]))).toEqual({ level: 'mid' });
    expect(cue(first, ctx('shithead', [first]))).toEqual({ level: 'big' });
    expect(cue(mine, ctx('shithead', [mine]))).toEqual({ level: 'big', taunt: true });
    expect(cue(other, ctx('shithead', [other, L({ k: 'shend', p: 'b' })]))).toEqual({ level: 'big', beat: true });
    const out = L({ k: 'dkout', p: ME, place: 1 });
    const same = L({ k: 'dkout', p: 'a', place: 1 });
    expect(cue(out, ctx('durak', [out, same]))).toEqual({ level: 'big' });
  });

  describe('Fertig und Platz 1 schlagen Bito und Verbrennen im selben Schub', () => {
    const dk = { limit: DK_MAX_ATTACK } as View['dk'];
    const sh = (burned: number) => ({ burned }) as View['sh'];

    it('Durak: Bito wird mittel ohne Spruch, das eigene Fertig bleibt groß', () => {
      const bito = L({ k: 'dkbito', p: ME, cnt: 2 * DK_MAX_ATTACK });
      // Allein ist dieses Bito groß mit Spruch, der Test prüft also wirklich den Vorrang
      expect(cue(bito, ctx('durak', [bito], { prev: { dk } }))).toEqual({ level: 'big', taunt: true });
      const out = L({ k: 'dkout', p: ME, place: 1 });
      const c = ctx('durak', [bito, out], { prev: { dk } });
      expect(cue(bito, c)).toEqual({ level: 'mid' });
      expect(batch(c)).toEqual(['mid', 'big']);
      // Fertig auf einem späteren Platz ist für mich ebenso groß
      const out3 = L({ k: 'dkout', p: ME, place: 3 });
      expect(batch(ctx('durak', [bito, out3], { prev: { dk } }))).toEqual(['mid', 'big']);
    });

    it('Durak: Platz 1 von anderen schlägt das Bito, ein späterer Platz anderer nicht', () => {
      const bito = L({ k: 'dkbito', p: 'a', cnt: 2 * DK_MAX_ATTACK });
      const first = L({ k: 'dkout', p: 'a', place: 1 });
      expect(batch(ctx('durak', [bito, first], { prev: { dk } }))).toEqual(['mid', 'big']);
      const second = L({ k: 'dkout', p: 'a', place: 2 });
      expect(batch(ctx('durak', [bito, second], { prev: { dk } }))).toEqual(['big', 'mid']);
    });

    it('Shithead: Bombe wird mittel, das eigene Fertig oder Platz 1 bleibt groß', () => {
      const bomb = L({ k: 'shburn', p: ME, four: true, cut: false });
      expect(cue(bomb, ctx('shithead', [bomb]))?.level).toBe('big');
      const done = L({ k: 'shdone', p: ME, place: 1 });
      expect(batch(ctx('shithead', [bomb, done]))).toEqual(['mid', 'big']);
      // Bombe außer der Reihe von anderen, ich werde fertig
      const cut = L({ k: 'shburn', p: 'a', four: true, cut: true });
      const mine3 = L({ k: 'shdone', p: ME, place: 3 });
      expect(batch(ctx('shithead', [cut, mine3]))).toEqual(['mid', 'big']);
      // Platz 1 von anderen schlägt meine Bombe, ein späterer Platz anderer nicht
      const first = L({ k: 'shdone', p: 'a', place: 1 });
      expect(batch(ctx('shithead', [bomb, first]))).toEqual(['mid', 'big']);
      const second = L({ k: 'shdone', p: 'a', place: 2 });
      expect(batch(ctx('shithead', [bomb, second]))).toEqual(['big', 'mid']);
    });

    it('Shithead: Verbrennen mit 12 Karten wird mittel, das Fertig bleibt groß', () => {
      const burn = L({ k: 'shburn', p: ME, four: false, cut: false });
      const o = { prev: { sh: sh(0) }, v: { sh: sh(12) } };
      expect(cue(burn, ctx('shithead', [burn], o))?.level).toBe('big');
      const done = L({ k: 'shdone', p: ME, place: 2 });
      expect(batch(ctx('shithead', [burn, done], o))).toEqual(['mid', 'big']);
    });

    it('Steht das Partieende im Schub, ist Fertig ein Takt und nichts wird gekürzt', () => {
      const bomb = L({ k: 'shburn', p: ME, four: true, cut: false });
      const done = L({ k: 'shdone', p: ME, place: 1 });
      const end = L({ k: 'shend', p: 'b' });
      expect(batch(ctx('shithead', [bomb, done, end]))).toEqual(['big', 'big', null]);
      expect(cue(done, ctx('shithead', [bomb, done, end]))).toEqual({ level: 'big', beat: true });
      // Durak: mit dkend im Schub ist das Bito ohnehin mittel, das Fertig ein Takt
      const bito = L({ k: 'dkbito', p: ME, cnt: 2 * DK_MAX_ATTACK });
      const out = L({ k: 'dkout', p: ME, place: 2 });
      const dkEnd = L({ k: 'dkend', p: 'b' });
      expect(batch(ctx('durak', [bito, out, dkEnd], { prev: { dk } }))).toEqual(['mid', 'big', null]);
    });

    it('Ablauf (sequence.ts): Stufe nach den Karten des Schritts, Vorrang über den ganzen Schub', () => {
      type Burn = Extract<LogEntry, { k: 'shburn' }>;
      const bomb = L({ k: 'shburn', p: ME, four: true, cut: false }) as Burn;
      const burn = L({ k: 'shburn', p: ME, four: false, cut: false }) as Burn;
      const done = L({ k: 'shdone', p: ME, place: 1 });
      // Der Ablauf kennt nur seinen Stand vor und nach dem Schritt, die Ansicht steht schon am Ende des Schubs
      const alone = ctx('shithead', [burn]);
      expect(burnCue(burn, 12, alone).level).toBe('big');
      expect(burnCue(burn, SAY.burnBig - 1, alone).level).toBe('mid');
      expect(burnCue(burn, 4, alone).level).toBe('mid');
      expect(burnCue(bomb, 4, ctx('shithead', [bomb])).level).toBe('big');
      for (const [e, n] of [
        [bomb, 4],
        [burn, 12],
      ] as const) {
        const full = ctx('shithead', [e, done], { prev: { sh: sh(0) }, v: { sh: sh(n) } });
        // apply.ts beginnt den Schub vor dem Ablauf, runStep meldet das Verbrennen
        const b = newBatch(full.fresh);
        expect(levelInBatch(burnCue(e, n, { ...full, prev: full.v }), b)).toBe('mid');
        // effects(prev, v, true) zählt ein großes Verbrennen des Ablaufs nur mit, wenn cueOf es groß nennt
        if (cueOf(e, full)?.level === 'big') b.big = true;
        expect(levelInBatch(cueOf(done, full) as Cue, b)).toBe('big');
      }
    });
  });

  it('zeigt das Partieende nur beim Wechsel nach „over“', () => {
    const end = L({ k: 'cbend', p: 'a' });
    expect(cue(end, ctx('cabo', [end], { v: { phase: 'over' } }))).toEqual({ level: 'big' });
    expect(cue(end, ctx('cabo', [end], { prev: { phase: 'over' }, v: { phase: 'over' } }))).toBeNull();
    const tie = L({ k: 'dkend' });
    expect(cue(tie, ctx('durak', [tie], { v: { phase: 'over' } }))).toEqual({ level: 'big', beat: true });
  });

  it('macht Treffen auf mich stärker als bei anderen', () => {
    const spy = (n: number) => ({ ...L({ k: 'cbspy', p: 'a', to: ME }), n }) as LogEntry;
    const even = spy(2 * SAY.cbSpyEvery);
    const odd = spy(2 * SAY.cbSpyEvery + 1);
    expect(cue(even, ctx('cabo', [even]))).toEqual({ level: 'mid', taunt: true });
    expect(cue(odd, ctx('cabo', [odd]))).toEqual({ level: 'mid' });
    const tr = L({ k: 'dktransfer', p: 'a', cards: ['H6'], to: ME });
    expect(cue(tr, ctx('durak', [tr]))).toEqual({ level: 'big', taunt: true });
    const toss = L({ k: 'toss', p: 'a', item: 'egg', to: 'b' });
    expect(cue(toss, ctx('schnautz', [toss]))).toBeNull();
  });

  it('meldet das Revanche-Ergebnis nur mit Menschen und mehr als zwei Leuten', () => {
    const e = L({ k: 'rematchend', p: 'b', to: ME, tn: 'Tahna', res: 'lost', c: 1 });
    expect(cue(e, ctx('shithead', [e]))).toEqual({ level: 'big', beat: true });
    const bots = L({ k: 'rematchend', p: 'b', to: 'b', tn: 'Bodo', res: 'lost', c: 1 });
    expect(cue(bots, ctx('shithead', [bots]))).toBeNull();
  });

  it('hält die Schwellen an einer Stelle', () => {
    expect(SAY).toEqual({
      pickupTaunt: 6,
      dkTakeEvery: 3,
      cbSpyEvery: 2,
      bitoTaunt: 6,
      burnBig: 10,
      fan: 8,
    });
  });
});
