/* Karten als HTML zeichnen. Alle Kartenwerte werden gegen CARD_RE geprüft, bevor sie in HTML landen. */
import { rankOf, suitOf } from '../game/cards';
import { SUIT_SYM } from '../game/constants';
import type { Card, HandValue, Player, Rules, Suit } from '../game/types';
import { RANK_NAME, SUIT_NAME, TABLE } from '../content/texts/table';
import { esc, num } from './dom';
import type { CardOpts } from './table/types';

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

/** Zweites Deck trägt hinten `:2` (siehe DECK2 in game/cards). */
export const CARD_RE = /^[CSHD](2|3|4|5|6|7|8|9|10|B|D|K|A)(:2)?$/;

const isRed = (s: Suit | null) => s === 'H' || s === 'D';
export const cardName = (c: Card): string => `${SUIT_NAME[suitOf(c)]} ${RANK_NAME[rankOf(c)]}`;

/** Vorderseite ohne Hülle: Ecken und Augen. `--x`/`--y` tragen die Augenlage im Raster 0 bis 100 (Kartenset Vinyl). */
function faceHTML(c: Card): string {
  const s = suitOf(c);
  const r = rankOf(c);
  const sym = SUIT_SYM[s];
  const ix = `<span class="ix"><span>${r}</span><i>${sym}</i></span><span class="ix br"><span>${r}</span><i>${sym}</i></span>`;
  const pips = PIPS[r];
  if (pips)
    return (
      ix +
      pips
        .map(
          ([x, y]) =>
            `<span class="pip${y > 55 ? ' f' : ''}" style="--x:${x};--y:${y};left:${x}%;top:${19 + y * 0.62}%">${sym}</span>`,
        )
        .join('')
    );
  if (r === 'A') return `${ix}<div class="ace"><b>${sym}</b></div>`;
  return `${ix}<div class="face"><i>${sym}</i><b>${r}</b><i>${sym}</i></div>`;
}

/**
 * Eine Karte als HTML. Ohne gültigen Kartenwert wird die Rückseite gezeichnet.
 * Neue Form `cardHTML(c, o)` mit Rollen, Namen und `data-fk` aus den Optionen (gefuehl 3.3). Die alte Form mit `cls`
 * und `attrs` bleibt bis 4a, `attrs` darf nur Attribute aus eigenem, sicherem Code enthalten.
 */
export function cardHTML(c?: Card | null, o: CardOpts | string = '', attrs = ''): string {
  const ok = !!c && CARD_RE.test(c);
  if (typeof o === 'object') return optsHTML(ok ? (c as Card) : null, o);
  if (!ok) return `<div class="card back ${o}" ${attrs}></div>`;
  const s = suitOf(c as Card);
  return `<div class="card ${isRed(s) ? 'red ' : ''}${o}" ${attrs} aria-label="${cardName(c as Card)}" data-r="${rankOf(c as Card)}">${faceHTML(c as Card)}</div>`;
}

/** Neue Form: Rolle, Name, Zustand und Haken fürs Ziehen. Fremde verdeckte Karten tragen nie einen Wert. */
function optsHTML(c: Card | null, o: CardOpts): string {
  const cls = `card${c ? (isRed(suitOf(c)) ? ' red' : '') : ' back'}${o.cls ? ` ${o.cls}` : ''}${o.sel ? ' sel' : ''}${o.dim ? ' dim' : ''}`;
  const name = c
    ? cardName(c) + (o.trump ? TABLE.trump : '') + (o.value != null ? TABLE.points(o.value) : '')
    : (o.backName ?? (o.act ? TABLE.back : ''));
  let a = ` data-fk="${esc(o.key)}"`;
  if (o.act) a += ` data-act="${o.act}" role="button" tabindex="${o.tab ?? 0}" aria-pressed="${!!o.sel}"`;
  else if (name) a += ' role="img"';
  a += name ? ` aria-label="${esc(name)}"` : ' aria-hidden="true"';
  if (o.why) a += ` aria-disabled="true" aria-description="${esc(o.why)}"`;
  if (o.i != null) a += ` data-i="${o.i}"`;
  if (o.sid != null) a += ` data-sid="${o.sid}"`;
  if (o.owner) a += ` data-o="${esc(o.owner)}"`;
  if (o.drag) a += ` data-drag="${o.drag}"`;
  if (c) a += ` data-r="${rankOf(c)}"`;
  if (o.style) a += ` style="${o.style}"`;
  return `<div class="${cls}"${a}>${c ? faceHTML(c) : ''}${o.extra ?? ''}</div>`;
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

/** Kennzeichen für KI-Plätze neben dem Namen. */
export const BOT_TAG = '<i class="botb" title="KI-Platz">KI</i>';

/** Drei gefächerte Karten: Zeichen für Handkarten, gut lesbar auch in Pillengröße. */
export const HAND_ICON =
  '<svg class="hico" viewBox="0 0 26 19" aria-hidden="true"><g stroke="#1c1b18" stroke-opacity=".7" stroke-width="1.1">' +
  '<rect x="8.5" y="2" width="9" height="13" rx="1.8" fill="#d8ccb2" transform="rotate(-24 13 22)"/>' +
  '<rect x="8.5" y="2" width="9" height="13" rx="1.8" fill="#ebe2cd"/>' +
  '<g transform="rotate(24 13 22)"><rect x="8.5" y="2" width="9" height="13" rx="1.8" fill="#fffdf6"/>' +
  '<path d="M13 5.6l2 2.9-2 2.9-2-2.9z" fill="#b3312a" stroke="none"/></g></g></svg>';

export const SWIM_ICON =
  '<svg viewBox="0 0 36 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2 7c4-4 7 4 11 0s7 4 11 0 7 4 10 0"/><path d="M2 15c4-4 7 4 11 0s7 4 11 0 7 4 10 0"/></svg>';

/** Leben einer Person bei Schnautz. */
export function livesHTML(p: Pick<Player, 'out' | 'lives'>, rules: Pick<Rules, 'lives'>): string {
  if (p.out) return '<span class="tag outt">raus</span>';
  if (p.lives === 0) return `<span class="swim" title="schwimmt">${SWIM_ICON}<span class="swt">schwimmt</span></span>`;
  const pl = num(p.lives);
  const max = Math.min(8, Math.max(num(rules.lives), pl));
  let h = `<span class="lives" title="${pl} Leben">`;
  for (let i = 0; i < max; i++) h += `<span class="coaster${i < pl ? '' : ' lost'}"></span>`;
  return `${h}</span>`;
}
