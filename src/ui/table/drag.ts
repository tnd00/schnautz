/*
 * Ziehen am Tisch, kleine Fassade im Einstieg (Plan 2.8 Abschnitt 8, ziehen.md 5.2 und 5.3). Der eigentliche Motor
 * (Zeiger, Geist, Zielsuche, Animation und src/styles/table/drag.css) steht in ./drag-motor.ts und lädt per import()
 * nach. Vor dem Laden tun dragRefresh, dragCancel und dragLanded nichts. Die Regeln stehen rein in src/game/drop.ts
 * (Weiche) und src/game/drop/<spiel>.ts.
 *
 * Muster fürs Nachladen der Adapter (Runde 5, fest):
 * 1. Jedes Spiel legt seinen Adapter in `src/ui/<spiel>/drag.ts` (Ordner = GameKind: shithead, durak, cabo, schnautz)
 *    und exportiert ihn unter genau diesem Namen:
 *      import type { DragAdapter } from '../table/drag';
 *      export const adapter: DragAdapter = { source, zone, commit };
 * 2. Die Spec des Spiels in src/ui/render/<spiel>.ts setzt `drag: true` (statt null). Das schaltet renderTable,
 *    den Schalter „Karten ziehen“ in „Bedienung“ und das Nachladen ein, die Spec importiert den Adapter nie.
 * 3. Der Motor holt alle vorhandenen Adapter über import.meta.glob('../{shithead,durak,cabo,schnautz}/drag.ts',
 *    { eager: true }) in sein eigenes Stück. Nichts davon landet im Einstieg, solange nur der Motor die Datei
 *    importiert. Was ein Adapter selbst importiert (send() aus input.ts, Texte), darf im Einstieg liegen.
 * Ein Spiel ohne Datei oder mit `drag: null` bleibt beim Tippen.
 */
import type { DragKey, DropKey } from '../../game/drop';
import type { Action, Card, View } from '../../game/types';
import { App } from '../app';

/** Was ein Spiel dem Motor liefert, als `export const adapter` in src/ui/<spiel>/drag.ts */
export interface DragAdapter {
  /**
   * Element unter dem Finger (das nächste mit data-drag, nie in #opps) als Quelle samt Elementen des Bündels, sonst
   * null (dann bleibt es ein Tipp). Gewählte Karte: alle gewählten, sonst nur sie (ziehen.md 4).
   */
  source(el: HTMLElement, v: View): { key: DragKey; els: HTMLElement[] } | null;
  /**
   * Zielelement im aktuellen DOM. Darf ein Feld nur fürs Ziehen anlegen (Durak-Schiebefeld, absolut, ohne Höhe zu
   * ändern), `end` räumt es wieder weg. Der Motor fragt nach jedem Neuzeichnen erneut.
   */
  zone(dst: DropKey): HTMLElement | null;
  /**
   * Gültiger Abwurf: über die vorhandene send() des Spiels schicken, kein zweiter Weg zum Gastgeber. dragLanded()
   * liefert da schon Quelle und Abwurfstelle, etwa für App.playRects.
   */
  commit(v: View, a: Action): void;
  /** Vorderseite für die Ansage beim Anheben, null für den Rücken (Cabo-Einblendung). Der Geist folgt dem DOM. */
  face?(key: DragKey, v: View): Card | null;
  /**
   * Der Finger ruht REST_MS (600 ms) über (x, y), danach immer wieder. Cabo dreht hier das Karussell am Rand weiter
   * (carouselNudge). Danach misst der Motor die Ziele neu, auch nach jedem transitionend in #opps.
   */
  rest?(x: number, y: number, v: View): void;
  /** Ziehen ist vorbei (Abwurf, Abbruch, Ablehnung): Felder aus `zone` wegräumen */
  end?(): void;
}

/** Abwurfstelle für die Flüge: was gezogen wurde und wo die Karten des Geists lagen (Reihenfolge wie im Bündel) */
export interface Landed {
  key: DragKey;
  rects: DOMRect[];
}

/** Was der nachgeladene Motor anbietet */
export interface DragMotor {
  refresh(v: View): void;
  /** `act` ist bei 'reject' der Typ der abgelehnten Aktion */
  cancel(why: 'cancel' | 'view' | 'reject', act?: string | null): void;
  landed(): Landed | null;
}

let motor: DragMotor | null = null;
let asked = false;

/** Einmal beim Start: lädt den Motor samt Adaptern nach, der hängt sich an #table. */
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
 * Laufendes Ziehen abbrechen, die Karte fliegt zurück. 'reject' (showReject, der Gastgeber lehnt einen Zug ab) holt
 * nur einen schon abgelegten Geist zurück und nur, wenn `act` der Typ seiner Aktion ist. Ein Tipp-Grund zu etwas
 * anderem und ein laufendes Ziehen bleiben. Den Grund nennt showReject selbst.
 */
export function dragCancel(why: 'cancel' | 'view' | 'reject', act?: string | null): void {
  motor?.cancel(why, act);
}

/**
 * Für die Flüge des eigenen Zugs: Quelle und Abwurfstelle, bis zu 2,5 Sekunden nach dem Loslassen, sonst null. Dann
 * starten die Karten dort, wo der Finger sie losließ (flyG und fly mit `from`, App.playRects).
 */
export function dragLanded(): Landed | null {
  return motor ? motor.landed() : null;
}
