import type { TossItem, View } from '../game/types';
import type { Timer } from './dom';
import { LS } from './storage';

export type Role = 'host' | 'guest' | null;
export type EmoTab = 'emo' | 'snd' | 'toss';
export type NetState = 'off' | 'connecting' | 'online' | 'reconnecting';

/** Einmalige Animationen für das nächste Rendern. */
export interface AnimFlags {
  deal?: boolean;
  dealHand?: boolean;
  dealMid?: boolean;
  pilePop?: boolean;
}

/** Positionen der Karten, die man gerade selbst ausgespielt hat (für die Flug-Animation). */
export interface PlayRects {
  t: number;
  src: 'hand' | 'up' | 'down';
  rects: DOMRect[];
}

/** Zustand der Oberfläche in diesem Browser. Der Spielzustand selbst steckt in `view`. */
export const App = {
  role: null as Role,
  me: '',
  name: '',
  code: '',
  key: '',
  view: null as View | null,
  net: 'off' as NetState,
  /** Auswahl bei Schnautz: Handkarte und Karte aus der Mitte. */
  sel: { h: null as number | null, m: null as number | null },
  /** Auswahl bei Shithead: Quelle und Indizes der Karten. */
  ss: { src: null as 'hand' | 'up' | null, idx: [] as number[] },
  /** Tauschrunde bei Shithead. */
  sw: { h: null as number | null, u: null as number | null },
  /** Durak: gewählte Handkarten und der Angriff, den der Verteidiger schlagen will. */
  ds: { idx: [] as number[], pair: null as number | null },
  /** Durak: Knopfzeile und wann sie sich zuletzt geändert hat, gegen Tipps auf einen gerade getauschten Knopf */
  dkBtn: { sig: '', at: 0 },
  /** Cabo: gewählte eigene Plätze, gewählter fremder Platz (Blindtausch) und ob Schnappen gerade an ist */
  cs: { ids: [] as number[], opp: null as { to: string; id: number } | null, snap: false },
  /** Cabo: was ich gerade kurz sehen darf, bis wann, und welche Einblendung (in welcher Partie und Runde) schon dran war */
  cbShow: { rid: 0, g: -1, round: 0, until: 0, items: [] as { owner: string; slot: number; c: string }[] },
  /** Cabo: Knopfzeile wie bei Durak, gegen Tipps auf einen gerade getauschten Knopf */
  cbBtn: { sig: '', at: 0 },
  /** Lobby am Handy: welcher Reiter offen ist. */
  ltab: 'table' as 'table' | 'game',
  seenN: 0,
  unread: 0,
  peek: false,
  busy: false,
  throwing: false,
  emoBlock: false,
  muted: LS.get('muted', false),
  /** Offener Reiter im Reaktionsfenster */
  etab: (['emo', 'snd', 'toss'].includes(LS.get('etab', 'emo')) ? LS.get('etab', 'emo') : 'emo') as EmoTab,
  /** Gewählter Gegenstand, das Fenster wartet auf ein Ziel */
  aim: null as TossItem | null,
  tossBlock: false,
  sbBlock: false,
  /** Bis wann die Sperre je Reiter läuft, für den Balken, der leerläuft */
  coolUntil: { emo: 0, snd: 0, toss: 0 } as Record<EmoTab, number>,
  /** Soundboard nur für sich selbst stumm */
  sbOff: LS.get('sbOff', false),
  /** Wasserstand für Würfe und Klänge: Alles bis hierhin ist schon abgespielt */
  fxN: 0,
  /** Nächste Ansicht nur abgleichen, nichts nachspielen (nach Laden, Neuverbinden, neuem Tisch) */
  fxSync: true,
  /** Nach dem Aufwachen kurz nichts nachspielen */
  fxQuietUntil: 0,
  /** Tipp-Fenster: gewählte Person und in welcher Partie es schon offen war (dann pulsiert der Knopf nicht mehr) */
  betSel: null as string | null,
  betSeen: -1,
  /** Shithead der gerade beendeten Partie: Bis zur Enthüllung zeigen Platz und Zähler ihn noch nicht */
  zerHide: '',
  /** Zähler für E2E-Tests: gezeigte Klänge und gespielte Clips */
  sbSeen: 0,
  sbHeard: 0,
  anim: {} as AnimFlags,
  flying: 0,
  flownN: 0,
  holdUntil: 0,
  holdT: null as Timer | null,
  lastSig: null as string | null,
  playRects: null as PlayRects | null,
};
