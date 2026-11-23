/* Kleine DOM-Helfer. */

/** Erstes Element zum Selektor. Für Elemente aus index.html, die immer existieren. */
export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  return root.querySelector<T>(sel) as T;
}

/** Erstes Element zum Selektor oder `null`, wenn es (gerade) nicht im DOM ist. */
export function $opt<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text sicher für innerHTML machen. Alle Namen und Chattexte laufen hier durch. */
export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Zahl aus unsicherer Quelle, sonst 0. */
export function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** "A, B und C" */
export const listJoin = (a: string[]): string =>
  a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`;

export const reduceMotion = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Einfacher, stabiler Hash für zufällig wirkende, aber reproduzierbare Werte. */
export function hashStr(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type Timer = ReturnType<typeof setTimeout>;
