import {
  AUTO_NEXT_MS,
  CB_HAND,
  CB_KAMI,
  CB_PENALTY,
  CB_RESET_AT,
  CB_RESET_TO,
  CB_TARGETS,
  CB_TWO_DECKS,
  DEFAULT_RULES,
  DK_FULL_DECK,
  DK_HAND,
  DK_MAX_ATTACK,
  SH_TWO_DECKS,
  SH_WIN_MS,
} from '../../game/constants';
import type { CbRules, DkRules, GameKind, Rules, ShRules } from '../../game/types';
import { App } from '../app';
import { num } from '../dom';
import { CABO_KING_HTML, zuWord } from '../helpers';
import { legendGrid, legendTitle } from './legend';
import { deviationWords } from './gamesettings';
import { sheetHTML } from '../dialog';
import { GAME_NAME, GAMES, LOSER_MARK, unreachable } from '../../game/games';

/* ---------- Regeln ---------- */
const p = (t: string) => `<p>${t}</p>`;
/** Ein Abschnitt mit eigener Überschrift, damit man beim Überfliegen schnell findet, was man sucht. */
const sec = (title: string, ...ps: string[]) =>
  `<section class="rsec"><h3>${title}</h3>${ps.map(p).join('')}</section>`;

/** Sprungmarken des Fensters, das gerade gebaut wird. Nur Abschnitte, die es mit diesen Regeln wirklich gibt. */
let JUMPS: { id: string; label: string }[] = [];
/** Abschnitt mit Sprungmarke oben im Kopf. `label` ist kurz, die Marken müssen am Handy in eine Zeile passen. */
const jsec = (label: string, title: string, ...ps: string[]) => {
  const id = `rj-${JUMPS.length}`;
  JUMPS.push({ id, label });
  return `<section class="rsec" id="${id}"><h3 tabindex="-1">${title}</h3>${ps.map(p).join('')}</section>`;
};

/** Feste Neigung pro Spiel-Sticker, nie zufällig. */
const TILT: Record<GameKind, string> = { schnautz: 'st-l3', shithead: 'st-r2', durak: 'st-l2', cabo: 'st-r3' };

/**
 * Regelfenster: Reiter für alle Spiele (auch am Tisch), oben die Kurzübersicht der Karten.
 * Ohne Angabe zeigt es das Spiel am Tisch. Am Tisch gelten für jedes Spiel die Regeln aus der Lobby.
 */
export function rulesHTML(game?: GameKind): string {
  const v = App.view;
  const g = game ?? v?.game ?? 'schnautz';
  const r: Rules = v ? v.rules : DEFAULT_RULES;
  const tabs =
    '<div class="rtabs" role="group" aria-label="Spiel">' +
    GAMES.map(
      (x) =>
        `<button type="button" class="rtab g-${x} ${TILT[x]}" data-act="rulestab" data-g="${x}" aria-pressed="${g === x}">` +
        `<span class="rtn">${GAME_NAME[x]}</span>${v?.game === x ? '<span class="rtag">am Tisch</span>' : ''}</button>`,
    ).join('') +
    '</div>';
  // Sonderregeln stehen als eigene Karte direkt unter dem ersten Text, noch vor der Übersicht
  const glance =
    sonderHTML(r, g) +
    `<section class="rsec glance g-${g}"><h3>${legendTitle(g)} auf einen Blick</h3>${legendGrid(g, r)}</section>`;
  JUMPS = [];
  const body = rulesOf(g, r, glance) + (r.turnSecs ? sec('Zeitlimit', timeText(g, r.turnSecs)) : '');
  const jumps = JUMPS.length
    ? '<nav class="rjump" aria-label="Springe zu">' +
      JUMPS.map((j) => `<button type="button" class="rj" data-jump="${j.id}">${j.label}</button>`).join('') +
      '</nav>'
    : '';
  return sheetHTML({ kind: `rules g-${g}`, title: 'Regeln', head: tabs + jumps, body });
}

/** Karte „Sonderregeln“: was am Tisch vom Standard abweicht, als Liste. Leer, wenn nach Standard gespielt wird. */
export function sonderHTML(r: Rules, g: GameKind): string {
  const words = deviationWords(r, g);
  return words.length
    ? `<section class="rsec rsonder g-${g}"><h3>Sonderregeln</h3><ul>` +
        words.map((w) => `<li>${w.charAt(0).toUpperCase()}${w.slice(1)}</li>`).join('') +
        '</ul></section>'
    : '';
}

/**
 * Zeitlimit je Spiel. Doppelte Zeit gibt es nur in der Shithead-Tauschrunde und beim Ansehen zu Beginn jeder
 * Cabo-Runde (src/game/clock.ts), Schnautz und Durak haben nichts davon.
 */
function timeText(g: GameKind, s: number): string {
  const ki = 'Läuft die Zeit ab, spielt die KI einmal für dich, danach spielst du ganz normal weiter.';
  switch (g) {
    case 'durak':
    case 'schnautz':
      return `Jeder Zug hat ${s} Sekunden. ${ki} Solange Karten fliegen, steht die Uhr.`;
    case 'cabo':
      return `Jeder Zug hat ${s} Sekunden, das Ansehen zu Beginn jeder Runde ${s * 2}. ${ki} Solange Karten fliegen, steht die Uhr.`;
    case 'shithead':
      return `Jeder Zug hat ${s} Sekunden, die Tauschrunde ${s * 2}. ${ki} Solange Karten fliegen oder 4er reinkommen, steht die Uhr.`;
    default:
      return unreachable(g);
  }
}

function rulesOf(g: GameKind, r: Rules, glance: string): string {
  switch (g) {
    case 'shithead':
      return rulesSh(r.sh || DEFAULT_RULES.sh, glance);
    case 'durak':
      return rulesDurak(r.dk ?? DEFAULT_RULES.dk, glance);
    case 'schnautz':
      return rulesSchnautz(r, glance);
    case 'cabo':
      return rulesCabo(r.cb ?? DEFAULT_RULES.cb, glance);
    default:
      return unreachable(g);
  }
}

function rulesSh(R: ShRules, glance: string): string {
  const sp: string[] = [];
  if (R.two) sp.push('Die 2 geht immer. Danach ist wieder alles erlaubt.');
  if (R.three) sp.push('Die 3 ist durchsichtig. Sie geht immer und für den Nächsten zählt die Karte darunter.');
  if (R.seven) sp.push('Nach einer 7 muss der Nächste 7 oder niedriger legen.');
  if (R.eight) sp.push('Jede 8 lässt eine Person aussetzen.');
  if (R.ten) sp.push('Die 10 geht immer und verbrennt den Stapel. Wer sie legt, ist gleich nochmal dran.');
  sp.push(
    'Vier gleiche Karten hintereinander sind eine Bombe und verbrennen den Stapel ebenfalls. Wer die vierte legt, ist gleich nochmal dran.',
  );
  const two = R.deck5 ? SH_TWO_DECKS - 1 : SH_TWO_DECKS;
  return (
    `<p class="lead">Auch bekannt als Palace oder Karma. Gespielt wird mit 52 Karten, ab ${two} Leuten mit zwei Decks. Das Ass ist am höchsten.</p>` +
    glance +
    sec('Worum es geht', 'Werde alle deine Karten los. Wer am Ende als Letzter noch Karten hat, ist der Shithead.') +
    jsec(
      'Aufbau',
      'Aufbau',
      'Jeder bekommt drei verdeckte Karten, darauf drei offene und dazu drei auf die Hand. Vor dem Start darfst du Handkarten mit deinen offenen Tischkarten tauschen.',
    ) +
    jsec(
      'Ablauf',
      'Ablauf',
      'Wer die niedrigste Handkarte hat, fängt an. Sonderkarten zählen dabei nicht. Du legst eine oder mehrere Karten mit gleichem Wert auf den Stapel. Sie müssen gleich hoch oder höher sein als die oberste Karte. Danach ziehst du wieder auf drei Handkarten nach, solange der Nachziehstapel reicht.',
      'Kannst oder willst du nicht legen, nimmst du den ganzen Stapel auf.',
    ) +
    sec(
      'Tischkarten',
      'Sind Nachziehstapel und Hand leer, spielst du deine offenen Tischkarten. Danach kommen die verdeckten, blind und eine nach der anderen. Passt die aufgedeckte Karte nicht, nimmst du den Stapel samt dieser Karte auf.',
    ) +
    jsec('Sonderkarten', 'Sonderkarten', ...sp) +
    (R.four
      ? jsec(
          '4er',
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
          'Liegen oben schon gleiche Karten und du hast genau die fehlenden zu vier gleichen, darfst du sie jederzeit als Bombe einwerfen, auch wenn du nicht dran bist. Der Stapel verbrennt und du bist als Nächstes dran. Wer zuerst drückt, gewinnt das Rennen.',
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

function rulesDurak(R: DkRules, glance: string): string {
  const small = DK_FULL_DECK - 1;
  return (
    `<p class="lead">Durak ist Russisch für Narr. Den Titel will keiner haben. Bis ${zuWord(small)} spielt ihr mit 36 Karten von der 6 bis zum Ass, ab ${DK_FULL_DECK} Leuten mit allen 52. Das Ass ist am höchsten.</p>` +
    glance +
    sec(
      'Worum es geht',
      'Werde alle deine Karten los. Wer zuerst keine mehr hat, holt die Krone. Wer am Ende als Letzter noch Karten hat, ist der Durak.',
    ) +
    jsec(
      'Aufbau',
      'Geben und Trumpf',
      `Jeder bekommt ${DK_HAND} Karten. Die unterste Karte des Stapels liegt offen darunter. Ihre Farbe ist Trumpf für die ganze Partie, gezogen wird sie als letzte.`,
      `Spielen ${small} Leute mit 36 Karten, bleibt kein Stapel übrig. Dann zeigt die zuletzt gegebene Karte den Trumpf und bleibt auf der Hand.`,
    ) +
    jsec(
      'Angriff',
      'Angreifen und nachlegen',
      'Wer angreift, legt eine Karte oder mehrere mit gleichem Wert vor den Verteidiger. Solange der Angriff läuft, dürfen alle außer dem Verteidiger nachlegen. Erlaubt sind nur Werte, die schon auf dem Tisch liegen, egal ob angegriffen oder geschlagen.',
      'Wer nichts mehr nachlegen will, passt. Wer gepasst hat, darf erst wieder nachlegen, wenn durch Schlagen ein neuer Wert auf den Tisch kommt oder der Verteidiger ' +
        (R.transfer ? 'weiterschiebt oder aufnimmt.' : 'aufnimmt.') +
        ' Schlägt er mit einem Wert, der schon liegt, bleibt es beim Passen.',
      `In einen Angriff passen höchstens ${DK_MAX_ATTACK} Karten und nie mehr, als der Verteidiger zu Beginn auf der Hand hatte.`,
    ) +
    jsec(
      'Abwehr',
      'Verteidigen und aufnehmen',
      'Der Verteidiger schlägt jede Angriffskarte einzeln, mit einer höheren Karte derselben Farbe oder mit einem Trumpf. Gegen einen Trumpf hilft nur ein höherer Trumpf.',
      'Kannst oder willst du nicht schlagen, nimmst du alles auf. Die anderen dürfen dir dann noch Karten dazulegen, die du gleich mit einsammelst.',
    ) +
    sec(
      'Bito und nachziehen',
      'Ist alles geschlagen und haben alle anderen gepasst, ist der Angriff abgewehrt. Das heißt Bito. Die Karten kommen auf den Bito-Stapel und sind aus dem Spiel, der Verteidiger greift als Nächstes an. Wer aufgenommen hat, setzt aus, dann greift die Person nach ihm an.',
      `Danach ziehen alle wieder auf ${DK_HAND} Karten nach, solange der Stapel reicht. Zuerst der Angreifer, dann die anderen reihum, der Verteidiger zuletzt.`,
    ) +
    (R.transfer
      ? sec(
          'Weiterschieben',
          'Solange noch nichts geschlagen ist, darf der Verteidiger eine oder mehrere Karten mit demselben Wert dazulegen. Dann muss die nächste Person alles abwehren. Sie braucht dafür mindestens so viele Karten, wie dann auf dem Tisch liegen.',
          'Auch sie darf wieder weiterschieben. Wer angegriffen hat, zieht trotzdem als Erster nach.',
        )
      : sec(
          'Weiterschieben',
          'Weiterschieben ist ein Schalter in der Lobby und normalerweise aus. Ist es an, darf der Verteidiger vor dem ersten Schlag den gleichen Wert dazulegen. Dann muss die nächste Person alles abwehren.',
        )) +
    sec(
      'Wer anfängt',
      'In der ersten Partie greift an, wer den niedrigsten Trumpf hat. Hat niemand einen, entscheidet der Zufall. Danach wird der Durak der letzten Partie zuerst angegriffen, von der Person rechts von ihm. Strafe muss sein.',
    ) +
    jsec(
      'Ende',
      'Ende',
      'Ist der Stapel leer, ist fertig, wer keine Karten mehr hat. Wer als Letzter Karten hält, ist der Durak und trägt den ' +
        LOSER_MARK.durak +
        ', bis die nächste Partie Durak vorbei ist.',
      'Werden die Letzten ihre Karten gleichzeitig los, ist es unentschieden. Dann gibt es keinen Durak und in der nächsten Partie fängt wieder der niedrigste Trumpf an.',
    ) +
    sec(
      'Tippen',
      'Wer fertig ist, tippt einmal pro Partie, wer Durak wird. Ein Treffer bringt so viele Punkte, wie beim Tippen noch Leute im Rennen sind, weniger einen. Früh lohnt sich also. Die Punkte stehen in der Bestenliste.',
    ) +
    sec(
      'Revanche',
      'Der Durak kann im Ergebnisfenster Revanche gegen den Sieger fordern. Das zählt als bereit, der Sieger muss annehmen. In der nächsten Partie gewinnt das Duell, wer den besseren Platz holt.',
    )
  );
}

function rulesCabo(R: CbRules, glance: string): string {
  const targets = CB_TARGETS.join(' oder ');
  return (
    `<p class="lead">Ein Spiel fürs Gedächtnis und für Pokerfaces. Gespielt wird mit 52 Karten, ab ${CB_TWO_DECKS} Leuten mit zwei Decks.</p>` +
    glance +
    sec(
      'Worum es geht',
      'Sammle so wenig Punkte wie möglich. Deine Karten liegen verdeckt vor dir und du siehst sie fast nie. Wer sich merkt, was wo liegt, wird die teuren Karten los.',
    ) +
    sec(
      'Kartenwerte',
      'Das Ass zählt 1, die 2 bis 10 zählen, was draufsteht. Der Bube zählt 11, die Dame 12, der schwarze König 13.',
      'Der rote König zählt 0 und ist die beste Karte im Spiel. Wer einen hat, sollte ihn nicht hergeben.',
    ) +
    jsec(
      'Aufbau',
      'Aufbau',
      `Jeder bekommt ${CB_HAND} verdeckte Karten in einer Reihe, eine Karte liegt offen auf der Ablage. Zu Beginn jeder Runde suchst du dir zwei deiner Karten aus und siehst sie dir an.`,
      'Gezeigt werden sie nur ein paar Sekunden, danach musst du sie dir merken. Mitschreiben gilt nicht.',
    ) +
    jsec(
      'Zug',
      'Dein Zug',
      'Du ziehst vom Stapel oder nimmst die oberste Karte der Ablage. Die Karte tauschst du gegen eine deiner Karten ein, die alte kommt offen auf die Ablage. Eine Karte von der Ablage musst du eintauschen, sie liegt danach offen vor dir.',
      'Du darfst auch mehrere Karten mit gleichem Wert auf einmal gegen die gezogene eintauschen. Dann liegen weniger Karten vor dir. Haben sie nicht alle den gleichen Wert, bleiben sie offen liegen, die gezogene geht auf die Ablage und du bekommst eine Strafkarte.',
      'Eine Karte vom Stapel darfst du auch gleich wieder ablegen. Hat sie eine Fähigkeit, darfst du sie nutzen.',
    ) +
    jsec(
      'Fähigkeiten',
      'Fähigkeiten',
      'Mit einer 7 oder 8 darfst du 👁️ ansehen. Du schaust dir eine eigene Karte an.',
      'Mit einer 9 oder 10 darfst du 🔍 spionieren. Du schaust dir eine Karte von jemand anderem an.',
      'Mit Bube oder Dame gibt es einen 🔀 Blindtausch. Du tauschst eine deiner Karten gegen eine fremde, angesehen wird dabei keine der beiden. Kanntest du deine Karte, weißt du danach, was jetzt drüben liegt.',
      'Das geht nur mit Karten, die du vom Stapel ziehst und gleich ablegst. Du darfst die Fähigkeit auch verfallen lassen.',
    ) +
    sec(
      'Cabo rufen',
      'Glaubst du, dass du am wenigsten hast, rufst du statt zu ziehen Cabo. Alle anderen sind dann noch genau einmal dran, danach wird aufgedeckt.',
      'Ist der Stapel leer, endet die Runde auch ohne Cabo.',
    ) +
    jsec(
      'Wertung',
      'Wertung',
      `Am Ende zählt die Summe deiner Karten. Wer Cabo ruft und am wenigsten hat, bekommt 0 Punkte. Gleichstand reicht dafür. Hat jemand weniger, gibt es die eigene Summe und ${CB_PENALTY} Strafpunkte obendrauf. Großes Maul, große Strafe.`,
      `Liegen bei jemandem genau zwei Damen und zwei schwarze Könige und sonst nichts, ist das Kamikaze. Alle anderen bekommen ${CB_KAMI} Punkte, die Person selbst 0. Das schlägt jeden Cabo-Ruf.`,
      `Wer genau auf ${CB_RESET_AT} Punkte kommt, fällt auf ${CB_RESET_TO} zurück. Das klappt einmal pro Partie.`,
    ) +
    sec(
      'Nächste Runde',
      `Sind alle bereit oder sind ${Math.round(AUTO_NEXT_MS / 1000)} Sekunden um, geht es von selbst weiter. In der ersten Runde entscheidet der Zufall, wer anfängt. Danach fängt an, wer in der letzten Runde die wenigsten Punkte bekommen hat.`,
    ) +
    sec(
      'Ende',
      `Kommt jemand über ${R.target} Punkte, ist die Partie vorbei. Wer dann die wenigsten Punkte hat, gewinnt und wird ${CABO_KING_HTML}. Die Krone bleibt, bis jemand anderes eine Partie Cabo gewinnt.`,
      `Bei Gleichstand entscheidet die letzte Runde. Ist auch die gleich, gibt es keinen Sieger und die Krone bleibt, wo sie ist. Die Zielpunkte (${targets}) stellt der Gastgeber in der Lobby ein.`,
    ) +
    (R.snap
      ? sec(
          'Schnappen',
          'Liegt oben auf der Ablage eine Karte und du hast eine mit dem gleichen Wert, darfst du sie während der Runde jederzeit draufwerfen, auch wenn du nicht dran bist. Dann liegt eine Karte weniger vor dir.',
          'Liegst du daneben, bleibt deine Karte offen liegen und du bekommst eine Strafkarte. Also erst denken, dann schnappen.',
        )
      : sec(
          'Schnappen',
          'Schnappen ist ein Schalter in der Lobby und normalerweise aus. Ist es an, darf jeder eine Karte mit dem gleichen Wert wie oben auf der Ablage jederzeit draufwerfen, auch außer der Reihe. Daneben kostet eine Strafkarte.',
        )) +
    sec(
      'Die KI',
      'Die KI schummelt nicht und vergisst auch mal was. Je länger sie eine Karte nicht gesehen hat, desto eher ist die Karte vergessen. Manchmal merkt sie sich sogar einen falschen Wert. Genau wie ihr nach dem dritten Bier.',
    ) +
    sec(
      'Revanche',
      `Wer am Ende die meisten Punkte hat, kann im Ergebnisfenster Revanche gegen den ${CABO_KING_HTML} fordern. Das zählt als bereit, der König muss annehmen. In der nächsten Partie gewinnt das Duell, wer weniger Punkte holt.`,
    )
  );
}

function rulesSchnautz(r: Rules, glance: string): string {
  return (
    '<p class="lead">Auch bekannt als Schwimmen, 31 oder Knack.</p>' +
    glance +
    sec(
      'Worum es geht',
      'Jeder hat drei Karten. Gezählt werden nur Karten derselben Farbe. Das Höchste ist 31. Wer am Ende einer Runde am wenigsten hat, verliert ein Leben.',
    ) +
    jsec(
      'Werte',
      'Kartenwerte',
      'Das Ass zählt 11. König, Dame, Bube und Zehn zählen 10. Neun, Acht und Sieben zählen so viel, wie draufsteht.',
      'Drei gleiche Karten (etwa drei Buben) zählen 30,5.' + (r.feuer ? ' Drei Asse sind Feuer und zählen 33.' : ''),
    ) +
    jsec(
      'Ablauf',
      'Ablauf',
      r.dealerChoice
        ? 'Wer gibt, bekommt ein zweites Blatt. Nach einem Blick auf das erste Blatt entscheidet der Geber, ob er es behält oder blind das zweite nimmt. Das übrige Blatt kommt offen in die Mitte.'
        : 'Jeder bekommt drei Karten, drei weitere liegen offen in der Mitte.',
      'Wer die letzte Runde verloren hat, fängt an. Das gilt auch für die erste Runde der nächsten Partie. Wer dran ist, tauscht eine Karte mit der Mitte, tauscht alle drei, schiebt oder klopft. Schieben alle nacheinander, kommen drei neue Karten in die Mitte.',
    ) +
    jsec(
      'Klopfen',
      'Klopfen',
      'Wer mit dem eigenen Blatt zufrieden ist, klopft. Alle anderen haben danach noch genau einen Zug. Dann wird aufgedeckt.' +
        (r.knockFirst ? '' : ' Klopfen geht erst, wenn jeder einmal dran war.') +
        (r.knockDouble ? ' Wer klopft und am Ende am wenigsten hat, verliert zwei Leben.' : ''),
    ) +
    sec(
      'Schnautz' + (r.feuer ? ' und Feuer' : ''),
      'Wer 31 auf der Hand hat, deckt sofort auf und die Runde ist vorbei. Das Spiel merkt das automatisch.' +
        (r.feuer ? ' Bei Feuer verlieren alle anderen ein Leben.' : ''),
    ) +
    jsec(
      'Ende',
      'Leben und Schwimmen',
      'Jeder startet mit ' +
        num(r.lives) +
        ' Leben. Wer das letzte verliert, schwimmt und darf weiterspielen. Wer schwimmend noch einmal verliert, ist raus. Wer als Letzter übrig bleibt, gewinnt.',
      'Haben alle gleich viel, verliert niemand. Bei Gleichstand am unteren Ende verlieren alle mit dem niedrigsten Wert.',
    ) +
    sec(
      'Revanche',
      'Wer in der letzten Runde rausgeflogen ist, kann im Ergebnisfenster Revanche gegen den Sieger fordern. Das zählt als bereit, der Sieger muss annehmen. In der nächsten Partie gewinnt das Duell, wer länger durchhält.',
    )
  );
}
