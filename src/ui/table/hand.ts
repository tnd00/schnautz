/*
 * Baustein Hand (Plan 2.8 Abschnitt 8, geruest.md 3.6): Karten einer Hand oder Reihe mit Rollen, Namen und Gründen,
 * dazu Anpassen langer Hände ohne Scrollen, Lage der ausgespielten Karten für Flüge und Suche über den
 * Fokus-Schlüssel `data-fk`. src/ui/shithead/hand.ts leitet bis 4a hierher weiter.
 */
import { rejectText, ctxOfView } from '../../content/texts/reject';
import type { Reject } from '../../game/reject';
import { App } from '../app';
import { cardHTML } from '../cards';
import { $, $opt, esc, isMobile } from '../dom';
import type { CardRef, HandCard, HandModel } from './types';

/** Grund als Klartext für Vorleser und Tipp, aus Sicht der eigenen Ansicht */
export const whyText = (r: Reject | null | undefined): string | null => (r ? rejectText(r, ctxOfView(App.view)) : null);

/**
 * Hand als HTML. Eine Tabulatorstelle pro Gruppe (gefuehl 3.5): die gewählte oder sonst die erste antippbare Karte,
 * die Pfeiltasten wandern von dort (src/ui/events.ts).
 */
export function handHTML(h: HandModel): string {
  const tap = h.cards.filter((x) => x.act);
  const stop = tap.find((x) => x.sel) ?? tap[0];
  const cards = h.cards.map((x: HandCard) =>
    cardHTML(x.c, {
      key: x.fk ?? `hand:${x.c ?? x.i}`,
      act: x.act,
      i: x.i,
      sid: x.sid,
      owner: x.owner,
      sel: x.sel,
      dim: x.dim,
      why: whyText(x.why),
      backName: x.label,
      drag: x.drag,
      drop: x.drop,
      tab: x === stop ? 0 : -1,
      extra: x.extra,
      cls: x.cls,
      style: x.delay != null ? `--d:${x.delay}s` : undefined,
    }),
  );
  return (
    `<div class="${h.cls} tb-hand" data-kind="${h.kind}"${h.fit ? ' data-fit' : ''}` +
    ` role="group" aria-label="${esc(h.label)}"${h.style ? ` style="${h.style}"` : ''}>${cards.join('')}</div>`
  );
}

const MAX_ROWS = 3;

interface HandRows {
  rows: number;
  per: number;
  slice: number;
}

/** Wie viele Reihen braucht die Hand bei dieser Kartenbreite und wie weit schaut jede Karte heraus? */
function handRows(n: number, hw: number, avail: number, mobile: boolean): HandRows {
  // Jede Karte soll mindestens so weit herausschauen, dass man Wert und Farbe erkennt
  const minSlice = mobile ? Math.max(15, hw * 0.27) : Math.max(20, hw * 0.3);
  let rows = 1;
  let per: number;
  let slice: number;
  for (;;) {
    per = Math.ceil(n / rows);
    slice = per > 1 ? (avail - hw) / (per - 1) : hw;
    if (slice >= minSlice || rows >= MAX_ROWS) break;
    rows++;
  }
  return { rows, per, slice };
}

/**
 * Lange Hand ohne Scrollen: Karten überlappen, bei sehr vielen in mehreren Reihen. Standard ist die Hand mit `data-fit`
 * aus handHTML, bis alle Spiele umgestellt sind sonst die alte Shithead- und Durak-Hand.
 */
export function fitHand(el0?: HTMLElement | null): void {
  const el = el0 ?? $opt('#me .tb-hand[data-fit]') ?? $opt('#me .shhand');
  if (!el) return;
  el.querySelectorAll('.hbr').forEach((x) => x.remove());
  el.classList.remove('many');
  const cards = Array.from(el.querySelectorAll<HTMLElement>('.card'));
  const n = cards.length;
  cards.forEach((c) => c.classList.remove('r2'));
  if (!n) return;
  const row = el.parentElement as HTMLElement;
  const meEl = $('#me');
  const mcs = getComputedStyle(meEl);
  let avail = meEl.clientWidth - parseFloat(mcs.paddingLeft || '0') - parseFloat(mcs.paddingRight || '0');
  const tc = row.querySelector<HTMLElement>('.tcards');
  if (tc && getComputedStyle(row).flexDirection === 'row') avail -= tc.offsetWidth + 26;
  avail -= 24 + 6;
  const mobile = isMobile();
  let hw = cards[0].offsetWidth || 80;
  let L = handRows(n, hw, avail, mobile);
  // Mobil wird es mit mehreren Reihen eng: kleinere Karten, damit Stapel und Knöpfe Platz behalten
  if (L.rows > 1 && mobile) {
    el.classList.add('many');
    hw = cards[0].offsetWidth || hw;
    L = handRows(n, hw, avail, mobile);
  }
  el.style.setProperty('--ov', Math.max(-0.82, Math.min(-0.06, L.slice / hw - 1)).toFixed(3));
  for (let r = 1; r < L.rows; r++) {
    const first = cards[r * L.per];
    if (!first) break;
    const br = document.createElement('i');
    br.className = 'hbr';
    el.insertBefore(br, first);
    for (let k = r * L.per; k < Math.min(n, (r + 1) * L.per); k++) cards[k].classList.add('r2');
  }
}

/** Merkt sich, wo die ausgespielten Karten lagen, damit sie von dort zum Stapel fliegen. */
export function grabRects(cards: readonly HTMLElement[], src: 'hand' | 'up' | 'down'): void {
  const rects = cards.map((c) => c.getBoundingClientRect());
  App.playRects = rects.length ? { t: Date.now(), src, rects } : null;
}

/** Wert von `data-fk` zum Verweis */
export const fkOf = (ref: CardRef): string => `${ref.z}:${ref.k}`;

/** Selektor über `data-fk`, etwa für noteTap(act, [cardSel(ref)]) vor showReject */
export const cardSel = (ref: CardRef): string => `[data-fk="${fkOf(ref)}"]`;

/** Die Karte am Tisch zum Verweis, für showReject und Flüge */
export function findCard(ref: CardRef): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#table ${cardSel(ref)}`);
}
