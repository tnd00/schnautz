import taunts from './taunts.json' with { type: 'json' };

/** Freche Sprüche für Meldungen und Ergebnisfenster. Platzhalter: {name}, {n}. */
export const TAUNTS: { screen: Readonly<Record<string, readonly string[]>> } = { screen: taunts.screen };
