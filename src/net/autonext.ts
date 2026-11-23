/*
 * Schnautz: Nach einer Runde startet der Host die nächste von selbst, wenn nach 10 Sekunden noch nicht alle bereit
 * sind. Am Ende der Partie nicht, dann wartet das Ergebnisfenster.
 */
import { act } from '../game/actions';
import type { State, View } from '../game/types';
import { App } from '../ui/app';
import type { Timer } from '../ui/dom';
import { H, hostCommit } from './host';

export const AUTO_NEXT_MS = 10_000;
/** So lange laufen ungefähr die Meldungen zur Runde, bevor das Ergebnisfenster steht */
const LEAD_MS = 2500;

const NEXT = { key: '', at: 0, t: null as Timer | null };

export function stopAutoNext(): void {
  if (NEXT.t) clearTimeout(NEXT.t);
  Object.assign(NEXT, { key: '', at: 0, t: null });
}

/**
 * Nach jeder Änderung: Steht eine Schnautz-Runde am Ende, läuft der Countdown zur nächsten. Er beginnt erst,
 * wenn die Meldungen zur Runde durch sind (`pauseMs`). Gibt true zurück, wenn gerade ein neuer Countdown beginnt.
 */
export function hostAutoNext(st: State, pauseMs: number): boolean {
  if (st.game !== 'schnautz' || st.phase !== 'end') {
    stopAutoNext();
    return false;
  }
  const key = `${st.games}|${st.round}`;
  if (key === NEXT.key) return false;
  stopAutoNext();
  NEXT.key = key;
  NEXT.at = Date.now() + Math.max(LEAD_MS, pauseMs) + AUTO_NEXT_MS;
  NEXT.t = setTimeout(() => {
    NEXT.t = null;
    const s = H.st;
    if (App.role !== 'host' || !s || s.phase !== 'end' || `${s.games}|${s.round}` !== key) return;
    if (!act(s, s.host, { type: 'force' })) hostCommit();
  }, NEXT.at - Date.now());
  return true;
}

/** Restzeit bis zur nächsten Runde für eine Ansicht. */
export function nextFor(v: View): void {
  v.next = NEXT.t ? Math.max(0, NEXT.at - Date.now()) : null;
}
