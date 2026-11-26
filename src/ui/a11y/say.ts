/*
 * Vorleser (Plan 2.8 Abschnitt 8, gefuehl.md 3.6): eine Region `#sr-say` fest in index.html außerhalb von `#app`, die
 * nur über textContent schreibt. Es gibt kein sayLog, der Vorleser hängt in `emit` (nach levelInBatch, nur groß und
 * eigene Meldungen) und in `showReject` (der Grundtext). So sagt er nie früher etwas als der Bildschirm (Zeremonie,
 * SEQ, Cabo-Einblendung). Zusätzlich sperrt er selbst: den noch versteckten Shithead (`App.zerHide`), alles nach dem
 * Aufwachen (`App.fxQuietUntil`) und jeden Schub, der nicht neuer ist als der Wasserstand aus `resetSay`. Nach dem
 * Laden und nach `resetSay(0)` nimmt er den Wasserstand beim ersten Zeichnen selbst (`App.seenN` in `sayStatus`).
 *
 * Der Kern (`SayCore` und die Funktionen davor) kommt ohne DOM aus, tests/unit/say.test.ts prüft ihn.
 */
import { App } from '../app';
import type { Status } from '../status';

/** Rang einer Ansage: eigener Zug, großer Moment, betrifft mich, sonstiges */
export type SayPrio = 'turn' | 'big' | 'mine' | 'info';

const RANK: Record<SayPrio, number> = { turn: 0, big: 1, mine: 2, info: 3 };
/** Höchstens so viele Sätze pro Schub, die wichtigsten zuerst */
export const SAY_MAX = 3;

/* ---------- Kern ohne DOM ---------- */

export interface SayCore {
  q: { text: string; prio: SayPrio }[];
  /** Wasserstand: Schübe bis zu dieser Lognummer werden nicht vorgelesen */
  mark: number;
  /** Höchste Lognummer des laufenden Schubs, 0 ohne Schub (Ablehnung, Uhr, Status) */
  batchN: number;
  /** Zuletzt vorgelesene Statuszeile, damit jedes Zeichnen sie nicht noch einmal sagt */
  status: string;
  /** Wasserstand noch offen (nach dem Laden oder resetSay(0)), das erste Zeichnen setzt ihn */
  armed: boolean;
}

export const newSayCore = (): SayCore => ({ q: [], mark: 0, batchN: 0, status: '', armed: true });

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** HTML der Meldungen und Statuszeile als Vorlesetext: Tags raus, Zeichen zurück, Leerraum zusammen */
export function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENT[e])
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

const end = (t: string): string => (/[.!?…:]$/.test(t) ? t : `${t}.`);

/** Teile als Sätze hintereinander, jeder mit Satzzeichen am Ende, leere fallen weg */
export const sentences = (...parts: string[]): string =>
  parts
    .map((t) => t.trim())
    .filter(Boolean)
    .map(end)
    .join(' ');

/** Satz einreihen. Leeres, Gesperrtes (`hide`), Altes (Schub unter dem Wasserstand) und Dubletten fallen weg. */
export function coreSay(c: SayCore, text: string, prio: SayPrio, hide: readonly string[] = []): void {
  const t = text.trim();
  if (!t) return;
  if (c.batchN && c.batchN <= c.mark) return;
  if (hide.some((h) => h && t.includes(h))) return;
  if (c.q.some((x) => x.text === t)) return;
  c.q.push({ text: t, prio });
}

/** Neuer Schub von Logeinträgen bis Lognummer n */
export function coreBatch(c: SayCore, n: number): void {
  c.batchN = n;
  // Ein Schub kommt nur mit einer Ansicht davor, das Laden ist also vorbei
  c.armed = false;
}

/** Erstes Zeichnen nach dem Laden: alles bis zur Lognummer n gilt als gesehen */
export function coreDraw(c: SayCore, n: number): void {
  if (!c.armed) return;
  c.armed = false;
  c.mark = Math.max(c.mark, n);
}

/** Was jetzt vorgelesen wird: höchstens SAY_MAX Sätze, die wichtigsten zuerst, sonst in der Reihenfolge. Leert. */
export function coreFlush(c: SayCore): string {
  const out = c.q
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => RANK[a.prio] - RANK[b.prio] || a.i - b.i)
    .slice(0, SAY_MAX)
    .sort((a, b) => a.i - b.i)
    .map((x) => end(x.text));
  c.q = [];
  return out.join(' ');
}

/** Wasserstand setzen und alles Wartende verwerfen */
export function coreReset(c: SayCore, n: number): void {
  c.q = [];
  c.mark = n;
  c.batchN = 0;
  c.status = '';
  // Ohne bekannte Lognummer nimmt das nächste Zeichnen den Wasserstand
  c.armed = n === 0;
}

/**
 * Statuszeile: nur wenn sie sich geändert hat und mich betrifft. Wer auf andere wartet (tone calm), hört nichts, das
 * zeigt nur der Bildschirm. Gibt den einzureihenden Satz zurück oder ''.
 */
export function coreStatus(c: SayCore, s: Pick<Status, 'main' | 'sub' | 'tone'>): string {
  const text = plain(s.main);
  if (text === c.status) return '';
  c.status = text;
  return s.tone === 'calm' ? '' : text;
}

/* ---------- Hülle ---------- */

const CORE = newSayCore();
/** Kurz sammeln, damit ein Schub als ein Satzpaket kommt */
const FLUSH_MS = 120;
/** Die Statuszeile wechselt beim Zeichnen manchmal zweimal kurz hintereinander, nur der Stand danach zählt */
const STATUS_MS = 400;
let flushT: ReturnType<typeof setTimeout> | null = null;
let statusT: ReturnType<typeof setTimeout> | null = null;

/** Namen, die gerade niemand hören darf: der neue Shithead bis zur Enthüllung */
function hidden(): string[] {
  if (!App.zerHide) return [];
  const p = App.view?.players.find((x) => x.id === App.zerHide);
  return p?.name ? [p.name] : [];
}

/** Nach dem Aufwachen oder im verdeckten Tab wird nichts nachgesprochen */
const quiet = (): boolean => typeof document === 'undefined' || document.hidden || Date.now() < App.fxQuietUntil;

function flush(): void {
  flushT = null;
  const text = coreFlush(CORE);
  const el = document.getElementById('sr-say');
  if (!text || !el) return;
  // Erst leeren, dann schreiben: derselbe Satz wie zuletzt („Du bist dran.“) wird sonst nicht noch einmal gelesen
  el.textContent = '';
  setTimeout(() => (el.textContent = text), 30);
}

/** Satz in die Warteschlange. Dubletten im selben Schub fallen weg, höchstens drei Sätze pro Schub. */
export function say(text: string, prio: SayPrio = 'info'): void {
  if (quiet()) return;
  coreSay(CORE, text, prio, hidden());
  if (CORE.q.length) flushT ??= setTimeout(flush, FLUSH_MS);
}

/** Aus beginBatch in feedback.ts: Lognummer des neuen Schubs, gegen den Wasserstand geprüft */
export function sayBatch(n: number): void {
  coreBatch(CORE, n);
}

/** Aus paintStatus: nur bei geänderter Hauptzeile, entprellt, ohne Ticker. */
export function sayStatus(s: Status): void {
  coreDraw(CORE, App.seenN);
  if (statusT) clearTimeout(statusT);
  statusT = setTimeout(() => {
    statusT = null;
    const text = coreStatus(CORE, s);
    if (text) say(text, s.tone === 'turn' ? 'turn' : 'info');
  }, STATUS_MS);
}

/**
 * Nach Laden, welcome, Aufwachen und beim Verlassen des Tisches: Wasserstand setzen, nichts nachsprechen. Mit 0
 * nimmt das erste Zeichnen danach den Wasserstand selbst.
 */
export function resetSay(n: number): void {
  coreReset(CORE, n);
  if (flushT) clearTimeout(flushT);
  if (statusT) clearTimeout(statusT);
  flushT = statusT = null;
  const el = typeof document === 'undefined' ? null : document.getElementById('sr-say');
  if (el) el.textContent = '';
}
