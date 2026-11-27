/*
 * TURN-Zugang für Verbindungen, die nicht direkt zustande kommen (etwa iCloud Privat-Relay oder mobile Netze). Die
 * freien TURN-Server von PeerJS gibt es seit November 2026 nicht mehr. Ein kleiner Worker gibt kurzlebige Zugangsdaten
 * aus, die App holt sie beim Start im Hintergrund und merkt sie sich, damit sie auch nach dem Neuladen sofort da sind.
 * Ohne Adresse oder bei einem Fehler bleibt alles wie vorher (nur STUN).
 */

/** Adresse des Workers, der `{ iceServers }` oder ein Array von RTCIceServer liefert. Leer heißt aus. */
export const ICE_URL = 'https://schnautz.tahnadoetsch.workers.dev/';

const KEY = 'schnautz:ice';
/** Zugangsdaten gelten 24 h, gemerkt wird kürzer, damit nie abgelaufene benutzt werden */
const KEEP_MS = 20 * 3600 * 1000;

let cached: RTCIceServer[] | null = null;

const isUrl = (u: unknown): u is string => typeof u === 'string' && /^(stun|turns?):/.test(u) && u.length < 300;

/** Prüft Daten aus dem Netz oder aus localStorage. Port 53 blockieren Browser, er kostet nur Wartezeit. */
export function asIce(x: unknown): RTCIceServer[] | null {
  if (!Array.isArray(x)) return null;
  const out: RTCIceServer[] = [];
  for (const s of x.slice(0, 8)) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const urls = (Array.isArray(o.urls) ? o.urls : [o.urls]).filter(isUrl).filter((u) => !/:53(\?|$)/.test(u));
    if (!urls.length) continue;
    const e: RTCIceServer = { urls };
    if (typeof o.username === 'string' && typeof o.credential === 'string') {
      e.username = o.username;
      e.credential = o.credential;
    }
    out.push(e);
  }
  return out.length ? out : null;
}

function fromStore(now: number): RTCIceServer[] | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null') as { s?: unknown; until?: unknown } | null;
    if (o && typeof o.until === 'number' && o.until > now) return asIce(o.s);
  } catch {
    // ohne Speicher oder kaputter Eintrag: neu holen
  }
  return null;
}

/** Gemerkte Zugangsdaten oder null */
export function iceServers(now = Date.now()): RTCIceServer[] | null {
  return cached ?? (cached = fromStore(now));
}

/** Holt neue Zugangsdaten im Hintergrund, wenn keine gültigen da sind. Wirft nie. */
export function loadIce(url = ICE_URL): void {
  if (!url || iceServers()) return;
  fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => {
      const s = asIce(Array.isArray(j) ? j : (j as { iceServers?: unknown } | null)?.iceServers);
      if (!s) return;
      cached = s;
      try {
        localStorage.setItem(KEY, JSON.stringify({ s, until: Date.now() + KEEP_MS }));
      } catch {
        // nur gemerkt, solange die Seite offen ist
      }
    })
    .catch(() => {});
}

/** Nur für Tests */
export function resetIce(): void {
  cached = null;
}
