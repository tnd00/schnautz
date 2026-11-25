import type { LogEntry, View } from '../../game/types';
import { confetti } from '../animations';
import { App } from '../app';
import { esc } from '../dom';
import { type Announcement, announce, centerLabel, floatLabel, holdForAnnouncements, shakePanel } from '../feedback';
import { nameOf, roundBest, vb } from '../helpers';
import { sfx } from '../sound';
import { taunt } from '../taunts';

/** Schnautz: Klopfen, Schieben, Behalten, Tauschen, neue Mitte, Rundenergebnis und Partiesieg. */
export function schnautzEffect(v: View, e: LogEntry): void {
  const RN = (id: string | null | undefined, fb?: string) => nameOf(v, id, fb);
  const N = (id: string | null | undefined, fb?: string) => esc(RN(id, fb));
  const mine = e.p === App.me;
  if (e.k === 'knock') {
    sfx('knock');
    announce({
      icon: '✊',
      tone: 'wood',
      title: mine ? 'Du klopfst!' : 'Klopf, klopf!',
      sub: mine ? 'Alle anderen haben noch einen Zug.' : N(e.p, e.name) + ' klopft. Alle anderen haben noch einen Zug.',
    });
    if (!mine) shakePanel(e.p);
  }
  if ((e.k === 'swap' || e.k === 'swapAll') && !mine) sfx('card');
  if (e.k === 'swapAll' && !mine)
    setTimeout(() => {
      floatLabel(e.p, 'tauscht alle drei');
    }, 60);
  if (e.k === 'renew')
    setTimeout(() => {
      centerLabel('Neue Mitte');
    }, 60);
  if (e.k === 'pass' && !mine) floatLabel(e.p, 'schiebt');
  if (e.k === 'keep' && !mine) floatLabel(e.p, 'behält');
  if (e.k === 'take' && !mine) floatLabel(e.p, 'nimmt blind');
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
    if (tt) lines.push('<span class="tt">' + esc(tt) + '</span>');
    if (c) {
      tone = c.to === 'swim' ? 'sea' : 'red';
      icon = c.to === 'out' ? '🫧' : c.to === 'swim' ? '🛟' : '💔';
    } else if (best.indexOf(App.me) >= 0 && ids.length && e.reason !== 'feuer') {
      tone = 'gold';
      icon = '👑';
      lines.push('Du hattest die beste Hand.');
    }
    if (e.reason !== 'quit') announce({ icon, tone, title, sub: lines.join(' '), ms: 2300 });
    holdForAnnouncements(400);
    setTimeout(() => {
      sfx(c ? 'lose' : 'win');
    }, 300);
  }
  if (e.k === 'winner' && e.p) {
    announce({
      icon: '🏆',
      tone: 'gold',
      title: mine ? 'Du gewinnst die Partie!' : N(e.p, e.name) + ' gewinnt die Partie!',
      sub:
        '<span class="tt">' +
        esc(mine ? taunt('gameWinSelf', null, e.n) : taunt('gameLoseSelf', { name: RN(e.p, e.name) }, e.n)) +
        '</span>',
      ms: 2600,
    });
    holdForAnnouncements(300);
    if (mine) setTimeout(confetti, 600);
  }
}
