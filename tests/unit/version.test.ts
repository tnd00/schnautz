import { describe, expect, it } from 'vitest';
import { APP_VERSION, cmpVersion } from '../../src/content/version';
import pkg from '../../package.json' with { type: 'json' };
import { isNewGame } from '../../src/game/games';
import { rj } from '../../src/game/reject';
import { ctxOfView, rejectText } from '../../src/content/texts';
import { helloVerdict } from '../../src/net/host';
import { hostOldSearch, keepsInvite, RESUME_GIVEUP_MS, searchStep } from '../../src/net/guest';
import { wireReject } from '../../src/net/protocol';

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

/** Eine Minor-Version älter oder neuer als diese Seite */
const [MAJ, MIN] = APP_VERSION.split('.').map(Number);
const OLDER = `${MAJ}.${MIN - 1}.9`;
const NEWER = `${MAJ}.${MIN + 1}.0`;

describe('Neulade-Pflicht beim Beitreten', () => {
  const ctx = ctxOfView(null);

  it('weist einen älteren Gast mit net.update ab, die Einladung bleibt auch für Gäste von 2.7', () => {
    for (const v of [OLDER, '2.2.0', undefined]) expect(helloVerdict(v)).toEqual(rj('net.update'));
    const wire = wireReject(rj('net.update'), ctx);
    expect(keepsInvite(wire.msg, 'net.update')).toBe(true);
    // Ein Gast von 2.7 kennt den Code nicht und liest nur msg
    expect(keepsInvite(wire.msg)).toBe(true);
  });

  it('meldet einem neueren Gast, dass der Gastgeber neu laden muss, die Einladung bleibt', () => {
    expect(helloVerdict(NEWER)).toEqual(rj('net.hostOld'));
    expect(keepsInvite(undefined, 'net.hostOld')).toBe(true);
    expect(rejectText(rj('net.hostOld'), ctx)).toContain('Der Gastgeber muss die Seite neu laden');
  });

  it('sucht nach net.hostOld wie bei der Rückkehr weiter, die Frist läuft ab dem ersten Mal', () => {
    const T0 = 1_000_000;
    const first = hostOldSearch(0, T0);
    expect(first).toEqual({ first: true, since: T0 });
    // Ein zweites Mal (der Gastgeber antwortet noch mit der alten Version) verlängert nichts
    expect(hostOldSearch(T0, T0 + 30_000)).toEqual({ first: false, since: T0 });
    const s = { resume: true, since: first.since, signal: true, notFound: true, linked: false, tryAt: 0, slowAt: 0 };
    // Der Gastgeber lädt neu, „gibt es nicht“ beendet die Suche nicht
    expect(searchStep(s, T0 + 5_000).t).toBe('wait');
    expect(searchStep(s, T0 + RESUME_GIVEUP_MS - 1).t).toBe('wait');
    expect(searchStep(s, T0 + RESUME_GIVEUP_MS).t).toBe('end');
  });

  it('lässt dieselbe Version durch, auch in kurzer Schreibweise', () => {
    expect(helloVerdict(APP_VERSION)).toBeNull();
    expect(helloVerdict(`${MAJ}.${MIN}`)).toEqual(APP_VERSION.endsWith('.0') ? null : rj('net.update'));
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
