import { describe, expect, it } from 'vitest';
import {
  BURST_CALM_MS,
  BURST_MAX_MS,
  EMOTE_GAP_MS,
  EMOTE_HOST_WINDOW_MS,
  SOUND_GAP_MS,
  SOUND_HOST_WINDOW_MS,
  TOSS_GAP_MS,
  TOSS_HOST_WINDOW_MS,
} from '../../src/game/constants';
import { allowBurst, newRateBook, rateSound, tableQuiet } from '../../src/net/rate';
import { burst, resetBurst } from '../../src/ui/burst';

describe('Sperre im Browser', () => {
  it('lässt drei schnell durch, danach eine Pause, die bei weiterem Spammen bis 5 Sekunden wächst', () => {
    resetBurst();
    const t0 = 10_000;
    expect(burst('emote', 1000, t0)).toEqual({ ok: true, cool: 0 });
    expect(burst('emote', 1000, t0 + 10)).toEqual({ ok: true, cool: 0 });
    expect(burst('emote', 1000, t0 + 20)).toEqual({ ok: true, cool: 1000 });
    // Während der Pause geht nichts, auch kein Verlängern
    expect(burst('emote', 1000, t0 + 500).ok).toBe(false);
    const pauses: number[] = [];
    let t = t0 + 1020;
    for (let i = 0; i < 5; i++) {
      const r = burst('emote', 1000, t);
      expect(r.ok).toBe(true);
      pauses.push(r.cool);
      t += r.cool;
    }
    expect(pauses).toEqual([1600, 2560, 4096, BURST_MAX_MS, BURST_MAX_MS]);
    // Nach Ruhe wieder drei auf einmal
    t += BURST_CALM_MS;
    expect(burst('emote', 1000, t).cool).toBe(0);
    expect(burst('emote', 1000, t + 1).cool).toBe(0);
    // Arten zählen getrennt
    expect(burst('sound', 1000, t + 2)).toEqual({ ok: true, cool: 0 });
  });
});

describe('Sperren beim Host', () => {
  it('lässt pro Platz und Art drei im Fenster durch, danach erst wieder nach Ablauf', () => {
    const b = newRateBook();
    expect(allowBurst(b, 'toss', 'a', TOSS_HOST_WINDOW_MS, 1000)).toBe(true);
    expect(allowBurst(b, 'toss', 'a', TOSS_HOST_WINDOW_MS, 1010)).toBe(true);
    expect(allowBurst(b, 'toss', 'a', TOSS_HOST_WINDOW_MS, 1020)).toBe(true);
    expect(allowBurst(b, 'toss', 'a', TOSS_HOST_WINDOW_MS, 1030)).toBe(false);
    expect(allowBurst(b, 'toss', 'b', TOSS_HOST_WINDOW_MS, 1030)).toBe(true);
    expect(allowBurst(b, 'emote', 'a', TOSS_HOST_WINDOW_MS, 1030)).toBe(true);
    expect(allowBurst(b, 'toss', 'a', TOSS_HOST_WINDOW_MS, 1000 + TOSS_HOST_WINDOW_MS)).toBe(true);
  });

  it('verwirft nie, was die Oberfläche erlaubt', () => {
    for (const [gap, win] of [
      [EMOTE_GAP_MS, EMOTE_HOST_WINDOW_MS],
      [TOSS_GAP_MS, TOSS_HOST_WINDOW_MS],
      [SOUND_GAP_MS, SOUND_HOST_WINDOW_MS],
    ]) {
      resetBurst();
      const b = newRateBook();
      let t = 0;
      for (let i = 0; i < 12; i++) {
        const r = burst('x', gap, t);
        expect(r.ok).toBe(true);
        expect(allowBurst(b, 'x', 'p', win, t)).toBe(true);
        t += r.cool || 5;
      }
    }
  });

  it('macht Klänge ab dem fünften im Tischfenster stumm', () => {
    const b = newRateBook();
    expect(rateSound(b, 'a', 0)).toBe('ok');
    expect(rateSound(b, 'a', 1)).toBe('ok');
    expect(rateSound(b, 'a', 2)).toBe('ok');
    expect(rateSound(b, 'a', 3)).toBe('seat');
    expect(rateSound(b, 'b', 4)).toBe('ok');
    expect(rateSound(b, 'c', 5)).toBe('quiet');
    expect(b.table).toHaveLength(4);
    expect(tableQuiet(b, 6)).toBe(false);
    expect(tableQuiet(b, 4 + 6000)).toBe(true);
    expect(rateSound(b, 'c', 4 + 6000)).toBe('ok');
  });
});
