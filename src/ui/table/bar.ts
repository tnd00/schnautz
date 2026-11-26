/*
 * Baustein Knopfleiste (Plan 2.8 Abschnitt 8, geruest.md 3.6): feste Knopfplätze, Gründe über aria-disabled statt
 * `disabled` und eine Sperre gegen Tipps, die einem gerade getauschten Knopf galten. `BAR` ersetzt später App.dkBtn
 * und App.cbBtn und gilt dann für alle vier Spiele.
 */
import { TABLE } from '../../content/texts/table';
import { esc } from '../dom';
import { whyText } from './hand';
import type { BarButton, BarModel } from './types';

/** So lange nach einem Wechsel der Knopfzeile gilt ein Tipp als gemeint für den vorigen Knopf */
export const BAR_GUARD_MS = 400;

/** Zuletzt gezeichnete Knopfzeile und wann sie sich geändert hat */
export const BAR = { sig: '', at: 0 };

/** Zwei Fassungen einer Beschriftung, die kurze steht, wo der Platz knapp ist (CSS .blong und .bshort) */
export const twoLabel = (long: string, short: string): string =>
  `<span class="blong">${long}</span><span class="bshort">${short}</span>`;

/** Ein Knopf. Gesperrt bleibt er antippbar und nennt beim Tipp seinen Grund (außer im Übergang mit `hard`). */
export function btnHTML(b: BarButton): string {
  const why = b.ok ? null : whyText(b.why);
  return (
    `<button class="btn ${b.cls}${b.pulse ? ' pulse' : ''}" data-act="${b.act}" data-intent="${b.intent}"` +
    (b.ok ? '' : b.hard ? ' disabled' : ' aria-disabled="true"') +
    (why ? ` aria-description="${esc(why)}"` : '') +
    (b.on != null ? ` aria-pressed="${b.on}"` : '') +
    (b.aria ? ` aria-label="${esc(b.aria)}"` : '') +
    (b.title ? ` title="${esc(b.title)}"` : '') +
    `>${b.label}</button>`
  );
}

/** Knopfleiste als HTML, setzt `BAR` bei einem Wechsel der Knöpfe. */
export function barHTML(b: BarModel | null): string {
  if (!b) return '';
  const sig = b.btns.map((x) => x.act).join(',');
  if (sig !== BAR.sig) Object.assign(BAR, { sig, at: Date.now() });
  return (
    `<div class="actions${b.cls ? ` ${b.cls}` : ''}" role="group" aria-label="${TABLE.bar}">` +
    `${b.btns.map(btnHTML).join('')}${b.extra ?? ''}</div>`
  );
}

/** true, wenn der Tipp wohl dem vorigen Knopf galt */
export function barGuard(): boolean {
  return Date.now() - BAR.at < BAR_GUARD_MS;
}
