/*
 * Was jedes Spiel am Tisch zeichnet (Plan 2.8 Abschnitt 8, geruest.md 3.3). Jedes Spiel ist seit Runde 4a ein
 * `NewTable` und liefert nur Modelle, die gemeinsamen Bausteine zeichnen.
 */
import { unreachable } from '../../game/games';
import type { GameKind, Player, View } from '../../game/types';
import { cbSpec } from '../render/cabo';
import { dkSpec } from '../render/durak';
import type { Sheet } from '../render/result';
import { szSpec } from '../render/schnautz';
import { shSpec } from '../render/shithead';
import type { Status } from '../status';
import type { CenterModel, MeModel, MeOut, SeatModel } from './types';

/** Ein Spiel auf dem gemeinsamen Gerüst. Es gibt keine Punkteleiste mehr, Werte stehen in `SeatModel.value`. */
export interface NewTable {
  /** Abzeichen am Namen in der Kopfzeile */
  badge: boolean;
  /** Wer ins Karussell geholt wird. layoutOpps liest das statt actorOf, Kino P7 setzt bei Durak den Verteidiger */
  actor(v: View): string | null;
  /** Kachel eines Gegners, null lässt den Platz weg */
  seat(v: View, p: Player): SeatModel | null;
  center(v: View): CenterModel | null;
  me(v: View): MeModel | MeOut | null;
  /** aus src/ui/status.ts, renderTable ruft paintStatus(spec.status(v)), das meldet den Vorleser selbst */
  status(v: View): Status;
  /** aus src/ui/render/result.ts, render() ruft renderResult(v, spec.sheet(v)) */
  sheet(v: View): Sheet | null;
  /**
   * Ziehen an: true, sobald src/ui/<spiel>/drag.ts den Adapter exportiert. Der Adapter lädt mit dem Motor nach
   * (Muster oben in ./drag.ts), die Spec importiert ihn nie, sonst landet er im Einstieg.
   */
  drag: true | null;
  /** Nach dem Schreiben: fitHand, layoutSwapOpps */
  after?(v: View): void;
}

export type TableSpec = NewTable;

/** Spec je Spiel, liefert shSpec, dkSpec, cbSpec und szSpec aus den Render-Dateien. */
export function specOf(game: GameKind): TableSpec {
  switch (game) {
    case 'shithead':
      return shSpec;
    case 'durak':
      return dkSpec;
    case 'cabo':
      return cbSpec;
    case 'schnautz':
      return szSpec;
    default:
      return unreachable(game);
  }
}
