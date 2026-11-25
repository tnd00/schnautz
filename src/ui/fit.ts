/*
 * Am PC passt der Tisch ohne Scrollen ins Fenster: Ist er zu hoch, wird er gleichmäßig verkleinert.
 * Das geht über transform statt zoom, weil alle Browser und Testwerkzeuge Positionen damit gleich berechnen.
 * Ist Platz übrig, füllt er die Höhe und der Rest verteilt sich über und unter der Tischmitte (table.css).
 * Am Handy regelt das fit.css mit der Einheit --u.
 */
import { $opt, isMobile } from './dom';

/** Kleiner wird es nie, sonst werden Karten unlesbar. Dann scrollt die Seite lieber ein Stück. */
const MIN_SCALE = 0.6;

function reset(t: HTMLElement): void {
  ['transform', 'transform-origin', 'margin-bottom', 'min-height'].forEach((k) => t.style.removeProperty(k));
}

/** Höhen der Teile am Tisch (Punkteleiste, Gegner, Mitte, Status, eigener Platz) beim letzten Einpassen. */
let fitted = '';
const partHeights = (t: HTMLElement): string =>
  Array.from(t.children, (c) => (c instanceof HTMLElement ? c.offsetHeight : 0)).join(',');

let watching = false;

/**
 * Zeichnet ein Weg nur einen Teil des Tisches neu (etwa die Auswahl bei Schnautz), läuft kein render und damit
 * kein fitDesktop. Deshalb beobachtet der Tisch seine Teile und passt neu ein, sobald sich eine Höhe ändert.
 * Beobachtet werden die Kinder, nicht #table selbst: fitDesktop setzt Höhe und transform an #table, das gäbe eine
 * Schleife. Die Kinder ändern dabei ihre Größe nicht (transform zählt nicht, der Rest geht in margin-top: auto).
 */
function watch(t: HTMLElement): void {
  if (watching || typeof ResizeObserver === 'undefined') return;
  watching = true;
  const ro = new ResizeObserver(() => {
    if (isMobile() || !document.body.classList.contains('ingame')) return;
    if (partHeights(t) !== fitted) fitDesktop();
  });
  for (const c of Array.from(t.children)) ro.observe(c);
}

export function fitDesktop(): void {
  const t = $opt('#table');
  if (!t) return;
  watch(t);
  if (isMobile() || !document.body.classList.contains('ingame')) {
    reset(t);
    fitted = '';
    return;
  }
  const bar = $opt('.top');
  if (bar) document.documentElement.style.setProperty('--toph', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  // Erst die natürliche Höhe messen, dann einpassen. Beides im selben Frame, es flackert nichts
  reset(t);
  t.style.minHeight = '0';
  const top = t.getBoundingClientRect().top + window.scrollY;
  // Ein paar Pixel Luft gegen Rundung beim Verkleinern
  const avail = Math.max(200, window.innerHeight - top - 4);
  const natural = t.offsetHeight;
  const z = Math.max(MIN_SCALE, Math.min(1, avail / natural));
  const h = Math.floor(avail / z);
  t.style.minHeight = `${h}px`;
  if (z < 0.999) {
    t.style.transformOrigin = 'top center';
    t.style.transform = `scale(${z.toFixed(3)})`;
    // transform ändert das Layout nicht, also den gesparten Platz unten zurückgeben
    t.style.marginBottom = `${-Math.ceil(h * (1 - z))}px`;
  }
  fitted = partHeights(t);
}
