/* Karten als HTML zeichnen. Alle Kartenwerte werden gegen CARD_RE geprüft, bevor sie in HTML landen. */
import { rankOf, suitOf } from '../game/cards';
import { SUIT_SYM } from '../game/constants';
import type { Card, HandValue, Player, Rank, Rules, Suit } from '../game/types';
import { num } from './dom';

type Pip = readonly [x: number, y: number];

/** Position der Symbole auf Zahlenkarten in Prozent. */
const PIPS: Readonly<Record<string, readonly Pip[]>> = {
  2: [
    [50, 0],
    [50, 100],
  ],
  3: [
    [50, 0],
    [50, 50],
    [50, 100],
  ],
  4: [
    [33, 0],
    [67, 0],
    [33, 100],
    [67, 100],
  ],
  5: [
    [33, 0],
    [67, 0],
    [50, 50],
    [33, 100],
    [67, 100],
  ],
  6: [
    [33, 0],
    [67, 0],
    [33, 50],
    [67, 50],
    [33, 100],
    [67, 100],
  ],
  7: [
    [33, 0],
    [67, 0],
    [50, 25],
    [33, 50],
    [67, 50],
    [33, 100],
    [67, 100],
  ],
  8: [
    [33, 0],
    [67, 0],
    [50, 25],
    [33, 50],
    [67, 50],
    [50, 75],
    [33, 100],
    [67, 100],
  ],
  9: [
    [33, 0],
    [67, 0],
    [33, 33.3],
    [67, 33.3],
    [50, 50],
    [33, 66.7],
    [67, 66.7],
    [33, 100],
    [67, 100],
  ],
  10: [
    [33, 0],
    [67, 0],
    [50, 16.7],
    [33, 33.3],
    [67, 33.3],
    [33, 66.7],
    [67, 66.7],
    [50, 83.3],
    [33, 100],
    [67, 100],
  ],
};

export const CARD_RE = /^[CSHD](2|3|4|5|6|7|8|9|10|B|D|K|A)$/;

const SUIT_NAME: Record<Suit, string> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };
const RANK_NAME: Record<Rank, string> = {
  2: 'Zwei',
  3: 'Drei',
  4: 'Vier',
  5: 'Fünf',
  6: 'Sechs',
  7: 'Sieben',
  8: 'Acht',
  9: 'Neun',
  10: 'Zehn',
  B: 'Bube',
  D: 'Dame',
  K: 'König',
  A: 'Ass',
};

const isRed = (s: Suit | null) => s === 'H' || s === 'D';
export const cardName = (c: Card): string => `${SUIT_NAME[suitOf(c)]} ${RANK_NAME[rankOf(c)]}`;

/**
 * Eine Karte als HTML. Ohne gültigen Kartenwert wird die Rückseite gezeichnet.
 * `attrs` darf nur Attribute aus eigenem, sicherem Code enthalten.
 */
export function cardHTML(c?: Card | null, cls = '', attrs = ''): string {
  if (!c || !CARD_RE.test(c)) return `<div class="card back ${cls}" ${attrs}></div>`;
  const s = suitOf(c);
  const r = rankOf(c);
  const sym = SUIT_SYM[s];
  const ix = `<span class="ix"><span>${r}</span><i>${sym}</i></span><span class="ix br"><span>${r}</span><i>${sym}</i></span>`;
  let body: string;
  const pips = PIPS[r];
  if (pips) {
    body = pips
      .map(([x, y]) => `<span class="pip${y > 55 ? ' f' : ''}" style="left:${x}%;top:${19 + y * 0.62}%">${sym}</span>`)
      .join('');
  } else if (r === 'A') {
    body = `<div class="ace"><b>${sym}</b></div>`;
  } else {
    body = `<div class="face"><i>${sym}</i><b>${r}</b><i>${sym}</i></div>`;
  }
  return `<div class="card ${isRed(s) ? 'red ' : ''}${cls}" ${attrs} aria-label="${cardName(c)}">${ix}${body}</div>`;
}

/** Kleine Karte im Fließtext (Verlauf). */
export function cardChip(c: unknown): string {
  if (typeof c !== 'string' || !CARD_RE.test(c)) return '?';
  const s = suitOf(c);
  return `<span class="cs${isRed(s) ? ' r' : ''}">${SUIT_SYM[s]}${rankOf(c)}</span>`;
}

export const fmtVal = (v: number): string => String(v).replace('.', ',');

export function valHTML(hv: HandValue | null | undefined): string {
  if (!hv || hv.kind === 'none') return '';
  if (hv.kind === 'feuer') return 'Feuer · 33';
  if (hv.kind === 'drei') return '30,5 · Drei Gleiche';
  if (hv.kind === 'schnautz') return '31 · Schnautz';
  return `${num(hv.v)} <span class="${isRed(hv.suit) ? 'r' : ''}">${hv.suit ? SUIT_SYM[hv.suit] : ''}</span>`;
}

const SWIM_ICON =
  '<svg viewBox="0 0 36 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2 7c4-4 7 4 11 0s7 4 11 0 7 4 10 0"/><path d="M2 15c4-4 7 4 11 0s7 4 11 0 7 4 10 0"/></svg>';

/** Bierdeckel (Leben) eines Spielers. */
export function livesHTML(p: Pick<Player, 'out' | 'lives'>, rules: Pick<Rules, 'lives'>): string {
  if (p.out) return '<span class="tag outt">raus</span>';
  if (p.lives === 0) return `<span class="swim" title="schwimmt">${SWIM_ICON}schwimmt</span>`;
  const pl = num(p.lives);
  const max = Math.min(8, Math.max(num(rules.lives), pl));
  let h = `<span class="lives" title="${pl} Leben">`;
  for (let i = 0; i < max; i++) h += `<span class="coaster${i < pl ? '' : ' lost'}"></span>`;
  return `${h}</span>`;
}
