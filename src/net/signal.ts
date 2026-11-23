import type { Peer } from 'peerjs';
import { App } from '../ui/app';
import { setNet } from '../ui/screens';

const looping = new WeakSet<Peer>();

/** Hält die Verbindung zum Vermittlungsserver am Leben und verbindet bei Bedarf neu. */
export function keepSignal(peer: Peer, isCurrent: () => boolean): void {
  if (looping.has(peer)) return;
  looping.add(peer);
  const tick = () => {
    if (!isCurrent() || peer.destroyed) {
      looping.delete(peer);
      return;
    }
    if (peer.disconnected) {
      try {
        peer.reconnect();
      } catch {
        /* nächster Versuch folgt */
      }
      setTimeout(tick, 4000);
    } else if (!peer.open) {
      setTimeout(tick, 1500);
    } else {
      looping.delete(peer);
      if (App.role === 'host') setNet('online');
    }
  };
  setTimeout(tick, 1500);
}

/** Schließt eine Verbindung, ohne dass ein Fehler stört. */
export function safeClose(c: { close(): void } | null | undefined, delay = 0): void {
  const run = () => {
    try {
      c?.close();
    } catch {
      /* schon zu */
    }
  };
  if (delay) setTimeout(run, delay);
  else run();
}

export function safeDestroy(p: Peer | null | undefined, delay = 0): void {
  const run = () => {
    try {
      p?.destroy();
    } catch {
      /* schon weg */
    }
  };
  if (delay) setTimeout(run, delay);
  else run();
}
