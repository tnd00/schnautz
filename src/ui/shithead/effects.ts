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
import { burnAnn } from './sequence';

const cards = (n: number) => `${n} ${n === 1 ? 'Karte' : 'Karten'}`;

/**
 * Shithead: Klänge, Verbrennen und kleine Hinweise ohne Ablauf, Fertig-Meldungen und die Zeremonie.
 * `c.seqd` heißt: Die Shithead-Sequenz hat Karten, Verbrennen und Aufnehmen schon gezeigt.
 * Stufen und Spruchschwellen kommen aus `cueOf` (src/ui/levels.ts), beide Wege melden dasselbe.
 */
export function shitheadEffect(c: LevelCtx, e: LogEntry): void {
  const { v, prev, fresh, seqd } = c;
  const N = (id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));
  const nm = nameOf(v, e.p, e.name);
  const mine = e.p === App.me;
  const cue = cueOf(e, c);
  if (!seqd) {
    if ((e.k === 'shplay' || e.k === 'shpickup' || e.k === 'shblindfail' || e.k === 'shthrow') && !mine) sfx('card');
    switch (e.k) {
      case 'shburn': {
        const a = burnAnn(v, e);
        emit(cue, {
          pid: e.p,
          text: e.four ? 'macht die vier voll' : 'verbrennt den Stapel',
          mine: e.four ? 'machst die vier voll' : 'verbrennst den Stapel',
          icon: a.icon,
          tone: a.tone,
          title: a.title,
          sub: a.sub,
          ms: a.ms,
          sfx: e.four ? 'bomb' : 'burn',
        });
        break;
      }
      case 'shthrow':
        emit(cue, { pid: e.p, text: 'wirft 4er rein', mine: 'wirfst 4er rein' });
        break;
      case 'shbomb':
        emit(cue, { pid: e.p, text: 'wirft eine Bombe ein', mine: 'wirfst eine Bombe ein' });
        break;
      case 'shplay':
        emit(cue, { pid: e.p, text: 'legt blind, passt!', mine: 'legst blind, passt!' });
        break;
      case 'shpickup': {
        const n = num(e.cnt);
        emit(cue, {
          pid: e.p,
          text: `nimmt ${cards(n)}`,
          mine: `nimmst ${cards(n)}`,
          taunt: mine ? taunt('pickupSelf', { n }, e.n) : taunt('pickupOther', { name: nm, n }, e.n),
        });
        break;
      }
      case 'shblindfail':
        emit(cue, {
          pid: e.p,
          text: 'legt blind, passt nicht!',
          mine: 'legst blind, passt nicht!',
          sfx: 'nope',
          taunt: mine ? taunt('blindFailSelf', null, e.n) : taunt('blindFailOther', { name: nm }, e.n),
        });
        break;
    }
  }
  if (e.k === 'shdone') {
    // Direkt vor der Zeremonie nur kurz, der Spruch für Platz 1 steht dann im Ergebnisfenster
    const toEnd = fresh.some((x) => x.k === 'shend' && x.p);
    emit(cue, {
      pid: e.p,
      text: `ist fertig auf Platz ${num(e.place)}`,
      mine: `bist fertig auf Platz ${num(e.place)}`,
      icon: e.place === 1 ? '🥇' : '✅',
      tone: 'gold',
      title: N(e.p, e.name) + vb(e.p, ' bist fertig!', ' ist fertig!'),
      sub: 'Platz ' + num(e.place) + '.',
      taunt: taunt('shWinSelf', null, e.n),
      ms: toEnd ? ZER_SHDONE_MS : mine ? 2200 : 1600,
    });
    if (mine && e.place === 1) setTimeout(() => sfx('win'), 200);
  }
  // Der Shithead steht fest: Zeremonie statt einfacher Meldung
  if (e.k === 'shend' && e.p && prev.phase !== 'over' && v.phase === 'over') shitheadCeremony(v, e);
}
