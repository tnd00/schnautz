import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../src/game/types';
import {
  decisivePlay,
  slowExtraMs,
  ZER_SHDONE_MS,
  ZER_SLOW_FLIGHT_MS,
  zerRevealDelay,
} from '../../src/ui/shithead/ceremony-plan';

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
