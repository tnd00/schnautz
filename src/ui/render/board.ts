/* Bestenliste: Bilanz am Tisch für das Spiel, das gerade gewählt ist. */
import type { Player, PlayerStats, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { loserCount, reignHTML } from './marks';
import { GAME_NAME, LOSER_MARK, LOSER_NAME, unreachable } from '../../game/games';

interface Row {
  p: Player;
  s: PlayerStats;
}

const avgPlace = (r: Row): number => (r.s.games ? num(r.s.places) / r.s.games : 99);

function cell(v: number | string, title: string): string {
  return `<span class="bv" title="${esc(title)}">${v}</span>`;
}

/** Bestenliste: Platz-Spiele zählen Siege, Verlierer-Titel und Platz, Schnautz zählt Deckel und 31. */
function placesGame(v: View): boolean {
  switch (v.game) {
    case 'shithead':
    case 'durak':
      return true;
    case 'schnautz':
      return false;
    default:
      return unreachable(v.game);
  }
}

export function boardHTML(v: View): string {
  const sh = placesGame(v);
  const lost = (r: Row) => loserCount(v.game, r.p);
  const rows: Row[] = v.players.map((p) => ({ p, s: p.stats?.[v.game] ?? { games: 0, wins: 0 } }));
  rows.sort((a, b) =>
    sh
      ? b.s.wins - a.s.wins || lost(a) - lost(b) || avgPlace(a) - avgPlace(b)
      : b.s.wins - a.s.wins || num(a.s.coasters) - num(b.s.coasters) || num(b.s.hot) - num(a.s.hot),
  );
  const head = sh
    ? [
        '🏆<small>Siege</small>',
        `${LOSER_MARK[v.game]}<small>${LOSER_NAME[v.game]}</small>`,
        'Ø<small>Platz</small>',
        '#<small>Partien</small>',
      ]
    : [
        '🏆<small>Siege</small>',
        '🍺<small>Deckel weg</small>',
        '⭐<small>31 / Feuer</small>',
        '#<small>Partien</small>',
      ];
  const played = rows.some((r) => r.s.games > 0);
  // Tipp-Punkte als eigene Spalte, sobald bei Shithead oder Durak jemand getippt hat
  const tips = sh && rows.some((r) => num(r.s.bets) > 0);
  if (tips) head.splice(3, 0, '🔮<small>Tipp-Punkte</small>');
  const MEDALS = ['🥇', '🥈', '🥉'];
  const body = rows
    .map((r, i) => {
      const s = r.s;
      const vals = sh
        ? [
            cell(s.wins, 'Gewonnene Partien'),
            cell(lost(r), `So oft ${LOSER_NAME[v.game]}`),
            cell(s.games ? avgPlace(r).toFixed(1).replace('.', ',') : '·', 'Durchschnittlicher Platz'),
            ...(tips ? [cell(num(s.betPts), 'Punkte aus richtigen Tipps')] : []),
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
    `<h2>Bestenliste <span class="r">${GAME_NAME[v.game]}</span></h2>` +
    `<p class="lead">${played ? 'Zählt alle fertigen Partien, seit dieser Tisch offen ist.' : 'Noch keine Partie fertig. Nach der ersten steht hier, wer vorne liegt.'}</p>` +
    `<div class="btable${tips ? ' c5' : ''}"><div class="brow bhead"><span class="bp"></span><span class="bn"></span>${head.map((h) => `<span class="bv">${h}</span>`).join('')}</div>${body}</div>` +
    '</div></div>'
  );
}
