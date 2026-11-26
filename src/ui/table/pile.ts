/*
 * Baustein Tischmitte (Plan 2.8 Abschnitt 8, geruest.md 3.6): Überschrift und Stapel aus einem CenterModel. Ziele fürs
 * Ziehen stehen in `data-drop`, antippbare Stapel sind Knöpfe mit Namen.
 */
import { TABLE } from '../../content/texts/table';
import type { Card } from '../../game/types';
import { cardHTML } from '../cards';
import { esc } from '../dom';
import { numHTML } from './seat';
import type { CenterModel, StackModel } from './types';

/** Inhalt von #center */
export function centerHTML(m: CenterModel): string {
  return (m.cap ? `<span class="cap">${m.cap}</span>` : '') + m.stacks.map(stackHTML).join('');
}

/** Ein Stapel oder Feld. Die alten Klassen aus `cls` bleiben Haken für Flüge und Tests. */
export function stackHTML(s: StackModel): string {
  const act = s.act ? ` data-act="${s.act.act}" role="button" tabindex="0" aria-label="${esc(s.act.label)}"` : '';
  return (
    `<div class="${s.cls}${s.can ? ' can' : ''}" data-k="${s.k}"${s.title ? ` title="${esc(s.title)}"` : ''}` +
    `${s.drop ? ` data-drop="${s.drop}"` : ''}${act}>${s.body}` +
    (s.cnt ? `<span class="cnt${s.cnt.warn ? ' warn' : ''}">${esc(s.cnt.text)}</span>` : '') +
    (s.count != null ? numHTML(s.count, { cls: 'pcount' }) : '') +
    '</div>'
  );
}

/** Nachziehstapel: bis zu drei Rücken, leer ein Platzhalter */
export function deckCards(n: number): string {
  if (n <= 0) return `<div class="emptyslot">${TABLE.empty}</div>`;
  const back = cardHTML(null, { key: '' });
  return back + (n > 1 ? back : '') + (n > 2 ? back : '');
}

/** Offene Karten klein in einer Reihe, höchstens `max`, darüber „+n“ (Restkarten am Partieende) */
export function cardsMini(cards: readonly Card[], max = 8): string {
  const more = cards.length - max;
  return (
    cards
      .slice(0, max)
      .map((c) => cardHTML(c, { key: '' }))
      .join('') + (more > 0 ? `<span class="more">+${more}</span>` : '')
  );
}
