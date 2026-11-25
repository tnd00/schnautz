/*
 * Texte der Durak-Statuszeile (dkStatus in src/ui/render/durak.ts). Namen kommen schon maskiert und fett aus der
 * Oberfläche, hier stehen nur die Sätze drumherum. Mehrere können zugleich dran sein, deshalb setzt die Zeile
 * Teilsätze zusammen: „Tom verteidigt, Lena darf nachlegen.“
 */
import { SH_STATUS } from './status';

export const DK_STATUS = {
  lead: 'Du greifst an.',
  leadSub: (def: string): string => `Tippe eine Karte oder gleiche Werte an und greif ${def} an.`,
  defend: 'Du verteidigst.',
  defendSub: 'Tippe eine Karte und dann den Angriff, den sie schlagen soll. Oder nimm alles auf.',
  defendSubTransfer: 'Schlag jede Karte, nimm alles auf oder schieb mit gleichem Wert weiter.',
  taking: 'Du nimmst auf.',
  beatenMine: 'Alles geschlagen.',
  attackedSoon: 'Gleich musst du verteidigen.',
  /** „Lena greift Tom an“, „Lena greift dich an“ */
  attacks: (att: string, def: string): string => `${att} greift ${def} an`,
  attacksShort: (att: string): string => `${att} greift an`,
  /** Werde ich angegriffen, heißt es dich statt Du */
  you: 'dich',
  defends: (def: string): string => `${def} verteidigt`,
  takes: (def: string): string => `${def} nimmt auf`,
  beaten: 'Alles geschlagen',
  /** „Lena darf nachlegen“, „Lena und KI Igor dürfen nachlegen“ */
  mayAdd: (names: string, n: number): string => `${names} ${n === 1 ? 'darf' : 'dürfen'} nachlegen`,
  meMayAdd: 'du darfst nachlegen',
  meMayAddMain: 'Du darfst nachlegen.',
  throwOpen: 'Passende Werte darfst du schon nachlegen.',
  throwFree: 'Nachlegen darfst du Werte, die schon liegen. Sonst tippe Passen.',
  passedTake: 'Du hast gepasst. Die anderen dürfen noch etwas obendrauf legen.',
  passed: (def: string): string => `Du hast gepasst. Das gilt, bis ein neuer Wert liegt oder ${def} aufnimmt.`,
  doneSub: SH_STATUS.doneSub,
  overSub: SH_STATUS.overSub,
} as const;
