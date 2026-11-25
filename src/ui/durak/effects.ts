import { suitOf } from '../../game/cards';
import { SUIT_SYM } from '../../game/constants';
import type { LogEntry } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { emit } from '../feedback';
import { cueOf, type LevelCtx } from '../levels';
import { nameOf, vb } from '../helpers';
import { sfx } from '../sound';
import { shitheadCeremony } from '../ceremony';
import { ZER_SHDONE_MS } from '../ceremony-plan';
import { taunt } from '../taunts';

type DkEntry = Extract<LogEntry, { k: `dk${string}` }>;

const isDk = (e: LogEntry): e is DkEntry => e.k.startsWith('dk');

const SUIT_NAME: Readonly<Record<string, string>> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };

/** Durak: Trumpf am Anfang, Klänge am Tisch, Aufnehmen, Weiterschieben, Fertig und das Ende. */
export function durakEffect(c: LevelCtx, e0: LogEntry): void {
  const { prev, v, seqd } = c;
  if (seqd || !isDk(e0)) return;
  const e = e0;
  const cue = cueOf(e, c);
  const mine = e.p === App.me;
  const N = (id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));
  /** Wen etwas trifft, aus Sicht dieses Browsers: dich statt Du. Für Ansagen (HTML, maskiert) */
  const whom = (id: string | null | undefined, fb?: string) => (id === App.me ? 'dich' : N(id, fb));
  /** Dasselbe als reiner Text für floatLabel, das selbst nur textContent setzt */
  const whomText = (id: string | null | undefined, fb?: string) => (id === App.me ? 'dich' : nameOf(v, id, fb));
  const cards = (n: number) => `${n} ${n === 1 ? 'Karte' : 'Karten'}`;
  const fresh = c.fresh;
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
      emit(cue, { text: `Trumpf ist ${SUIT_NAME[s]}`, icon: SUIT_SYM[s], tone: 'gold', sub, ms: 2400 });
      return;
    }
    case 'dkattack':
    case 'dkdefend':
      if (!mine) sfx('card');
      return;
    case 'dktransfer': {
      const to = whomText(e.to, e.tn ?? 'den Nächsten');
      emit(cue, {
        pid: e.p,
        text: `schiebt weiter an ${to}`,
        mine: `schiebst weiter an ${to}`,
        icon: '↪️',
        tone: 'red',
        title: `${N(e.p, e.name)} schiebt weiter an dich!`,
        sfx: 'knock',
        taunt: taunt('dkTransferOnMe', { name: nameOf(v, e.p, e.name) }, e.n),
        ms: 1800,
      });
      return;
    }
    case 'dktake':
      // Ist der Tisch schon voll, folgt das Aufnehmen sofort, dann sprechen Hinweis und Spruch dort
      emit(cue, {
        pid: e.p,
        text: 'nimmt auf',
        mine: 'nimmst auf',
        taunt: mine ? taunt('dkTakeSelf', null, e.n) : taunt('dkTakeOther', { name: nameOf(v, e.p, e.name) }, e.n),
      });
      return;
    case 'dkpickup': {
      const n = num(e.cnt);
      emit(cue, {
        pid: e.p,
        text: `nimmt ${cards(n)}`,
        mine: `nimmst ${cards(n)}`,
        sfx: mine ? 'lose' : 'pop',
        taunt: mine
          ? taunt('dkBigPickupSelf', { n }, e.n)
          : taunt('dkBigPickupOther', { name: nameOf(v, e.p, e.name), n }, e.n),
      });
      return;
    }
    case 'dkbito':
      emit(cue, {
        pid: e.p,
        text: 'wehrt alles ab',
        mine: 'wehrst alles ab',
        icon: '🛡️',
        tone: 'gold',
        title: `Bito! ${N(e.p, e.name)}${vb(e.p, ' wehrst', ' wehrt')} alles ab.`,
        sub: `${num(e.cnt)} Karten gehen auf den Bito-Stapel.`,
        sfx: 'deal',
        taunt: taunt('dkBitoSelf', null, e.n),
        ms: 1600,
      });
      return;
    case 'dkout': {
      // Direkt vor der Zeremonie nur kurz. Teilt sich jemand den Platz, gibt es keinen Siegerjubel
      const toEnd = fresh.some((x) => x.k === 'dkend' && x.p);
      const shared = fresh.some((x) => x.k === 'dkout' && x.place === e.place && x.p !== e.p);
      const solo = e.place === 1 && !shared;
      emit(cue, {
        pid: e.p,
        text: `ist fertig auf Platz ${num(e.place)}`,
        mine: `bist fertig auf Platz ${num(e.place)}`,
        icon: solo ? '🥇' : '✅',
        tone: 'gold',
        title: N(e.p, e.name) + vb(e.p, ' bist fertig!', ' ist fertig!'),
        sub: 'Platz ' + num(e.place) + (shared ? ', gleichzeitig mit anderen.' : '.'),
        taunt: taunt('dkWinSelf', null, e.n),
        ms: toEnd ? ZER_SHDONE_MS : mine ? 2200 : 1600,
      });
      if (mine && solo) setTimeout(() => sfx('win'), 200);
      return;
    }
    case 'dkend':
      if (prev.phase === 'over' || v.phase !== 'over') return;
      if (e.p) shitheadCeremony(v, e);
      else {
        // Das Ergebnisfenster wartet, bis die Meldungen durch sind
        emit(cue, {
          text: 'Unentschieden!',
          icon: '🤝',
          tone: 'gold',
          sub: 'Die Letzten sind gleichzeitig fertig geworden. Diesmal gibt es keinen Durak.',
          ms: 2600,
          hold: 250,
        });
      }
      return;
  }
}
