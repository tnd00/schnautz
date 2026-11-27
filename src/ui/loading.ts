/*
 * Ladebildschirm #boot (Markup und Stil inline in index.html, damit er vor dem Haupt-CSS steht). Er steht ab dem
 * ersten Byte und geht, sobald die Startseite fertig ist. Führt das Laden zurück an den Tisch, bleibt er stehen, nach
 * BOOT_CAP_MS gibt er den Wartebildschirm mit Abbrechen und Hinweisen frei. Beim Legacy-Stück am Tisch
 * blendet ihn allein das CSS in index.html ein.
 */
const BOOT_CAP_MS = 5000;
const FONT_WAIT_MS = 1500;

let first = true;
let timer = 0;
const boot = (): HTMLElement | null => document.getElementById('boot');

function set(on: boolean): void {
  boot()?.classList.toggle('off', !on);
  boot()?.setAttribute('aria-hidden', String(!on));
}

/**
 * Aus showScreen: Lobby, Tisch und Startseite nehmen ihn weg. Nur die Rückkehr direkt nach dem Laden der Seite behält
 * ihn über dem Warten. Reißt die Verbindung mitten in der Sitzung ab, kommt er nicht (User 27.11.2026), dort reichen
 * Netzleiste und Wartebildschirm, ein Ladebildschirm lenkt nur ab.
 */
export function bootFor(screen: string, resuming: boolean): void {
  clearTimeout(timer);
  if (screen === 'wait' && resuming && !boot()?.classList.contains('off'))
    timer = window.setTimeout(set, BOOT_CAP_MS, false);
  // Beim ersten Laden entscheidet bootStart, die Startseite darunter ist da noch nicht fertig
  else if (!(first && screen === 'start')) set(false);
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
