/*
 * Kleines Protokoll fürs Dev-Menü: Fehler, Warnungen, Netz, abgelehnte Züge und Ton, nur im Speicher dieses Browsers.
 * Kostet fast nichts und hilft, wenn am Handy etwas schiefgeht und keine Konsole zur Hand ist. Ohne Imports.
 */
export type DevLogKind = 'err' | 'warn' | 'net' | 'game' | 'audio' | 'dev';

export interface DevLogLine {
  t: number;
  k: DevLogKind;
  msg: string;
}

const MAX_LINES = 300;
export const DEVLOG: DevLogLine[] = [];

export function dlog(k: DevLogKind, msg: string): void {
  DEVLOG.push({ t: Date.now(), k, msg: msg.slice(0, 600) });
  if (DEVLOG.length > MAX_LINES) DEVLOG.splice(0, DEVLOG.length - MAX_LINES);
}

function str(x: unknown): string {
  if (x instanceof Error) return `${x.name}: ${x.message}`;
  if (typeof x === 'string') return x;
  try {
    return JSON.stringify(x) ?? String(x);
  } catch {
    return String(x);
  }
}

/** Einmal beim Start: Konsole und unbehandelte Fehler mitschreiben. Die Konsole selbst bleibt unverändert. */
export function initDevLog(): void {
  const hook = (k: 'err' | 'warn', name: 'error' | 'warn') => {
    const orig = console[name].bind(console);
    console[name] = (...args: unknown[]) => {
      dlog(k, args.map(str).join(' '));
      orig(...args);
    };
  };
  hook('err', 'error');
  hook('warn', 'warn');
  window.addEventListener('error', (e) =>
    dlog('err', `${e.message} (${e.filename?.split('/').pop() ?? ''}:${e.lineno})`),
  );
  window.addEventListener('unhandledrejection', (e) => dlog('err', `Promise: ${str(e.reason)}`));
  dlog('net', 'Seite geladen');
}
