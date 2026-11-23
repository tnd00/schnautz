/* Bestenliste: Bilanz am Tisch für das Spiel, das gerade gewählt ist. */
import type { Player, PlayerStats, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { reignHTML } from './shithead';

interface Row {
  p: Player;
  s: PlayerStats;
}

const avgPlace = (r: Row): number => (r.s.games ? num(r.s.places) / r.s.games : 99);

function cell(v: number | string, title: string): string {
  return `<span class="bv" title="${esc(title)}">${v}</span>`;
}

export function boardHTML(v: View): string {
  const sh = v.game === 'shithead';
  const rows: Row[] = v.players.map((p) => ({ p, s: p.stats?.[v.game] ?? { games: 0, wins: 0 } }));
  rows.sort((a, b) =>
    sh
      ? b.s.wins - a.s.wins || num(a.p.shc) - num(b.p.shc) || avgPlace(a) - avgPlace(b)
      : b.s.wins - a.s.wins || num(a.s.coasters) - num(b.s.coasters) || num(b.s.hot) - num(a.s.hot),
  );
  const head = sh
    ? ['🏆<small>Siege</small>', '💩<small>Shithead</small>', 'Ø<small>Platz</small>', '#<small>Partien</small>']
    : [
        '🏆<small>Siege</small>',
        '🍺<small>Deckel weg</small>',
        '⭐<small>31 / Feuer</small>',
        '#<small>Partien</small>',
      ];
  const played = rows.some((r) => r.s.games > 0);
  const MEDALS = ['🥇', '🥈', '🥉'];
  const body = rows
    .map((r, i) => {
      const s = r.s;
      const vals = sh
        ? [
            cell(s.wins, 'Gewonnene Partien'),
            cell(num(r.p.shc), 'So oft Shithead'),
            cell(s.games ? avgPlace(r).toFixed(1).replace('.', ',') : '·', 'Durchschnittlicher Platz'),
            cell(s.games, 'Gespielte Partien'),
          ]
        : [
            cell(s.wins, 'Gewonnene Partien'),
            cell(num(s.coasters), 'Verlorene Bierdeckel'),
            cell(num(s.hot), 'Runden mit 31 oder Feuer beendet'),
            cell(s.games, 'Gespielte Partien'),
          ];
      const me = r.p.id === App.me;
      return (
        `<div class="brow${me ? ' mine' : ''}${i === 0 && s.wins ? ' top' : ''}">` +
        `<span class="bp">${played && i < 3 && s.games ? MEDALS[i] : `${i + 1}.`}</span>` +
        `<span class="bn">${reignHTML(v, r.p.id)}${esc(me ? 'Du' : r.p.name)}${r.p.bot ? '<i class="botb">KI</i>' : ''}</span>` +
        `${vals.join('')}</div>`
      );
    })
    .join('');
  return (
    '<div class="modal"><div class="paper sheet board"><button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    `<h2>Bestenliste <span class="r">${sh ? 'Shithead' : 'Schnautz'}</span></h2>` +
    `<p class="lead">${played ? 'Zählt alle fertigen Partien, seit dieser Tisch offen ist.' : 'Noch keine Partie fertig. Nach der ersten steht hier, wer vorne liegt.'}</p>` +
    `<div class="btable"><div class="brow bhead"><span class="bp"></span><span class="bn"></span>${head.map((h) => `<span class="bv">${h}</span>`).join('')}</div>${body}</div>` +
    '</div></div>'
  );
}
