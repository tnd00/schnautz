/*
 * Statuszeile über dem eigenen Platz, gemeinsam für alle Spiele (Stufe 2.7 „Klare Worte“).
 * Jedes Spiel liefert seinen Status als Daten (`shStatus`, `dkStatus`, `cbStatus`, `szStatus`), `renderStatus`
 * schreibt ihn über `paintStatus` immer mit Haupt- und Unterzeile, damit die Zeile ihre Höhe behält. Ohne DOM bis
 * auf `paintStatus`, damit Vitest die Sätze prüfen kann. Die Spiele importieren von hier nur Funktionen, der Kreis
 * ist deshalb harmlos.
 */
import { unreachable } from '../game/games';
import type { View } from '../game/types';
import { STATUS, turnOf, waitLine } from '../content/texts/status';
import { sayStatus } from './a11y/say';
import { App } from './app';
import { $, esc } from './dom';
import { nameOf, pById } from './helpers';
import { cbStatus } from './render/cabo';
import { dkStatus } from './render/durak';
import { szStatus } from './render/schnautz';
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

/**
 * „Warte auf Tom und KI Igor.“, ab vier Namen „Warte auf Lena, Tom und 5 weitere.“, leer ohne jemanden. Die Kurzform
 * hält die Unterzeile auch mit acht Leuten und langen Namen in ihren zwei Zeilen.
 */
export function waitSub(v: View, ids: readonly string[]): string {
  return waitLine(ids.filter((id) => id !== App.me).map((id) => whoHTML(v, id)));
}

/** Hauptzeile am Ende: „Aufdecken …“, solange eine Zeremonie läuft, sonst Runde oder Partie vorbei. */
export function endMain(v: View, revealing: boolean): string {
  if (v.phase === 'over') return revealing ? STATUS.reveal : STATUS.gameOver;
  return STATUS.roundOver;
}

/** Status des laufenden Spiels. */
export function statusOf(v: View): Status {
  switch (v.game) {
    case 'shithead':
      return shStatus(v);
    case 'durak':
      return dkStatus(v);
    case 'cabo':
      return cbStatus(v);
    case 'schnautz':
      return szStatus(v);
    default:
      return unreachable(v.game);
  }
}

/** Schreibt #status für alle Spiele in derselben Form. */
export function renderStatus(v: View): void {
  paintStatus(statusOf(v));
}

/** Schreibt einen fertigen Status nach #status, Klasse tone-<x>. renderTable ruft das mit spec.status(v). */
export function paintStatus(s: Status): void {
  const el = $('#status');
  el.className = `status sline tone-${s.tone}${s.quick ? ' hasquick' : ''}`;
  el.innerHTML =
    `<div class="main">${s.main}</div>` +
    (s.quick ? `<div class="quick">${s.quick}</div>` : `<div class="sub">${s.sub}</div>`);
  sayStatus(s);
}
