import { describe, expect, it } from 'vitest';
import { APP_VERSION, cmpVersion } from '../../src/content/version';
import pkg from '../../package.json' with { type: 'json' };

describe('Versionsvergleich', () => {
  it('kennt die eigene Version aus package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('vergleicht Zahl für Zahl, eine fehlende Version gilt als älter', () => {
    expect(cmpVersion('2.2.1', '2.2.1')).toBe(0);
    expect(cmpVersion('2.2.0', '2.2.1')).toBe(-1);
    expect(cmpVersion('2.10.0', '2.9.9')).toBe(1);
    expect(cmpVersion('2.2', '2.2.0')).toBe(0);
    expect(cmpVersion(undefined, '2.2.1')).toBe(-1);
    expect(cmpVersion('2.2.1', undefined)).toBe(1);
  });
});
