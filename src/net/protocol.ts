/* Nachrichten zwischen Gastgeber und Gästen (PeerJS-Datenkanal, JSON). */
import type { Action, State, View } from '../game/types';

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
  | { t: 'reject'; msg: string }
  | { t: 'err'; msg: string }
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
