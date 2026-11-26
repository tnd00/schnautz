/*
 * Ablehnungscode net.update (Plan 2.8 Runde 1, Neulade-Pflicht): Der Gastgeber weist einen Gast mit älterem Build ab.
 * Gäste von 2.8 lesen den Code, Gäste von 2.7 kennen ihn nicht und lesen nur msg. Damit sie die Einladung behalten,
 * steht in der Vorlage der eingefrorene Wortteil „Lade die Seite neu“.
 */
import { describe, expect, it } from 'vitest';
import { isRejectCode, rj } from '../../src/game/reject';
import { ctxOfView, rejectText } from '../../src/content/texts';
import { asReject, readReject, wireReject } from '../../src/net/protocol';
import { keepsInvite } from '../../src/net/guest';

/** So prüft ein Gast von 2.6 und 2.7 ohne bekannten Code, ob die Einladung bleibt (eingefroren). */
const OLD_KEEPS = /voll|alle Plätze sind besetzt|Lade die Seite neu/;
const TEXT = 'An diesem Tisch läuft eine neuere Version. Lade die Seite neu, dann kannst du mitspielen.';

describe('net.update', () => {
  it('ist ein bekannter Code mit eigener Vorlage', () => {
    expect(isRejectCode('net.update')).toBe(true);
    expect(rejectText(rj('net.update'), ctxOfView(null))).toBe(TEXT);
  });

  it('nennt den Wortteil, an dem alte Gäste die Einladung behalten', () => {
    const wire = wireReject(rj('net.update'), ctxOfView(null));
    expect(wire).toEqual({ e: 'net.update', msg: TEXT });
    expect(wire.msg).toMatch(OLD_KEEPS);
    expect(keepsInvite(wire.msg)).toBe(true);
  });

  it('kommt beim Gast durch asReject, ohne Argumente und auch als JSON', () => {
    const wire = JSON.parse(JSON.stringify({ t: 'reject', ...wireReject(rj('net.update'), ctxOfView(null)) }));
    expect(asReject(wire)).toEqual({ e: 'net.update' });
    expect(readReject(wire, ctxOfView(null), 'Rückfall.')).toEqual({ text: TEXT, code: 'net.update' });
  });

  it('verwirft fremde Argumente wie bei jedem Code', () => {
    expect(asReject({ e: 'net.update', a: { key: 'k-0123456789ab' } })).toBeNull();
    expect(asReject({ e: 'net.update', a: { n: 'neu' } })).toBeNull();
  });
});
