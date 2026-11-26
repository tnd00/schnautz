/*
 * Baustein Platz (Plan 2.8 Abschnitt 8, geruest.md 3.4 und 3.6): eine Gegnerkachel aus einem SeatModel. Zustände stehen
 * in `data-st`, daneben bleiben die alten Klassen als Haken (turn, out, offline). Slots sind fertiges HTML, ihre Hüllen
 * `tb-body` und `tb-count` stehen mit `display: contents` (table.css), damit Legacy gleich bleibt.
 */
import { TABLE } from '../../content/texts/table';
import { cardHTML } from '../cards';
import { esc } from '../dom';
import type { SeatModel, TagModel } from './types';

/** Denkpünktchen hinter einem Etikett */
export const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';

/** Zustände, die zusätzlich als alte Klasse an der Kachel stehen */
const OLD_ST = new Set(['turn', 'out', 'offline']);

/** Etikett am Platz. Ohne Etikett ein unsichtbarer Platzhalter, damit die Kachel ihre Höhe behält. */
export function tagHTML(t: TagModel | null): string {
  if (!t) return '<span class="tag" style="visibility:hidden" aria-hidden="true">.</span>';
  return (
    `<span class="tag${t.cls ? ` ${t.cls}` : ''}" data-k="${t.kind}"${t.title ? ` title="${esc(t.title)}"` : ''}>` +
    `${esc(t.text)}${t.think ? THINKING : ''}</span>`
  );
}

/** Eine Gegnerkachel. Ist sie Wurfziel, öffnet ein Tipp die Wurfleiste wie heute über data-act="aim". */
export function seatHTML(m: SeatModel): string {
  const cls = ['opp', ...m.cls, ...m.st.filter((s) => OLD_ST.has(s))].join(' ');
  const aim = m.aim && !m.st.includes('target') ? ` data-act="aim" title="${esc(TABLE.aim(m.name))}"` : '';
  return (
    `<div data-pid="${esc(m.id)}" class="${cls}" data-st="${m.st.join(' ')}"${m.role ? ` data-role="${m.role}"` : ''}` +
    ` role="listitem" aria-label="${esc(TABLE.seat(m.name, m.say))}"${aim}>` +
    `<div class="tb-body">${m.body}</div>` +
    `<div class="ometa">${m.marks}<span class="nm">${esc(m.name)}</span><span class="tb-count">${m.count}</span></div>` +
    `${m.value}${tagHTML(m.tag)}${m.badges ?? ''}</div>`
  );
}

/**
 * Gehaltener Fächer mit Zahl in der Mitte (Shithead ohne Tischkarten, Durak). Die Rücken sind aria-hidden, die Zahl
 * nennt der Satz am Platz.
 */
export function fanHTML(
  n: number,
  o: { max: number; deg: number; word: string; title: string; deal: boolean },
): string {
  const shown = Math.min(n, o.max);
  let fan = '';
  for (let i = 0; i < shown; i++) {
    const rot = (i - (shown - 1) / 2) * o.deg;
    fan += cardHTML(null, { key: '', cls: o.deal ? 'deal' : '', style: `--rot:${rot}deg; --d:${i * 0.05}s` });
  }
  return (
    `<div class="bighand" title="${esc(o.title)}"><span class="ohand bigfan">${fan}</span>` +
    `<span class="bhn"><b>${n}</b><span class="bht">${esc(o.word)}</span></span></div>`
  );
}

/** Zahl als Objekt (.pcount, .cbp). `data-n` erlaubt später das Hochzählen (Kino). */
export function numHTML(n: number, o: { cls: string; title?: string }): string {
  return `<span class="${o.cls}" data-n="${n}"${o.title ? ` title="${esc(o.title)}"` : ''}>${n}</span>`;
}
