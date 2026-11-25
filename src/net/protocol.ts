/* Nachrichten zwischen Gastgeber und Gästen (PeerJS-Datenkanal, JSON). */
import type { Action, State, View } from '../game/types';
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
   * Abweisung beim Beitritt und abgelehnter Zug. `msg` ist der fertige Text aus Sicht des Gastes und bleibt
   * Pflicht, solange Gäste von 2.6 mitspielen (Entscheidung E6). Neu und freiwillig: Code `e` mit Argumenten `a`,
   * beim Zug dazu `act`, der Typ der abgelehnten Aktion.
   */
  | { t: 'reject'; msg: string; e?: string; a?: RejectArgs }
  | { t: 'err'; msg: string; e?: string; a?: RejectArgs; act?: string }
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

const REJECT_MAX_ARGS = 4;
/** Platz-IDs vom Draht: kurz und ohne die Form eines Platzschlüssels (`k-` plus 12 Hex, src/net/ids.ts) */
const REJECT_ID = /^[\w-]{1,40}$/;
const SEAT_KEY = /^k-[0-9a-f]{12}$/;
/** Erlaubte Argumente je Name. Alles andere verwirft die Prüfung, damit nichts Fremdes durchrutscht. */
const REJECT_ARG: Readonly<Record<string, (v: unknown) => boolean>> = {
  p: (v) => typeof v === 'string' && REJECT_ID.test(v) && !SEAT_KEY.test(v),
  on: (v) => typeof v === 'string' && REJECT_ID.test(v) && !SEAT_KEY.test(v),
  g: (v) => isGame(v),
  n: (v) => Number.isInteger(v) && Math.abs(v as number) <= 10_000,
  min: (v) => Number.isInteger(v) && Math.abs(v as number) <= 10_000,
  max: (v) => Number.isInteger(v) && Math.abs(v as number) <= 10_000,
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

/** Was der Gastgeber zu einer Ablehnung schickt. Noch nicht umgestellte Stellen liefern Text, dann nur `msg`. */
export function wireReject(r: Reject | string, ctx: RejectCtx): { e?: RejectCode; a?: RejectArgs; msg: string } {
  if (typeof r === 'string') return { msg: r };
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
