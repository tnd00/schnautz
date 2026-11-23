import type { View } from '../game/types';
import { confetti, emojiFly, rain } from './animations';
import { App } from './app';
import { esc, num } from './dom';
import {
  type Announcement,
  announce,
  centerLabel,
  chatBubble,
  floatLabel,
  holdForAnnouncements,
  shakePanel,
} from './feedback';
import { myTurn, nameOf, roundBest, turnId, vb } from './helpers';
import { updateTitle } from './screens';
import { burnAnn } from './shithead/sequence';
import { sfx } from './sound';
import { taunt } from './taunts';

/**
 * Reagiert auf neue Log-Einträge: Töne, große Meldungen, Sprechblasen, Emojis.
 * `seqd` heißt: Die Shithead-Sequenz hat Karten, Verbrennen und Aufnehmen schon gezeigt.
 */
export function effects(prev: View, v: View, seqd = false): void {
  const fresh = v.log.filter((e) => e.n > App.seenN);
  const RN = (id: string | null | undefined, fb?: string) => nameOf(v, id, fb);
  const N = (id: string | null | undefined, fb?: string) => esc(RN(id, fb));
  fresh.forEach((e) => {
    const mine = e.p === App.me;
    if (e.k === 'emote') emojiFly(e.p, e.e);
    if (e.k === 'knock') {
      sfx('knock');
      announce({
        icon: '✊',
        tone: 'wood',
        title: mine ? 'Du klopfst!' : 'Klopf, klopf!',
        sub: mine ? 'Alle anderen haben noch einen Zug.' : N(e.p, e.name) + ' klopft. Jeder andere hat noch einen Zug.',
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
    if (e.k === 'chat' && e.p !== App.me) {
      setTimeout(() => {
        chatBubble(e.p, e.text);
      }, 30);
      if (!e.bot && !document.body.classList.contains('logopen')) App.unread++;
    }
    if (!seqd) {
      if (e.k === 'shburn') {
        sfx(e.four ? 'bomb' : 'burn');
        announce(burnAnn(v, e));
      }
      if ((e.k === 'shplay' || e.k === 'shpickup' || e.k === 'shblindfail' || e.k === 'shthrow') && !mine) sfx('card');
      if (e.k === 'shpickup' && num(e.cnt) >= 5)
        setTimeout(() => {
          floatLabel(e.p, `nimmt ${num(e.cnt)} Karten`, `nimmst ${num(e.cnt)} Karten`);
        }, 60);
      if (e.k === 'shthrow')
        setTimeout(() => {
          floatLabel(e.p, 'wirft 4er rein', 'wirfst 4er rein');
        }, 60);
    }
    if (e.k === 'shdone')
      announce({
        icon: e.place === 1 ? '🥇' : '✅',
        tone: 'gold',
        title: N(e.p, e.name) + vb(e.p, ' bist fertig!', ' ist fertig!'),
        sub:
          'Platz ' +
          num(e.place) +
          '.' +
          (mine && e.place === 1 ? '<span class="tt">' + esc(taunt('shWinSelf', null, e.n)) + '</span>' : ''),
        ms: mine ? 2200 : 1600,
      });
    if (e.k === 'shend' && e.p) {
      announce({
        icon: '💩',
        tone: 'red',
        title: mine ? 'Du bist der Shithead!' : N(e.p, e.name) + ' ist der Shithead!',
        sub:
          '<span class="tt">' +
          esc(mine ? taunt('shLoserSelf', null, e.n) : taunt('shLoserOther', { name: RN(e.p, e.name) }, e.n)) +
          '</span>',
        ms: 2600,
      });
      holdForAnnouncements();
      setTimeout(() => {
        sfx(mine ? 'lose' : 'win');
      }, 300);
      if (mine)
        setTimeout(() => {
          rain('💩', 34);
        }, 250);
      else if (v.sh && v.sh.finished && v.sh.finished[0] === App.me) setTimeout(confetti, 500);
    }
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
        return (
          nmOf(id) + (me2 ? ' verlierst ' : ' verliert ') + (ch.n === 2 ? 'zwei Bierdeckel.' : 'einen Bierdeckel.')
        );
      });
      let title: string;
      let icon: string;
      let tone: Announcement['tone'] = '';
      if (e.reason === 'schnautz') {
        title = 'Schnautz!';
        icon = '⭐';
        tone = 'gold';
        lines.unshift(N(e.by) + vb(e.by, ' hast', ' hat') + ' 31.');
      } else if (e.reason === 'feuer') {
        title = 'Feuer!';
        icon = '🔥';
        tone = 'red';
        lines = [N(e.by) + vb(e.by, ' hast', ' hat') + ' drei Asse. Alle anderen verlieren einen Bierdeckel.'];
      } else {
        title = 'Aufgedeckt!';
        icon = '🃏';
      }
      if (!ids.length && e.reason !== 'quit') lines.push('Gleichstand. Niemand verliert einen Bierdeckel.');
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
        icon = c.to === 'out' ? '🚪' : c.to === 'swim' ? '🏊' : '🍺';
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
  });
  const was = prev.phase === 'play' && turnId(prev) === App.me && !prev.sh?.win?.lock;
  if (myTurn(v) && !v.sh?.win?.lock && !was) {
    sfx('turn');
    try {
      navigator.vibrate?.(60);
    } catch {
      // Manche Browser verbieten Vibration ohne vorherige Geste
    }
  }
  updateTitle();
}
