import { suitOf } from '../game/cards';
import type { LogEntry, View } from '../game/types';
import { confetti, emojiFly } from './animations';
import { App } from './app';
import { $opt, esc, listJoin, num } from './dom';
import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO, REMATCH_ANN_MS, SUIT_SYM } from '../game/constants';
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
  toast,
} from './feedback';
import { myMoveNow, myTurn, nameOf, pById, roundBest, vb } from './helpers';
import { betEffect, BETUI } from './render/bets';
import { duelResult, duelRunning, rematchAnn } from './render/rematch';
import { updateTitle } from './screens';
import { burnAnn } from './shithead/sequence';
import { sfx, sfxCalm } from './sound';
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
        // Ein Satz für alle Spiele, nur beim Ansehen zu Beginn einer Cabo-Runde zeigt die KI zwei Karten
        sub: prev.phase === 'peek' ? 'Die KI hat dir zwei Karten gezeigt.' : 'Die KI hat einmal für dich gespielt.',
        ms: 2000,
      });
    }
    if (e.k === 'knock') {
      sfx('knock');
      announce({
        icon: '✊',
        tone: 'wood',
        title: mine ? 'Du klopfst!' : 'Klopf, klopf!',
        sub: mine
          ? 'Alle anderen haben noch einen Zug.'
          : N(e.p, e.name) + ' klopft. Alle anderen haben noch einen Zug.',
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
    if (isCb(e)) caboEffect(prev, v, e, fresh);
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
  if (prev.phase === 'lobby' && v.phase === 'lobby') lobbyPeople(prev, v, fresh);
  // Zu Beginn der Revanche-Partie ein kurzer Hinweis am Tisch
  const started = fresh.some(
    (e) => e.k === 'shdeal' || e.k === 'dkdeal' || ((e.k === 'round' || e.k === 'cbdeal') && e.r === 1),
  );
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
  const was = myMoveNow(prev) && !prev.sh?.win?.lock;
  if (myMoveNow(v) && !v.sh?.win?.lock && !was) {
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
  /** Wen etwas trifft, aus Sicht dieses Browsers: dich statt Du. Für Ansagen (HTML, maskiert) */
  const whom = (id: string | null | undefined, fb?: string) => (id === App.me ? 'dich' : N(id, fb));
  /** Dasselbe als reiner Text für floatLabel, das selbst nur textContent setzt */
  const whomText = (id: string | null | undefined, fb?: string) => (id === App.me ? 'dich' : nameOf(v, id, fb));
  const cards = (n: number) => `${n} ${n === 1 ? 'Karte' : 'Karten'}`;
  // Endet die Partie im selben Schub, haben Sprüche zum einzelnen Angriff Pause bis nach der Enthüllung
  const ending = fresh.some((x) => x.k === 'dkend');
  switch (e.k) {
    case 'dkdeal': {
      const s = suitOf(e.trump);
      let sub: string;
      if (e.prev) {
        sub =
          e.def === App.me
            ? 'Du warst zuletzt Durak. Rate mal, wer zuerst angegriffen wird.'
            : `${N(e.def)} war zuletzt Durak und wird zuerst angegriffen.`;
      } else if (e.rnd)
        sub = `Niemand hat Trumpf, das Los entscheidet: ${N(e.att)}${vb(e.att, ' greifst', ' greift')} ${whom(e.def)} an.`;
      else
        sub = `${N(e.att)}${vb(e.att, ' hast', ' hat')} den kleinsten Trumpf und${vb(e.att, ' greifst', ' greift')} ${whom(e.def)} an.`;
      announce({ icon: SUIT_SYM[s], tone: 'gold', title: `Trumpf ist ${SUIT_NAME[s]}`, sub, ms: 2400 });
      return;
    }
    case 'dkattack':
    case 'dkdefend':
      if (!mine) sfx('card');
      return;
    case 'dktransfer': {
      sfx('knock');
      const to = whomText(e.to, e.tn ?? 'den Nächsten');
      setTimeout(() => floatLabel(e.p, `schiebt weiter an ${to}`, `schiebst weiter an ${to}`), 60);
      if (e.to === App.me && !mine) tauntLabel(taunt('dkTransferOnMe', { name: nameOf(v, e.p, e.name) }, e.n));
      return;
    }
    case 'dktake':
      // Ist der Tisch schon voll, folgt das Aufnehmen sofort, dann sprechen Hinweis und Spruch dort
      if (fresh.some((x) => x.k === 'dkpickup' && x.n > e.n)) return;
      setTimeout(() => floatLabel(e.p, 'nimmt auf', 'nimmst auf'), 60);
      if (ending) return;
      if (mine) tauntLabel(taunt('dkTakeSelf', null, e.n));
      else if (e.n % 3 === 0) tauntLabel(taunt('dkTakeOther', { name: nameOf(v, e.p, e.name) }, e.n));
      return;
    case 'dkpickup': {
      const n = num(e.cnt);
      sfx(mine ? 'lose' : 'pop');
      setTimeout(() => floatLabel(e.p, `nimmt ${cards(n)}`, `nimmst ${cards(n)}`), 60);
      if (n >= 6 && !ending)
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
      if (mine && num(e.cnt) >= 6 && !ending) tauntLabel(taunt('dkBitoSelf', null, e.n));
      return;
    case 'dkout': {
      // Direkt vor der Zeremonie nur kurz. Teilt sich jemand den Platz, gibt es keinen Siegerjubel
      const toEnd = fresh.some((x) => x.k === 'dkend' && x.p);
      const shared = fresh.some((x) => x.k === 'dkout' && x.place === e.place && x.p !== e.p);
      const solo = e.place === 1 && !shared;
      announce({
        icon: solo ? '🥇' : '✅',
        tone: 'gold',
        title: N(e.p, e.name) + vb(e.p, ' bist fertig!', ' ist fertig!'),
        sub:
          'Platz ' +
          num(e.place) +
          (shared ? ', gleichzeitig mit anderen.' : '.') +
          (mine && solo && !toEnd ? '<span class="tt">' + esc(taunt('dkWinSelf', null, e.n)) + '</span>' : ''),
        ms: toEnd ? ZER_SHDONE_MS : mine ? 2200 : 1600,
      });
      if (mine && solo) setTimeout(() => sfx('win'), 200);
      return;
    }
    case 'dkend':
      if (prev.phase === 'over' || v.phase !== 'over') return;
      if (e.p) shitheadCeremony(v, e);
      else {
        announce({
          icon: '🤝',
          tone: 'gold',
          title: 'Unentschieden!',
          sub: 'Die Letzten sind gleichzeitig fertig geworden. Diesmal gibt es keinen Durak.',
          ms: 2600,
        });
        // Das Ergebnisfenster wartet, bis die Meldungen durch sind
        holdForAnnouncements();
      }
      return;
  }
}

type CbEntry = Extract<LogEntry, { k: `cb${string}` }>;

const isCb = (e: LogEntry): e is CbEntry => e.k.startsWith('cb');

/** Was eine abgelegte Karte erlaubt, als kurzer Hinweis am Platz. */
const CB_POWER_LABEL = {
  peek: ['darf eine eigene Karte ansehen', 'darfst eine eigene Karte ansehen'],
  spy: ['darf spionieren', 'darfst spionieren'],
  swap: ['darf blind tauschen', 'darfst blind tauschen'],
} as const;

/** Cabo: Rundenbeginn, Klänge am Tisch, Cabo-Ruf, Spionieren und Blindtausch, Schnappen, Abrechnung, Krönung. */
function caboEffect(prev: View, v: View, e: CbEntry, fresh: LogEntry[]): void {
  const mine = e.p === App.me;
  const N = (id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));
  /** Name nach „bei“ oder „mit“ als reiner Text, nur für floatLabel (setzt textContent, maskiert selbst) */
  const toWhom = (id: string | null | undefined, fb?: string) => (id === App.me ? 'dir' : nameOf(v, id, fb));
  // Endet die Partie im selben Schub, wartet alles Kleine bis nach der Krönung
  const ending = fresh.some((x) => x.k === 'cbend');
  switch (e.k) {
    case 'cbdeal': {
      // Den Austeilklang spielt schon das Austeilen selbst (src/ui/apply.ts)
      const first = e.r === 1;
      announce({
        icon: '🃏',
        tone: 'gold',
        title: first ? 'Cabo!' : `Runde ${num(e.r)}`,
        sub:
          (first ? 'Wenig Punkte gewinnen. ' : '') +
          'Sieh dir zwei deiner Karten an und merk sie dir gut. ' +
          `${N(e.start)}${vb(e.start, ' fängst', ' fängt')} an.`,
        ms: first ? 2600 : 1800,
      });
      return;
    }
    case 'cblook':
      if (mine) sfx('pop');
      return;
    case 'cbdraw':
      if (!mine) sfx('card');
      if (!mine && e.from === 'pile') setTimeout(() => floatLabel(e.p, 'nimmt von der Ablage'), 60);
      return;
    case 'cbswap': {
      if (!mine) sfx('card');
      if (!e.ok) {
        sfx('nope');
        shakePanel(e.p);
        setTimeout(() => floatLabel(e.p, 'greift daneben, Strafkarte!', 'greifst daneben, Strafkarte!'), 60);
      } else if (e.slots > 1)
        setTimeout(() => floatLabel(e.p, `wirft ${e.slots} gleiche ab`, `wirfst ${e.slots} gleiche ab`), 60);
      return;
    }
    case 'cbdiscard':
      if (!mine) sfx('card');
      if (e.power) {
        const [er, du] = CB_POWER_LABEL[e.power];
        setTimeout(() => floatLabel(e.p, er, du), 60);
      }
      return;
    case 'cbpeek':
      if (!mine) setTimeout(() => floatLabel(e.p, 'schaut sich eine Karte an'), 60);
      return;
    case 'cbspy':
      if (mine) return;
      setTimeout(() => floatLabel(e.p, `spioniert bei ${toWhom(e.to, e.tn)}`), 60);
      if (e.to === App.me) {
        sfx('knock');
        if (e.n % 2 === 0) tauntLabel(taunt('cbSpyOnMe', { name: nameOf(v, e.p, e.name) }, e.n));
      }
      return;
    case 'cbblind':
      sfx('smack');
      setTimeout(
        () => floatLabel(e.p, `tauscht blind mit ${toWhom(e.to, e.tn)}`, `tauschst blind mit ${toWhom(e.to, e.tn)}`),
        60,
      );
      if (e.to === App.me && !mine) {
        shakePanel(App.me);
        tauntLabel(taunt('cbBlindOnMe', { name: nameOf(v, e.p, e.name) }, e.n));
        try {
          navigator.vibrate?.([40, 40, 40]);
        } catch {
          // Manche Browser verbieten Vibration ohne vorherige Geste
        }
      }
      return;
    case 'cbcabo': {
      sfx('knock');
      setTimeout(() => sfx('duel'), 250);
      if (!mine) shakePanel(e.p);
      const t = mine ? taunt('cbCaboSelf', null, e.n) : taunt('cbCaboOther', { name: nameOf(v, e.p, e.name) }, e.n);
      announce({
        icon: '📣',
        tone: 'red',
        title: mine ? 'Du rufst Cabo!' : `${N(e.p, e.name)} ruft Cabo!`,
        sub: `Alle anderen haben noch einen Zug.<span class="tt">${esc(t)}</span>`,
        ms: 2400,
      });
      return;
    }
    case 'cbsnap':
      if (e.ok) {
        sfx('pop');
        setTimeout(() => floatLabel(e.p, 'schnappt!', 'schnappst!'), 60);
      } else {
        sfx('nope');
        shakePanel(e.p);
        setTimeout(() => floatLabel(e.p, 'schnappt daneben, Strafkarte!', 'schnappst daneben, Strafkarte!'), 60);
        if (mine) tauntLabel(taunt('cbSnapFailSelf', null, e.n));
      }
      return;
    case 'cbround': {
      // Kurz vorab, das Ergebnisfenster danach zeigt alles genau
      let icon = '🃏';
      let title = 'Stapel leer!';
      let tone: Announcement['tone'] = '';
      let sub = 'Alle Karten auf den Tisch.';
      if (e.kami) {
        icon = '💥';
        title = 'Kamikaze!';
        tone = 'red';
        sub = `${N(e.kami)}${vb(e.kami, ' hast', ' hat')} zwei Damen und zwei schwarze Könige. Alle anderen bekommen ${CB_KAMI}.`;
        sfx('bomb');
      } else if (e.caller) {
        icon = e.ok ? '🎯' : '🙈';
        title = e.ok ? 'Cabo geschafft!' : 'Cabo daneben!';
        tone = e.ok ? 'gold' : 'red';
        sub = e.ok
          ? `${N(e.caller)}${vb(e.caller, ' hattest', ' hatte')} am wenigsten.`
          : `${N(e.caller)}${vb(e.caller, ' bekommst', ' bekommt')} ${CB_PENALTY} Strafpunkte obendrauf.`;
        setTimeout(() => sfx(e.ok === (e.caller === App.me) ? 'win' : 'lose'), 250);
      }
      announce({ icon, tone, title, sub, ms: ending ? 1600 : 2200 });
      holdForAnnouncements(300);
      return;
    }
    case 'cbreset':
      setTimeout(
        () =>
          floatLabel(
            e.p,
            `landet genau auf ${CB_RESET_AT} und fällt auf ${CB_RESET_TO}`,
            `landest genau auf ${CB_RESET_AT} und fällst auf ${CB_RESET_TO}`,
          ),
        400,
      );
      return;
    case 'cbend':
      if (prev.phase === 'over' || v.phase !== 'over') return;
      if (e.p) shitheadCeremony(v, e);
      else {
        announce({
          icon: '🤝',
          tone: 'gold',
          title: 'Unentschieden!',
          sub: 'Vorne liegen mehrere gleichauf. Diesmal gibt es keinen neuen Cabo-König.',
          ms: 2600,
        });
        holdForAnnouncements();
      }
      return;
    default:
      return;
  }
}

/**
 * Lobby: Wer kommt oder geht, bekommt eine kurze Meldung und einen leisen Ton. KIs kommen und gehen still,
 * mehrere auf einmal stehen in einer Meldung.
 */
function lobbyPeople(prev: View, v: View, fresh: LogEntry[]): void {
  const came: string[] = [];
  const went: string[] = [];
  fresh.forEach((e) => {
    if (!e.p || e.p === App.me) return;
    if ((e.k === 'join' && !e.bot) || e.k === 'takeover' || e.k === 'back') came.push(nameOf(v, e.p, e.name));
    const was = pById(prev, e.p);
    if (e.k === 'leave' && was && !was.bot) went.push(e.name ?? was.name);
  });
  if (came.length) {
    sfxCalm('msg', 400);
    toast(`${listJoin(came)} ${came.length === 1 ? 'sitzt' : 'sitzen'} jetzt mit am Tisch.`);
  }
  if (went.length) {
    sfxCalm('card', 400, 0.7);
    toast(`${listJoin(went)} ${went.length === 1 ? 'ist' : 'sind'} gegangen.`);
  }
}
