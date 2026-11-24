/*
 * Alle Spiele an einem Ort: Reihenfolge, Namen und ab welcher Version eine Seite sie anzeigen kann.
 * Neue Spiele kommen hier und in `GameKind` dazu. Weichen nach Spiel sind vollständige switch-Anweisungen
 * mit `unreachable` im default, dann meldet der Compiler jede Stelle, die das neue Spiel noch nicht kennt.
 */
import type { GameKind, Reign, Result, SchnautzResult, State, Table } from './types';
import { cmpVersion } from '../content/version';

export const GAMES: readonly GameKind[] = ['schnautz', 'shithead', 'durak', 'cabo'];

export const GAME_NAME: Readonly<Record<GameKind, string>> = {
  schnautz: 'Schnautz',
  shithead: 'Shithead',
  durak: 'Durak',
  cabo: 'Cabo',
};

/** Zeichen für den Verlierer der letzten Partie, wo es einen gibt: Shithead und Durak */
export const LOSER_MARK: Readonly<Record<GameKind, string>> = {
  schnautz: '',
  shithead: '💩',
  durak: '🤡',
  cabo: '',
};

/** Wie der Verlierer heißt */
export const LOSER_NAME: Readonly<Record<GameKind, string>> = {
  schnautz: '',
  shithead: 'Shithead',
  durak: 'Durak',
  cabo: '',
};

/** Ältere Seiten kennen spätere Spiele nicht und würden sie als Schnautz zeichnen */
export const GAME_SINCE: Readonly<Record<GameKind, string>> = {
  schnautz: '1.0.0',
  shithead: '1.0.0',
  durak: '2.4.0',
  cabo: '2.5.0',
};

/** Seiten vor 2.2.1 schicken keine Version mit, sie gelten als diese */
const NO_VERSION = '2.2.0';

/** Kann eine Seite mit dieser Version das Spiel anzeigen? */
export const canShow = (game: GameKind, v: string | undefined): boolean =>
  cmpVersion(v ?? NO_VERSION, GAME_SINCE[game]) >= 0;

export const isGame = (x: unknown): x is GameKind => typeof x === 'string' && (GAMES as readonly string[]).includes(x);

const SZ_REASONS: ReadonlySet<string> = new Set(['feuer', 'schnautz', 'knock', 'quit']);

/** Schnautz-Ergebnis oder null, ohne andere Spiele für Schnautz zu halten. */
export const szResult = (r: Result | null | undefined): SchnautzResult | null =>
  r && SZ_REASONS.has(r.reason) ? (r as SchnautzResult) : null;

/** Für den default-Zweig einer vollständigen Weiche nach Spiel. */
export function unreachable(x: never): never {
  throw new Error(`Unbekanntes Spiel: ${String(x)}`);
}

/** Krone und Titel des Verlierers gelten pro Spiel, bis dort jemand Neues gewinnt oder verliert. */
export const reignOf = (t: Pick<Table, 'reigns' | 'game'>, game: GameKind = t.game): Reign | null =>
  t.reigns?.[game] ?? null;

export function setReign(st: State, game: GameKind, win: string | null, lose: string | null = null): void {
  st.reigns = { ...(st.reigns ?? {}), [game]: { win, lose, game } };
}
