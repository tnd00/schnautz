import { describe, expect, it } from 'vitest';
import { APP_VERSION, cmpVersion } from '../../src/content/version';
import pkg from '../../package.json' with { type: 'json' };
import { canShow, GAMES, isNewGame } from '../../src/game/games';

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

describe('Welche Seite welches Spiel zeigen kann', () => {
  it('lässt Schnautz und Shithead auch für Seiten ohne Versionsangabe zu', () => {
    expect(canShow('schnautz', undefined)).toBe(true);
    expect(canShow('shithead', '2.1.0')).toBe(true);
    expect(GAMES.every((g) => canShow(g, APP_VERSION))).toBe(true);
  });
});

describe('„Neu“ auf der Startseite', () => {
  it('trägt nur das zuletzt dazugekommene Spiel, eine Minor-Version lang', () => {
    expect(isNewGame('cabo', '2.5.0')).toBe(true);
    expect(isNewGame('cabo', '2.6.3')).toBe(true);
    expect(isNewGame('cabo', '2.7.0')).toBe(false);
    expect(isNewGame('cabo', '3.5.0')).toBe(false);
    expect(isNewGame('durak', '2.5.0')).toBe(false);
    expect(isNewGame('shithead', '2.5.0')).toBe(false);
  });
});
