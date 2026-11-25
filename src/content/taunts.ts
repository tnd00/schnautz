import common from './taunts/common.json' with { type: 'json' };
import shithead from './taunts/shithead.json' with { type: 'json' };
import durak from './taunts/durak.json' with { type: 'json' };
import cabo from './taunts/cabo.json' with { type: 'json' };
import schnautz from './taunts/schnautz.json' with { type: 'json' };

/*
 * Spruchtöpfe, eine Datei je Besitzer: gemeinsame Töpfe in common.json, alles andere beim jeweiligen Spiel.
 * `screen` erscheint in Meldungen und Ergebnisfenstern, `bot` schreibt die KI in den Chat.
 */

/** Alle Töpfe für Meldungen und Ergebnisfenster, zusammengeführt aus src/content/taunts/*.json */
export const TAUNT_SCREEN = {
  ...common.screen,
  ...shithead.screen,
  ...durak.screen,
  ...cabo.screen,
  ...schnautz.screen,
};

/** Chat-Sprüche der KI zu Ereignissen am Tisch */
export const TAUNT_BOT = {
  ...common.bot,
  ...shithead.bot,
  ...durak.bot,
  ...cabo.bot,
  ...schnautz.bot,
};

/** Freche Sprüche für Meldungen und Ergebnisfenster. Platzhalter sind {name}, {n} und {what} (Titel des Verlierers). */
export const TAUNTS: {
  screen: Readonly<Record<string, readonly string[]>>;
  bot: Readonly<Record<string, readonly string[]>>;
} = { screen: TAUNT_SCREEN, bot: TAUNT_BOT };
