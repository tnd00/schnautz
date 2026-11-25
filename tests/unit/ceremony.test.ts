import { describe, expect, it } from 'vitest';
import { GAMES } from '../../src/game/games';
import type { GameKind, LogEntry } from '../../src/game/types';
import {
  decisivePlay,
  planOf,
  revealDelayOf,
  slowExtraMs,
  ZER_SHDONE_MS,
  ZER_SLOW_FLIGHT_MS,
  zerRevealDelay,
} from '../../src/ui/ceremony-plan';

const e = (x: Partial<LogEntry> & { k: string }, n: number): LogEntry => ({ n, ...x }) as LogEntry;

describe('Zeitplan der Zeremonie', () => {
  it('findet den Zug, mit dem die vorletzte Person fertig wurde', () => {
    const fresh = [
      e({ k: 'shplay', p: 'a', cards: ['HA'], src: 'hand' }, 1),
      e({ k: 'shplay', p: 'b', cards: ['H5', 'D5'], src: 'down' }, 2),
      e({ k: 'shburn', p: 'b', four: false, cut: false }, 3),
      e({ k: 'shdone', p: 'b', place: 2 }, 4),
      e({ k: 'shend', p: 'c' }, 5),
    ];
    expect(decisivePlay(fresh)?.n).toBe(2);
    expect(slowExtraMs({ cards: ['H5', 'D5'] })).toBe(ZER_SLOW_FLIGHT_MS + 110);
    expect(zerRevealDelay(fresh, 1000)).toBe(1000 + ZER_SLOW_FLIGHT_MS + 110 + ZER_SHDONE_MS + 840);
    // Ohne Sequenz gibt es keine Zeitlupe
    expect(zerRevealDelay(fresh, 0)).toBe(ZER_SHDONE_MS + 840);
  });

  it('liefert nichts ohne Shithead oder wenn shdone nicht direkt davor steht', () => {
    expect(decisivePlay([e({ k: 'shplay', p: 'b', cards: ['H5'], src: 'hand' }, 1), e({ k: 'shend' }, 2)])).toBeNull();
    expect(
      decisivePlay([
        e({ k: 'shplay', p: 'b', cards: ['H5'], src: 'hand' }, 1),
        e({ k: 'chat', p: 'x', text: 'hi' }, 2),
        e({ k: 'shend', p: 'c' }, 3),
      ]),
    ).toBeNull();
  });
});

describe('Drehbuch je Spiel (planOf)', () => {
  it('deckt alle Spiele ab, Schnautz ohne Zeremonie', () => {
    const kinds = GAMES.map((g) => [g, planOf(g).kind] as const);
    expect(Object.fromEntries(kinds)).toEqual({
      schnautz: 'none',
      shithead: 'shame',
      durak: 'shame',
      cabo: 'crown',
    });
  });

  it('hat je Spiel das eigene Zeichen und die eigene Endart', () => {
    const look = (g: GameKind) => {
      const p = planOf(g);
      return p.kind === 'none' ? null : [p.mark, p.endKind, p.doneKind, p.sfx, p.what];
    };
    expect(look('shithead')).toEqual(['💩', 'shend', 'shdone', 'trombone', 'Shithead']);
    expect(look('durak')).toEqual(['🤡', 'dkend', 'dkout', 'trombone', 'Durak']);
    expect(look('cabo')).toEqual(['👑', 'cbend', null, 'crown', 'Cabo-König']);
    expect(look('schnautz')).toBeNull();
  });
});

describe('Wartezeit bis zur Enthüllung (revealDelayOf)', () => {
  const sh = [
    e({ k: 'shplay', p: 'b', cards: ['H5', 'D5'], src: 'down' }, 1),
    e({ k: 'shdone', p: 'b', place: 2 }, 2),
    e({ k: 'shend', p: 'c' }, 3),
  ];

  it('ist bei Shithead genau zerRevealDelay', () => {
    for (const seq of [0, 1000, 2500]) expect(revealDelayOf('shithead', sh, seq)).toBe(zerRevealDelay(sh, seq));
    const late = [e({ k: 'timeout', p: 'b' }, 0), ...sh];
    expect(revealDelayOf('shithead', late, 0)).toBe(zerRevealDelay(late, 0));
  });

  it('rechnet bei Durak und Cabo mit denselben Zeiten ohne Zeitlupe', () => {
    const dk = [e({ k: 'dkout', p: 'b', place: 2 }, 1), e({ k: 'dkend', p: 'c' }, 2)];
    const cb = [e({ k: 'cbround', scores: {}, caller: null, ok: null, kami: null }, 1), e({ k: 'cbend', p: 'c' }, 2)];
    expect(revealDelayOf('durak', dk, 0)).toBe(ZER_SHDONE_MS + 840);
    expect(revealDelayOf('cabo', cb, 0)).toBe(ZER_SHDONE_MS + 840);
    expect(revealDelayOf('durak', [e({ k: 'timeout', p: 'b' }, 0), ...dk], 0)).toBe(ZER_SHDONE_MS + 840 + 2240);
    // Das frühere zerRevealDelay ergab hier dieselben Werte
    expect(revealDelayOf('durak', dk, 0)).toBe(zerRevealDelay(dk, 0));
    expect(revealDelayOf('cabo', cb, 0)).toBe(zerRevealDelay(cb, 0));
  });

  it('ist 0 ohne Partieende des eigenen Spiels und bei Schnautz immer', () => {
    expect(revealDelayOf('shithead', [e({ k: 'shplay', p: 'b', cards: ['H5'], src: 'hand' }, 1)], 800)).toBe(0);
    expect(revealDelayOf('durak', sh, 0)).toBe(0);
    expect(revealDelayOf('cabo', sh, 0)).toBe(0);
    expect(revealDelayOf('schnautz', sh, 0)).toBe(0);
    expect(revealDelayOf('schnautz', [e({ k: 'winner', p: 'a' }, 1)], 0)).toBe(0);
  });
});
