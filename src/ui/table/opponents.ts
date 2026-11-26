/* Baustein Gegner (Plan 2.8 Abschnitt 8): alle Kacheln in Sitzordnung, das Karussell setzt sie danach an ihren Platz. */
import type { View } from '../../game/types';
import { seatOrder } from '../helpers';
import { seatHTML } from './seat';
import type { NewTable } from './spec';

export function opponentsHTML(v: View, spec: NewTable): string {
  return seatOrder(v)
    .map((p) => spec.seat(v, p))
    .map((m) => (m ? seatHTML(m) : ''))
    .join('');
}
