/*
 * Neue Version: Die Seite fragt ab und zu nach, ob ein neuer Stand veröffentlicht wurde, und Gastgeber und Gäste
 * vergleichen ihre Version beim Beitreten. Dann kündigt oben ein Hinweis mit Ton das Neuladen an, die Seite lädt
 * von selbst neu, sobald es ruhig ist (Neulade-Pflicht, Plan 2.8). Danach geht es ohne Tippen zurück an den Tisch,
 * ebenso nach jedem anderen Neuladen am Tisch.
 */
import { APP_VERSION, cmpVersion } from '../content/version';
import { UPD, type UpdWho } from '../content/texts/update';
import { App } from './app';
import { $opt, esc } from './dom';
import { toast } from './feedback';
import { sfx } from './sound';
import { SS } from './storage';
import { dlog } from './devlog';
import { tableBusy } from './table/index';
import { dkWaiting } from '../game/durak';
import type { View } from '../game/types';

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
    (reload ? `<button type="button" class="btn primary small" data-act="reloadapp">${UPD.reload}</button>` : '') +
    `<button type="button" class="x" data-act="closeupd" aria-label="${UPD.close}">×</button>`;
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
/** Rückweg für einen Gast, den der Gastgeber wegen alter Version abgewiesen hat (er sitzt nicht mehr am Tisch) */
let backAfter: BackMark | null = null;

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
  const m: BackMark | null = App.role ? { role: App.role, code: App.code, name: App.name, why: 'update' } : backAfter;
  if (m) SS.set(MARK, m);
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
  toast(UPD.back, 2500);
}

/** Ziel beim Neuladen wegen einer Version statt eines Builds: irgendetwas Neueres als diese Seite */
export const newerThanMe = (): string => `>${APP_VERSION}`;

/** Gast: Der Gastgeber meldet seine Version. Einen älteren Gastgeber fängt guest.ts schon vorher ab. */
export function noteHostVersion(v: string | undefined): void {
  // Kommt mit welcome, der Gast sitzt also wieder am Tisch
  showBackHint();
  if (cmpVersion(v, APP_VERSION) > 0) reloadSoon(newerThanMe());
}

/** Gastgeber: Ein Gast kommt mit neuerer Version, also sofort nachsehen und neu laden. */
export function noteGuestVersion(name: string, v: string | undefined): void {
  if (cmpVersion(v, APP_VERSION) <= 0) return;
  void check(true).then((found) => {
    if (!found) showUpdate(UPD.guestNewer(name), true);
  });
}

const who = (): UpdWho => App.role ?? (backAfter ? 'guest' : 'none');

/** Hinweis auf eine neue Version, passend dazu, ob und wie dieser Tab am Tisch sitzt. */
export function updateText(): string {
  return UPD.now[who()];
}

/** Erst lesen lassen, dann auf Ruhe warten. Fenster und Abläufe warten höchstens bis zur Frist, der eigene Zug immer. */
const SOON_MIN_MS = 2500;
const SOON_MAX_MS = 15_000;
/** Ziel des letzten Neuladens von selbst. Für dasselbe Ziel nie noch einmal, sonst ginge es mit altem Zwischenspeicher im Kreis */
const TARGET = 'updTo';
let soon: ReturnType<typeof setInterval> | null = null;

/** Bin ich gerade dran oder läuft meine Uhr? Auch in der Tauschrunde und beim Ansehen, solange ich nicht fertig bin. */
function myTurn(v: View): boolean {
  const me = v.players.find((p) => p.id === App.me);
  if (!me || me.out) return false;
  if (v.clock?.ids.includes(App.me)) return true;
  if (v.phase === 'swap' || v.phase === 'peek') return !me.ready;
  if (v.game === 'durak') return dkWaiting(v).includes(App.me);
  if (v.phase === 'choose') return v.players[v.dealer]?.id === App.me;
  return v.phase === 'play' && v.players[v.turn]?.id === App.me;
}

/** Ablauf am Tisch oder offenes Fenster: Darauf wartet das Neuladen nur bis zur Frist. */
const busy = (): boolean => tableBusy() || !!$opt('#modal')?.firstElementChild;

/**
 * Neuer Stand erkannt: mit Text und Ton ankündigen und neu laden, sobald es ruhig ist. `target`: Ziel-Build oder
 * `>Version`. `back`: Gast, den der Gastgeber wegen alter Version abgewiesen hat, danach geht es an diesen Tisch zurück.
 */
export function reloadSoon(target: string, back?: { code: string; name: string }): void {
  if (back) backAfter = { role: 'guest', code: back.code, name: back.name, why: 'update' };
  if (soon) return;
  if (SS.get<string>(TARGET, '') === target) {
    // Schon einmal dafür neu geladen und doch nicht angekommen: nur der Hinweis mit Knopf
    dlog('net', `Neuladen für ${target} brachte keinen neuen Stand, nur Hinweis`);
    showUpdate(updateText(), true);
    return;
  }
  dlog('net', 'Neue Version, lade neu, sobald es ruhig ist');
  showUpdate(UPD.soon[who()], true);
  sfx('msg');
  const t0 = Date.now();
  soon = setInterval(() => {
    const dt = Date.now() - t0;
    if (dt < SOON_MIN_MS || (App.view && myTurn(App.view)) || (dt < SOON_MAX_MS && busy())) return;
    if (soon) clearInterval(soon);
    SS.set(TARGET, target);
    reloadApp();
  }, 500);
}

/** Fragt den Server nach dem aktuellen Build. `force`: auch wenn schon ein Hinweis steht oder der Tab versteckt ist. */
async function check(force = false): Promise<boolean> {
  if (!BUILD || (!force && (shown || document.hidden))) return false;
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const j = (await r.json()) as { build?: unknown };
    if (typeof j.build === 'string' && j.build !== BUILD) {
      dlog('net', `Neue Version auf dem Server: ${j.build}`);
      reloadSoon(j.build);
      return true;
    }
  } catch {
    /* offline oder beim Entwickeln: kein Hinweis */
  }
  return false;
}

export function initUpdateCheck(): void {
  setInterval(() => void check(), CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
}
