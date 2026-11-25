/*
 * Statuszeile über dem eigenen Platz, gemeinsam für alle Spiele (Stufe 2.7 „Klare Worte“).
 * Jedes Spiel liefert seinen Status als Daten (`shStatus` und später die anderen), `renderStatus` schreibt ihn
 * immer mit Haupt- und Unterzeile, damit die Zeile ihre Höhe behält. Liefert ein Spiel noch `null`, zeichnet es
 * seine Zeile weiter selbst. Ohne DOM bis auf `renderStatus`, damit Vitest die Sätze prüfen kann.
 */
import { unreachable } from '../game/games';
import type { View } from '../game/types';
import { STATUS, turnOf, waitFor } from '../content/texts/status';
import { App } from './app';
import { $, esc, listJoin } from './dom';
import { nameOf, pById } from './helpers';
import { shStatus } from './render/shithead';

export type StatusTone = 'calm' | 'turn' | 'alert' | 'knock' | 'over';

export interface Status {
  /** HTML, maskiert */
  main: string;
  /** HTML, darf leer sein, die Zeile bleibt trotzdem gleich hoch */
  sub: string;
  tone: StatusTone;
  /** Knöpfe (4er, Bombe, Vorspulen, Für X spielen), stehen statt der Unterzeile */
  quick?: string;
}

/** Name für die Statuszeile, fett und maskiert. KIs heißen „KI Igor“, ich heiße „Du“. */
export function whoHTML(v: View, id: string | null | undefined): string {
  const p = pById(v, id);
  const bot = p?.bot && id !== App.me ? `${STATUS.bot} ` : '';
  return `<b>${esc(bot + nameOf(v, id))}</b>`;
}

/** „Du bist dran.“ oder „<b>Lena</b> ist dran.“ */
export const turnMain = (v: View, id: string | null): string =>
  id === App.me ? STATUS.myTurn : turnOf(whoHTML(v, id));

/** „Warte auf Tom und KI Igor.“, leer ohne jemanden */
export function waitSub(v: View, ids: readonly string[]): string {
  const names = ids.filter((id) => id !== App.me).map((id) => whoHTML(v, id));
  return names.length ? waitFor(listJoin(names)) : '';
}

/** Hauptzeile am Ende: „Aufdecken …“, solange eine Zeremonie läuft, sonst Runde oder Partie vorbei. */
export function endMain(v: View, revealing: boolean): string {
  if (v.phase === 'over') return revealing ? STATUS.reveal : STATUS.gameOver;
  return STATUS.roundOver;
}

/** Status des Spiels oder `null`, dann zeichnet das Spiel die Zeile noch selbst. */
export function statusOf(v: View): Status | null {
  switch (v.game) {
    case 'shithead':
      return shStatus(v);
    case 'durak':
    case 'cabo':
    case 'schnautz':
      return null;
    default:
      return unreachable(v.game);
  }
}

/** Schreibt #status. Gibt `false` zurück, wenn das Spiel seine Zeile noch selbst zeichnet. */
export function renderStatus(v: View): boolean {
  const s = statusOf(v);
  if (!s) return false;
  const el = $('#status');
  el.className = `status sline tone-${s.tone}${s.quick ? ' hasquick' : ''}`;
  el.innerHTML =
    `<div class="main">${s.main}</div>` +
    (s.quick ? `<div class="quick">${s.quick}</div>` : `<div class="sub">${s.sub}</div>`);
  return true;
}
