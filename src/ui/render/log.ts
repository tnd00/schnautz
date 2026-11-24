import type { LogEntry, View } from '../../game/types';
import { App } from '../app';
import { cardChip } from '../cards';
import { $, esc, num } from '../dom';
import { W, nameOf, vb } from '../helpers';
import { SEQ } from '../shithead/sequence';
import { rematchLog } from './rematch';
import { ZER } from '../ceremony';
import { GAME_NAME, LOSER_MARK, isGame } from '../../game/games';
import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO } from '../../game/constants';

/** Cabo: Zahlwort für mehrere gleiche Karten auf einmal */
const NUM_WORD: Readonly<Record<number, string>> = { 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs' };
/** Cabo: was die abgelegte Karte erlaubt, nach "darf" */
const CB_POWER: Readonly<Record<'peek' | 'spy' | 'swap', string>> = {
  peek: 'eine eigene Karte ansehen',
  spy: 'bei jemand anderem spicken',
  swap: 'blind tauschen',
};

/** Eine Zeile im Verlauf: CSS-Klasse und HTML (Namen und Texte sind escaped). */
export function logLine(v: View, e: LogEntry): [cls: string, html: string] | null {
  const p = e.p;
  const who = () => W(v, p, e.name);
  /** Name in der Objektrolle: aus "Du" wird "dich" */
  const whom = (id: string | null | undefined, fallback?: string) => (id === App.me ? 'dich' : W(v, id, fallback));
  const chips = (cards: unknown) => (Array.isArray(cards) ? cards.map(cardChip).join(' ') : '');
  const cards = (n: number) => num(n) + (num(n) === 1 ? ' Karte' : ' Karten');
  /** Name nach "mit" oder "von": aus "Du" wird "dir" */
  const toWhom = (id: string | null | undefined, fallback?: string) => (id === App.me ? 'dir' : W(v, id, fallback));
  switch (e.k) {
    case 'join':
      return ['sys', who() + (e.bot ? ' (KI) setzt sich an den Tisch.' : ' sitzt jetzt mit am Tisch.')];
    case 'quit':
      return [
        'big',
        who() + vb(p, ' hast den Tisch verlassen und bist raus.', ' hat den Tisch verlassen und ist raus.'),
      ];
    case 'leave':
      return ['sys', '<b>' + esc(e.name || 'Jemand') + '</b> ist gegangen.'];
    case 'takeover':
      return [
        'big',
        who() + vb(p, ' übernimmst', ' übernimmt') + ' den Platz von <b>' + esc(e.from) + '</b> samt Karten.',
      ];
    case 'tobot':
      return ['big', who() + ' ist gegangen. Ab jetzt spielt die KI für ' + who() + ' weiter.'];
    case 'timeout':
      return ['big', '⏱ Zeit um! Für ' + (p === App.me ? 'dich' : who()) + ' zieht jetzt die KI.'];
    case 'back':
      return ['big', who() + vb(p, ' bist zurück und spielst wieder selbst.', ' ist zurück und spielt wieder selbst.')];
    case 'game':
      return [
        'round',
        'Partie ' + num(e.g) + ' beginnt' + (isGame(e.game) && e.game !== 'schnautz' ? ' · ' + GAME_NAME[e.game] : ''),
      ];
    case 'shdeal':
      return ['sys', 'Die Karten sind verteilt. Vor dem Start darf jeder Hand- und Tischkarten tauschen.'];
    case 'shstart':
      return [
        '',
        who() + vb(p, ' fängst an', ' fängt an') + (e.card ? ' (niedrigste Karte ' + cardChip(e.card) + ').' : '.'),
      ];
    case 'shplay':
      return [
        '',
        who() +
          vb(p, ' legst ', ' legt ') +
          (e.cards || []).map(cardChip).join(' ') +
          (e.src === 'up' ? ' vom Tisch' : e.src === 'down' ? ' blind' : '') +
          '.',
      ];
    case 'shburn':
      return ['big', (e.four ? 'Bombe! ' : '') + who() + vb(p, ' verbrennst den Stapel.', ' verbrennt den Stapel.')];
    case 'shpickup':
      return [
        '',
        who() +
          vb(p, ' nimmst den Stapel auf (', ' nimmt den Stapel auf (') +
          num(e.cnt) +
          (num(e.cnt) === 1 ? ' Karte).' : ' Karten).'),
      ];
    case 'shblindfail':
      return [
        '',
        who() +
          vb(p, ' deckst blind ', ' deckt blind ') +
          cardChip(e.card) +
          ' auf. Die passt nicht. ' +
          esc(vb(p, 'Du nimmst ', nameOf(v, p, e.name) + ' nimmt ')) +
          num(e.cnt) +
          (num(e.cnt) === 1 ? ' Karte auf.' : ' Karten auf.'),
      ];
    case 'shdone':
      return ['big', who() + vb(p, ' bist fertig! Platz ', ' ist fertig! Platz ') + num(e.place) + '.'];
    case 'shthrow':
      return [
        '',
        who() +
          vb(p, ' wirfst ', ' wirft ') +
          (e.cards || []).map(cardChip).join(' ') +
          (e.src === 'up' ? ' vom Tisch' : '') +
          ' rein.',
      ];
    case 'shbomb':
      return [
        'big',
        '💣 ' +
          who() +
          vb(p, ' wirfst ', ' wirft ') +
          (e.cards || []).map(cardChip).join(' ') +
          (e.out ? ' außer der Reihe' : '') +
          ' zur Bombe ein.',
      ];
    case 'emote':
      return null;
    case 'rematch':
    case 'rematchend': {
      const t = rematchLog(v, e);
      return t ? ['big', t] : null;
    }
    case 'shend':
      return [
        'big',
        e.p
          ? LOSER_MARK.shithead + ' ' + who() + vb(p, ' bist der Shithead!', ' ist der Shithead!')
          : 'Die Partie ist vorbei.',
      ];
    case 'dkdeal':
      return e.prev
        ? [
            'big',
            'Trumpf ist ' +
              cardChip(e.trump) +
              '. ' +
              LOSER_MARK.durak +
              ' ' +
              W(v, e.def) +
              vb(e.def, ' warst letztes Mal der Durak und kriegst ', ' war letztes Mal der Durak und kriegt ') +
              'als Erstes eins drauf. ' +
              W(v, e.att) +
              vb(e.att, ' greifst an.', ' greift an.'),
          ]
        : [
            '',
            'Trumpf ist ' +
              cardChip(e.trump) +
              '. ' +
              W(v, e.att) +
              vb(e.att, ' greifst ', ' greift ') +
              whom(e.def) +
              ' als Erstes an.',
          ];
    case 'dkattack':
      return [
        '',
        who() +
          (e.lead
            ? vb(p, ' greifst mit ', ' greift mit ') + chips(e.cards) + ' an.'
            : vb(p, ' legst ', ' legt ') + chips(e.cards) + ' nach.'),
      ];
    case 'dkdefend':
      return ['', who() + vb(p, ' schlägst ', ' schlägt ') + cardChip(e.a) + ' mit ' + cardChip(e.d) + '.'];
    case 'dktransfer':
      return ['', who() + vb(p, ' schiebst ', ' schiebt ') + chips(e.cards) + ' weiter an ' + whom(e.to, e.tn) + '.'];
    case 'dktake':
      return [
        '',
        who() +
          vb(
            p,
            ' gibst auf und nimmst alles. Die anderen dürfen dir noch was dazulegen.',
            ' gibt auf und nimmt alles. Jetzt noch schnell nachlegen!',
          ),
      ];
    case 'dkpass':
      return null;
    case 'dkbito':
      return [
        '',
        'Bito! ' +
          who() +
          vb(p, ' wehrst alles ab, ', ' wehrt alles ab, ') +
          cards(e.cnt) +
          (num(e.cnt) === 1 ? ' ist weg.' : ' sind weg.'),
      ];
    case 'dkpickup':
      return [
        '',
        who() + vb(p, ' nimmst ', ' nimmt ') + cards(e.cnt) + ' auf.' + (num(e.cnt) >= 8 ? ' Schöner Fächer.' : ''),
      ];
    case 'dkout':
      return [
        'big',
        who() + vb(p, ' hast keine Karten mehr! Platz ', ' hat keine Karten mehr! Platz ') + num(e.place) + '.',
      ];
    case 'dkend':
      return [
        'big',
        e.p
          ? LOSER_MARK.durak + ' ' + who() + vb(p, ' bist der Durak!', ' ist der Durak!')
          : 'Unentschieden! Die Letzten sind gleichzeitig raus, einen Durak gibt es diesmal nicht.',
      ];
    case 'cbdeal':
      return ['round', 'Runde ' + num(e.r) + ' · ' + esc(nameOf(v, e.start)) + vb(e.start, ' fängst an', ' fängt an')];
    case 'cblook':
    case 'cbskip':
      return null;
    case 'cbdraw':
      return e.from === 'pile'
        ? ['', who() + vb(p, ' nimmst ', ' nimmt ') + cardChip(e.c) + ' von der Ablage.']
        : ['', who() + vb(p, ' ziehst vom Stapel.', ' zieht vom Stapel.')];
    case 'cbswap': {
      const n = num(e.slots);
      if (!e.ok)
        return [
          'big',
          who() +
            vb(p, ' willst ', ' will ') +
            chips(e.out) +
            ' zusammen loswerden. Daneben! Die Karten liegen jetzt offen' +
            (e.pen ? vb(p, ', dazu kriegst du eine Strafkarte.', ', dazu gibt es eine Strafkarte.') : '.'),
        ];
      if (n > 1)
        return [
          '',
          who() +
            vb(p, ' wirfst ', ' wirft ') +
            (NUM_WORD[n] ?? String(n)) +
            ' gleiche auf einmal ab (' +
            chips(e.out) +
            ').',
        ];
      return ['', who() + vb(p, ' tauschst und wirfst ', ' tauscht und wirft ') + chips(e.out) + ' ab.'];
    }
    case 'cbdiscard':
      return [
        '',
        who() +
          vb(p, ' legst ', ' legt ') +
          cardChip(e.c) +
          ' ab' +
          (e.power ? vb(p, ' und darfst ', ' und darf ') + CB_POWER[e.power] : '') +
          '.',
      ];
    case 'cbpeek':
      return ['', who() + vb(p, ' schaust dir eine eigene Karte an.', ' schaut sich eine eigene Karte an.')];
    case 'cbspy':
      return ['', '👀 ' + who() + vb(p, ' spionierst ', ' spioniert ') + whom(e.to, e.tn) + ' aus.'];
    case 'cbblind':
      return [
        '',
        who() +
          vb(p, ' tauschst blind eine Karte mit ', ' tauscht blind eine Karte mit ') +
          toWhom(e.to, e.tn) +
          (e.to === App.me ? '. Hoffentlich war es nicht dein roter König.' : '.'),
      ];
    case 'cbcabo':
      return [
        'big',
        '📣 ' +
          who() +
          vb(p, ' rufst CABO! Alle anderen haben noch einen Zug.', ' ruft CABO! Alle anderen haben noch einen Zug.'),
      ];
    case 'cbsnap':
      return e.ok
        ? ['', '⚡ ' + who() + vb(p, ' schnappst ', ' schnappt ') + cardChip(e.c) + ' auf die Ablage.']
        : [
            'big',
            who() +
              vb(p, ' schnappst mit ', ' schnappt mit ') +
              cardChip(e.c) +
              ' daneben. Zu gierig! Die Karte bleibt offen liegen, dazu gibt es eine Strafkarte.',
          ];
    case 'cbround': {
      const c = e.caller;
      let head: string;
      if (e.kami)
        head =
          '💥 Kamikaze! ' +
          W(v, e.kami) +
          vb(e.kami, ' hast', ' hat') +
          ' zwei Damen und zwei schwarze Könige, alle anderen kassieren ' +
          CB_KAMI +
          '.';
      else if (c && e.ok === true)
        head = W(v, c) + vb(c, ' hattest mit Cabo recht, 0 Punkte.', ' hatte mit Cabo recht, 0 Punkte.');
      else if (c && e.ok === false)
        head =
          W(v, c) +
          vb(c, ' hast dich mit Cabo verzockt, ', ' hat sich mit Cabo verzockt, ') +
          CB_PENALTY +
          ' Strafpunkte obendrauf.';
      else head = c ? 'Aufgedeckt!' : 'Der Stapel ist leer, alle decken auf.';
      const list = Object.keys(e.scores || {})
        .sort((a, b) => num(e.scores[a]) - num(e.scores[b]))
        .map((id) => esc(nameOf(v, id)) + ' +' + num(e.scores[id]))
        .join(' · ');
      return ['big', head + (list ? ' ' + list : '')];
    }
    case 'cbreset':
      return [
        'big',
        who() +
          vb(p, ' landest genau auf ', ' landet genau auf ') +
          CB_RESET_AT +
          vb(p, ' und fällst zurück auf ', ' und fällt zurück auf ') +
          CB_RESET_TO +
          '. Glück gehabt!',
      ];
    case 'cbend':
      return [
        'big',
        e.p
          ? e.again
            ? '👑 ' +
              who() +
              vb(p, ' verteidigst die Krone und bleibst Cabo-König!', ' verteidigt die Krone und bleibt Cabo-König!')
            : '👑 ' + who() + vb(p, ' bist der neue Cabo-König!', ' ist der neue Cabo-König!')
          : 'Gleichstand ganz vorne! Diesmal gibt es keinen neuen Cabo-König.',
      ];
    case 'lobby':
      return ['sys', 'Zurück in der Lobby.'];
    case 'round':
      return [
        'round',
        'Runde ' +
          num(e.r) +
          ' · ' +
          esc(nameOf(v, p)) +
          vb(p, ' gibst', ' gibt') +
          (e.start
            ? ', ' + esc(e.start === App.me ? 'du' : nameOf(v, e.start)) + vb(e.start, ' fängst an', ' fängt an')
            : ''),
      ];
    case 'keep':
      return ['', who() + vb(p, ' behältst das eigene Blatt.', ' behält das eigene Blatt.')];
    case 'take':
      return ['', who() + vb(p, ' nimmst blind das zweite Blatt.', ' nimmt blind das zweite Blatt.')];
    case 'swap':
      return [
        '',
        who() +
          vb(p, ' nimmst ', ' nimmt ') +
          cardChip(e.take) +
          vb(p, ' und legst ', ' und legt ') +
          cardChip(e.give) +
          ' hin.',
      ];
    case 'swapAll':
      return ['', who() + vb(p, ' tauschst alle drei Karten.', ' tauscht alle drei Karten.')];
    case 'pass':
      return ['', who() + vb(p, ' schiebst.', ' schiebt.')];
    case 'renew':
      return ['sys', 'Alle haben geschoben. Drei neue Karten liegen aus.'];
    case 'knock':
      return [
        'big',
        who() + vb(p, ' klopfst! Alle anderen haben noch einen Zug.', ' klopft! Alle anderen haben noch einen Zug.'),
      ];
    case 'result': {
      const parts: string[] = [];
      if (e.reason === 'schnautz') parts.push('Schnautz! ' + who() + vb(p, ' hast 31.', ' hat 31.'));
      else if (e.reason === 'feuer') parts.push('Feuer! ' + who() + vb(p, ' hast drei Asse.', ' hat drei Asse.'));
      else parts.push('Aufgedeckt.');
      if (e.tie) parts.push('Gleichstand, niemand verliert ein Leben.');
      Object.keys(e.changes || {}).forEach((id) => {
        const c = e.changes[id],
          w = W(v, id, e.names?.[id]);
        if (c.to === 'out') parts.push(w + vb(id, ' bist raus.', ' ist raus.'));
        else if (c.to === 'swim') parts.push(w + vb(id, ' schwimmst jetzt.', ' schwimmt jetzt.'));
        else parts.push(w + vb(id, ' verlierst ', ' verliert ') + (c.n === 2 ? 'zwei Leben.' : 'ein Leben.'));
      });
      return ['big', parts.join(' ')];
    }
    case 'winner':
      return [
        'big',
        e.p ? '🏆 ' + who() + vb(p, ' gewinnst die Partie!', ' gewinnt die Partie!') : 'Die Partie ist vorbei.',
      ];
    case 'chat':
      return [
        'chat' + (p === App.me ? ' mine' : ''),
        (p === App.me ? '' : '<b>' + esc(nameOf(v, p)) + '</b>') + esc(e.text),
      ];
  }
  return null;
}

let lastLogKey = '';
let scrolledOnce = false;

export function resetLog(): void {
  lastLogKey = '';
  scrolledOnce = false;
}

/** Verlauf und Chat. Während einer Shithead-Sequenz erscheinen Züge erst, wenn sie zu sehen waren. */
export function renderLog(v: View): void {
  const list = (
    SEQ.busy
      ? v.log.filter((e) => {
          return e.n <= App.seenN || e.k === 'chat';
        })
      : v.log
  ).filter((e) => !ZER.logN || e.n < ZER.logN || e.k === 'chat');
  const key = (list.length ? list[list.length - 1].n : 0) + ':' + list.length + ':' + App.me;
  const u = $('#unread');
  u.hidden = !App.unread;
  u.textContent = App.unread > 9 ? '9+' : String(App.unread);
  if (key === lastLogKey) return;
  lastLogKey = key;
  const el = $('#log'),
    near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML =
    list
      .map((e) => {
        const l = logLine(v, e);
        return l ? '<div class="e ' + l[0] + '">' + l[1] + '</div>' : '';
      })
      .join('') || '<div class="e sys">Hier erscheint, was am Tisch passiert. Ihr könnt auch schreiben.</div>';
  if (near || !scrolledOnce) {
    el.scrollTop = el.scrollHeight;
    scrolledOnce = true;
  }
}
