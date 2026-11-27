/* Nachrichten zwischen Gastgeber und Gästen (PeerJS-Datenkanal, JSON). */
import type { Action, State, View } from '../game/types';
import { rankOf, suitOf } from '../game/cards';
import { SH_RANKS, SUITS } from '../game/constants';
import { isGame } from '../game/games';
import { isRejectCode, type Reject, type RejectArgs, type RejectCode } from '../game/reject';
import { rejectText, type RejectCtx } from '../content/texts';

/** Gast → Gastgeber */
export type GuestMessage =
  /** `v`: Version der Seite, fehlt bei älteren Ständen */
  | { t: 'hello'; pid: string; key: string; name: string; v?: string }
  | { t: 'ping' }
  | { t: 'act'; a: Action }
  | { t: 'bye' };

/** Gastgeber → Gast */
export type HostMessage =
  | { t: 'welcome'; pid: string; v?: string }
  | { t: 'state'; s: View }
  | { t: 'pong' }
  /**
   * Abweisung beim Beitritt und abgelehnter Zug: Code `e` mit Argumenten `a`, beim Zug dazu `act`, der Typ der
   * abgelehnten Aktion. Beim Beitritt steht noch eine Stufe lang `msg` dabei, der fertige Text aus Sicht des Gastes,
   * damit Gäste von 2.7 auch neue Codes wie `net.update` lesen und die Einladung behalten. Beim Zug kommt seit der
   * Neulade-Pflicht kein `msg` mehr, ein Gastgeber bis 2.7 schickt es noch.
   */
  | { t: 'reject'; msg: string; e?: string; a?: RejectArgs }
  | { t: 'err'; msg?: string; e?: string; a?: RejectArgs; act?: string }
  | { t: 'closed' }
  | { t: 'replaced' };

/** Gespeicherter Tisch des Gastgebers, damit er nach dem Neuladen weitermachen kann. */
export interface SavedHost {
  code: string;
  me: string;
  name: string;
  st: State;
  keys: Record<string, string>;
  ts: number;
  /** Tab, der zuletzt gespeichert hat (src/net/tablock.ts), fehlt bei älteren Ständen */
  tab?: string;
}

/** Gespeicherter Platz eines Gastes. */
export interface SavedGuest {
  code: string;
  pid: string;
  key: string;
  name: string;
  ts: number;
}

/** Nachrichten kommen ungeprüft aus dem Netz: nur Objekte mit Typfeld weiterreichen. */
export function asMessage<T extends { t: string }>(m: unknown): T | null {
  return m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string' ? (m as T) : null;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';

/** Grobe Formprüfung einer Ansicht vom Gastgeber, bevor die Oberfläche damit arbeitet. */
export function isView(s: unknown): s is View {
  return (
    isObj(s) &&
    typeof s.phase === 'string' &&
    typeof s.me === 'string' &&
    Array.isArray(s.players) &&
    Array.isArray(s.log) &&
    isObj(s.rules)
  );
}

/** So lange lässt sich ein Tisch nach dem Neuladen fortsetzen. */
export const HOST_RESUME_MS = 24 * 3_600_000;
export const GUEST_RESUME_MS = 12 * 3_600_000;

/** Gespeicherte Daten können alt oder kaputt sein: nur Einträge mit passender Form verwenden. */
export function asSavedHost(x: unknown): SavedHost | null {
  if (!isObj(x) || typeof x.code !== 'string' || typeof x.me !== 'string' || typeof x.ts !== 'number') return null;
  const st = x.st;
  if (!isObj(st) || !Array.isArray(st.players) || !Array.isArray(st.log) || typeof st.phase !== 'string') return null;
  return x as unknown as SavedHost;
}

export function asSavedGuest(x: unknown): SavedGuest | null {
  if (!isObj(x) || typeof x.ts !== 'number') return null;
  return ['code', 'pid', 'key', 'name'].every((k) => typeof x[k] === 'string') ? (x as unknown as SavedGuest) : null;
}

/**
 * Vorlieben pro Gerät (Plan 2.8 Abschnitt 8, gefuehl.md 3.7). Sie gehen nie ins Netz, nicht in die View und nicht in
 * den Gastgeber-Speicher. Lesen und Schreiben steht in src/ui/prefs.ts.
 */
export interface Prefs {
  /** Tisch im Sticker-Look oder im Legacy-Design */
  look: 'sticker' | 'legacy';
  /** Kartendeck in beiden Looks, unabhängig vom Design: Vinyl, Vinyl dunkel oder das klassische aus cards.css */
  deck: 'vinyl' | 'vinyl-dark' | 'classic';
  /** wirkt nur unter Sticker, gewählt als „Sticker dunkel“ im Bogen „Design“ */
  theme: 'light' | 'dark';
  /** Ruhig: auto folgt prefers-reduced-motion */
  calm: 'auto' | 'on' | 'off';
  /** Karten ziehen */
  drag: boolean;
  /** Trefferflächen beim Ziehen sichtbar machen, Standard aus */
  zones: boolean;
  /** Vibration, nur angezeigt, wenn navigator.vibrate existiert */
  haptic: boolean;
  /** Lautstärke von 0 bis 1 */
  volume: number;
  /** Ton, wenn ich dran bin. away: nur bei verdecktem Tab oder nach kurzer Ruhe */
  turnTone: 'always' | 'away' | 'off';
}

/** Standard je Vorliebe, für alle Sticker mit Vinyl. DEFAULT_LOOK in src/ui/look.ts liest den Wert von hier. */
export const PREFS_DEFAULT: Readonly<Prefs> = {
  look: 'sticker',
  deck: 'vinyl',
  theme: 'light',
  calm: 'auto',
  drag: true,
  zones: false,
  haptic: true,
  volume: 1,
  turnTone: 'away',
};

/** Genau einer der erlaubten Werte, sonst der Standard */
const oneOf = <T extends string>(v: unknown, ok: readonly T[], d: T): T =>
  typeof v === 'string' && (ok as readonly string[]).includes(v) ? (v as T) : d;
const boolOr = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/**
 * Vorlieben aus dem Speicher, Feld für Feld geprüft: Was fehlt oder nicht passt, nimmt den Standard, alles andere
 * fällt weg. So setzt ein kaputtes Feld nicht alle Vorlieben zurück.
 */
export function asPrefs(x: unknown): Prefs {
  const o: Record<string, unknown> = isObj(x) && !Array.isArray(x) ? x : {};
  const d = PREFS_DEFAULT;
  const vol = o.volume;
  return {
    look: oneOf(o.look, ['sticker', 'legacy'], d.look),
    deck: oneOf(o.deck, ['vinyl', 'vinyl-dark', 'classic'], d.deck),
    theme: oneOf(o.theme, ['light', 'dark'], d.theme),
    calm: oneOf(o.calm, ['auto', 'on', 'off'], d.calm),
    drag: boolOr(o.drag, d.drag),
    zones: boolOr(o.zones, d.zones),
    haptic: boolOr(o.haptic, d.haptic),
    volume: typeof vol === 'number' && Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : d.volume,
    turnTone: oneOf(o.turnTone, ['always', 'away', 'off'], d.turnTone),
  };
}

const REJECT_MAX_ARGS = 4;
/** Platz-IDs vom Draht: kurz und ohne die Form eines Platzschlüssels (`k-` plus 12 Hex, src/net/ids.ts) */
const REJECT_ID = /^[\w-]{1,40}$/;
const SEAT_KEY = /^k-[0-9a-f]{12}$/;
/**
 * Karten vom Draht (sh.noFit, dk.noBeat, dk.beaten, dk.transferRank): Farbe und Wert wie in src/game/cards.ts, aus
 * Deck 2 mit `:2`. SH_RANKS deckt auch Durak und Schnautz ab. Alles andere ist keine Karte.
 */
const isCardArg = (v: unknown): boolean =>
  typeof v === 'string' &&
  v.length <= 6 &&
  (SUITS as readonly string[]).includes(suitOf(v)) &&
  (SH_RANKS as readonly string[]).includes(rankOf(v));
/** Erlaubte Argumente je Name. Alles andere verwirft die Prüfung, damit nichts Fremdes durchrutscht. */
const REJECT_ARG: Readonly<Record<string, (v: unknown) => boolean>> = {
  p: (v) => typeof v === 'string' && REJECT_ID.test(v) && !SEAT_KEY.test(v),
  on: (v) => typeof v === 'string' && REJECT_ID.test(v) && !SEAT_KEY.test(v),
  g: (v) => isGame(v),
  n: (v) => Number.isInteger(v) && Math.abs(v as number) <= 10_000,
  min: (v) => Number.isInteger(v) && Math.abs(v as number) <= 10_000,
  max: (v) => Number.isInteger(v) && Math.abs(v as number) <= 10_000,
  c: isCardArg,
  a: isCardArg,
  top: isCardArg,
};

/** Code und Argumente einer Ablehnung vom Gastgeber, streng geprüft. Unbekannter Code oder krumme Argumente: null. */
export function asReject(m: unknown): Reject | null {
  if (!isObj(m) || !isRejectCode(m.e)) return null;
  if (m.a === undefined) return { e: m.e };
  const a = m.a;
  if (!isObj(a) || Array.isArray(a)) return null;
  const entries = Object.entries(a);
  if (entries.length > REJECT_MAX_ARGS) return null;
  const out: RejectArgs = {};
  for (const [k, v] of entries) {
    const ok = REJECT_ARG[k];
    if (!ok || !ok(v)) return null;
    out[k] = v as string | number;
  }
  return { e: m.e, a: out };
}

/**
 * Was der Gastgeber zu einer Abweisung beim Beitritt schickt: Code und Argumente, dazu `msg` aus Sicht des Gastes für
 * Gäste von 2.7, die neue Codes nicht kennen und dann den Text lesen (eine Stufe über 2.8 hinaus).
 */
export function wireReject(r: Reject, ctx: RejectCtx): { e: RejectCode; a?: RejectArgs; msg: string } {
  const msg = rejectText(r, ctx);
  return r.a ? { e: r.e, a: r.a, msg } : { e: r.e, msg };
}

/**
 * Was der Gast zeigt: mit bekanntem Code selbst gerendert (eigene Ansicht und Blickwinkel), sonst `msg`, sonst der
 * Rückfall. `code` ist der geprüfte Code, auch wenn die Argumente nicht passten.
 */
export function readReject(
  m: Readonly<Record<string, unknown>>,
  ctx: RejectCtx,
  fallback: string,
): { text: string; code: RejectCode | null } {
  const msg = typeof m.msg === 'string' && m.msg ? m.msg : fallback;
  const r = asReject(m);
  if (!r) return { text: msg, code: null };
  return { text: rejectText(r, ctx, msg), code: r.e };
}

/** Typ der abgelehnten Aktion, damit der Gast weiß, was wackeln soll (Entscheidung E4). */
export function rejectAct(m: Readonly<Record<string, unknown>>): string | null {
  return typeof m.act === 'string' && /^[a-z]{1,16}$/i.test(m.act) ? m.act : null;
}
