/*
 * Look am Tisch (Plan 2.8 Abschnitt 8, legacy.md 8 und 9): Sticker oder Legacy-Design als `data-look` an `html`, das
 * Kartendeck (Vinyl, Vinyl dunkel oder Klassisch) getrennt davon als `data-deck`, in jedem Design gleich. Dazu das
 * Thema als `data-theme`, aber nur unter Sticker. Das Thema färbt kein Deck um, ein neues Deck braucht nur seinen Wert,
 * einen Texteintrag und eine CSS-Datei (Anleitung in table/cards-vinyl.css). Render-Code verzweigt nie nach Look oder
 * Deck, Ausnahmen stehen nur hier (Paletten, theme-color, Nachladen der Stücke).
 *
 * Sticker und alle Decks stehen im Haupt-CSS. Legacy (Tokens und Filz-Dekor, styles/looks/legacy.css) und das
 * dunkle Thema kommen per import() erst, wenn jemand sie wählt. Bis das Legacy-Stück da ist, hält die Wache in
 * base.css den Tisch unsichtbar (Klasse `look-ready`, spätestens nach 3 Sekunden), damit nichts aufblitzt.
 */
import { PREFS_DEFAULT, type Prefs } from '../net/protocol';
import { relayoutOpps } from './carousel';
import { dlog } from './devlog';
import { prefs, setPref } from './prefs';
import { render } from './render/index';

export type Look = Prefs['look'];
export type Deck = Prefs['deck'];
/** Wahl im Bogen „Design“: Sticker hell, Sticker dunkel oder Legacy */
export type Design = Look | 'dark';

/** Die Wahl im Bogen zu einem Stand der Vorlieben. Das Thema zählt nur unter Sticker. */
export const designOf = (p: Pick<Prefs, 'look' | 'theme'>): Design =>
  p.look === 'sticker' && p.theme === 'dark' ? 'dark' : p.look;

/** Sticker. Der Wert steht in PREFS_DEFAULT, damit asPrefs denselben nimmt. */
export const DEFAULT_LOOK: Look = PREFS_DEFAULT.look;
/** Vinyl, in jedem Design */
export const DEFAULT_DECK: Deck = PREFS_DEFAULT.deck;

/** Paletten für Konfetti und Zeremonien nach Namen */
export type PaletteName = 'gold' | 'brown' | 'jester' | 'party';

/** So lange wartet der Tisch höchstens auf das Legacy-Stück */
const LEGACY_WAIT_MS = 3000;

let legacy: Promise<boolean> | null = null;
let legacyOk = false;
/** Neueste Wahl im Bogen: Eine ältere, deren Stück erst später ankommt, gilt nicht mehr */
let pick = 0;

let darkBusy = false;

/** Lädt das Legacy- oder das dunkle Stück gerade? Dann lädt ein Fehler die Seite nicht neu (vite:preloadError in main.ts) */
export const lookLoading = (): boolean => (!!legacy && !legacyOk) || darkBusy;

/**
 * Dunkles Stück laden. Ein Fehler landet im Protokoll und ergibt false, der nächste Versuch lädt neu. Promise.all
 * steht mit Absicht dazwischen: Ein direkt an import() gehängtes then zieht Vite in die Ladefunktion, dann erreicht der
 * Ladefehler den Fehlerzweig nie.
 */
function loadDark(): Promise<boolean> {
  darkBusy = true;
  return Promise.all([import('../styles/looks/dark.css')])
    .then(
      () => true,
      (e: unknown) => {
        dlog('warn', `Dunkles Design nicht geladen: ${String(e)}`);
        return false;
      },
    )
    .finally(() => (darkBusy = false));
}

/**
 * Legacy-Stück höchstens einmal laden, samt kursiver Fraunces (höchstens 300 ms, sonst springen die Namen kurz in
 * Georgia). import() einer CSS-Datei ist erst erfüllt, wenn das Stylesheet geladen ist. Ein Fehler setzt zurück,
 * damit der nächste Versuch neu lädt, landet im Protokoll und ergibt false.
 */
function loadLegacy(): Promise<boolean> {
  legacy ??= Promise.all([
    import('../styles/looks/legacy.css'),
    Promise.race([document.fonts?.load('italic 700 16px "Fraunces Variable"'), new Promise((r) => setTimeout(r, 300))]),
  ]).then(
    () => (legacyOk = true),
    (e: unknown) => {
      legacy = null;
      dlog('warn', `Legacy-Design nicht geladen: ${String(e)}`);
      return false;
    },
  );
  return legacy;
}

/**
 * Früh in main.ts: setzt data-look, data-deck und data-theme (nur unter Sticker) und lädt Legacy oder das dunkle
 * Thema nach.
 */
export function applyLook(): void {
  const p = prefs();
  const h = document.documentElement;
  h.dataset.look = p.look;
  h.dataset.deck = p.deck;
  if (p.look === 'sticker') {
    h.dataset.theme = p.theme;
    // Fehlt das dunkle Stück, steht der Tisch in dieser Sitzung hell statt halb dunkel
    if (p.theme === 'dark') void loadDark().then((ok) => ok || (h.dataset.theme = 'light'));
  } else {
    delete h.dataset.theme;
    const ready = (): void => h.classList.add('look-ready');
    setTimeout(ready, LEGACY_WAIT_MS);
    // Fehlt das Stück, steht der Tisch in dieser Sitzung in Sticker statt ohne Farben
    void loadLegacy().then((ok) => {
      if (!ok) Object.assign(h.dataset, { look: 'sticker', theme: 'light' });
      ready();
    });
  }
}

/** Nach einer Wahl: anwenden, Browserleiste umfärben und den Tisch neu zeichnen (das Karussell misst neu aus). */
function redraw(): void {
  applyLook();
  const game = document.body.classList.contains('ingame') ? 'game' : 'start';
  const p = prefs();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColorOf(p.look, game, p.theme === 'dark'));
  render();
  if (document.getElementById('opps')) relayoutOpps();
}

/**
 * Speichert die Wahl aus dem Bogen. Legacy gilt und wird gespeichert, erst wenn sein Stück da ist, so springt der Tisch
 * nur einmal. Lädt es nicht, bleibt alles beim Alten und das Ergebnis ist false (der Bogen meldet es). Sticker dunkel
 * ebenso mit seinem Stück. Sticker und Sticker dunkel setzen auch das Thema.
 */
export async function setLook(d: Design): Promise<boolean> {
  const n = ++pick;
  const ok = d === 'legacy' ? await loadLegacy() : d === 'dark' ? await loadDark() : true;
  if (ok && n === pick) {
    setPref('look', d === 'legacy' ? 'legacy' : 'sticker');
    if (d !== 'legacy') setPref('theme', d === 'dark' ? 'dark' : 'light');
    redraw();
  }
  return ok;
}

/** Speichert das Kartendeck und wendet es an. Karten haben in beiden Decks dieselben Maße. */
export function setDeck(d: Deck): void {
  setPref('deck', d);
  applyLook();
}

/** Bogen „Design“ (Menü ⋯) in #modal, lädt beim ersten Öffnen nach wie „Bedienung“. */
export function openDesign(): void {
  void import('./render/design').then((m) => m.renderDesign());
}

/*
 * Legacy: Messing, Creme und Filz wie bis 2.7. Sticker: Spielfarben, Tinte, Weiß und Periwinkle, ohne Sonnengelb
 * (gehört dem Logo), Limette nur für die Krone bei Cabo. Braun ist der Haufen und bleibt in beiden Looks.
 */
const PALETTES: Record<Look, Record<PaletteName, readonly string[]>> = {
  legacy: {
    gold: ['#f3cd7d', '#e8b64c', '#fff1c7', '#c9962e', '#f6efdf'],
    brown: ['#9c6b3a', '#b07a42', '#c08a50', '#d9a96b', '#e8c9a0'],
    jester: ['#e0362b', '#f3cd7d', '#2e8b57', '#4a6fd1', '#f6efdf', '#b3312a'],
    party: ['#f3cd7d', '#d6a24a', '#f6efdf', '#b3312a', '#8fd3e8', '#7fe3a3'],
  },
  sticker: {
    gold: ['#c8f25c', '#ffffff', '#1a1830', '#8f8cf7', '#e4f9a8'],
    brown: ['#9c6b3a', '#b07a42', '#c08a50', '#d9a96b', '#e8c9a0'],
    jester: ['#5ee6c2', '#ff7eb6', '#ff9a3c', '#8f8cf7', '#ffffff', '#1a1830'],
    party: ['#ff9a3c', '#ff7eb6', '#5ee6c2', '#8f8cf7', '#ffffff', '#1a1830'],
  },
};

/** Farben einer Palette im Moment des Auslösens */
export function paletteOf(l: Look, name: PaletteName): readonly string[] {
  return PALETTES[l][name];
}

/** Extra-Funken für den ersten Titel: Legacy und die Cabo-Krone in der ersten Goldfarbe, sonst Weiß (Limette nur bei Cabo) */
export function sparkOf(l: Look, crown: boolean): string {
  return l === 'legacy' || crown ? PALETTES[l].gold[0] : '#ffffff';
}

/** Farbe der Browserleiste je Bildschirm: am Tisch Filz (Legacy) oder Nachtblau (Sticker dunkel), sonst Periwinkle */
export function themeColorOf(l: Look, screen: string, dark = false): string {
  if (screen !== 'game') return '#6f6cf0';
  return l === 'legacy' ? '#123326' : dark ? '#1b194e' : '#6f6cf0';
}
