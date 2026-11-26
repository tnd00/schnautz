/*
 * Alle Spiele an einem Ort: Reihenfolge, Namen und ab welcher Version eine Seite sie anzeigen kann.
 * Neue Spiele kommen hier und in `GameKind` dazu. Weichen nach Spiel sind vollständige switch-Anweisungen
 * mit `unreachable` im default, dann meldet der Compiler jede Stelle, die das neue Spiel noch nicht kennt.
 */
import type { GameKind, Player, Reign, Result, Rules, SchnautzResult, State, Table } from './types';
import { cmpVersion } from '../content/version';
import { cloneRules, DEFAULT_RULES } from './constants';

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

/** So viele Minor-Versionen nach seiner Einführung trägt das neueste Spiel auf der Startseite „Neu“. */
const NEW_FOR_MINORS = 1;

/** Ist das Spiel das zuletzt dazugekommene und für diese Version noch frisch? */
export function isNewGame(game: GameKind, version: string): boolean {
  const since = GAME_SINCE[game];
  if (GAMES.some((g) => cmpVersion(GAME_SINCE[g], since) > 0)) return false;
  const [va = 0, vb = 0] = version.split('.').map(Number);
  const [sa = 0, sb = 0] = since.split('.').map(Number);
  return va === sa && vb >= sb && vb - sb <= NEW_FOR_MINORS;
}

export const isGame = (x: unknown): x is GameKind => typeof x === 'string' && (GAMES as readonly string[]).includes(x);

const SZ_REASONS: ReadonlySet<string> = new Set(['feuer', 'schnautz', 'knock', 'quit']);

/** Schnautz-Ergebnis oder null, ohne andere Spiele für Schnautz zu halten. */
export const szResult = (r: Result | null | undefined): SchnautzResult | null =>
  r && SZ_REASONS.has(r.reason) ? (r as SchnautzResult) : null;

/** Für den default-Zweig einer vollständigen Weiche nach Spiel. */
export function unreachable(x: never): never {
  throw new Error(`Unbekanntes Spiel: ${String(x)}`);
}

/**
 * Wer in der laufenden Partie noch mitspielt. Gilt für den Zustand beim Host und für jede Ansicht.
 * Durak wie `dkLive` aus durak.ts, hier nachgebaut, denn durak.ts importiert diese Datei.
 */
export function livePlayers(t: Table): Player[] {
  switch (t.game) {
    case 'shithead':
      return t.players.filter((p) => !p.out && !!t.sh?.P[p.id] && !t.sh.finished.includes(p.id));
    case 'durak':
      return t.players.filter((p) => !!t.dk && p.id in t.dk.P && !t.dk.finished.includes(p.id));
    case 'cabo':
      return t.players.filter((p) => !!t.cb?.P[p.id]);
    case 'schnautz':
      return t.players.filter((p) => !p.out);
    default:
      return unreachable(t.game);
  }
}

/** Spielen gerade nur noch KIs? Dann darf der Gastgeber vorspulen oder die Partie beenden. */
export function onlyBotsPlaying(t: Table): boolean {
  if (t.phase !== 'play' && t.phase !== 'choose' && t.phase !== 'swap' && t.phase !== 'peek') return false;
  const live = livePlayers(t);
  return live.length > 0 && live.every((p) => p.bot);
}

/** Krone und Titel des Verlierers gelten pro Spiel, bis dort jemand Neues gewinnt oder verliert. */
export const reignOf = (t: Pick<Table, 'reigns' | 'game'>, game: GameKind = t.game): Reign | null =>
  t.reigns?.[game] ?? null;

export function setReign(st: State, game: GameKind, win: string | null, lose: string | null = null): void {
  st.reigns = { ...(st.reigns ?? {}), [game]: { win, lose, game } };
}

/** Was „Auf Standard zurücksetzen“ im Einstellungsfenster schickt: die Regeln dieses Spiels und die Zeit pro Zug wie im Standard. */
export function resetRulesFor(g: GameKind): Partial<Rules> {
  const d = cloneRules(DEFAULT_RULES);
  const base = { turnSecs: d.turnSecs };
  switch (g) {
    case 'schnautz':
      return {
        ...base,
        lives: d.lives,
        feuer: d.feuer,
        dealerChoice: d.dealerChoice,
        knockFirst: d.knockFirst,
        knockDouble: d.knockDouble,
      };
    case 'shithead':
      return { ...base, sh: d.sh };
    case 'durak':
      return { ...base, dk: d.dk };
    case 'cabo':
      return { ...base, cb: d.cb };
    default:
      return unreachable(g);
  }
}
