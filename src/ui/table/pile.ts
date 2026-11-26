/*
 * Baustein Tischmitte (Plan 2.8 Abschnitt 8, geruest.md 3.6): Überschrift und Stapel aus einem CenterModel. Ziele fürs
 * Ziehen stehen in `data-drop`, antippbare Stapel sind Knöpfe mit Namen.
 */
import { TABLE } from '../../content/texts/table';
import { cardHTML } from '../cards';
import { esc } from '../dom';
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
    (s.count != null ? `<span class="pcount">${s.count}</span>` : '') +
    '</div>'
  );
}

/** Nachziehstapel: bis zu drei Rücken, leer ein Platzhalter */
export function deckCards(n: number): string {
  if (n <= 0) return `<div class="emptyslot">${TABLE.empty}</div>`;
  return cardHTML(null) + (n > 1 ? cardHTML(null) : '') + (n > 2 ? cardHTML(null) : '');
}
