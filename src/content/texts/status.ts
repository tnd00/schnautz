/*
 * Texte der Statuszeile (src/ui/status.ts). Feste Formen für alle Spiele, dazu die Unterzeilen je Spiel.
 * Namen kommen schon maskiert und fett aus der Oberfläche, hier stehen nur die Sätze drumherum.
 */

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

/** „Lena ist gerade offline.“ */
export const offline = (name: string): string => `${name} ist gerade offline.`;
export const OFFLINE_WAIT = 'Das Spiel wartet.';
export const playFor = (name: string): string => `Für ${name} spielen`;

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
