/*
 * Spiel-Sticker: Zeichen, Neigung und weitere Namen der vier Spiele. Startseite und Lobby nutzen dieselben Zeichen
 * und Namen, damit ein Spiel überall gleich aussieht. Die Startseite neigt ihre Sticker kräftiger (start.css).
 */
import type { GameKind } from '../game/types';

/**
 * Zeichen pro Spiel, bis es gezeichnete Sticker gibt. Nur Emoji, die es seit Jahren überall gibt und die auch
 * bei 20 px noch eine klare Form haben: Die Welle liest sich klein, der Schwimmer nicht.
 */
export const MARK: Readonly<Record<GameKind, string>> = { schnautz: '🌊', shithead: '💩', durak: '🤡', cabo: '👑' };

/**
 * Unter welchem Namen man das Spiel sonst kennt, damit es auch erkennt, wer den ersten Namen nicht kennt.
 * Durak hat keinen verbreiteten zweiten Namen, dort steht, was das Wort heißt.
 */
export const AKA: Readonly<Record<GameKind, string>> = {
  schnautz: 'Auch Schwimmen oder 31',
  shithead: 'Auch Palace oder Karma',
  durak: 'Russisch für Narr',
  cabo: 'Auch Cambio oder Pablo',
};

/** Feste, leichte Neigung der Lobby-Karten (Klassen aus sticker.css, höchstens 1 Grad), nie zufällig */
export const TILT: Readonly<Record<GameKind, string>> = {
  schnautz: 'st-l2',
  shithead: 'st-r1',
  durak: 'st-r2',
  cabo: 'st-l1',
};

export const PEOPLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0M16 4.8a3.2 3.2 0 0 1 0 6.4M18.2 13.6a6 6 0 0 1 2.8 5.9"/></svg>';
