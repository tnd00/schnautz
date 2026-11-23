/*
 * Würfe und Klänge laufen sofort, auch während eine Shithead-Sequenz die Ansicht zurückhält.
 * Ein eigener Wasserstand sorgt dafür, dass nach Laden, Neuverbinden oder Aufwachen nichts nachgespielt wird.
 */
import type { View } from '../game/types';
import { App } from './app';
import { playSounds, type SoundEntry } from './soundboard';
import { clearTossMarks, playToss, type TossEntry } from './toss';

/** So lange nach dem Sichtbarwerden nur abgleichen, gestaute Nachrichten dröhnen sonst auf einmal los. */
export const FX_WAKE_MS = 1500;
/** Mehr neue Würfe auf einmal heißt, es fehlten Ansichten: nicht nachspielen. */
const MAX_TOSS_BURST = 3;

export function liveFx(v: View): void {
  const top = v.log.reduce((mx, e) => Math.max(mx, e.n), 0);
  if (v.phase === 'lobby') clearTossMarks();
  if (App.fxSync || document.hidden || Date.now() < App.fxQuietUntil || top < App.fxN) {
    App.fxN = top;
    App.fxSync = false;
    return;
  }
  const fresh = v.log.filter((e) => e.n > App.fxN);
  App.fxN = top;
  if (!fresh.length || v.phase === 'lobby') return;
  const tosses = fresh.filter((e): e is TossEntry => e.k === 'toss');
  if (tosses.length && tosses.length <= MAX_TOSS_BURST) tosses.forEach(playToss);
  const sounds = fresh.filter((e): e is SoundEntry => e.k === 'sound');
  if (sounds.length) playSounds(sounds);
}
