/*
 * Baustein Platz (Plan 2.8 Abschnitt 8, geruest.md 3.4 und 3.6): eine Gegnerkachel aus einem SeatModel. Zustände stehen
 * in `data-st`, daneben bleiben die alten Klassen als Haken (turn, out, offline). Slots sind fertiges HTML.
 */
import { TABLE } from '../../content/texts/table';
import { esc } from '../dom';
import type { SeatModel, TagModel } from './types';

/** Denkpünktchen hinter einem Etikett */
export const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';

/** Zustände, die zusätzlich als alte Klasse an der Kachel stehen */
const OLD_ST = new Set(['turn', 'out', 'offline']);

/** Etikett am Platz. Ohne Etikett ein unsichtbarer Platzhalter, damit die Kachel ihre Höhe behält. */
export function tagHTML(t: TagModel | null): string {
  if (!t) return '<span class="tag" style="visibility:hidden" aria-hidden="true">.</span>';
  return `<span class="tag${t.cls ? ` ${t.cls}` : ''}" data-k="${t.kind}">${esc(t.text)}${t.think ? THINKING : ''}</span>`;
}

/** Eine Gegnerkachel. Ist sie Wurfziel, öffnet ein Tipp die Wurfleiste wie heute über data-act="aim". */
export function seatHTML(m: SeatModel): string {
  const cls = ['opp', ...m.cls, ...m.st.filter((s) => OLD_ST.has(s))].join(' ');
  const aim = m.aim && !m.st.includes('target') ? ` data-act="aim" title="${esc(TABLE.aim(m.name))}"` : '';
  return (
    `<div data-pid="${esc(m.id)}" class="${cls}" data-st="${m.st.join(' ')}"${m.role ? ` data-role="${m.role}"` : ''}` +
    ` role="listitem" aria-label="${esc(TABLE.seat(m.name, m.say))}"${aim}>` +
    `${m.body}<div class="ometa">${m.marks}<span class="nm">${esc(m.name)}</span>${m.count}</div>` +
    `${m.value}${tagHTML(m.tag)}${m.badges ?? ''}</div>`
  );
}
