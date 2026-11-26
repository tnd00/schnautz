/*
 * Kartennamen für den Vorleser (Plan 2.8 Abschnitt 9.1): Jeder Name kommt aus dem Katalog, Karten aus dem zweiten Deck
 * heißen wie aus dem ersten, fremde verdeckte Karten tragen nie einen Wert.
 */
import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '../../src/game/types';
import { RANK_NAME, SUIT_NAME, TABLE } from '../../src/content/texts/table';
import { cardHTML, cardName } from '../../src/ui/cards';
import { parseHTML, qsa } from './helpers';

const SUITS = Object.keys(SUIT_NAME) as Suit[];
const RANKS = Object.keys(RANK_NAME) as Rank[];
const ALL: Card[] = SUITS.flatMap((s) => RANKS.flatMap((r) => [`${s}${r}`, `${s}${r}:2`]));

const card = (html: string) => {
  const els = qsa(parseHTML(html), '.card');
  expect(els).toHaveLength(1);
  return els[0].attrs;
};

describe('Kartennamen', () => {
  it('kommen aus dem Katalog, in alter und neuer Form gleich', () => {
    for (const c of ALL) {
      const want = `${SUIT_NAME[c[0] as Suit]} ${RANK_NAME[c.replace(':2', '').slice(1) as Rank]}`;
      expect(cardName(c)).toBe(want);
      expect(card(cardHTML(c))['aria-label']).toBe(want);
      expect(card(cardHTML(c, { key: `hand:${c}` }))['aria-label']).toBe(want);
    }
  });

  it('zweites Deck heißt wie das erste, nur der Schlüssel bleibt eindeutig', () => {
    const a = card(cardHTML('HA', { key: 'hand:HA', act: 'shh' }));
    const b = card(cardHTML('HA:2', { key: 'hand:HA:2', act: 'shh' }));
    expect(b['aria-label']).toBe(a['aria-label']);
    expect(b['data-r']).toBe('A');
    expect(a['data-fk']).not.toBe(b['data-fk']);
  });

  it('hängt Trumpf und Punkte an offene Karten', () => {
    expect(card(cardHTML('H10', { key: 'k', trump: true }))['aria-label']).toBe(`Herz Zehn${TABLE.trump}`);
    expect(card(cardHTML('SD', { key: 'k', value: 12 }))['aria-label']).toBe('Pik Dame, 12 Punkte');
    expect(card(cardHTML('CA', { key: 'k', value: 1 }))['aria-label']).toBe('Kreuz Ass, 1 Punkt');
  });

  it('fremde verdeckte Karten tragen nie einen Wert', () => {
    // Auch wenn ein Modell aus Versehen Punkte mitgibt, steht am Rücken nichts davon
    const plain = card(cardHTML(null, { key: 'cb:p2:3', value: 7 }));
    expect(plain['aria-hidden']).toBe('true');
    expect(plain['aria-label']).toBeUndefined();
    expect(plain['data-r']).toBeUndefined();
    const named = card(cardHTML(null, { key: 'cb:p2:3', value: 7, backName: 'Lenas 3. Karte, verdeckt' }));
    expect(named['aria-label']).toBe('Lenas 3. Karte, verdeckt');
    expect(named.role).toBe('img');
    const words = [...Object.values(SUIT_NAME), ...Object.values(RANK_NAME), 'Punkt'];
    for (const w of words) expect(named['aria-label']).not.toContain(w);
    // Ungültige Werte werden zum Rücken
    expect(card(cardHTML('HX' as Card, { key: 'k' })).class).toContain('back');
  });

  it('antippbarer Rücken heißt wenigstens verdeckte Karte', () => {
    const a = card(cardHTML(null, { key: 'down:0', act: 'shd', i: 0 }));
    expect(a['aria-label']).toBe(TABLE.back);
    expect(a.role).toBe('button');
  });
});
