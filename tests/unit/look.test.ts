/*
 * Look am Tisch (src/ui/look.ts): Standard bis Runde 6 Legacy, Paletten und Farbe der Browserleiste mit den heutigen
 * Werten, applyLook setzt data-theme nie unter Legacy und lädt dort nichts nach.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREFS_DEFAULT } from '../../src/net/protocol';
import { applyLook, DEFAULT_LOOK, paletteOf, themeColorOf } from '../../src/ui/look';

afterEach(() => vi.unstubAllGlobals());

/** Kleines html mit dataset und dem Menüschalter, Speicher aus einer Map */
function fakeDom(store: Record<string, string>) {
  const html = { dataset: {} as Record<string, string> };
  const sw: Record<string, string> = {};
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
  vi.stubGlobal('document', {
    documentElement: html,
    getElementById: (id: string) =>
      id === 'menu-look' ? { setAttribute: (k: string, v: string) => (sw[k] = v) } : null,
  });
  return { html, sw };
}

describe('look', () => {
  it('bleibt bis Runde 6 bei Legacy', () => {
    expect(DEFAULT_LOOK).toBe('legacy');
    expect(DEFAULT_LOOK).toBe(PREFS_DEFAULT.look);
  });

  it('liefert die heutigen Farben', () => {
    expect(themeColorOf('legacy', 'game')).toBe('#123326');
    expect(themeColorOf('legacy', 'start')).toBe('#6f6cf0');
    expect(themeColorOf('sticker', 'game')).toBe('#6f6cf0');
    expect(paletteOf('legacy', 'gold')).toContain('#f3cd7d');
    for (const n of ['gold', 'brown', 'jester', 'party'] as const) {
      expect(paletteOf('legacy', n).length).toBeGreaterThan(3);
      for (const c of paletteOf('legacy', n)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('setzt unter Legacy kein Thema, auch wenn dunkel gespeichert ist', () => {
    const { html, sw } = fakeDom({ 'schnautz:theme': '"dark"' });
    applyLook();
    expect(html.dataset).toEqual({ look: 'legacy' });
    expect(sw['aria-checked']).toBe('true');
  });

  it('setzt unter Sticker Look und Thema', () => {
    const { html, sw } = fakeDom({ 'schnautz:look': '"sticker"', 'schnautz:theme': '"dark"' });
    applyLook();
    expect(html.dataset).toEqual({ look: 'sticker', theme: 'dark' });
    expect(sw['aria-checked']).toBe('false');
  });
});
