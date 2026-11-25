import type { LogEntry } from '../../game/types';
import { confetti } from '../animations';
import { App } from '../app';
import { esc } from '../dom';
import { type Announcement, emit, holdForAnnouncements, shakePanel } from '../feedback';
import { cueOf, type LevelCtx } from '../levels';
import { nameOf, roundBest, vb } from '../helpers';
import { sfx } from '../sound';
import { taunt } from '../taunts';

/** Schnautz: Klopfen, Schieben, Behalten, Tauschen, neue Mitte, Rundenergebnis und Partiesieg. */
export function schnautzEffect(c: LevelCtx, e: LogEntry): void {
  const { v } = c;
  const cue = cueOf(e, c);
  const RN = (id: string | null | undefined, fb?: string) => nameOf(v, id, fb);
  const N = (id: string | null | undefined, fb?: string) => esc(RN(id, fb));
  const mine = e.p === App.me;
  if (e.k === 'knock') {
    emit(cue, {
      pid: e.p,
      text: 'klopft',
      mine: 'klopfst',
      icon: '✊',
      tone: 'wood',
      title: mine ? 'Du klopfst!' : 'Klopf, klopf!',
      sub: mine ? 'Alle anderen haben noch einen Zug.' : N(e.p, e.name) + ' klopft. Alle anderen haben noch einen Zug.',
      sfx: 'knock',
    });
    if (!mine) shakePanel(e.p);
  }
  if ((e.k === 'swap' || e.k === 'swapAll') && !mine) sfx('card');
  if (e.k === 'swapAll') emit(cue, { pid: e.p, text: 'tauscht alle drei' });
  if (e.k === 'renew') emit(cue, { text: 'Neue Mitte' });
  if (e.k === 'pass') emit(cue, { pid: e.p, text: 'schiebt' });
  if (e.k === 'keep') emit(cue, { pid: e.p, text: 'behält' });
  if (e.k === 'take') emit(cue, { pid: e.p, text: 'nimmt blind' });
  if (e.k === 'result') {
    const best = roundBest(v);
    const c = e.changes?.[App.me];
    const ids = Object.keys(e.changes || {});
    const nmOf = (id: string) => (id === App.me ? 'Du' : N(id, e.names?.[id]));
    let lines = ids.map((id) => {
      const ch = e.changes[id],
        me2 = id === App.me;
      if (ch.to === 'out') return nmOf(id) + (me2 ? ' bist raus.' : ' ist raus.');
      if (ch.to === 'swim') return nmOf(id) + (me2 ? ' schwimmst jetzt.' : ' schwimmt jetzt.');
      return nmOf(id) + (me2 ? ' verlierst ' : ' verliert ') + (ch.n === 2 ? 'zwei Leben.' : 'ein Leben.');
    });
    let title: string;
    let icon: string;
    let tone: Announcement['tone'] = '';
    if (e.reason === 'schnautz') {
      title = 'Schnautz!';
      icon = '⭐';
      tone = 'gold';
      lines.unshift(N(e.by, e.by ? e.names?.[e.by] : undefined) + vb(e.by, ' hast', ' hat') + ' 31.');
    } else if (e.reason === 'feuer') {
      title = 'Feuer!';
      icon = '🔥';
      tone = 'red';
      lines = [
        N(e.by, e.by ? e.names?.[e.by] : undefined) +
          vb(e.by, ' hast', ' hat') +
          ' drei Asse. Alle anderen verlieren ein Leben.',
      ];
    } else {
      title = 'Aufgedeckt!';
      icon = '🃏';
    }
    if (!ids.length && e.reason !== 'quit') lines.push('Gleichstand. Niemand verliert ein Leben.');
    let tt = '';
    if (c) tt = taunt(c.to === 'out' ? 'scOutSelf' : c.to === 'swim' ? 'scSwimSelf' : 'scLoseSelf', null, e.n);
    else if (ids.length && e.reason !== 'quit') {
      const l0 = ids[0],
        c0 = e.changes[l0];
      tt = taunt(
        c0.to === 'out' ? 'scOutOther' : c0.to === 'swim' ? 'scSwimOther' : 'scLoseOther',
        { name: RN(l0, e.names?.[l0]) },
        e.n,
      );
    }

    if (c) {
      tone = c.to === 'swim' ? 'sea' : 'red';
      icon = c.to === 'out' ? '🫧' : c.to === 'swim' ? '🛟' : '💔';
    } else if (best.indexOf(App.me) >= 0 && ids.length && e.reason !== 'feuer') {
      tone = 'gold';
      icon = '👑';
      lines.push('Du hattest die beste Hand.');
    }
    emit(cue, { text: title, icon, tone, sub: lines.join(' '), taunt: tt, ms: 2300, hold: 400 });
    // Wer den Tisch verlässt, beendet die Runde ohne Meldung, das Ergebnis wartet trotzdem kurz
    if (e.reason === 'quit') holdForAnnouncements(400);
    setTimeout(() => {
      sfx(c ? 'lose' : 'win');
    }, 300);
  }
  if (e.k === 'winner' && e.p) {
    emit(cue, {
      pid: e.p,
      text: 'gewinnt die Partie!',
      mine: 'gewinnst die Partie!',
      icon: '🏆',
      tone: 'gold',
      taunt: mine ? taunt('gameWinSelf', null, e.n) : taunt('gameLoseSelf', { name: RN(e.p, e.name) }, e.n),
      ms: 2600,
      hold: 300,
    });
    if (mine) setTimeout(confetti, 600);
  }
}
