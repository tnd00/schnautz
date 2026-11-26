/*
 * Modelle des gemeinsamen Tisches (Plan 2.8, Vertrag aus Runde 1). Jedes Spiel liefert nur noch Daten in diesen
 * Formen, die Bausteine in src/ui/table zeichnen daraus HTML mit Rollen, Namen und Zuständen. Grundlage ist
 * geruest.md 3.2 mit den Änderungen aus Abschnitt 8 des Plans: keine Punkteleiste, dafür Wert und Eckaufkleber am
 * Platz, Gründe als Ablehnungscode statt als Text.
 *
 * Slots (`body`, `count`, `value`, `marks`, `rows`, `extra` und so weiter) sind fertiges, maskiertes HTML aus eigenem
 * Code. Alle übrigen Texte sind Klartext, der Baustein maskiert sie.
 */
import type { DropKey } from '../../game/drop';
import type { Reject } from '../../game/reject';
import type { Card } from '../../game/types';

/** Zustand eines Platzes. Ein Wortschatz für alle vier Spiele, mehrere zugleich möglich, steht in `data-st`. */
export type SeatState =
  /** am Zug oder gefragt (bei Durak und Cabo aus dkWaiting, cbWaiting) */
  | 'turn'
  /** KI überlegt (heute die Denkpünktchen im Etikett) */
  | 'think'
  /** fertig mit Platz */
  | 'done'
  /** raus oder gegangen, blass */
  | 'out'
  | 'offline'
  /** Ziel einer Fähigkeit (Cabo Spionieren, Blindtausch), dann kein Wurfziel */
  | 'target'
  /** gerade vorn (Schnautz-Rundenende) */
  | 'win'
  /** gerade getroffen (Schnautz-Rundenende) */
  | 'lose'
  /** Cabo gerufen */
  | 'called';

/** Rolle in dieser Runde, unabhängig vom Zustand, steht in `data-role` */
export type SeatRole = 'att' | 'def' | 'deal' | 'knock';

export type TagKind = 'plain' | 'turn' | 'done' | 'role' | 'take' | 'knock' | 'call' | 'king' | 'loser' | 'four';

/** Etikett am Platz („ist dran“, „verteidigt“, „hat geklopft“) */
export interface TagModel {
  /** Klartext, der Baustein maskiert */
  text: string;
  kind: TagKind;
  /** Denkpünktchen anhängen */
  think?: boolean;
  /** alte Klassen als Haken: 'turn', 'done', 'outt', 'knock', 'take', 'def', 'att', 'cabo', 'king' */
  cls?: string;
}

/** Ein Gegnerplatz als Kachel */
export interface SeatModel {
  /** data-pid */
  id: string;
  /** Klartext */
  name: string;
  /** Eckaufkleber (Krone, 💩, 🤡) als fertiges HTML aus marksHTML, leer ohne */
  marks: string;
  /**
   * Tinten-Sticker auf der Unterkante: Handkarten, Punkte oder Leben. HTML, leer heißt kein Sticker. Runde 3 füllt ihn
   * für Shithead, 4b für die übrigen Spiele, bis dahin bleibt er leer und das Bild unverändert.
   */
  value: string;
  /** Slot Zähler wie heute: shcHTML, dkcHTML, Cabo-Punkte, livesHTML */
  count: string;
  /** null gibt den unsichtbaren Platzhalter, damit die Kachel ihre Höhe behält */
  tag: TagModel | null;
  /** Slot Kartenbild: tcards, bighand, dkshow, cbrow, ocards */
  body: string;
  st: readonly SeatState[];
  role?: SeatRole;
  /** Wurfziel (aimAttrs), aus, wenn `st` 'target' enthält */
  aim: boolean;
  /** alte Klassen: 'sh', 'dk', 'cb', 'handonly', 'aimable', 'def', 'att' */
  cls: readonly string[];
  /** Slot für Großes Kino: Krawatte, Schwimmring, Spur nach Blindtausch */
  badges?: string;
  /** Satz ohne Namen für den Vorleser, etwa „KI, 5 Karten, verteidigt“ */
  say: string;
}

/** Kopf des eigenen Platzes */
export interface MeHead {
  /** reignHTML */
  marks: string;
  /** shcHTML, dkcHTML, livesHTML */
  count?: string;
  /** „Platz 2“, „📣 Cabo!“, „+12“, „du gibst“, später die eigene Rolle (Kino 12) */
  tags?: string;
  /** Handkarten, Punkte, Handwert mit Vorschau */
  pill?: string;
}

export type MeState = 'turn' | 'looking' | 'swapping' | 'snapping' | 'win' | 'lose';

/** Eigener Platz */
export interface MeModel {
  /** null in der Tauschrunde, dort steht `lead` */
  head: MeHead | null;
  /** Slot über den Reihen, heute .swhead */
  lead?: string;
  /** Slot Reihen: Tischkarten plus Hand, cbrow, Schnautz-Fächer */
  rows: string;
  bar: BarModel | null;
  st: readonly MeState[];
  /** alte Klassen: 'shme', 'dkme', 'cbme', 'swapping', 'looking' */
  cls: readonly string[];
  /** „Du verteidigst, 6 Karten“ */
  say: string;
}

/** Eigener Platz, wenn man die Partie nicht mitspielt */
export interface MeOut {
  /** „Du spielst diese Partie nicht mit.“ */
  out: string;
  /** Vorspulen bei Schnautz, wenn man raus ist */
  bar?: BarModel | null;
}

/** Was eine Karte am Tisch als Quelle fürs Ziehen ist, steht in `data-drag` */
export type DragSrcKind = 'hand' | 'up' | 'down' | 'slot' | 'hold' | 'pile' | 'deck' | 'mid';
/** Was ein Feld als Ziel fürs Ziehen ist, steht in `data-drop`, gleich `DropKey.z` aus src/game/drop.ts */
export type DropKind = DropKey['z'];

/** Eine Karte in einer Hand oder Reihe */
export interface HandCard {
  /** null zeichnet den Rücken */
  c: Card | null;
  /** data-i */
  i: number;
  /**
   * Fokus-Schlüssel `data-fk` (gefuehl 3.4), etwa `hand:HA:2` oder `cb:p2:3`. Ohne ihn bildet der Baustein ihn aus
   * Gruppe und `i`.
   */
  fk?: string;
  /** data-sid bei Cabo (heißt in geruest 3.2 `key`, umbenannt wegen `CardOpts.key`) */
  sid?: number;
  /** data-o bei fremden Cabo-Karten */
  owner?: string;
  /** data-act, ohne act nicht antippbar */
  act?: string;
  /** .sel und aria-pressed="true" */
  sel?: boolean;
  /** .dim, bleibt antippbar */
  dim?: boolean;
  /**
   * Grund, warum die Karte gerade nicht geht, mit demselben Code, den der Gastgeber schicken würde (shWhyNot,
   * dkWhyNot, cbWhyNot, szWhyNot). Der Baustein schreibt daraus aria-disabled und den Vorlesetext.
   */
  why?: Reject | null;
  /** Spielklassen: 'trumpc', 'blindc', 'deal', 'pop' */
  cls?: string;
  /** --d in Sekunden */
  delay?: number;
  /** Slot auf der Karte: Cabo-Wert, Auge, Restzeit */
  extra?: string;
  /** Quelle fürs Ziehen */
  drag?: DragSrcKind;
  /** Name für Rückseiten, „verdeckte Karte 2“ */
  label?: string;
}

/**
 * Form einer Hand: fan3 Schnautz, row Shithead und Durak, slots Cabo. Heißt in geruest 3.2 `HandKind`, umbenannt wegen
 * `HandKind` in src/game/types.ts.
 */
export type HandLayout = 'fan3' | 'row' | 'slots';

export interface HandModel {
  kind: HandLayout;
  /** alte Klassen: 'shhand', 'shhand dkhand', 'cbrow mine', 'hand' */
  cls: string;
  /** „Deine Hand, 7 Karten“ */
  label: string;
  cards: readonly HandCard[];
  /** fitHand passt Überlappung und Reihen an */
  fit?: boolean;
  /** Stapelhand nach Wert (Großes Kino Punkt 1), im Fundament ohne Wirkung */
  group?: 'rank';
  /** etwa --ov bei Cabo */
  style?: string;
}

/** Ein Stapel oder Feld in der Tischmitte */
export interface StackModel {
  k: 'deck' | 'pile' | 'hold' | 'table' | 'middle' | 'counter';
  /**
   * alte Klassen: 'deck', 'deck dkdeck', 'deck cbdeck', 'pile', 'pile cbpile', 'cbhold', 'dktable', 'middle',
   * 'burned', 'burned dkbito'
   */
  cls: string;
  title: string;
  /** Karten oder Slot (Durak-Paare, Schnautz-Mitte) */
  body: string;
  /** .pcount */
  count?: number;
  /** Beschriftung darunter */
  cnt?: { text: string; warn?: boolean };
  /** antippbar, mit aria-label */
  act?: { act: string; label: string };
  /** gerade ein Ziel, alte Klasse .can */
  can?: boolean;
  /** Ziel fürs Ziehen */
  drop?: DropKind;
}

export interface CenterModel {
  /** HTML, maskiert */
  cap: string;
  stacks: readonly StackModel[];
  /** „Tischmitte, 3 Karten auf dem Stapel“ */
  label: string;
}

export type BtnIntent = 'go' | 'alt' | 'take' | 'call' | 'toggle';

/** Ein Knopf in der Knopfleiste (in geruest 3.2 `BtnModel`) */
export interface BarButton {
  act: string;
  /** HTML erlaubt (blong und bshort aus der Hilfe twoLabel) */
  label: string;
  /** für Sticker und Vorleser */
  intent: BtnIntent;
  /** alte Klassen für Legacy: 'primary', 'ghost', 'wood', 'bomb', 'throw', 'cabo', 'snapb' */
  cls: string;
  /** false schreibt aria-disabled, der Knopf bleibt an seinem Platz und antippbar */
  ok: boolean;
  /**
   * Grund, wenn `ok` false ist, als Code wie beim Gastgeber. Der Baustein schreibt daraus den Vorlesetext und zeigt
   * ihn beim Tipp.
   */
  why?: Reject | null;
  pulse?: boolean;
  /** Schalter (Schnappen), aria-pressed */
  on?: boolean;
  aria?: string;
  title?: string;
}

export interface BarModel {
  btns: readonly BarButton[];
  /** Tipp-Knopf, Hinweis, botsOnlyHTML */
  extra?: string;
  /** 'botsrow' */
  cls?: string;
}

/**
 * Optionen für `cardHTML(c, o)` in src/ui/cards.ts (gefuehl 3.3), statt freier `attrs`. Die Render-Dateien bauen
 * damit keine Rollen mehr selbst. Die alte Form mit `attrs` bleibt bis 4a gültig.
 */
export interface CardOpts {
  /** Fokus-Schlüssel `data-fk`, die Karte selbst (eindeutig auch mit `:2`), bei Cabo Besitzer und Platz-ID */
  key: string;
  /** data-act, wenn antippbar. Dann role="button" und tabindex aus der Hand-Gruppe */
  act?: string;
  /** Platz in der Gruppe, für data-i und den Namen („3. Karte“) */
  i?: number;
  /** data-sid bei Cabo */
  sid?: number;
  /** data-o bei fremden Cabo-Karten */
  owner?: string;
  /** aria-pressed */
  sel?: boolean;
  /** .dim */
  dim?: boolean;
  /** Grund als fertiger Klartext aus `HandCard.why`, wird aria-description, die Karte bleibt antippbar */
  why?: string | null;
  /** Name endet auf „, Trumpf“, sichtbares Zeichen in der Ecke */
  trump?: boolean;
  /** Cabo: Wert im Namen („Herz Dame, 12 Punkte“) */
  value?: number;
  /** Name, wenn die Karte verdeckt ist („Deine 2. Karte, verdeckt“), sonst ist der Rücken aria-hidden */
  backName?: string;
  /** data-drag */
  drag?: DragSrcKind;
  cls?: string;
  style?: string;
}

/** Zone eines fokussierbaren Elements am Tisch, erster Teil von `data-fk` (gefuehl 3.4) */
export type FkZone = 'hand' | 'up' | 'down' | 'mid' | 'pair' | 'cb' | 'zone' | 'act';

/**
 * Verweis auf eine Karte oder ein Feld über den Fokus-Schlüssel: Zone plus Karte (`HA:2`), Index (`1`) oder bei
 * Cabo Besitzer und Platz-ID (`p2:3`). `data-fk` ist dann `${z}:${k}`.
 */
export interface CardRef {
  z: FkZone;
  k: string | number;
}
