/*
 * Neue Version: Die Seite fragt ab und zu nach, ob ein neuer Stand veröffentlicht wurde, und Gastgeber und Gäste
 * vergleichen ihre Version beim Beitreten. Dann erscheint oben ein Hinweis mit Knopf zum Neuladen.
 * Nach dem Neuladen geht es von selbst zurück an den Tisch, ebenso nach jedem anderen Neuladen am Tisch.
 */
import { APP_VERSION, cmpVersion } from '../content/version';
import { App } from './app';
import { $opt, esc } from './dom';
import { toast } from './feedback';
import { SS } from './storage';
import { dlog } from './devlog';

/** Kennung dieses Builds, setzt vite.config.ts. Beim Entwickeln gibt es keine. */
declare const __BUILD_ID__: string | undefined;
export const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';

const CHECK_MS = 5 * 60_000;
let shown = false;

/** Hinweis oben. `reload`: mit Knopf, der die Seite neu lädt und danach an den Tisch zurückkehrt. */
export function showUpdate(text: string, reload: boolean): void {
  let bar = $opt('#updbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'updbar';
    bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML =
    `<span>${esc(text)}</span>` +
    (reload ? '<button type="button" class="btn primary small" data-act="reloadapp">Neu laden</button>' : '') +
    '<button type="button" class="x" data-act="closeupd" aria-label="Schließen">×</button>';
  shown = true;
  watch(bar);
}

/*
 * Der Hinweis liegt unter der Kopfzeile, damit Regeln, Menü und Tischcode frei bleiben. Toasts und die
 * Verbindungswarnung rutschen so lange darunter (--st-updend). Die Kopfzeile ändert ihre Höhe je nach Bildschirm.
 */
let ro: ResizeObserver | null = null;

function place(): void {
  const root = document.documentElement.style;
  const bar = $opt('#updbar');
  const head = $opt('.top')?.getBoundingClientRect();
  if (!bar) {
    root.removeProperty('--st-updtop');
    root.removeProperty('--st-updend');
    return;
  }
  if (head && head.height) root.setProperty('--st-updtop', `${Math.round(head.bottom + 8)}px`);
  else root.removeProperty('--st-updtop');
  root.setProperty('--st-updend', `${Math.round(bar.getBoundingClientRect().bottom + 8)}px`);
}

function watch(bar: HTMLElement): void {
  if (!ro && typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(place);
    const head = $opt('.top');
    if (head) ro.observe(head);
    ro.observe(bar);
  }
  place();
}

export function closeUpdate(): void {
  $opt('#updbar')?.remove();
  ro?.disconnect();
  ro = null;
  place();
}

/**
 * Merker in sessionStorage: Dieser Tab saß am Tisch, nach dem Neuladen geht es ohne Tippen dorthin zurück.
 * `update`: Neuladen wegen einer neuen Version, `hide`: jedes andere Neuladen oder ein vom System verworfener Tab.
 * sessionStorage gehört genau diesem Tab, ein neuer Tab zeigt deshalb weiter die Karte zum Fortsetzen.
 */
export interface BackMark {
  role: 'host' | 'guest';
  code: string;
  name: string;
  why: 'update' | 'hide';
}

const MARK = 'autoresume';
/** Gerade läuft reloadApp: Der Merker steht schon und bleibt */
let reloading = false;

/** Merker lesen. Ein Tab mit 2.6 hat nur die Rolle als Text geschrieben, das zählt wie ein Update. */
export function peekBackMark(): BackMark | null {
  const m = SS.get<unknown>(MARK, null);
  if (m === 'host' || m === 'guest') return { role: m, code: '', name: '', why: 'update' };
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.role !== 'host' && o.role !== 'guest') return null;
  return {
    role: o.role,
    code: typeof o.code === 'string' ? o.code : '',
    name: typeof o.name === 'string' ? o.name : '',
    why: o.why === 'hide' ? 'hide' : 'update',
  };
}

/** Merker lesen und löschen, einmal beim Start (main.ts). */
export function takeBackMark(): BackMark | null {
  const m = peekBackMark();
  SS.del(MARK);
  return m;
}

/** Merker löschen, etwa wenn der Tab den Tisch im Hintergrund verloren hat (verdrängt oder aufgelöst). */
export function clearBackMark(): void {
  if (!reloading) SS.del(MARK);
}

/** Merker setzen, solange dieser Tab am Tisch sitzt, sonst löschen. Während „Verbinde…“ zählt das nicht. */
function noteBackMark(): void {
  if (reloading) return;
  if (App.role && App.view && App.code) {
    const m: BackMark = { role: App.role, code: App.code, name: App.name, why: 'hide' };
    SS.set(MARK, m);
  } else SS.del(MARK);
}

/** Einmal beim Start: Merker beim Verlassen der Seite und beim Verstecken setzen, beim Zurückkommen löschen. */
export function initBackMark(): void {
  window.addEventListener('pagehide', noteBackMark);
  document.addEventListener('visibilitychange', () => {
    // Android und iOS verwerfen Tabs im Hintergrund oft ohne pagehide, sessionStorage überlebt das
    if (document.hidden) noteBackMark();
    else if (!reloading) SS.del(MARK);
  });
  // Zurück aus dem Seitencache: kein Neuladen, der Merker würde sonst später zur falschen Zeit greifen
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !reloading) SS.del(MARK);
  });
}

/** Neu laden und danach an den Tisch zurück, als hätte man „Fortsetzen“ getippt. */
export function reloadApp(): void {
  if (App.role) {
    const m: BackMark = { role: App.role, code: App.code, name: App.name, why: 'update' };
    SS.set(MARK, m);
  }
  reloading = true;
  location.reload();
}

/** Nach einer Rückkehr ohne Tippen kommt am Tisch einmal kurz „Zurück an deinem Tisch.“ */
let backHint = false;

export function armBackHint(on = true): void {
  backHint = on;
}

/** Gastgeber: Peer offen. Gast: `welcome` (über noteHostVersion). Der Hinweis kommt nur nach armBackHint. */
export function showBackHint(): void {
  if (!backHint) return;
  backHint = false;
  toast('Zurück an deinem Tisch.', 2500);
}

/** Gast: Der Gastgeber meldet seine Version. Unterschied heißt, einer von beiden sollte neu laden. */
export function noteHostVersion(v: string | undefined): void {
  // Kommt mit welcome, der Gast sitzt also wieder am Tisch
  showBackHint();
  const c = cmpVersion(v, APP_VERSION);
  if (c < 0)
    showUpdate('Der Tisch läuft noch mit einer älteren Version. Bitte den Gastgeber, die Seite neu zu laden.', false);
  else if (c > 0) showUpdate('Neue Version verfügbar. Lade neu, dein Platz bleibt.', true);
}

/** Gastgeber: Ein Gast kommt mit anderer Version. */
export function noteGuestVersion(name: string, v: string | undefined): void {
  const c = cmpVersion(v, APP_VERSION);
  if (c < 0) toast(`${name} nutzt noch eine ältere Version. Bitte neu laden lassen.`, 6000);
  else if (c > 0) showUpdate(`${name} hat schon eine neuere Version. Lade neu, der Tisch läuft danach weiter.`, true);
}

/** Hinweis auf eine neue Version, passend dazu, ob und wie dieser Tab am Tisch sitzt. */
export function updateText(): string {
  return !App.role
    ? 'Neue Version verfügbar. Lade kurz neu.'
    : App.role === 'host'
      ? 'Neue Version verfügbar. Lade neu, der Tisch läuft danach weiter.'
      : 'Neue Version verfügbar. Lade neu, dein Platz bleibt.';
}

async function check(): Promise<void> {
  if (!BUILD || shown || document.hidden) return;
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { build?: unknown };
    if (typeof j.build === 'string' && j.build !== BUILD) {
      dlog('net', `Neue Version auf dem Server: ${j.build}`);
      showUpdate(updateText(), true);
    }
  } catch {
    /* offline oder beim Entwickeln: kein Hinweis */
  }
}

export function initUpdateCheck(): void {
  setInterval(() => void check(), CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
}
