/*
 * Vorlieben im Speicher (src/ui/prefs.ts): Look und Thema einzeln, der Rest als ein Objekt, kaputte Einträge setzen
 * nur ihr eigenes Feld zurück. Ruhig folgt bei auto dem System, sonst der Wahl.
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

  it('speichert Look und Thema einzeln, den Rest als Objekt', () => {
    setPref('look', 'sticker');
    setPref('theme', 'dark');
    setPref('volume', 0.4);
    setPref('turnTone', 'off');
    expect(JSON.parse(mem.get('schnautz:look') ?? '')).toBe('sticker');
    expect(JSON.parse(mem.get('schnautz:prefs') ?? '')).toEqual({ volume: 0.4, turnTone: 'off' });
    expect(prefs()).toEqual({ ...PREFS_DEFAULT, look: 'sticker', theme: 'dark', volume: 0.4, turnTone: 'off' });
  });

  it('übersteht kaputten Speicher Feld für Feld', () => {
    mem.set('schnautz:prefs', '{kaputt');
    mem.set('schnautz:look', '"neon"');
    expect(prefs()).toEqual(PREFS_DEFAULT);
    mem.set('schnautz:prefs', JSON.stringify({ volume: 'laut', drag: false, look: 'sticker' }));
    // look im Objekt zählt nicht, nur der eigene Eintrag
    expect(prefs()).toEqual({ ...PREFS_DEFAULT, drag: false });
    setPref('haptic', false);
    expect(JSON.parse(mem.get('schnautz:prefs') ?? '')).toEqual({ volume: 'laut', drag: false, haptic: false });
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
