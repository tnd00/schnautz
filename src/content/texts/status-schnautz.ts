/*
 * Texte der Schnautz-Statuszeile (szStatus in src/ui/render/schnautz.ts) und des Schnautz-Ergebnisblatts.
 * Namen kommen schon maskiert und fett aus der Oberfläche, hier stehen nur die Sätze drumherum.
 */

const zug = (n: number): string => (n === 1 ? 'Noch ein Zug' : `Noch ${n} Züge`);

/** Statuszeile */
export const SZ_STATUS = {
  chooseMine: 'Behalte dein Blatt oder nimm blind das zweite. Das andere kommt offen in die Mitte.',
  chooseOther: 'Wer gibt, behält das Blatt oder nimmt blind das zweite.',
  you: 'Du',
  tip: 'Tippe eine Handkarte und eine Karte aus der Mitte an.',
  /** „Lena hat geklopft, das ist dein letzter Zug.“ */
  lastMine: (who: string): string => `${who} hat geklopft, das ist dein letzter Zug.`,
  /** „Du hast geklopft. Noch 3 Züge bis zum Aufdecken.“, `who` ist „Du“ oder ein Name */
  knocked: (who: string, mine: boolean, left: number): string =>
    `${who} ${mine ? 'hast' : 'hat'} geklopft. ${zug(left)} bis zum Aufdecken.`,
  passed: (n: number, of: number): string => `${n} von ${of} ${n === 1 ? 'hat' : 'haben'} geschoben.`,
  passedAll: 'Schieben alle, kommen neue Karten.',
  out: 'Du bist raus. Werfen und tröten darfst du trotzdem.',
  roundSub: 'Gleich kommt das Ergebnis.',
  /** Knopf des Gastgebers, wenn die Person am Zug offline ist */
  skipKeep: (name: string): string => `Für ${name} behalten`,
  skipPass: (name: string): string => `Für ${name} schieben`,
} as const;

/** Ergebnisblatt */
export const SZ_SHEET = {
  won: 'gewinnst!',
  wins: 'gewinnt!',
  over: 'Partie vorbei',
  decided: 'Partie entschieden!',
  schnautz: 'Schnautz!',
  feuer: 'Feuer!',
  shown: 'Aufgedeckt',
  quit: (name: string, mine: boolean): string => `${name} ${mine ? 'hast' : 'hat'} den Tisch verlassen.`,
  knocked: (mine: boolean): string => (mine ? 'hast geklopft' : 'hat geklopft'),
  /** Handwert in der Schlüsselzeile */
  handVal: (val: string): string => `Hand ${val}`,
  tie: '🤝 Gleichstand. Niemand verliert ein Leben.',
  /** Folge in der Zeile */
  life: (n: number): string => (n === 2 ? '2 Leben weg' : '1 Leben weg'),
  swim: (mine: boolean): string => (mine ? 'schwimmst jetzt' : 'schwimmt jetzt'),
  outNow: (mine: boolean): string => (mine ? 'bist raus' : 'ist raus'),
  best: 'beste Hand',
  outBefore: 'schon raus',
  winner: (mine: boolean): string => (mine ? 'bleibst übrig' : 'bleibt übrig'),
  outIn: (round: number): string => `raus in Runde ${round}`,
  /*
   * Kurzformen, wenn ein langer Name neben der Kernzahl sonst nicht ganz passt (fitRows in src/ui/render/result.ts).
   * Wo das Zeichen vor dem Namen es schon sagt (💔 ein Leben weg, 🛟 schwimmt, 👑 beste Hand), bleibt sie leer.
   */
  lifeShort: (n: number): string => (n === 1 ? '' : `−${n} Leben`),
  outShort: 'raus',
  knockedShort: 'geklopft',
  outInShort: (round: number): string => `Runde ${round}`,
  /** „Tom ist zuletzt untergegangen.“, `names` schon verbunden, `me` ob „Du“ dabei ist */
  lastDownNote: (names: string, count: number, me: boolean): string =>
    `🫧 ${names} ${count > 1 ? (me ? 'seid' : 'sind') : me ? 'bist' : 'ist'} zuletzt untergegangen.`,
} as const;
