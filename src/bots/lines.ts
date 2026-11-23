import content from '../content/botlines.json' with { type: 'json' };
import taunts from '../content/taunts.json' with { type: 'json' };

export type BotLineCategory = keyof typeof content.lines | keyof typeof taunts.bot;

/** Chat-Sprüche der KI, nach Anlass sortiert. */
export const BOT_LINES: Readonly<Record<string, readonly string[]>> = { ...content.lines, ...taunts.bot };
