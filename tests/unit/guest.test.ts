import { describe, expect, it } from 'vitest';
import { seatGuest } from '../../src/game/seats';
import { addPlayer, newState } from '../../src/game/state';
import {
  EXPIRE_WAIT_MS,
  JOIN_GIVEUP_MS,
  keepsInvite,
  RESUME_GIVEUP_MS,
  type Search,
  searchEndText,
  searchStep,
  SLOW_GIVEUP_MS,
} from '../../src/net/guest';

const T0 = 1_000_000;

/** Frischer Beitritt, Peer offen, erster Versuch kurz nach dem Start. */
function fresh(over: Partial<Search> = {}): Search {
  return {
    resume: false,
    since: T0,
    signal: true,
    notFound: false,
    linked: false,
    tryAt: T0 + 100,
    slowAt: 0,
    ...over,
  };
}

describe('Suche nach dem Tisch, frischer Beitritt', () => {
  it('endet beim ersten „gibt es nicht“ sofort mit „Kein Tisch“', () => {
    expect(searchStep(fresh({ notFound: true }), T0 + 5_100)).toEqual({ t: 'end', why: 'notfound' });
    // Auch ganz früh, eine zweite Runde passt nicht mehr unter 10 Sekunden
    expect(searchStep(fresh({ notFound: true }), T0 + 1)).toEqual({ t: 'end', why: 'notfound' });
  });

  it('wartet bis zur festen Frist und keine Millisekunde länger', () => {
    expect(searchStep(fresh(), T0)).toEqual({ t: 'wait', at: T0 + JOIN_GIVEUP_MS });
    expect(searchStep(fresh(), T0 + JOIN_GIVEUP_MS - 1)).toEqual({ t: 'wait', at: T0 + JOIN_GIVEUP_MS });
    expect(searchStep(fresh(), T0 + JOIN_GIVEUP_MS).t).toBe('slow');
  });

  it('die Frist bleibt unter 10 Sekunden', () => {
    expect(JOIN_GIVEUP_MS).toBeLessThan(10_000);
    // Der Server meldet „gibt es nicht“ nach höchstens EXPIRE_WAIT_MS, ein früher Versuch ist vor der Frist geklärt
    expect(EXPIRE_WAIT_MS).toBeLessThan(JOIN_GIVEUP_MS);
  });

  it('ohne offenen eigenen Peer liegt es am Server, nicht am Tisch', () => {
    const s = fresh({ signal: false, tryAt: 0 });
    expect(searchStep(s, T0 + JOIN_GIVEUP_MS - 1).t).toBe('wait');
    expect(searchStep(s, T0 + JOIN_GIVEUP_MS)).toEqual({ t: 'end', why: 'server' });
  });

  it('nach der Frist ohne „gibt es nicht“ kommt der WLAN-Rat und noch eine feste Frist', () => {
    const now = T0 + JOIN_GIVEUP_MS;
    expect(searchStep(fresh(), now)).toEqual({ t: 'slow', at: now + SLOW_GIVEUP_MS });
    const slow = fresh({ slowAt: now });
    expect(searchStep(slow, now + SLOW_GIVEUP_MS - 1)).toEqual({ t: 'wait', at: now + SLOW_GIVEUP_MS });
    expect(searchStep(slow, now + SLOW_GIVEUP_MS)).toEqual({ t: 'end', why: 'slow' });
  });

  it('kommt „gibt es nicht“ noch während des WLAN-Rats, ist der Tisch weg', () => {
    expect(searchStep(fresh({ slowAt: T0 + JOIN_GIVEUP_MS, notFound: true }), T0 + 12_000)).toEqual({
      t: 'end',
      why: 'notfound',
    });
  });

  it('ging der letzte Versuch spät los, wartet die Frist noch auf die Antwort des Servers', () => {
    const late = fresh({ tryAt: T0 + 4_000 });
    const heard = T0 + 4_000 + EXPIRE_WAIT_MS;
    expect(searchStep(late, T0 + JOIN_GIVEUP_MS)).toEqual({ t: 'wait', at: heard });
    expect(searchStep(late, heard - 1)).toEqual({ t: 'wait', at: heard });
    expect(searchStep(late, heard).t).toBe('slow');
  });

  it('ohne jeden Versuch, aber mit Server, gilt die direkte Verbindung als Grund', () => {
    expect(searchStep(fresh({ tryAt: 0 }), T0 + JOIN_GIVEUP_MS).t).toBe('slow');
  });

  it('steht die Verbindung schon, wartet sie kurz auf die Antwort des Gastgebers', () => {
    const now = T0 + JOIN_GIVEUP_MS + SLOW_GIVEUP_MS;
    const r = searchStep(fresh({ linked: true, slowAt: T0 + JOIN_GIVEUP_MS }), now);
    expect(r.t).toBe('wait');
    if (r.t === 'wait') expect(r.at).toBeGreaterThan(now);
  });
});

describe('Suche nach dem Tisch, zurück an den eigenen Platz', () => {
  const back = (over: Partial<Search> = {}) => fresh({ resume: true, ...over });

  it('gibt bei „gibt es nicht“ nicht auf, sondern versucht es weiter', () => {
    expect(searchStep(back({ notFound: true }), T0 + 6_000)).toEqual({ t: 'wait', at: T0 + RESUME_GIVEUP_MS });
    expect(searchStep(back({ notFound: true }), T0 + 60_000).t).toBe('wait');
  });

  it('wartet länger als der Gastgeber zum Wiederaufbau braucht', () => {
    expect(RESUME_GIVEUP_MS).toBeGreaterThan(120_000);
    expect(searchStep(back({ notFound: true }), T0 + RESUME_GIVEUP_MS - 1).t).toBe('wait');
    expect(searchStep(back({ notFound: true }), T0 + RESUME_GIVEUP_MS)).toEqual({ t: 'end', why: 'gone' });
  });

  it('nennt am Ende den passenden Grund', () => {
    const end = T0 + RESUME_GIVEUP_MS;
    expect(searchStep(back(), end)).toEqual({ t: 'end', why: 'slow' });
    expect(searchStep(back({ signal: false }), end)).toEqual({ t: 'end', why: 'server' });
  });

  it('zeigt keinen WLAN-Rat nach der kurzen Frist', () => {
    expect(searchStep(back(), T0 + JOIN_GIVEUP_MS).t).toBe('wait');
    expect(searchStep(back({ signal: false }), T0 + JOIN_GIVEUP_MS).t).toBe('wait');
  });
});

describe('Meldungen am Ende der Suche', () => {
  it('„Kein Tisch“ beendet die Einladung, Netzprobleme behalten sie', () => {
    expect(searchEndText('notfound', 'ZZZZZ')).toEqual({
      msg: 'Kein Tisch mit dem Code ZZZZZ gefunden. Prüf den Code oder frag, ob der Tisch noch offen ist.',
      endInv: true,
    });
    expect(searchEndText('gone', 'ZZZZZ').endInv).toBe(true);
    expect(searchEndText('server', 'ZZZZZ').endInv).toBe(false);
    expect(searchEndText('slow', 'ZZZZZ').endInv).toBe(false);
  });

  it('halten die Schreibregeln ein', () => {
    for (const why of ['notfound', 'gone', 'server', 'slow'] as const) {
      const { msg } = searchEndText(why, 'ABCDE');
      expect(msg).not.toMatch(/[–—]/);
      expect(msg).not.toMatch(/, und /);
      expect(msg).not.toMatch(/(?:^|[\s„"(])(?:[Ii]ch|mich|mir|[Mm]ein\w*)\b/);
      expect(msg).not.toMatch(/Spieler|Host|Raum/);
    }
  });
});

describe('Einladung nach einer Abweisung (auch für Gäste mit 2.6)', () => {
  it('bleibt bei den drei eingefrorenen Wortteilen', () => {
    expect(keepsInvite('Der Tisch ist voll.')).toBe(true);
    expect(keepsInvite('Die Partie läuft schon und alle Plätze sind besetzt.')).toBe(true);
    expect(keepsInvite('An diesem Tisch läuft Cabo. Lade die Seite neu, dann kannst du mitspielen.')).toBe(true);
  });

  it('endet bei allem anderen', () => {
    expect(keepsInvite(undefined)).toBe(false);
    expect(keepsInvite('')).toBe(false);
    expect(keepsInvite('Beitreten hat nicht geklappt.')).toBe(false);
  });

  it('erkennt die echte Abweisung eines vollen Tischs', () => {
    const st = newState('h', 'Gastgeber');
    for (let i = 0; i < 20 && !addPlayer(st, `p${i}`, `Gast ${i}`); i++);
    const r = seatGuest(st, 'neu', 'Neu');
    expect('err' in r && keepsInvite(r.err)).toBe(true);
  });
});
