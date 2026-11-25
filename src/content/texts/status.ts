/*
 * Texte der Statuszeile (src/ui/status.ts). Feste Formen für alle Spiele, dazu die Unterzeilen je Spiel.
 * Namen kommen schon maskiert und fett aus der Oberfläche, hier stehen nur die Sätze drumherum.
 */

import { LOSER_MARK } from '../../game/games';

/** Gemeinsame Hauptzeilen */
export const STATUS = {
  myTurn: 'Du bist dran.',
  soon: 'Gleich bist du dran.',
  done: 'Du bist fertig!',
  roundOver: 'Runde vorbei.',
  gameOver: 'Partie vorbei.',
  /** Bis die Zeremonie durch ist, verrät die Zeile nichts */
  reveal: 'Aufdecken …',
  /** Präfix vor KI-Namen in Warte- und Zugsätzen */
  bot: 'KI',
} as const;

/** „Lena ist dran.“ */
export const turnOf = (name: string): string => `${name} ist dran.`;

/** „Warte auf Tom und KI Igor.“ */
export const waitFor = (names: string): string => `Warte auf ${names}.`;

/** „Lena, Tom und 5 weitere“, `names` sind die ersten schon mit Komma verbunden, `n` der Rest (ab 2) */
const andMore = (names: string, n: number): string => `${names} und ${n} weitere`;

/** „A, B und C“ */
const andJoin = (a: readonly string[]): string =>
  a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`;

/**
 * Auf wen gewartet wird: bis drei Namen alle („Tom, Uschi und KI Max“), ab vier die ersten zwei und der Rest als
 * Zahl („Lena, Tom und 5 weitere“). Die Namen kommen fertig, fett und maskiert oder roh.
 */
export function waitWho(names: readonly string[]): string {
  return names.length < 4 ? andJoin(names) : andMore(names.slice(0, 2).join(', '), names.length - 2);
}

/** Wartezeile der Statuszeile: „Warte auf Lena, Tom und 5 weitere.“, leer ohne Namen */
export const waitLine = (names: readonly string[]): string => (names.length ? waitFor(waitWho(names)) : '');

/** Ergebnisblatt: Tooltip und Vorlesetext zu ⏳ an der Zeile von allen, auf die nach dem Bereitmelden noch gewartet wird */
export const WAIT_MARK = 'noch nicht bereit';
/** Ergebnisblatt, wenn kein Name mehr in die Knopfreihe passt: „Noch 1 fehlt.“, „Noch 5 fehlen.“ */
export const waitCount = (n: number): string => (n === 1 ? 'Noch 1 fehlt.' : `Noch ${n} fehlen.`);
/** Ergebnisblatt, alle sind bereit */
export const WAIT_GO = "Los geht's…";
/** Countdown zur nächsten Runde im Ergebnisblatt, `secs` kommt als HTML */
export const nextIn = (secs: string): string => `Weiter in ${secs} s`;

/**
 * Wartetext im Ergebnisblatt vom längsten zum kürzesten. Er steht in der Knopfreihe neben bis zu drei Knöpfen, bei
 * 360 px sind das je nach Rolle nur 103 bis 233 px. Die Oberfläche zeigt den ersten, der ganz hineinpasst: die
 * Wartezeile, dann ein Name und der Rest als Zahl, zuletzt nur die Zahl. Wer fehlt, zeigt dann ⏳ an der Zeile.
 */
export function waitForms(names: readonly string[]): string[] {
  if (!names.length) return [WAIT_GO];
  const forms = [waitLine(names)];
  if (names.length >= 3) forms.push(waitFor(andMore(names[0], names.length - 1)));
  forms.push(waitCount(names.length));
  return forms;
}

/** „Lena ist gerade offline.“ */
export const offline = (name: string): string => `${name} ist gerade offline.`;
export const OFFLINE_WAIT = 'Das Spiel wartet.';
export const playFor = (name: string): string => `Für ${name} spielen`;

/**
 * Kernzahl in den Zeilen des Ergebnisblatts bei Shithead, Durak nimmt dieselben Wörter. Passt ein langer Name neben
 * der Kernzahl nicht ganz, nimmt das Blatt die Kurzform (fitRows in src/ui/render/result.ts). Krone und Platz sagen
 * dann schon, wer zuerst fertig war.
 */
export const SH_SHEET = {
  first: 'zuerst fertig',
  firstShort: 'zuerst',
  done: 'fertig',
  left: (n: number): string => `${n} ${n === 1 ? 'Karte übrig' : 'Karten übrig'}`,
  /** „2× Shithead“ in früheren Partien */
  count: (n: number): string => `${n}× Shithead`,
  /** Kurz wie am Tisch: „💩 2“, mit Erklärung beim Darüberfahren */
  countShort: (n: number): string => `<span title="So oft Shithead gewesen">${LOSER_MARK.shithead} ${n}</span>`,
} as const;

/** Shithead */
export const SH_STATUS = {
  blind: 'Jetzt blind!',
  blindSub: 'Tippe eine verdeckte Karte an. Passt sie nicht, nimmst du den Stapel auf.',
  noFit: 'Keine Karte passt. Du musst den Stapel aufnehmen.',
  upNow: 'Deine Hand ist leer. Jetzt sind die offenen Tischkarten dran.',
  pick: 'Tippe gleiche Karten an und leg sie ab.',
  winMine: 'Neuer Stapel, alle dürfen jetzt ihre 4er reinwerfen, du auch.',
  swap: 'Tauschrunde',
  swapSub: 'Tausche Hand- und Tischkarten, dann tippe Bereit.',
  doneSub: (place: number): string => `Platz ${place}. Werfen und tröten darfst du trotzdem.`,
  overSub: 'Gleich kommt das Ergebnis.',
} as const;
