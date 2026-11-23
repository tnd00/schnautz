/* Score-Leiste oben: Leben oder Kartenzahl, Siege, Shithead-Zähler und amtierende Sieger. */
import type { Player, ShPlayerView, View } from '../../game/types';
import { App } from '../app';
import { livesHTML, SWIM_ICON as SWIM } from '../cards';
import { $, esc, num } from '../dom';
import { dealerId, turnId } from '../helpers';
import { reignOf } from '../../game/games';

const count = (x: string[] | number) => (typeof x === 'number' ? x : x.length);
const cardsLeft = (P: ShPlayerView) => count(P.hand) + P.up.length + count(P.down);

/** Leben in einem Zeichen: Bierdeckel mit Zahl, Schwimmen oder raus. Für die schmale Leiste am Handy. */
function livesCompact(v: View, p: Player): string {
  if (v.game === 'shithead') return '';
  if (p.out) return '<span class="sb-lc" title="raus">raus</span>';
  if (p.lives === 0) return `<span class="sb-lc" title="schwimmt">${SWIM}</span>`;
  return `<span class="sb-lc" title="${num(p.lives)} Leben"><span class="coaster"></span>${num(p.lives)}</span>`;
}

function statusOf(v: View, p: Player): string {
  if (v.game !== 'shithead') return livesHTML(p, v.rules);
  if (p.out) return '<span class="tag outt">raus</span>';
  if (v.sh?.finished.includes(p.id)) return `<span class="sb-c">Platz ${num(p.place)}</span>`;
  const P = v.sh?.P[p.id];
  const n = P ? cardsLeft(P) : 0;
  return `<span class="sb-c" title="Karten insgesamt">${n}<span class="sb-l"> ${n === 1 ? 'Karte' : 'Karten'}</span></span>`;
}

export function renderScore(v: View): void {
  const el = $('#scorebar');
  const sh = v.game === 'shithead';
  const tId = turnId(v);
  const dId = dealerId(v);
  // Siege zählen pro Spiel, wie in der Bestenliste
  const winsOf = (p: Player) => num(p.stats?.[v.game]?.wins);
  const anyWin = v.players.some((p) => winsOf(p) > 0);
  const rg = reignOf(v);
  let h = `<div class="sb-meta"><b>${sh ? 'Shithead' : `Runde ${num(v.round)}`}</b><small>Partie ${num(v.games)}</small></div>`;
  v.players.forEach((p) => {
    const cur = (v.phase === 'play' && tId === p.id) || (v.phase === 'choose' && dId === p.id);
    const crown = rg?.win === p.id;
    const poo = sh && rg?.lose === p.id;
    const cls = ['sb-p', cur && 'cur', p.out && 'out', p.id === App.me && 'mine', poo && 'shamed']
      .filter(Boolean)
      .join(' ');
    h +=
      `<div class="${cls}" data-pid="${esc(p.id)}"><span class="sb-n">` +
      (crown ? '<span class="reign" title="Hat die letzte Partie gewonnen">👑</span>' : '') +
      (poo ? '<span class="reign" title="Amtierender Shithead">💩</span>' : '') +
      esc(p.id === App.me ? 'Du' : p.name) +
      (p.bot ? '<i class="botb">KI</i>' : '') +
      (!sh && v.knocker === p.id ? ' <span title="hat geklopft">✊</span>' : '') +
      `</span>${statusOf(v, p)}${livesCompact(v, p)}` +
      (anyWin ? `<span class="sb-w" title="Gewonnene Partien">🏆 ${winsOf(p)}</span>` : '') +
      (sh && p.shc ? `<span class="sb-w" title="So oft Shithead">💩 ${num(p.shc)}</span>` : '') +
      '</div>';
  });
  el.innerHTML = h;
  el.classList.toggle('many', v.players.length > 4);
}
