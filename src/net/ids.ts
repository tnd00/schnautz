import type { PeerOptions } from 'peerjs';

/** Alle Tische teilen sich den öffentlichen PeerJS-Server, daher ein eigenes Präfix. */
export const PREFIX = 'schnautz-tisch-v1-';
/** Ohne leicht verwechselbare Zeichen wie 0/O und 1/I. */
export const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;

export function genCode(): string {
  const a = crypto.getRandomValues(new Uint32Array(CODE_LEN));
  return Array.from(a, (x) => ALPHA[x % ALPHA.length]).join('');
}

export function genId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const cleanCode = (s: unknown): string =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LEN);

export const cleanName = (s: unknown): string =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);

/**
 * Verbindungsoptionen. Für lokale Tests lässt sich ein eigener PeerServer per URL einstellen:
 * `?peerhost=127.0.0.1&peerport=9000&noice=1`
 */
export function peerOptions(): PeerOptions {
  const q = new URLSearchParams(location.search);
  const o: PeerOptions = { debug: 0 };
  const host = q.get('peerhost');
  if (host) {
    o.host = host;
    o.port = parseInt(q.get('peerport') || '9000', 10);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  if (q.get('noice')) o.config = { iceServers: [] };
  return o;
}
