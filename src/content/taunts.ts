import taunts from './taunts.json' with { type: 'json' };

/** Freche Sprüche für Meldungen und Ergebnisfenster. Platzhalter sind {name}, {n} und {what} (Titel des Verlierers). */
export const TAUNTS: { screen: Readonly<Record<string, readonly string[]>> } = { screen: taunts.screen };
