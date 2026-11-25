import { suitOf } from '../../game/cards';
import { SUIT_SYM } from '../../game/constants';
import type { LogEntry, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { announce, floatLabel, holdForAnnouncements, tauntLabel } from '../feedback';
import { nameOf, vb } from '../helpers';
import { sfx } from '../sound';
import { shitheadCeremony } from '../ceremony';
import { ZER_SHDONE_MS } from '../ceremony-plan';
import { taunt } from '../taunts';

type DkEntry = Extract<LogEntry, { k: `dk${string}` }>;

const isDk = (e: LogEntry): e is DkEntry => e.k.startsWith('dk');

const SUIT_NAME: Readonly<Record<string, string>> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };

/** Durak: Trumpf am Anfang, Klänge am Tisch, Aufnehmen, Weiterschieben, Fertig und das Ende. */
export function durakEffect(prev: View, v: View, e0: LogEntry, fresh: readonly LogEntry[], seqd: boolean): void {
  if (seqd || !isDk(e0)) return;
  const e = e0;
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
