import { DEFAULT_RULES, SH_WIN_MS } from '../../game/constants';
import type { GameKind, Rules, ShRules } from '../../game/types';
import { App } from '../app';
import { num } from '../dom';

/* ---------- Regeln ---------- */
const p = (t: string) => `<p>${t}</p>`;

/** Regelfenster mit Reitern für beide Spiele, passend zu den Regeln am Tisch. */
export function rulesHTML(game?: GameKind): string {
  const v = App.view;
  const g = game || v?.game || 'schnautz';
  const r: Rules = v ? v.rules : DEFAULT_RULES;
  const tabs =
    '<div class="gamesel light">' +
    ['schnautz', 'shithead']
      .map((x) => {
        return (
          '<button data-act="rulestab" data-g="' +
          x +
          '" class="' +
          (g === x ? 'on' : '') +
          '">' +
          (x === 'shithead' ? 'Shithead' : 'Schnautz') +
          '</button>'
        );
      })
      .join('') +
    '</div>';
  return (
    '<div class="modal"><div class="paper"><button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    tabs +
    (g === 'shithead' ? rulesSh(r.sh || DEFAULT_RULES.sh) : rulesSchnautz(r)) +
    '</div></div>'
  );
}

function rulesSh(R: ShRules): string {
  const sp: string[] = [];
  if (R.two) sp.push('Die 2 geht immer. Danach ist wieder alles erlaubt.');
  if (R.three) sp.push('Die 3 ist durchsichtig. Sie geht immer und für den Nächsten zählt die Karte darunter.');
  if (R.seven) sp.push('Nach einer 7 muss der Nächste 7 oder niedriger legen.');
  if (R.eight) sp.push('Jede 8 lässt einen Spieler aussetzen.');
  if (R.ten) sp.push('Die 10 geht immer und verbrennt den Stapel. Wer sie legt, ist gleich nochmal dran.');
  sp.push(
    'Vier gleiche Karten hintereinander verbrennen den Stapel ebenfalls. Wer die vierte legt, ist gleich nochmal dran.',
  );
  return (
    '<h2>So geht <span class="r">Shithead</span></h2><p class="lead">Auch bekannt als Palace oder Karma. Gespielt wird mit 52 Karten, das Ass ist am höchsten.</p>' +
    '<h3>Worum es geht</h3>' +
    p('Werde alle deine Karten los. Wer am Ende als Letzter noch Karten hat, ist der Shithead.') +
    '<h3>Aufbau</h3>' +
    p(
      'Jeder bekommt drei verdeckte Karten, darauf drei offene und dazu drei auf die Hand. Vor dem Start darfst du Handkarten mit deinen offenen Tischkarten tauschen.',
    ) +
    '<h3>Ablauf</h3>' +
    (R.four
      ? p(
          'Wer eine 4 auf der Hand hat, fängt an und legt sie sofort. Alle anderen haben dann ' +
            Math.round(SH_WIN_MS / 1000) +
            ' Sekunden, um ihre 4er per Knopfdruck reinzuwerfen. Wer zu langsam ist, behält sie erst mal. Hat niemand eine 4, fängt die niedrigste Handkarte an.',
        )
      : '') +
    p(
      (R.four
        ? 'Danach geht es reihum. '
        : 'Wer die niedrigste Handkarte hat, fängt an. Sonderkarten zählen dabei nicht. ') +
        'Du legst eine oder mehrere Karten mit gleichem Wert auf den Stapel. Sie müssen gleich hoch oder höher sein als die oberste Karte. Danach ziehst du wieder auf drei Handkarten nach, solange der Nachziehstapel reicht.',
    ) +
    p('Kannst oder willst du nicht legen, nimmst du den ganzen Stapel auf.') +
    '<h3>Tischkarten</h3>' +
    p(
      'Sind Nachziehstapel und Hand leer, spielst du deine offenen Tischkarten. Danach kommen die verdeckten, blind und eine nach der anderen. Passt die aufgedeckte Karte nicht, nimmst du den Stapel samt dieser Karte auf.',
    ) +
    '<h3>Sonderkarten</h3>' +
    sp.map(p).join('') +
    (R.cut
      ? '<h3>Einwerfen</h3>' +
        p(
          'Liegen oben schon gleiche Karten und du hast genau die fehlenden zu vier gleichen, darfst du sie jederzeit reinwerfen, auch wenn du nicht dran bist. Der Stapel verbrennt und du bist als Nächstes dran. Wer zuerst drückt, gewinnt das Rennen.',
        )
      : '')
  );
}

function rulesSchnautz(r: Rules): string {
  return (
    '<h2>So geht <span class="r">Schnautz</span></h2><p class="lead">Auch bekannt als Schwimmen, 31 oder Knack.</p>' +
    '<h3>Worum es geht</h3>' +
    p(
      'Jeder hat drei Karten. Gezählt werden nur Karten derselben Farbe. Das Höchste ist 31. Wer am Ende einer Runde am wenigsten hat, verliert einen Bierdeckel.',
    ) +
    '<h3>Kartenwerte</h3>' +
    p('Das Ass zählt 11. König, Dame, Bube und Zehn zählen 10. Neun, Acht und Sieben zählen so viel, wie draufsteht.') +
    p('Drei gleiche Karten (etwa drei Buben) zählen 30,5.' + (r.feuer ? ' Drei Asse sind Feuer und zählen 33.' : '')) +
    '<h3>Ablauf</h3>' +
    (r.dealerChoice
      ? p(
          'Wer gibt, bekommt ein zweites Blatt. Nach einem Blick auf das erste Blatt entscheidet der Geber, ob er es behält oder blind das zweite nimmt. Das übrige Blatt kommt offen in die Mitte.',
        )
      : p('Jeder bekommt drei Karten, drei weitere liegen offen in der Mitte.')) +
    p(
      'Wer dran ist, tauscht eine Karte mit der Mitte, tauscht alle drei, schiebt oder klopft. Schieben alle nacheinander, kommen drei neue Karten in die Mitte.',
    ) +
    '<h3>Klopfen</h3>' +
    p(
      'Wer mit dem eigenen Blatt zufrieden ist, klopft. Alle anderen haben danach noch genau einen Zug. Dann wird aufgedeckt.' +
        (r.knockFirst ? '' : ' Klopfen geht erst, wenn jeder einmal dran war.') +
        (r.knockDouble ? ' Wer klopft und am Ende am wenigsten hat, verliert zwei Bierdeckel.' : ''),
    ) +
    '<h3>Schnautz' +
    (r.feuer ? ' und Feuer' : '') +
    '</h3>' +
    p(
      'Wer 31 auf der Hand hat, deckt sofort auf und die Runde ist vorbei. Das Spiel merkt das automatisch.' +
        (r.feuer ? ' Bei Feuer verlieren alle anderen einen Bierdeckel.' : ''),
    ) +
    '<h3>Leben und Schwimmen</h3>' +
    p(
      'Jeder startet mit ' +
        num(r.lives) +
        ' Leben, hier als Bierdeckel. Wer den letzten verliert, schwimmt und darf weiterspielen. Wer schwimmend noch einmal verliert, ist raus. Wer als Letzter übrig bleibt, gewinnt.',
    ) +
    p(
      'Haben alle gleich viel, verliert niemand. Bei Gleichstand am unteren Ende verlieren alle mit dem niedrigsten Wert.',
    )
  );
}
