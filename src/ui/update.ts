/*
 * Neue Version: Die Seite fragt ab und zu nach, ob ein neuer Stand veröffentlicht wurde, und Host und Gäste
 * vergleichen ihre Version beim Beitreten. Dann erscheint oben ein Hinweis mit Knopf zum Neuladen.
 * Nach dem Neuladen geht es von selbst zurück an den Tisch.
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

/** Neu laden und danach an den Tisch zurück, als hätte man „Fortsetzen“ getippt. */
export function reloadApp(): void {
  if (App.role) SS.set('autoresume', App.role);
  location.reload();
}

/**
 * Nach dem Start: War das ein Neuladen wegen einer neuen Version, gleich weiter am Tisch. Zeigt der Link auf einen
 * anderen Tisch, lässt initStart (start.ts) die Einladung weg, damit der Knopf zum Fortsetzen da ist.
 */
export function autoResume(): void {
  const role = SS.get<string>('autoresume', '');
  if (!role) return;
  SS.del('autoresume');
  $opt<HTMLButtonElement>(`[data-act=${role === 'host' ? 'resumehost' : 'resumeguest'}]`)?.click();
}

/** Gast: Der Host meldet seine Version. Unterschied heißt, einer von beiden sollte neu laden. */
export function noteHostVersion(v: string | undefined): void {
  const c = cmpVersion(v, APP_VERSION);
  if (c < 0)
    showUpdate('Der Tisch läuft noch mit einer älteren Version. Bitte den Gastgeber, die Seite neu zu laden.', false);
  else if (c > 0) showUpdate('Neue Version verfügbar. Lade neu, dein Platz bleibt.', true);
}

/** Host: Ein Gast kommt mit anderer Version. */
export function noteGuestVersion(name: string, v: string | undefined): void {
  const c = cmpVersion(v, APP_VERSION);
  if (c < 0) toast(`${name} nutzt noch eine ältere Version. Bitte neu laden lassen.`, 6000);
  else if (c > 0) showUpdate(`${name} hat schon eine neuere Version. Lade neu, der Tisch läuft danach weiter.`, true);
}

async function check(): Promise<void> {
  if (!BUILD || shown || document.hidden) return;
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { build?: unknown };
    if (typeof j.build === 'string' && j.build !== BUILD) {
      dlog('net', `Neue Version auf dem Server: ${j.build}`);
      showUpdate(
        !App.role
          ? 'Neue Version verfügbar. Lade kurz neu.'
          : App.role === 'host'
            ? 'Neue Version verfügbar. Lade neu, der Tisch läuft danach weiter.'
            : 'Neue Version verfügbar. Lade neu, dein Platz bleibt.',
        true,
      );
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
