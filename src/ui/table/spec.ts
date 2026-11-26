/*
 * Was jedes Spiel am Tisch zeichnet (Plan 2.8 Abschnitt 8, geruest.md 3.3). Ein Spiel, das noch nicht umgestellt
 * ist, steht als `OldTable` da und zeichnet wie heute selbst. Ein umgestelltes Spiel ist ein `NewTable` und liefert
 * nur Modelle, die gemeinsamen Bausteine zeichnen. `specOf` löst `tableOf` aus src/ui/render/index.ts ab.
 *
 * Stand Runde 1: alle vier Spiele sind `OldTable`, eingebunden ist noch nichts.
 */
import { unreachable } from '../../game/games';
import type { GameKind, Player, View } from '../../game/types';
import { cbSpec } from '../render/cabo';
import { dkSpec } from '../render/durak';
import type { Sheet } from '../render/result';
import { szSpec } from '../render/schnautz';
import { shSpec } from '../render/shithead';
import type { Status } from '../status';
import type { DragAdapter } from './drag';
import type { CenterModel, MeModel, MeOut, SeatModel } from './types';

/** Übergang: Ein Spiel, das noch nicht umgestellt ist, zeichnet wie heute selbst. */
export interface OldTable {
  /** Abzeichen am Namen in der Kopfzeile */
  badge: boolean;
  old: { draw(v: View): void; overlay(v: View): void };
}

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
  /** aus src/ui/status.ts, renderTable ruft paintStatus(spec.status(v)) und sayStatus */
  status(v: View): Status;
  /** aus src/ui/render/result.ts, render() ruft renderResult(v, spec.sheet(v)) */
  sheet(v: View): Sheet | null;
  /** Adapter fürs Ziehen, alle vier Spiele bekommen einen (Entscheidung des Users) */
  drag: DragAdapter | null;
  /** Nach dem Schreiben: fitHand, layoutSwapOpps */
  after?(v: View): void;
}

export type TableSpec = OldTable | NewTable;

export const isOld = (s: TableSpec): s is OldTable => 'old' in s;

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

/**
 * Übergang bis 4b (Plan 2.8 Nachtrag nach Runde 0, Punkt 7): Ob die Punkteleiste oben noch erscheint. Shithead und
 * Durak zeigen alles in den Kacheln, bei Cabo und Schnautz trägt die Leiste Punkte und Leben, bis 4b sie in
 * `SeatModel.value` holt. Danach fällt diese Weiche weg.
 */
export function scorebarOf(game: GameKind): boolean {
  switch (game) {
    case 'shithead':
    case 'durak':
      return false;
    case 'cabo':
    case 'schnautz':
      return true;
    default:
      return unreachable(game);
  }
}
