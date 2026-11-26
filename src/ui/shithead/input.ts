/*
 * Shithead bedienen: Grund beim Antippen einer ausgegrauten Karte. Die Karte bleibt antippbar, statt sie still
 * auszuwählen, wackelt sie und der Grund steht am Stapel, mit demselben Code, den der Gastgeber senden würde
 * (shWhyNot in src/game/shithead.ts). Auswahl und Tauschrunde laufen weiter über shTap in src/ui/events.ts.
 */
import { shWhyNot, type ShCardRef } from '../../game/shithead';
import type { View } from '../../game/types';
import { App } from '../app';
import { $opt } from '../dom';
import { noteTap, showReject } from '../feedback';
import { myTurn } from '../helpers';
import { SEQ } from './sequence';

/** Die Karte im eigenen Platz zum Verweis, so wie sie data-act und data-i tragen. */
const cardSel = (ref: ShCardRef): string =>
  `#me [data-act="${ref.src === 'hand' ? 'shh' : ref.src === 'up' ? 'shu' : 'shd'}"][data-i="${ref.i}"]`;

/**
 * Grund zur Karte, wenn sie gerade ausgegraut ist: eigener Zug, Fenster zu und die Karte passt nicht. Während der
 * 4er-Sperre darf man vorauswählen, außerhalb des eigenen Zugs ist nichts ausgegraut, dann bleibt es still.
 */
export function shDimWhy(v: View, ref: ShCardRef): ReturnType<typeof shWhyNot> {
  if (v.game !== 'shithead' || v.phase !== 'play' || !myTurn(v) || v.sh?.win?.lock || SEQ.busy) return null;
  const why = shWhyNot(v, App.me, ref);
  return why?.e === 'sh.noFit' ? why : null;
}

/**
 * Tipp auf eine eigene Karte vor der Auswahl. `true` heißt: Die Karte ist ausgegraut, der Grund steht schon am
 * Tisch (oder schweigt während SEQ.busy) und die Auswahl bleibt, wie sie war.
 */
export function shWhyTap(kind: 'h' | 'u', i: number): boolean {
  const v = App.view;
  if (!v) return false;
  const ref: ShCardRef = { src: kind === 'h' ? 'hand' : 'up', i };
  const el = $opt(cardSel(ref));
  // Während eines Ablaufs zeigt der Tisch noch den alten Stand: kein Grund, aber eine graue Karte wählt sich auch nicht
  if (SEQ.busy) return el?.getAttribute('aria-disabled') === 'true';
  const why = shDimWhy(v, ref);
  if (!why || !el) return false;
  noteTap('shplay', [cardSel(ref)]);
  showReject(why, 'shplay');
  return true;
}
