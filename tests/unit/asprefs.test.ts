/*
 * Vorlieben aus dem Speicher (Plan 2.8 Runde 1): asPrefs prüft Feld für Feld, was nicht passt, nimmt den Standard.
 * Der Speicher ist ungeprüft (CLAUDE.md), deshalb auch kaputte und fremde Werte.
 */
import { describe, expect, it } from 'vitest';
import { asPrefs, PREFS_DEFAULT, type Prefs } from '../../src/net/protocol';

const FULL: Prefs = {
  look: 'sticker',
  deck: 'classic',
  theme: 'dark',
  calm: 'on',
  drag: false,
  zones: true,
  dragSame: false,
  zoom: true,
  haptic: false,
  volume: 0.3,
  turnTone: 'always',
};

describe('asPrefs', () => {
  it('liefert ohne Speicher den Standard, Sticker mit Vinyl', () => {
    for (const x of [undefined, null, 0, 'legacy', true, [], [FULL]]) expect(asPrefs(x)).toEqual(PREFS_DEFAULT);
    expect(PREFS_DEFAULT.look).toBe('sticker');
    expect(PREFS_DEFAULT.deck).toBe('vinyl');
    expect(PREFS_DEFAULT.theme).toBe('light');
  });

  it('übernimmt gültige Werte unverändert', () => {
    expect(asPrefs(FULL)).toEqual(FULL);
    expect(asPrefs({ ...FULL, look: 'legacy', deck: 'vinyl', theme: 'light', calm: 'off', turnTone: 'off' })).toEqual({
      ...FULL,
      look: 'legacy',
      deck: 'vinyl',
      theme: 'light',
      calm: 'off',
      turnTone: 'off',
    });
  });

  it('setzt nur das kaputte Feld zurück, die übrigen bleiben', () => {
    expect(asPrefs({ ...FULL, look: 'Legacy' })).toEqual({ ...FULL, look: PREFS_DEFAULT.look });
    expect(asPrefs({ ...FULL, deck: 'Klassisch' })).toEqual({ ...FULL, deck: PREFS_DEFAULT.deck });
    expect(asPrefs({ ...FULL, theme: 1 })).toEqual({ ...FULL, theme: PREFS_DEFAULT.theme });
    expect(asPrefs({ ...FULL, calm: true })).toEqual({ ...FULL, calm: PREFS_DEFAULT.calm });
    expect(asPrefs({ ...FULL, drag: 'false' })).toEqual({ ...FULL, drag: PREFS_DEFAULT.drag });
    expect(asPrefs({ ...FULL, haptic: 0 })).toEqual({ ...FULL, haptic: PREFS_DEFAULT.haptic });
    expect(asPrefs({ ...FULL, turnTone: 'sometimes' })).toEqual({ ...FULL, turnTone: PREFS_DEFAULT.turnTone });
  });

  it('nimmt die Lautstärke nur als endliche Zahl und kappt sie auf 0 bis 1', () => {
    const vol = (volume: unknown) => asPrefs({ volume }).volume;
    expect(vol(0)).toBe(0);
    expect(vol(1)).toBe(1);
    expect(vol(0.5)).toBe(0.5);
    expect(vol(-2)).toBe(0);
    expect(vol(7)).toBe(1);
    for (const x of [NaN, Infinity, '0.5', null]) expect(vol(x)).toBe(PREFS_DEFAULT.volume);
  });

  it('lässt fremde Felder weg und gibt ein neues Objekt zurück', () => {
    const raw = { ...FULL, key: 'k-0123456789ab', __proto__x: 1 };
    const got = asPrefs(raw);
    expect(Object.keys(got).sort()).toEqual(Object.keys(PREFS_DEFAULT).sort());
    expect(got).not.toBe(raw);
    expect(asPrefs(JSON.parse('{"__proto__":{"look":"sticker"}}'))).toEqual(PREFS_DEFAULT);
  });

  it('übersteht die Rundreise als JSON wie im Speicher', () => {
    expect(asPrefs(JSON.parse(JSON.stringify(FULL)))).toEqual(FULL);
  });
});
