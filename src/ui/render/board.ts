/* Bestenliste: Bilanz am Tisch, das gewählte Spiel zuerst, danach jedes Spiel, das hier schon lief. */
import type { GameKind, Player, PlayerStats, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { sheetHTML } from '../dialog';
import { loserCount, reignHTML } from './marks';
import { GAME_NAME, GAMES, LOSER_NAME, unreachable } from '../../game/games';

interface Row {
  p: Player;
  s: PlayerStats;
}

/** Spalte: kurze Überschrift (mindestens 12 px lesbar), ausgeschrieben für Vorleser und Mauszeiger. */
interface Col {
  h: string;
  full: string;
  val: (r: Row) => string;
}

const avgPlace = (r: Row): number => (r.s.games ? num(r.s.places) / r.s.games : 99);
const comma = (x: number): string => x.toFixed(1).replace('.', ',');

/** Platz-Spiele zählen Siege, Verlierer-Titel und Platz, Schnautz zählt verlorene Leben und 31. */
function placesGame(g: GameKind): boolean {
  switch (g) {
    case 'shithead':
    case 'durak':
    case 'cabo':
      return true;
    case 'schnautz':
      return false;
    default:
      return unreachable(g);
  }
}

/** Cabo-Rufe: richtig gerufen von allen Rufen. Cabo hat keinen Verlierer-Titel, an dessen Stelle stehen die Rufe. */
function caboCalls(s: PlayerStats): string {
  const n = num(s.cabos);
  return n ? `${num(s.cabosOk)}/${n}` : '·';
}

function columns(g: GameKind, tips: boolean): Col[] {
  const wins: Col = { h: 'Siege', full: 'Gewonnene Partien', val: (r) => String(r.s.wins) };
  const games: Col = { h: 'Partien', full: 'Gespielte Partien', val: (r) => String(r.s.games) };
  if (!placesGame(g))
    return [
      wins,
      { h: 'Leben', full: 'Verlorene Leben', val: (r) => String(num(r.s.coasters)) },
      { h: '31', full: 'Runden mit 31 oder Feuer beendet', val: (r) => String(num(r.s.hot)) },
      games,
    ];
  const second: Col =
    g === 'cabo'
      ? { h: 'Cabo', full: 'Cabo-Rufe, die aufgingen, von allen Rufen', val: (r) => caboCalls(r.s) }
      : { h: LOSER_NAME[g], full: `So oft ${LOSER_NAME[g]}`, val: (r) => String(loserCount(g, r.p)) };
  return [
    wins,
    second,
    { h: 'Ø Platz', full: 'Durchschnittlicher Platz', val: (r) => (r.s.games ? comma(avgPlace(r)) : '·') },
    ...(tips ? [{ h: 'Tipps', full: 'Punkte aus richtigen Tipps', val: (r: Row) => String(num(r.s.betPts)) }] : []),
    games,
  ];
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Ein Spiel als eigener Abschnitt in seiner Farbe. Die Krone gibt es nur beim Spiel, das gerade gewählt ist. */
function section(v: View, g: GameKind, rows: Row[], played: number): string {
  const name = `<span class="lbg st-display g-${g}">${GAME_NAME[g]}</span>`;
  const count = played
    ? `<span class="lbn"><span class="st-num">${played}</span> ${played === 1 ? 'Partie' : 'Partien'}</span>`
    : '';
  const head = `<div class="lbh">${name}${count}</div>`;
  if (!played)
    return `<section class="lbs g-${g}">${head}<p class="lbnone">Noch keine Partie ${GAME_NAME[g]} fertig.</p></section>`;
  const sh = placesGame(g);
  const lost = (r: Row) => loserCount(g, r.p);
  rows.sort((a, b) =>
    sh
      ? b.s.wins - a.s.wins || lost(a) - lost(b) || avgPlace(a) - avgPlace(b)
      : b.s.wins - a.s.wins || num(a.s.coasters) - num(b.s.coasters) || num(b.s.hot) - num(a.s.hot),
  );
  // Tipp-Punkte als eigene Spalte, sobald bei Shithead oder Durak jemand getippt hat
  const tips = sh && g !== 'cabo' && rows.some((r) => num(r.s.bets) > 0);
  const cols = columns(g, tips);
  const ths = cols
    .map((c) => `<span class="lbc" role="columnheader" title="${esc(c.full)}">${esc(c.h)}</span>`)
    .join('');
  const body = rows
    .map((r, i) => {
      const me = r.p.id === App.me;
      const rank =
        i < 3 && r.s.games
          ? `<span class="sr">${i + 1}.</span><span class="lbm" aria-hidden="true">${MEDALS[i]}</span>`
          : `${i + 1}.`;
      const mark = g === v.game ? reignHTML(v, r.p.id) : '';
      const who = `${mark}<span class="lbname">${esc(me ? 'Du' : r.p.name)}</span>${r.p.bot ? '<i class="botb">KI</i>' : ''}`;
      const cells = cols.map((c) => `<span class="lbv" role="cell" title="${esc(c.full)}">${c.val(r)}</span>`).join('');
      return (
        `<div class="lbr${me ? ' mine' : ''}${i === 0 && r.s.wins ? ' top' : ''}" role="row">` +
        `<span class="lbp" role="cell">${rank}</span><span class="lbw" role="rowheader">${who}</span>${cells}</div>`
      );
    })
    .join('');
  return (
    `<section class="lbs g-${g}">${head}` +
    `<div class="lbt c${cols.length}" role="table" aria-label="Bestenliste ${GAME_NAME[g]}">` +
    `<div class="lbr lbhead" role="row"><span class="lbp" role="columnheader"><span class="sr">Platz</span></span>` +
    `<span class="lbw" role="columnheader"><span class="sr">Name</span></span>${ths}</div>${body}</div></section>`
  );
}

export function boardHTML(v: View): string {
  const rowsOf = (g: GameKind): Row[] => v.players.map((p) => ({ p, s: p.stats?.[g] ?? { games: 0, wins: 0 } }));
  // Wie viele Partien hier fertig sind: Jede Partie zählt bei allen, die mitgespielt haben, also das Maximum
  const playedOf = (g: GameKind): number => Math.max(0, ...rowsOf(g).map((r) => num(r.s.games)));
  const order = [v.game, ...GAMES.filter((g) => g !== v.game && playedOf(g) > 0)];
  const any = order.some((g) => playedOf(g) > 0);
  const body = any
    ? '<p class="lead">Zählt alle fertigen Partien, seit dieser Tisch offen ist.</p>' +
      order.map((g) => section(v, g, rowsOf(g), playedOf(g))).join('')
    : '<div class="lbempty"><span class="lbcup st-r4" aria-hidden="true">🏆</span>' +
      '<p class="lbbig st-display">Noch blitzeblank.</p>' +
      '<p>Noch keine Partie fertig, also darf hier noch keiner angeben. Nach der ersten steht fest, wer prahlen darf und wer sich was anhören muss.</p></div>';
  return sheetHTML({ kind: `board g-${v.game}`, title: 'Bestenliste', body });
}
