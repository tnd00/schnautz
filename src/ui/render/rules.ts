import { DEFAULT_RULES, SH_WIN_MS } from '../../game/constants';
import type { GameKind, Rules, ShRules } from '../../game/types';
import { App } from '../app';
import { num } from '../dom';
import { legendGrid, legendTitle } from './legend';
import { GAME_NAME, GAMES, unreachable } from '../../game/games';

/* ---------- Regeln ---------- */
const p = (t: string) => `<p>${t}</p>`;
/** Ein Abschnitt als eigene Karte, damit man beim Überfliegen schnell findet, was man sucht. */
const sec = (title: string, ...ps: string[]) =>
  `<section class="rsec"><h3>${title}</h3>${ps.map(p).join('')}</section>`;

/** Regelfenster, am Tisch nur für das laufende Spiel. Oben die Kurzübersicht der Karten. */
export function rulesHTML(game?: GameKind): string {
  const v = App.view;
  // Am Tisch gibt es nur die Regeln des Spiels, das gerade läuft. Reiter nur auf der Startseite
  const g = v?.game || game || 'schnautz';
  const r: Rules = v ? v.rules : DEFAULT_RULES;
  const tabs =
    '<div class="gamesel">' +
    GAMES.map(
      (x) => `<button data-act="rulestab" data-g="${x}" class="${g === x ? 'on' : ''}">${GAME_NAME[x]}</button>`,
    ).join('') +
    '</div>';
  const glance = `<section class="rsec glance"><h3>${legendTitle(g)} auf einen Blick</h3>${legendGrid(g, r)}</section>`;
  return (
    '<div class="modal"><div class="paper sheet rules"><button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    (v ? '' : tabs) +
    rulesOf(g, r, glance) +
    (r.turnSecs
      ? sec(
          'Zeitlimit',
          `Jeder Zug hat ${r.turnSecs} Sekunden, die Tauschrunde ${r.turnSecs * 2}. Läuft die Zeit ab, macht die KI einen Zug für dich, danach spielst du ganz normal weiter. Solange Karten fliegen oder 4er reinkommen, steht die Uhr.`,
        )
      : '') +
    '</div></div>'
  );
}

function rulesOf(g: GameKind, r: Rules, glance: string): string {
  switch (g) {
    case 'shithead':
      return rulesSh(r.sh || DEFAULT_RULES.sh, glance);
    case 'schnautz':
      return rulesSchnautz(r, glance);
    default:
      return unreachable(g);
  }
}

function rulesSh(R: ShRules, glance: string): string {
  const sp: string[] = [];
  if (R.two) sp.push('Die 2 geht immer. Danach ist wieder alles erlaubt.');
  if (R.three) sp.push('Die 3 ist durchsichtig. Sie geht immer und für den Nächsten zählt die Karte darunter.');
  if (R.seven) sp.push('Nach einer 7 muss der Nächste 7 oder niedriger legen.');
  if (R.eight) sp.push('Jede 8 lässt einen Spieler aussetzen.');
  if (R.ten) sp.push('Die 10 geht immer und verbrennt den Stapel. Wer sie legt, ist gleich nochmal dran.');
  sp.push(
    'Vier gleiche Karten hintereinander sind eine Bombe und verbrennen den Stapel ebenfalls. Wer die vierte legt, ist gleich nochmal dran.',
  );
  return (
    '<h2>So geht <span class="r">Shithead</span></h2><p class="lead">Auch bekannt als Palace oder Karma. Gespielt wird mit 52 Karten, ab 6 Leuten mit zwei Decks. Das Ass ist am höchsten.</p>' +
    glance +
    sec('Worum es geht', 'Werde alle deine Karten los. Wer am Ende als Letzter noch Karten hat, ist der Shithead.') +
    sec(
      'Aufbau',
      'Jeder bekommt drei verdeckte Karten, darauf drei offene und dazu drei auf die Hand. Vor dem Start darfst du Handkarten mit deinen offenen Tischkarten tauschen.',
    ) +
    sec(
      'Ablauf',
      'Wer die niedrigste Handkarte hat, fängt an. Sonderkarten zählen dabei nicht. Du legst eine oder mehrere Karten mit gleichem Wert auf den Stapel. Sie müssen gleich hoch oder höher sein als die oberste Karte. Danach ziehst du wieder auf drei Handkarten nach, solange der Nachziehstapel reicht.',
      'Kannst oder willst du nicht legen, nimmst du den ganzen Stapel auf.',
    ) +
    sec(
      'Tischkarten',
      'Sind Nachziehstapel und Hand leer, spielst du deine offenen Tischkarten. Danach kommen die verdeckten, blind und eine nach der anderen. Passt die aufgedeckte Karte nicht, nimmst du den Stapel samt dieser Karte auf.',
    ) +
    sec('Sonderkarten', ...sp) +
    (R.four
      ? sec(
          '4er reinwerfen',
          'Immer wenn ein neuer Stapel beginnt, also am Anfang, nach einer 10, nach einer Bombe und nach dem Aufnehmen, dürfen alle ihre 4er per Knopf reinwerfen, auch die Person am Zug. An der Reihenfolge ändert das nichts.',
          'Wer dran ist, wartet höchstens ' +
            Math.round(SH_WIN_MS / 1000) +
            ' Sekunden und darf in der Zeit selbst schon reinwerfen. Danach spielt sie ganz normal, mit ihrer ersten Karte ist das Fenster zu. Reinwerfen ist freiwillig, du kannst deine 4 auch einfach im eigenen Zug legen. Wer die vierte 4 reinwirft, macht eine Bombe und ist dran.',
        )
      : '') +
    (R.cut
      ? sec(
          'Einwerfen',
          'Liegen oben schon gleiche Karten und du hast genau die fehlenden zu vier gleichen, darfst du sie jederzeit als Bombe reinwerfen, auch wenn du nicht dran bist. Der Stapel verbrennt und du bist als Nächstes dran. Wer zuerst drückt, gewinnt das Rennen.',
        )
      : '') +
    sec(
      'Tippen',
      'Wer fertig ist, tippt einmal pro Partie, wer Shithead wird. Ein Treffer bringt so viele Punkte, wie beim Tippen noch Leute im Rennen sind, weniger einen. Früh lohnt sich also. Die Punkte stehen in der Bestenliste.',
    ) +
    sec(
      'Revanche',
      'Der Shithead kann im Ergebnisfenster Revanche gegen den Sieger fordern. Das zählt als bereit, der Sieger muss annehmen. In der nächsten Partie gewinnt das Duell, wer den besseren Platz holt.',
    )
  );
}

function rulesSchnautz(r: Rules, glance: string): string {
  return (
    '<h2>So geht <span class="r">Schnautz</span></h2><p class="lead">Auch bekannt als Schwimmen, 31 oder Knack.</p>' +
    glance +
    sec(
      'Worum es geht',
      'Jeder hat drei Karten. Gezählt werden nur Karten derselben Farbe. Das Höchste ist 31. Wer am Ende einer Runde am wenigsten hat, verliert einen Bierdeckel.',
    ) +
    sec(
      'Kartenwerte',
      'Das Ass zählt 11. König, Dame, Bube und Zehn zählen 10. Neun, Acht und Sieben zählen so viel, wie draufsteht.',
      'Drei gleiche Karten (etwa drei Buben) zählen 30,5.' + (r.feuer ? ' Drei Asse sind Feuer und zählen 33.' : ''),
    ) +
    sec(
      'Ablauf',
      r.dealerChoice
        ? 'Wer gibt, bekommt ein zweites Blatt. Nach einem Blick auf das erste Blatt entscheidet der Geber, ob er es behält oder blind das zweite nimmt. Das übrige Blatt kommt offen in die Mitte.'
        : 'Jeder bekommt drei Karten, drei weitere liegen offen in der Mitte.',
      'Wer die letzte Runde verloren hat, fängt an. Das gilt auch für die erste Runde der nächsten Partie. Wer dran ist, tauscht eine Karte mit der Mitte, tauscht alle drei, schiebt oder klopft. Schieben alle nacheinander, kommen drei neue Karten in die Mitte.',
    ) +
    sec(
      'Klopfen',
      'Wer mit dem eigenen Blatt zufrieden ist, klopft. Alle anderen haben danach noch genau einen Zug. Dann wird aufgedeckt.' +
        (r.knockFirst ? '' : ' Klopfen geht erst, wenn jeder einmal dran war.') +
        (r.knockDouble ? ' Wer klopft und am Ende am wenigsten hat, verliert zwei Bierdeckel.' : ''),
    ) +
    sec(
      'Schnautz' + (r.feuer ? ' und Feuer' : ''),
      'Wer 31 auf der Hand hat, deckt sofort auf und die Runde ist vorbei. Das Spiel merkt das automatisch.' +
        (r.feuer ? ' Bei Feuer verlieren alle anderen einen Bierdeckel.' : ''),
    ) +
    sec(
      'Leben und Schwimmen',
      'Jeder startet mit ' +
        num(r.lives) +
        ' Leben, hier als Bierdeckel. Wer den letzten verliert, schwimmt und darf weiterspielen. Wer schwimmend noch einmal verliert, ist raus. Wer als Letzter übrig bleibt, gewinnt.',
      'Haben alle gleich viel, verliert niemand. Bei Gleichstand am unteren Ende verlieren alle mit dem niedrigsten Wert.',
    ) +
    sec(
      'Revanche',
      'Wer in der letzten Runde rausgeflogen ist, kann im Ergebnisfenster Revanche gegen den Sieger fordern. Das zählt als bereit, der Sieger muss annehmen. In der nächsten Partie gewinnt das Duell, wer länger durchhält.',
    )
  );
}
