import { resetBots } from '../net/bots';
import { resetHostTimers } from '../net/host';
import { App } from './app';
import { resetAnnouncements } from './feedback';
import { resetLegend } from './render/legend';
import { resetLog } from './render/log';
import { resetSeq } from './shithead/sequence';
import { resetWin } from './shithead/window';

/** Alles zurücksetzen, was zu einem Tisch gehört (Verlassen, neuer Tisch, Fortsetzen). */
export function resetTableUI(): void {
  App.flownN = 0;
  App.holdUntil = 0;
  App.unread = 0;
  App.peek = false;
  App.lastSig = null;
  App.playRects = null;
  resetSeq();
  resetWin();
  resetLegend();
  resetLog();
  resetHostTimers();
  resetBots();
  resetAnnouncements();
}
