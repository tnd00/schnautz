import content from '../content/botlines.json' with { type: 'json' };
import { TAUNT_BOT } from '../content/taunts';

export type BotLineCategory = keyof typeof content.lines | keyof typeof TAUNT_BOT;

/** Chat-Sprüche der KI, nach Anlass sortiert. */
export const BOT_LINES: Readonly<Record<string, readonly string[]>> = { ...content.lines, ...TAUNT_BOT };
