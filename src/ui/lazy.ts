/*
 * Selten gebrauchte große Fenster laden erst bei Bedarf nach, damit das Startpaket klein bleibt (tests/size.mjs):
 * die Regeln aller Spiele (render/rules.ts) und die Updates samt Changelog (render/updates.ts).
 *
 * Vorgeladen wird, sobald sich ein Öffner ankündigt (Zeiger drüber, Tipp, Fokus, Menü ⋯ auf) und sonst einmal im
 * Leerlauf nach dem Start. Ist das Stück schon da, öffnet das Fenster im selben Takt wie vorher, sonst einen Augenblick
 * später. Öffnet man in der Zwischenzeit ein anderes Fenster, tippt woanders hin oder drückt Escape, bleibt es zu.
 *
 * Ladefehler: Scheitert nur das stille Vorladen, passiert nichts (lazyQuiet, main.ts lädt dann nicht neu), der
 * nächste Versuch lädt neu. Scheitert es beim Öffnen, lädt main.ts die Seite einmal neu (meist ist eine neue Version
 * online), beim zweiten Mal binnen einer Minute kommen der Versionshinweis und ein Toast.
 */
import type { GameKind } from '../game/types';
import { $ } from './dom';
import { toast } from './feedback';

type RulesMod = typeof import('./render/rules');
type UpdatesMod = typeof import('./render/updates');

interface Part<M> {
  mod: M | null;
  wait: Promise<M> | null;
  /** Jemand will das Fenster öffnen und wartet auf das Stück (sonst lädt es nur still vor) */
  want: boolean;
  load: () => Promise<M>;
}

const part = <M>(load: () => Promise<M>): Part<M> => ({ mod: null, wait: null, want: false, load });

const RULES = part<RulesMod>(() => import('./render/rules'));
const UPDATES = part<UpdatesMod>(() => import('./render/updates'));

function fetchPart<M>(p: Part<M>): Promise<M> {
  p.wait ??= p
    .load()
    .then((m) => {
      // Hat main.ts den Ladefehler abgefangen (vite:preloadError), kommt statt des Stücks nichts an
      if (!m) throw new Error('Stück fehlt');
      return (p.mod = m);
    })
    .catch((e: unknown) => {
      // Beim nächsten Versuch neu laden, etwa nach einem Wackler im Netz
      p.wait = null;
      throw e;
    })
    .finally(() => {
      p.want = false;
    });
  return p.wait;
}

/**
 * Lädt gerade nur still vor, ohne dass jemand auf ein Fenster wartet? Dann soll ein Ladefehler die Seite nicht neu
 * laden und keinen Versionshinweis zeigen (vite:preloadError in main.ts).
 */
export function lazyQuiet(): boolean {
  const parts = [RULES, UPDATES];
  return parts.some((p) => p.wait && !p.mod) && !parts.some((p) => p.want);
}

/** Jeder Öffnungswunsch bekommt eine Nummer, nur der letzte zählt. */
let ask = 0;

/**
 * Baut das Fenster, sobald das Stück da ist. `before` läuft im selben Takt wie das Öffnen (etwa Menü ⋯ zu), damit
 * nichts zwischen zwei Bildern leer steht.
 */
function openWith<M>(p: Part<M>, html: (m: M) => string, before?: () => void): void {
  const n = ++ask;
  const show = (m: M) => {
    before?.();
    $('#modal').innerHTML = html(m);
  };
  if (p.mod) {
    show(p.mod);
    return;
  }
  const box = $('#modal');
  const was = box.innerHTML;
  p.want = true;
  fetchPart(p).then(
    (m) => {
      // Inzwischen etwas anderes geöffnet oder geschlossen: nicht darüber legen
      if (n !== ask || box.innerHTML !== was) return;
      show(m);
    },
    () => {
      if (n === ask) toast('Das Fenster ließ sich nicht laden, bitte noch einmal tippen.');
    },
  );
}

/** Regelfenster, ohne Spiel für das Spiel am Tisch (wie rulesHTML). */
export function openRules(game?: GameKind, before?: () => void): void {
  openWith(RULES, (m) => m.rulesHTML(game), before);
}

/** Updates mit allen Versionen, unten die Versionszeile fürs Dev-Menü. */
export function openUpdates(before?: () => void): void {
  openWith(UPDATES, (m) => m.updatesHTML(), before);
}

const quiet = () => undefined;
export const preloadRules = (): void => void fetchPart(RULES).catch(quiet);
export const preloadUpdates = (): void => void fetchPart(UPDATES).catch(quiet);

const RULES_SEL = '#btn-rules, [data-act="rulestab"], [data-act="menurules"]';
const UPDATES_SEL = '[data-act="updates"]';

function onIntent(e: Event): void {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  // Ein Tipp woanders hin verwirft ein Fenster, das noch lädt (der Öffner selbst zählt erst beim click)
  if (e.type === 'pointerdown' && !t.closest(`${RULES_SEL}, ${UPDATES_SEL}, #btn-menu`)) ask++;
  if (t.closest(RULES_SEL)) preloadRules();
  else if (t.closest(UPDATES_SEL)) preloadUpdates();
  else if (t.closest('#btn-menu')) {
    // Das Menü ⋯ führt zu beiden
    preloadRules();
    preloadUpdates();
  }
}

/** Einmal beim Start: Vorladen bei Absicht und einmal im Leerlauf. */
export function initLazy(): void {
  const opts = { capture: true, passive: true };
  for (const ev of ['pointerover', 'pointerdown', 'focusin']) document.addEventListener(ev, onIntent, opts);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') ask++;
    },
    opts,
  );
  const idle = () => {
    preloadRules();
    preloadUpdates();
  };
  const later = () =>
    'requestIdleCallback' in window ? window.requestIdleCallback(idle, { timeout: 5000 }) : setTimeout(idle, 3000);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}
