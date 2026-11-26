/* Texte zur neuen Version (src/ui/update.ts): Hinweis oben, Neuladen von selbst und Rückkehr an den Tisch. */

/** Wer liest: niemand am Tisch, Gastgeber oder Gast */
export type UpdWho = 'none' | 'host' | 'guest';

export const UPD = {
  /** Mit Knopf, ohne Neuladen von selbst (etwa wenn es gerade schon einmal neu geladen hat) */
  now: {
    none: 'Neue Version verfügbar. Lade kurz neu.',
    host: 'Neue Version verfügbar. Lade neu, der Tisch läuft danach weiter.',
    guest: 'Neue Version verfügbar. Lade neu, dein Platz bleibt.',
  } satisfies Record<UpdWho, string>,
  /** Die Seite lädt gleich von selbst neu, sobald es ruhig ist */
  soon: {
    none: 'Neue Version da. Die Seite lädt gleich von selbst neu.',
    host: 'Neue Version da. Die Seite lädt gleich von selbst neu, der Tisch läuft danach weiter.',
    guest: 'Neue Version da. Die Seite lädt gleich von selbst neu, dein Platz bleibt.',
  } satisfies Record<UpdWho, string>,
  /** Gastgeber: Ein Gast hat schon eine neuere Version, die Prüfung fand aber keinen neuen Build */
  guestNewer: (name: string): string =>
    `${name} hat schon eine neuere Version. Lade neu, der Tisch läuft danach weiter.`,
  back: 'Zurück an deinem Tisch.',
  /** Gast: Der Tisch hat noch eine ältere Version, der Gastgeber lädt gleich neu, der Gast versucht es weiter */
  hostReload: 'Der Gastgeber lädt gerade neu…',
  hostReloadSub: 'Sein Tisch hat noch eine ältere Version. Sobald er neu geladen hat, bist du von selbst wieder dabei.',
  reload: 'Neu laden',
  close: 'Schließen',
};
