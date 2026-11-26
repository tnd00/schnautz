/*
 * Baustein eigener Platz (Plan 2.8 Abschnitt 8, geruest.md 3.4): Kopf, Reihen und Knopfleiste. Klasse, Zustand und
 * Name des Containers #me setzt renderTable über meClass und meLabel.
 */
import { TABLE } from '../../content/texts/table';
import { esc } from '../dom';
import { barHTML } from './bar';
import type { MeModel, MeOut } from './types';

export const isOut = (m: MeModel | MeOut): m is MeOut => 'out' in m;

/** Inhalt von #me */
export function meHTML(m: MeModel | MeOut): string {
  if (isOut(m)) return `<div class="outmsg">${esc(m.out)}</div>${barHTML(m.bar ?? null)}`;
  const h = m.head;
  const head = h
    ? `<div class="mehead">${h.marks}<span class="nm">Du</span>${h.count ?? ''}${h.tags ?? ''}${h.pill ?? ''}</div>`
    : '';
  return `${m.lead ?? ''}${head}${m.rows}${barHTML(m.bar)}`;
}

/** Klassen von #me: me, die alten Klassen des Spiels und die Zustände turn, looking und swapping wie heute */
export function meClass(m: MeModel | MeOut): string {
  if (isOut(m)) return 'me';
  return ['me', ...m.cls, ...m.st.filter((s) => s === 'turn' || s === 'looking' || s === 'swapping')].join(' ');
}

/** Name der Gruppe #me für den Vorleser */
export const meLabel = (m: MeModel | MeOut): string => TABLE.me(isOut(m) ? m.out : m.say);
