/*
 * Ein Tisch, ein Tab: Wer Gastgeber ist, hält die Sperre `schnautz-host` (navigator.locks). Ein zweiter Tab, der den
 * Tisch haben will, meldet einen Anspruch über BroadcastChannel und den Eintrag `hostclaim` in localStorage (das
 * storage-Ereignis gibt es überall, auch ohne Sperren und ohne sicheren Kontext). Der alte Tab tritt dann ab.
 * Beim Laden fasst diese Datei weder window noch navigator an, damit sich die Logik ohne Browser prüfen lässt.
 */
import { genId } from './ids';

export const LOCK_NAME = 'schnautz-host';
/** Eintrag in localStorage, mit demselben Präfix wie src/ui/storage.ts */
export const CLAIM_KEY = 'schnautz:hostclaim';
const CHANNEL = 'schnautz';
/** So lange wartet ein neuer Tab auf die freiwillige Übergabe, danach nimmt er sich die Sperre */
export const YIELD_WAIT_MS = 3000;
/** Ohne Sperren: kurz warten, damit der alte Tab speichern und seinen Peer schließen kann */
export const CLAIM_WAIT_MS = 600;
/** Ältere Ansprüche gelten nicht mehr, etwa wenn ein eingefrorener Tab erst viel später aufwacht */
export const CLAIM_FRESH_MS = 10_000;

/** Kennung dieses Seitenaufrufs. */
export const TAB = genId('t');

/** Ein Tab will Gastgeber werden. `code` leer heißt: ein neuer Tisch. Nie mit Schlüsseln oder Spielstand. */
export interface Claim {
  tab: string;
  code: string;
  at: number;
}

export function asClaim(x: unknown): Claim | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.tab !== 'string' || typeof o.code !== 'string' || typeof o.at !== 'number') return null;
  return { tab: o.tab.slice(0, 40), code: o.code.slice(0, 10), at: o.at };
}

/**
 * Was ein Tab mit einem fremden Anspruch macht. `keep`: speichert ein letztes Mal und übergibt (gleicher Tisch),
 * `end`: beendet seinen Tisch (im anderen Tab wird ein neuer aufgemacht), `drop`: tritt ohne Speichern ab, weil der
 * Anspruch schon alt ist und der neue Tab vielleicht längst selbst speichert, `ignore`: geht ihn nichts an.
 */
export type ClaimVerdict = 'keep' | 'end' | 'drop' | 'ignore';

export function claimVerdict(
  c: Claim | null,
  me: { tab: string; code: string; hosting: boolean },
  now: number,
): ClaimVerdict {
  if (!c || !me.hosting || c.tab === me.tab) return 'ignore';
  if (now - c.at > CLAIM_FRESH_MS) return 'drop';
  return c.code === me.code ? 'keep' : 'end';
}

/** Teil von navigator.locks, den diese Datei braucht (zum Prüfen ersetzbar). */
export interface LockApi {
  request(
    name: string,
    opts: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    cb: (lock: unknown) => unknown,
  ): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[]; pending?: { name?: string }[] }>;
}

export function browserLocks(): LockApi | null {
  try {
    const l = (globalThis.navigator as { locks?: LockApi } | undefined)?.locks;
    return l && typeof l.request === 'function' && typeof l.query === 'function' ? l : null;
  } catch {
    return null;
  }
}

/** Hält diesen Tab die Sperre: Freigabe. Wartet er darauf: true in `asking`. */
const L = {
  release: null as (() => void) | null,
  asking: 0,
  /** Die Sperre wurde diesem Tab weggenommen (ein anderer Tab hat sie sich genommen) */
  onLost: null as (() => void) | null,
};

export const holdsHostLock = (): boolean => !!L.release;

export function onHostLockLost(cb: () => void): void {
  L.onLost = cb;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortController !== 'function') return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/**
 * Eine Anfrage an die Sperre. Liefert true, sobald dieser Tab sie hält, false, wenn sie belegt ist (ifAvailable) oder
 * die Wartezeit ablief. Wird sie später weggenommen, meldet sich `onHostLockLost`. Jede Ablehnung wird abgefangen.
 */
function ask(api: LockApi, opts: { ifAvailable?: boolean; steal?: boolean; waitMs?: number }): Promise<boolean> {
  return new Promise((resolve) => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((r) => {
      release = r;
    });
    const o: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal } = {};
    if (opts.ifAvailable) o.ifAvailable = true;
    if (opts.steal) o.steal = true;
    if (opts.waitMs) o.signal = timeoutSignal(opts.waitMs);
    L.asking++;
    let granted = false;
    api
      .request(LOCK_NAME, o, (lock) => {
        L.asking--;
        if (!lock) {
          resolve(false);
          return undefined;
        }
        granted = true;
        // Eine alte Sperre dieses Tabs (sollte es nicht geben) gibt er frei
        L.release?.();
        L.release = release;
        resolve(true);
        return hold;
      })
      .catch(() => {
        if (!granted) {
          // Wartezeit abgelaufen, bevor die Sperre kam
          L.asking--;
          resolve(false);
          return;
        }
        // Weggenommen, während dieser Tab sie hielt
        if (L.release === release) {
          L.release = null;
          L.onLost?.();
        }
      });
  });
}

/** Sperre freigeben, falls dieser Tab sie hält. */
export function releaseHostLock(): void {
  const r = L.release;
  L.release = null;
  r?.();
}

/** Hält gerade ein anderer Tab den Tisch? null: Ohne Sperren lässt sich das nicht sagen. */
export async function hostLockElsewhere(api: LockApi | null = browserLocks()): Promise<boolean | null> {
  if (!api) return null;
  if (L.release || L.asking) return false;
  try {
    const s = await api.query();
    return [...(s.held ?? []), ...(s.pending ?? [])].some((l) => l.name === LOCK_NAME);
  } catch {
    return null;
  }
}

/** Sperre nehmen, wenn sie frei ist. Ohne Sperren gilt das als geklappt. */
export async function tryHostLock(api: LockApi | null = browserLocks()): Promise<boolean> {
  if (!api) return true;
  if (L.release) return true;
  return ask(api, { ifAvailable: true });
}

/** Wartet bis zu `waitMs` auf die Sperre, ohne sie zu nehmen (ein gerade entladener Tab gibt sie gleich frei). */
export async function waitHostLock(waitMs: number, api: LockApi | null = browserLocks()): Promise<boolean> {
  if (!api) return true;
  if (L.release) return true;
  return ask(api, { waitMs });
}

/** Die Sperre wirklich bekommen: erst auf die freiwillige Übergabe warten, dann nehmen. */
export async function takeHostLock(api: LockApi | null = browserLocks(), waitMs = YIELD_WAIT_MS): Promise<void> {
  if (!api || L.release) return;
  if (await ask(api, { ifAvailable: true })) return;
  if (await ask(api, { waitMs })) return;
  await ask(api, { steal: true });
}

/** Wie man einen Anspruch verschickt und empfängt (zum Prüfen ersetzbar). */
export interface ClaimBus {
  send(c: Claim): void;
  listen(cb: (c: Claim) => void): void;
}

/** BroadcastChannel und localStorage, jeweils nur, wenn es sie gibt. */
export function browserBus(storageKey = CLAIM_KEY): ClaimBus {
  let ch: BroadcastChannel | null = null;
  try {
    ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    ch = null;
  }
  return {
    send(c) {
      try {
        ch?.postMessage({ t: 'claim', c });
      } catch {
        /* Kanal zu */
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(c));
      } catch {
        /* Speicher nicht verfügbar */
      }
    },
    listen(cb) {
      ch?.addEventListener('message', (e: MessageEvent) => {
        const d = e.data as { t?: unknown; c?: unknown } | null;
        if (d && d.t === 'claim') {
          const c = asClaim(d.c);
          if (c) cb(c);
        }
      });
      window.addEventListener('storage', (e) => {
        if (e.key !== storageKey || !e.newValue) return;
        try {
          const c = asClaim(JSON.parse(e.newValue));
          if (c) cb(c);
        } catch {
          /* kaputter Eintrag */
        }
      });
    },
  };
}

/** Kommt derselbe Anspruch über beide Wege, zählt er einmal. */
export function dedupe(cb: (c: Claim) => void): (c: Claim) => void {
  const seen = new Set<string>();
  return (c) => {
    const k = `${c.tab}|${c.at}`;
    if (seen.has(k)) return;
    seen.add(k);
    if (seen.size > 50) seen.clear();
    cb(c);
  };
}

export function newClaim(code: string, now = Date.now()): Claim {
  return { tab: TAB, code, at: now };
}
