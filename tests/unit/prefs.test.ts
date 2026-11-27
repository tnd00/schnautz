/*
 * Vorlieben im Speicher (src/ui/prefs.ts): Look (unter `design`), Deck und Thema einzeln, der Rest als ein Objekt,
 * kaputte Einträge setzen nur ihr eigenes Feld zurück. Der alte Schlüssel `look` aus der Zeit mit Legacy als Standard
 * zählt nicht mehr. Ruhig folgt bei auto dem System, sonst der Wahl.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFS_DEFAULT } from '../../src/net/protocol';
import { calm, prefs, setPref } from '../../src/ui/prefs';

let mem: Map<string, string>;
let sysCalm = false;

beforeEach(() => {
  mem = new Map();
  sysCalm = false;
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
    matchMedia: (q: string) => ({ matches: q.includes('reduced-motion') && sysCalm }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('prefs', () => {
  it('liefert ohne Speicher den Standard', () => {
    expect(prefs()).toEqual(PREFS_DEFAULT);
  });

  it('speichert Look, Deck und Thema einzeln, den Rest als Objekt', () => {
    setPref('look', 'legacy');
    setPref('deck', 'classic');
    setPref('theme', 'dark');
    setPref('volume', 0.4);
    setPref('turnTone', 'off');
    expect(JSON.parse(mem.get('schnautz:design') ?? '')).toBe('legacy');
    expect(JSON.parse(mem.get('schnautz:deck') ?? '')).toBe('classic');
    expect(mem.has('schnautz:look')).toBe(false);
    expect(JSON.parse(mem.get('schnautz:prefs') ?? '')).toEqual({ volume: 0.4, turnTone: 'off' });
    expect(prefs()).toEqual({
      ...PREFS_DEFAULT,
      look: 'legacy',
      deck: 'classic',
      theme: 'dark',
      volume: 0.4,
      turnTone: 'off',
    });
  });

  it('gibt allen mit dem alten Standard Legacy jetzt Sticker, eine neue Wahl gilt', () => {
    // Vor Runde 6 stand unter `look` meist nur der damalige Standard, keine bewusste Wahl
    mem.set('schnautz:look', '"legacy"');
    expect(prefs().look).toBe('sticker');
    setPref('look', 'legacy');
    expect(prefs().look).toBe('legacy');
    setPref('look', 'sticker');
    expect(prefs().look).toBe('sticker');
  });

  it('übersteht kaputten Speicher Feld für Feld', () => {
    mem.set('schnautz:prefs', '{kaputt');
    mem.set('schnautz:design', '"neon"');
    mem.set('schnautz:deck', 'vinyl');
    expect(prefs()).toEqual(PREFS_DEFAULT);
    mem.set('schnautz:prefs', JSON.stringify({ volume: 'laut', drag: false, look: 'legacy', deck: 'classic' }));
    // Look und Deck im Objekt zählen nicht, nur der eigene Eintrag
    expect(prefs()).toEqual({ ...PREFS_DEFAULT, drag: false });
    setPref('haptic', false);
    expect(JSON.parse(mem.get('schnautz:prefs') ?? '')).toEqual({ volume: 'laut', drag: false, haptic: false });
  });

  it('hält die Wahl bis zum Neuladen, wenn der Speicher gesperrt ist', () => {
    const ls = (window as unknown as { localStorage: Record<string, unknown> }).localStorage;
    const blocked = (): never => {
      throw new Error('gesperrt');
    };
    Object.assign(ls, { getItem: blocked, setItem: blocked });
    setPref('look', 'legacy');
    setPref('drag', false);
    expect(prefs()).toEqual({ ...PREFS_DEFAULT, look: 'legacy', drag: false });
    // Geht der Speicher wieder, gilt er und die Sitzungswerte fallen weg
    Object.assign(ls, { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) });
    setPref('look', 'sticker');
    setPref('drag', true);
    expect(prefs()).toEqual(PREFS_DEFAULT);
    expect(mem.get('schnautz:design')).toBe('"sticker"');
  });

  it('Ruhig: auto folgt dem System, an und aus gelten immer', () => {
    expect(calm()).toBe(false);
    sysCalm = true;
    expect(calm()).toBe(true);
    setPref('calm', 'off');
    expect(calm()).toBe(false);
    sysCalm = false;
    setPref('calm', 'on');
    expect(calm()).toBe(true);
  });
});
