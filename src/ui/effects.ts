import { suitOf } from '../game/cards';
import type { LogEntry, View } from '../game/types';
import { confetti, emojiFly } from './animations';
import { App } from './app';
import { $opt, esc, num } from './dom';
import { REMATCH_ANN_MS, SUIT_SYM } from '../game/constants';
import {
  type Announcement,
  announce,
  centerLabel,
  chatBubble,
  fixedLabel,
  floatLabel,
  holdForAnnouncements,
  shakePanel,
  tauntLabel,
} from './feedback';
import { myTurn, nameOf, pById, roundBest, turnId, vb } from './helpers';
import { betEffect, BETUI } from './render/bets';
import { duelResult, duelRunning, rematchAnn } from './render/rematch';
import { updateTitle } from './screens';
import { burnAnn } from './shithead/sequence';
import { sfx } from './sound';
import { shitheadCeremony } from './ceremony';
import { ZER_SHDONE_MS } from './shithead/ceremony-plan';
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
    if (e.k === 'timeout' && mine) {
      // Zu lange gebraucht: Damit klar ist, warum plötzlich etwas passiert ist
      sfx('timeout');
      try {
        navigator.vibrate?.([60, 60, 60]);
      } catch {
        // Manche Browser verbieten Vibration ohne vorherige Geste
      }
      announce({
        icon: '⏰',
        tone: 'red',
        title: 'Zeit um!',
        sub: prev.phase === 'swap' ? 'Die KI hat für dich getauscht.' : 'Die KI hat für dich gezogen.',
        ms: 2000,
      });
    }
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
    if (e.k === 'shdone') {
      // Direkt vor der Zeremonie nur kurz, der Spruch für Platz 1 steht dann im Ergebnisfenster
      const toEnd = fresh.some((x) => x.k === 'shend' && x.p);
      announce({
        icon: e.place === 1 ? '🥇' : '✅',
        tone: 'gold',
        title: N(e.p, e.name) + vb(e.p, ' bist fertig!', ' ist fertig!'),
        sub:
          'Platz ' +
          num(e.place) +
          '.' +
          (mine && e.place === 1 && !toEnd ? '<span class="tt">' + esc(taunt('shWinSelf', null, e.n)) + '</span>' : ''),
        ms: toEnd ? ZER_SHDONE_MS : mine ? 2200 : 1600,
      });
      if (mine && e.place === 1) setTimeout(() => sfx('win'), 200);
    }
    // Der Shithead steht fest: Zeremonie statt einfacher Meldung
    if (e.k === 'shend' && e.p && prev.phase !== 'over' && v.phase === 'over') shitheadCeremony(v, e);
    if (isDk(e)) durakEffect(prev, v, e, fresh, seqd);
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
    if (e.k === 'rematch') {
      sfx('duel');
      const a = rematchAnn(v, e);
      announce({ icon: '⚔️', tone: 'red', title: a.title, sub: a.sub, ms: REMATCH_ANN_MS });
    }
    if (e.k === 'rematchend' && v.players.length > 2 && [e.p, e.to].some((id) => !pById(v, id ?? '')?.bot)) {
      const full = duelResult(v, { by: e.p ?? '', vs: e.to, res: e.res }, e.name, e.tn);
      const cut = full.indexOf('! ');
      announce({
        icon: '⚔️',
        tone: e.res === 'won' ? 'gold' : e.res === 'lost' ? 'red' : '',
        title: full.slice(0, cut + 1),
        sub: full.slice(cut + 2),
        ms: 2200,
      });
      holdForAnnouncements(300);
    }
    if (e.k === 'shbet') betEffect(v, e);
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
  // Zu Beginn der Revanche-Partie ein kurzer Hinweis am Tisch
  const started = fresh.some((e) => e.k === 'shdeal' || (e.k === 'round' && e.r === 1));
  const duel = started ? duelRunning(v) : '';
  if (duel) {
    const wait = fresh.some((e) => e.k === 'rematch') ? REMATCH_ANN_MS + 300 : 600;
    setTimeout(() => fixedLabel('duellbl', duel, $opt('#center'), 3200), wait);
  }
  // Ein Spruch zum ersten Tipp auf mich wartet, bis ich nicht mehr dran bin
  if (BETUI.pend && (BETUI.pend.games !== v.games || v.phase !== 'play')) BETUI.pend = null;
  if (BETUI.pend && !myTurn(v)) {
    tauntLabel(BETUI.pend.text);
    BETUI.pend = null;
  }
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

type DkEntry = Extract<LogEntry, { k: `dk${string}` }>;

const isDk = (e: LogEntry): e is DkEntry => e.k.startsWith('dk');

const SUIT_NAME: Readonly<Record<string, string>> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };

/** Durak: Trumpf am Anfang, Klänge am Tisch, Aufnehmen, Weiterschieben, Raus und das Ende. */
function durakEffect(prev: View, v: View, e: DkEntry, fresh: LogEntry[], seqd: boolean): void {
  if (seqd) return;
  const mine = e.p === App.me;
  const N = (id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));
  switch (e.k) {
    case 'dkdeal': {
      const s = suitOf(e.trump);
      let sub: string;
      if (e.prev) {
        sub =
          e.def === App.me
            ? 'Du warst zuletzt Durak. Rate mal, wer zuerst angegriffen wird.'
            : `${N(e.def)} war zuletzt Durak und wird zuerst angegriffen.`;
      } else sub = `${N(e.att)} hat den kleinsten Trumpf und greift ${N(e.def)} an.`;
      announce({ icon: SUIT_SYM[s], tone: 'gold', title: `Trumpf ist ${SUIT_NAME[s]}`, sub, ms: 2400 });
      return;
    }
    case 'dkattack':
    case 'dkdefend':
      if (!mine) sfx('card');
      return;
    case 'dktransfer':
      sfx('knock');
      setTimeout(() => floatLabel(e.p, `schiebt weiter an ${e.tn ?? 'den Nächsten'}`, 'schiebst weiter'), 60);
      if (e.to === App.me && !mine) tauntLabel(taunt('dkTransferOnMe', { name: nameOf(v, e.p, e.name) }, e.n));
      return;
    case 'dktake':
      setTimeout(() => floatLabel(e.p, 'nimmt auf', 'nimmst auf'), 60);
      // Ist der Tisch schon voll, folgt das Aufnehmen sofort, dann spricht der Spruch dort
      if (fresh.some((x) => x.k === 'dkpickup' && x.n > e.n)) return;
      if (mine) tauntLabel(taunt('dkTakeSelf', null, e.n));
      else if (e.n % 3 === 0) tauntLabel(taunt('dkTakeOther', { name: nameOf(v, e.p, e.name) }, e.n));
      return;
    case 'dkpickup': {
      const n = num(e.cnt);
      sfx(mine ? 'lose' : 'pop');
      setTimeout(() => floatLabel(e.p, `nimmt ${n} Karten`, `nimmst ${n} Karten`), 60);
      if (n >= 6)
        tauntLabel(
          mine
            ? taunt('dkBigPickupSelf', { n }, e.n)
            : taunt('dkBigPickupOther', { name: nameOf(v, e.p, e.name), n }, e.n),
        );
      return;
    }
    case 'dkbito':
      sfx('deal');
      setTimeout(() => floatLabel(e.p, 'wehrt alles ab', 'wehrst alles ab'), 60);
      if (mine && num(e.cnt) >= 6) tauntLabel(taunt('dkBitoSelf', null, e.n));
      return;
    case 'dkout': {
      // Direkt vor der Zeremonie nur kurz
      const toEnd = fresh.some((x) => x.k === 'dkend' && x.p);
      announce({
        icon: e.place === 1 ? '🥇' : '✅',
        tone: 'gold',
        title: N(e.p, e.name) + vb(e.p, ' bist raus!', ' ist raus!'),
        sub:
          'Platz ' +
          num(e.place) +
          '.' +
          (mine && e.place === 1 && !toEnd ? '<span class="tt">' + esc(taunt('dkWinSelf', null, e.n)) + '</span>' : ''),
        ms: toEnd ? ZER_SHDONE_MS : mine ? 2200 : 1600,
      });
      if (mine && e.place === 1) setTimeout(() => sfx('win'), 200);
      return;
    }
    case 'dkend':
      if (prev.phase === 'over' || v.phase !== 'over') return;
      if (e.p) shitheadCeremony(v, e);
      else
        announce({
          icon: '🤝',
          tone: 'gold',
          title: 'Unentschieden!',
          sub: 'Die Letzten sind gleichzeitig raus. Diesmal gibt es keinen Durak.',
          ms: 2600,
        });
      return;
  }
}
