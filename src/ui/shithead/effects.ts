import type { LogEntry, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { announce, floatLabel } from '../feedback';
import { nameOf, vb } from '../helpers';
import { sfx } from '../sound';
import { shitheadCeremony } from '../ceremony';
import { ZER_SHDONE_MS } from '../ceremony-plan';
import { taunt } from '../taunts';
import { burnAnn } from './sequence';

/**
 * Shithead: Klänge, Verbrennen und kleine Hinweise ohne Ablauf, Fertig-Meldungen und die Zeremonie.
 * `seqd` heißt: Die Shithead-Sequenz hat Karten, Verbrennen und Aufnehmen schon gezeigt.
 */
export function shitheadEffect(prev: View, v: View, e: LogEntry, fresh: readonly LogEntry[], seqd: boolean): void {
  const N = (id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));
  const mine = e.p === App.me;
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
}
