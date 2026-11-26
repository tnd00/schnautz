/*
 * Ziehen am Tisch, kleine Fassade im Einstieg (Plan 2.8 Abschnitt 8, ziehen.md 5.2 und 5.3). Der eigentliche Motor
 * (Zeiger, Geist, Zielsuche, Animation und src/styles/table/drag.css) steht in ./drag-motor.ts und lädt per import()
 * nach. Vor dem Laden tun dragRefresh, dragCancel und dragLanded nichts. Die Regeln stehen rein in src/game/drop.ts,
 * jedes Spiel liefert nur einen Adapter über `specOf(game).drag`.
 */
import type { DragKey, DropKey } from '../../game/drop';
import type { Reject } from '../../game/reject';
import type { Action, Card, View } from '../../game/types';
import { App } from '../app';

/** Was ein Spiel dem Motor liefert, in src/ui/<spiel>/drag.ts */
export interface DragAdapter {
  /** Element unter dem Finger (das nächste mit data-drag) als Quelle samt Elementen des Bündels, sonst null */
  source(el: HTMLElement, v: View): { key: DragKey; els: HTMLElement[] } | null;
  /** Zielelement im aktuellen DOM */
  zone(dst: DropKey): HTMLElement | null;
  /** Gültiger Abwurf: über die vorhandene send() des Spiels schicken, dragLanded() liefert da schon die Abwurfstelle */
  commit(v: View, a: Action): void;
  /** Vorderseite oder Rücken des Geists nach dem aktuellen Stand (Cabo-Einblendung) */
  face?(key: DragKey, v: View): Card | null;
}

/** Was der nachgeladene Motor anbietet */
export interface DragMotor {
  refresh(v: View): void;
  cancel(why: 'cancel' | 'view' | 'reject', r?: Reject): void;
  landed(): DOMRect[] | null;
}

let motor: DragMotor | null = null;
let asked = false;

/** Einmal beim Start: lädt den Motor nach, der hängt sich an #table. Der Adapter kommt aus specOf(game).drag. */
export function initDrag(): void {
  if (asked) return;
  asked = true;
  import('./drag-motor').then(
    (m) => {
      motor = m.startMotor();
      if (App.view) motor.refresh(App.view);
    },
    // Ohne Motor bleibt der Tisch von 2.7, Tippen geht immer
    () => (asked = false),
  );
}

/** Am Ende von renderTable: Quelle wiederfinden, Ziele neu messen, Markierungen setzen oder abbrechen. */
export function dragRefresh(v: View): void {
  motor?.refresh(v);
}

/**
 * Laufendes Ziehen abbrechen, die Karte fliegt zurück. Bei 'reject' (der Gastgeber lehnt den gezogenen Zug ab) fliegt
 * auch ein schon abgelegter Geist zurück. Den Grund nennt wie bei jedem Zug showReject beim Aufrufer.
 */
export function dragCancel(why: 'cancel' | 'view' | 'reject', r?: Reject): void {
  motor?.cancel(why, r);
}

/** Für die Flüge: Startstelle eigener Karten nach einem Abwurf, bis die passende Ansicht kommt. */
export function dragLanded(): DOMRect[] | null {
  return motor ? motor.landed() : null;
}
