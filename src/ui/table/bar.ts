/*
 * Baustein Knopfleiste (Plan 2.8 Abschnitt 8, geruest.md 3.6): feste Knopfplätze, Gründe über aria-disabled statt
 * `disabled` und eine Sperre gegen Tipps, die einem gerade getauschten Knopf galten. `BAR` gilt für alle vier Spiele.
 */
import { TABLE } from '../../content/texts/table';
import { esc } from '../dom';
import { BAR_GUARD_MS } from './consts';
import { whyText } from './hand';
import type { BarButton, BarModel } from './types';

/** Zuletzt gezeichnete Knopfzeile, die davor und wann sie sich geändert hat */
export const BAR = { sig: '', prev: '', at: 0 };

/** Zwei Fassungen einer Beschriftung, die kurze steht, wo der Platz knapp ist (CSS .blong und .bshort) */
export const twoLabel = (long: string, short: string): string =>
  `<span class="blong">${long}</span><span class="bshort">${short}</span>`;

/** Ein Knopf. Gesperrt bleibt er antippbar und nennt beim Tipp seinen Grund. */
export function btnHTML(b: BarButton): string {
  const why = b.ok ? null : whyText(b.why);
  return (
    `<button class="btn ${b.cls}${b.pulse ? ' pulse' : ''}" data-act="${b.act}" data-intent="${b.intent}"` +
    (b.ok ? '' : ' aria-disabled="true"') +
    (why ? ` aria-description="${esc(why)}"` : '') +
    (b.on != null ? ` aria-pressed="${b.on}"` : '') +
    (b.aria ? ` aria-label="${esc(b.aria)}"` : '') +
    (b.title ? ` title="${esc(b.title)}"` : '') +
    `>${b.label}</button>`
  );
}

/** Freier Knopfplatz: hält die Breite, ist aber weder sichtbar noch fokussierbar noch für den Vorleser da */
const SLOT = '<span class="btn bslot" aria-hidden="true"></span>';

/** Knopfleiste als HTML, setzt `BAR` bei einem Wechsel der Knöpfe. */
export function barHTML(b: BarModel | null): string {
  if (!b) return '';
  const sig = b.btns.map((x) => x.act).join(',');
  if (sig !== BAR.sig) Object.assign(BAR, { prev: BAR.sig, sig, at: Date.now() });
  return (
    `<div class="actions${b.cls ? ` ${b.cls}` : ''}${b.slots ? ' slots' : ''}" role="group" aria-label="${TABLE.bar}">` +
    `${b.btns.map(btnHTML).join('')}${SLOT.repeat(Math.max(0, (b.slots ?? 0) - b.btns.length))}${b.extra ?? ''}</div>`
  );
}

/**
 * true, wenn der Tipp wohl dem vorigen Knopf galt: Die Zeile hat sich gerade geändert und an der Stelle von `act`
 * stand vorher ein anderer Knopf oder keiner. Ändert sich nur die Zahl der Knöpfe, rücken am Handy alle außer dem
 * ersten (der leere Platz fällt dort weg, damit die Beschriftungen nicht umbrechen), also bleibt nur der erste
 * gültig. Ohne `act` zählt jede Änderung.
 */
export function barGuard(act?: string): boolean {
  if (Date.now() - BAR.at >= BAR_GUARD_MS) return false;
  if (!act) return true;
  const now = BAR.sig.split(',');
  const prev = BAR.prev.split(',');
  const i = now.indexOf(act);
  return i < 0 || prev[i] !== act || (i > 0 && prev.length !== now.length);
}
