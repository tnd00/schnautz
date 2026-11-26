/* Weiterleitung bis 4a: Die Hand lebt in src/ui/table/hand.ts, hier bleibt nur die alte Form von grabRects. */
import { grabRects as grab } from '../table/hand';

export { fitHand } from '../table/hand';

/** Alte Form: Merkt sich die Lage der Karten `idx` aus Hand oder offenen Tischkarten für den Flug zum Stapel. */
export function grabRects(src: 'hand' | 'up', idx: number[]): void {
  const all = document.querySelectorAll<HTMLElement>(src === 'hand' ? '#me .shhand .card' : '#me .tcards .upc .card');
  grab(
    idx.flatMap((i) => all[i] ?? []),
    src,
  );
}
