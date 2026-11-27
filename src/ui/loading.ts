/*
 * Ladebildschirm #boot (Markup und Stil inline in index.html, damit er vor dem Haupt-CSS steht). Er steht ab dem
 * ersten Byte und geht, sobald die Startseite fertig ist. Auf dem Weg zurück an den Tisch kommt er nach BOOT_DELAY_MS
 * wieder, nach BOOT_CAP_MS gibt er den Wartebildschirm mit Abbrechen und Hinweisen frei. Beim Legacy-Stück am Tisch
 * blendet ihn allein das CSS in index.html ein.
 */
const BOOT_DELAY_MS = 300;
const BOOT_CAP_MS = 5000;
const FONT_WAIT_MS = 1500;

let first = true;
let timer = 0;
const boot = (): HTMLElement | null => document.getElementById('boot');

function set(on: boolean): void {
  boot()?.classList.toggle('off', !on);
  boot()?.setAttribute('aria-hidden', String(!on));
}

/** Aus showScreen: Lobby, Tisch und Startseite nehmen ihn weg, nur die Rückkehr an den Tisch zeigt ihn. */
export function bootFor(screen: string, resuming: boolean): void {
  clearTimeout(timer);
  if (screen === 'wait' && resuming) {
    // Steht er noch vom Neuladen, bleibt er, sonst kommt er erst nach BOOT_DELAY_MS
    const wait = boot()?.classList.contains('off') ? BOOT_DELAY_MS : 0;
    timer = window.setTimeout(() => {
      set(true);
      timer = window.setTimeout(set, BOOT_CAP_MS, false);
    }, wait);
    // Beim ersten Laden entscheidet bootStart, die Startseite darunter ist da noch nicht fertig
  } else if (!(first && screen === 'start')) set(false);
}

/** Ende von main.ts (nach einer Rückkehr erst, wenn sie losgelaufen ist): Steht die Startseite, nach den Schriften weg. */
export function bootStart(): void {
  first = false;
  requestAnimationFrame(() => {
    void Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, FONT_WAIT_MS))]).then(
      () => document.getElementById('scr-start')?.hidden === false && set(false),
    );
  });
}
