import type { View } from '../game/types';
import type { Timer } from './dom';
import { LS } from './storage';

export type Role = 'host' | 'guest' | null;
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
  /** Lobby am Handy: welcher Reiter offen ist. */
  ltab: 'table' as 'table' | 'game',
  seenN: 0,
  unread: 0,
  peek: false,
  busy: false,
  throwing: false,
  emoBlock: false,
  muted: LS.get('muted', false),
  anim: {} as AnimFlags,
  flying: 0,
  flownN: 0,
  holdUntil: 0,
  holdT: null as Timer | null,
  lastSig: null as string | null,
  playRects: null as PlayRects | null,
};
