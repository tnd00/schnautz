/* Score-Leiste oben: Leben oder Kartenzahl, Siege, Verlierer-Zähler und amtierende Sieger. */
import type { Player, ShPlayerView, View } from '../../game/types';
import { App } from '../app';
import { livesHTML, SWIM_ICON as SWIM } from '../cards';
import { $, esc, num } from '../dom';
import { dealerId, turnId } from '../helpers';
import { dkCount } from '../../game/durak';
import { GAME_NAME, LOSER_MARK, LOSER_NAME, reignOf } from '../../game/games';
import { loserCount } from './marks';

const count = (x: string[] | number) => (typeof x === 'number' ? x : x.length);
const cardsLeft = (P: ShPlayerView) => count(P.hand) + P.up.length + count(P.down);

/** Leben in einem Zeichen: Bierdeckel mit Zahl, Schwimmen oder raus. Für die schmale Leiste am Handy. */
function livesCompact(v: View, p: Player): string {
  if (v.game !== 'schnautz') return '';
  if (p.out) return '<span class="sb-lc" title="raus">raus</span>';
  if (p.lives === 0) return `<span class="sb-lc" title="schwimmt">${SWIM}</span>`;
  return `<span class="sb-lc" title="${num(p.lives)} Leben"><span class="coaster"></span>${num(p.lives)}</span>`;
}

function statusOf(v: View, p: Player): string {
  if (v.game === 'schnautz') return livesHTML(p, v.rules);
  if (p.out) return '<span class="tag outt">raus</span>';
  const fin = v.game === 'durak' ? v.dk?.finished : v.sh?.finished;
  if (fin?.includes(p.id)) return `<span class="sb-c">Platz ${num(p.place)}</span>`;
  const P = v.sh?.P[p.id];
  const n = v.game === 'durak' ? dkCount(v, p.id) : P ? cardsLeft(P) : 0;
  return `<span class="sb-c" title="Karten insgesamt">${n}<span class="sb-l"> ${n === 1 ? 'Karte' : 'Karten'}</span></span>`;
}

export function renderScore(v: View): void {
  const el = $('#scorebar');
  const sz = v.game === 'schnautz';
  const mark = LOSER_MARK[v.game];
  const tId = turnId(v);
  const dId = dealerId(v);
  // Siege zählen pro Spiel, wie in der Bestenliste
  const winsOf = (p: Player) => num(p.stats?.[v.game]?.wins);
  const anyWin = v.players.some((p) => winsOf(p) > 0);
  const rg = reignOf(v);
  let h = `<div class="sb-meta"><b>${sz ? `Runde ${num(v.round)}` : GAME_NAME[v.game]}</b><small>Partie ${num(v.games)}</small></div>`;
  v.players.forEach((p) => {
    const cur = (v.phase === 'play' && tId === p.id) || (v.phase === 'choose' && dId === p.id);
    const crown = rg?.win === p.id;
    const poo = !!mark && rg?.lose === p.id;
    const lost = loserCount(v.game, p);
    const cls = ['sb-p', cur && 'cur', p.out && 'out', p.id === App.me && 'mine', poo && 'shamed']
      .filter(Boolean)
      .join(' ');
    h +=
      `<div class="${cls}" data-pid="${esc(p.id)}"><span class="sb-n">` +
      (crown ? '<span class="reign" title="Hat die letzte Partie gewonnen">👑</span>' : '') +
      (poo ? `<span class="reign" title="Amtierender ${LOSER_NAME[v.game]}">${mark}</span>` : '') +
      esc(p.id === App.me ? 'Du' : p.name) +
      (p.bot ? '<i class="botb">KI</i>' : '') +
      (sz && v.knocker === p.id ? ' <span title="hat geklopft">✊</span>' : '') +
      `</span>${statusOf(v, p)}${livesCompact(v, p)}` +
      (anyWin ? `<span class="sb-w" title="Gewonnene Partien">🏆 ${winsOf(p)}</span>` : '') +
      (lost ? `<span class="sb-w" title="So oft ${LOSER_NAME[v.game]}">${mark} ${lost}</span>` : '') +
      '</div>';
  });
  el.innerHTML = h;
  el.classList.toggle('many', v.players.length > 4);
}
