/*
 * Baustein Hand (Plan 2.8 Abschnitt 8, geruest.md 3.6): Karten einer Hand oder Reihe mit Rollen, Namen und Gründen,
 * dazu Anpassen langer Hände, Lage der ausgespielten Karten für Flüge und Suche über den Fokus-Schlüssel `data-fk`.
 *
 * Stummel aus Runde 1. `handHTML` zeichnet noch nichts, `fitHand` passt wie heute die Shithead-Hand an. Die alte Form
 * `grabRects(src, idx)` in src/ui/shithead/hand.ts bleibt als Weiterleitung bis 4a. Runde 2 (Gerüst) baut den Baustein.
 */
import { App } from '../app';
import { fitHand as fitShHand } from '../shithead/hand';
import type { CardRef, HandModel } from './types';

/** Hand als HTML. Stummel, Runde 2. */
export function handHTML(_h: HandModel): string {
  return '';
}

/** Lange Hand ohne Scrollen. Standard ist `#me .tb-hand[data-fit]`, heute die Shithead-Hand wie bisher. */
export function fitHand(_el?: HTMLElement | null): void {
  fitShHand();
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
