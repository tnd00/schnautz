import { resetBots } from '../net/bots';
import { stopHostClocks } from '../net/host';
import { App } from './app';
import { resetAnnouncements } from './feedback';
import { resetLegend } from './render/legend';
import { resetLog } from './render/log';
import { resetSeq } from './shithead/sequence';
import { resetWin } from './shithead/window';
import { resetClockUI } from './clock';
import { CAR } from './carousel';
import { resetToss } from './toss';
import { resetBetUI } from './render/bets';
import { resetCeremony } from './ceremony';
import { resetCaboUI } from './cabo/input';

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
  resetClockUI();
  resetLegend();
  resetLog();
  stopHostClocks();
  resetBots();
  resetAnnouncements();
  resetToss();
  resetBetUI();
  resetCeremony();
  resetCaboUI();
  CAR.hold = 0;
  App.fxSync = true;
  App.aim = null;
  App.tossBlock = false;
}
