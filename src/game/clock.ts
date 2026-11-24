/* Zeitlimit: Wer hat gerade die Uhr? Die Uhr selbst läuft beim Host (src/net/clock.ts). */
import { dkWaiting } from './durak';
import { addLog, pIdx } from './state';
import type { State } from './types';

export interface ClockTurn {
  /** Menschen, die gerade dran sind (in der Tauschrunde alle, die noch nicht fertig sind) */
  ids: string[];
  /** Ändert sich mit jedem neuen Zug, dann beginnt die Uhr von vorn */
  key: string;
  swap: boolean;
}

/** Wer gerade dran ist und keine KI ist. KIs ziehen von selbst, für sie läuft keine Uhr. */
export function clockTurn(st: State): ClockTurn {
  const none: ClockTurn = { ids: [], key: '', swap: false };
  if (!st.rules.turnSecs) return none;
  const base = `${st.game}|${st.games}|${st.round}|${st.phase}`;
  // Tauschrunde bei Shithead und Ansehen bei Cabo: alle gleichzeitig, doppelte Zeit
  if (st.phase === 'swap' || st.phase === 'peek') {
    const ids = st.players.filter((p) => !p.bot && !p.out && !p.ready).map((p) => p.id);
    return ids.length ? { ids, key: base, swap: true } : none;
  }
  // Durak: Es können mehrere gleichzeitig dran sein, etwa alle, die noch fertig sagen müssen
  if (st.game === 'durak') {
    if (st.phase !== 'play' || !st.dk) return none;
    const ids = dkWaiting(st).filter((id) => {
      const p = st.players[pIdx(st, id)];
      return !!p && !p.bot;
    });
    return ids.length ? { ids, key: `${base}|${st.dk.bout}|${st.last?.n ?? 0}`, swap: false } : none;
  }
  const i = st.phase === 'choose' ? st.dealer : st.phase === 'play' ? st.turn : -1;
  const p = st.players[i];
  if (!p || p.bot || p.out || st.sh?.finished.includes(p.id)) return none;
  // Jeder Zug setzt `last` neu, auch wenn dieselbe Person nochmal dran ist (etwa nach einer 10)
  return { ids: [p.id], key: `${base}|${i}|${st.last?.n ?? 0}`, swap: false };
}

/** Im Verlauf festhalten, dass die Zeit abgelaufen ist und die KI gezogen hat. */
export function noteTimeout(st: State, pid: string): void {
  addLog(st, { k: 'timeout', p: pid });
}
