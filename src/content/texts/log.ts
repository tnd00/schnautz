/*
 * Textkatalog für den Verlauf. Jede Logart hat genau einen Eintrag in LOG, der Compiler meldet fehlende Arten.
 * Ohne DOM und ohne Import aus ui, net oder bots: Namen, Karten und Maskierung kommen über den Formatierer (Fmt),
 * den sich jedes Ziel selbst baut (der Verlauf mit fett gesetzten, maskierten Namen und Kartenchips).
 */
import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO } from '../../game/constants';
import { GAME_NAME, LOSER_MARK, isGame } from '../../game/games';
import type { GameKind, LogEntry, LogKind } from '../../game/types';

/** Wie ein Ziel Namen, Texte und Karten darstellt. HTML-Ziele maskieren in wrap und esc, Text-Ziele nicht. */
export interface Fmt {
  /** Eigene Platz-ID, sie heißt „Du“ */
  me: string;
  /** Spiel am Tisch, manche Sätze hängen davon ab */
  game: GameKind;
  /** Roher Anzeigename, nie „Du“: Name am Tisch, sonst der Name aus dem Eintrag, sonst „Jemand“ */
  name(id: string | null | undefined, fb?: string): string;
  /** Hervorgehobener Name (Verlauf: fett und maskiert) */
  wrap(name: unknown): string;
  /** Freier Text (Verlauf: maskiert) */
  esc(text: unknown): string;
  /** Eine Karte (Verlauf: Kartenchip) */
  card(c: unknown): string;
}

/** Zahl aus unsicherer Quelle, sonst 0 */
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/** Perspektive: wer liest, heißt „Du“, „du“, „dich“ oder „dir“, alle anderen beim Namen. */
export function persp(f: Fmt) {
  const self = (id: string | null | undefined): boolean => id === f.me;
  return {
    game: f.game,
    self,
    /** Satzanfang, hervorgehoben: „Du“ oder „Lena“ */
    who: (id: string | null | undefined, fb?: string) => f.wrap(self(id) ? 'Du' : f.name(id, fb)),
    /** Objekt im Akkusativ, hervorgehoben: „dich“ oder „Lena“ */
    whom: (id: string | null | undefined, fb?: string) => (self(id) ? 'dich' : f.wrap(f.name(id, fb))),
    /** Nach „mit“ oder „von“, hervorgehoben: „dir“ oder „Lena“ */
    toWhom: (id: string | null | undefined, fb?: string) => (self(id) ? 'dir' : f.wrap(f.name(id, fb))),
    /** Satzanfang ohne Hervorhebung: „Du“ oder „Lena“ */
    nm: (id: string | null | undefined, fb?: string) => f.esc(self(id) ? 'Du' : f.name(id, fb)),
    /** Mitten im Satz ohne Hervorhebung: „du“ oder „Lena“ */
    du: (id: string | null | undefined, fb?: string) => f.esc(self(id) ? 'du' : f.name(id, fb)),
    /** Verbform passend zu „Du“ oder einem Namen, etwa vb(id, ' legst', ' legt') */
    vb: (id: string | null | undefined, du: string, er: string) => (self(id) ? du : er),
    wrap: f.wrap,
    esc: f.esc,
    card: f.card,
    /** Mehrere Karten, ohne Liste leer */
    cards: (cs: unknown) => (Array.isArray(cs) ? cs.map(f.card).join(' ') : ''),
    /** „1 Karte“, „5 Karten“ */
    count: (n: unknown) => num(n) + (num(n) === 1 ? ' Karte' : ' Karten'),
  };
}
export type P = ReturnType<typeof persp>;

/** Eine Zeile im Verlauf: CSS-Klasse und Text im Format des Ziels. null heißt, die Art steht nicht im Verlauf. */
export type LogLine = readonly [cls: string, text: string] | null;

/** Cabo: Zahlwort für mehrere gleiche Karten auf einmal */
const NUM_WORD: Readonly<Record<number, string>> = { 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs' };

/** Cabo: was die abgelegte Karte erlaubt, nach „darf“ (die Namen der Fähigkeiten stehen in common.ts) */
const CB_MAY: Readonly<Record<'peek' | 'spy' | 'swap', string>> = {
  peek: 'eine eigene Karte ansehen',
  spy: 'spionieren',
  swap: 'blind tauschen',
};

/** Wie ein Duell unentschieden ausgeht, je Spiel für „Ihr“ und für zwei andere */
export const TIE_TEXT: Readonly<Record<GameKind, readonly [string, string]>> = {
  schnautz: ['fliegt beide in derselben Runde raus', 'fliegen in derselben Runde raus'],
  shithead: ['seid gleichzeitig fertig geworden', 'sind gleichzeitig fertig geworden'],
  durak: ['seid gleichzeitig fertig geworden', 'sind gleichzeitig fertig geworden'],
  cabo: ['habt gleich viele Punkte', 'haben gleich viele Punkte'],
};

/** Ausgang eines Revanche-Duells aus Sicht der jeweiligen Person, Namen ohne Hervorhebung. */
export function duelText(t: P, d: { by: string; vs: string; res?: string }, bn?: string, vn?: string): string {
  const by = t.self(d.by);
  const vs = t.self(d.vs);
  if (d.res === 'tie') {
    const [du, er] = TIE_TEXT[t.game];
    return by || vs ? `Unentschieden! Ihr ${du}.` : `Unentschieden! ${t.nm(d.by, bn)} und ${t.nm(d.vs, vn)} ${er}.`;
  }
  if (d.res === 'won')
    return by
      ? `Revanche geglückt! Du schlägst ${t.nm(d.vs, vn)}.`
      : vs
        ? `Revanche geglückt! ${t.nm(d.by, bn)} schlägt dich.`
        : `Revanche geglückt! ${t.nm(d.by, bn)} schlägt ${t.nm(d.vs, vn)}.`;
  return by
    ? `Revanche verpatzt! ${t.nm(d.vs, vn)} bleibt vorne.`
    : vs
      ? 'Revanche verpatzt! Du bleibst vorne.'
      : `Revanche verpatzt! ${t.nm(d.vs, vn)} bleibt vorne.`;
}

/** Steht im Verlauf, solange noch nichts passiert ist */
export const LOG_EMPTY = 'Hier erscheint, was am Tisch passiert. Ihr könnt auch schreiben.';

/** Nur für den Ablauf, im Verlauf nicht zu sehen */
const hidden = (): LogLine => null;

/** Jede Logart braucht einen Eintrag, sonst meldet der Compiler die fehlende Art. */
export const LOG: { readonly [K in LogKind]: (t: P, e: Extract<LogEntry, { k: K }>) => LogLine } = {
  // Plätze und Tisch
  // Die KI heißt so wie im Eintrag und nie „Du“: Übernimmt später jemand den Platz, trägt er dessen ID und Namen
  join: (t, e) =>
    e.bot
      ? ['sys', e.name ? t.wrap(e.name) + ' (KI) setzt sich an den Tisch.' : 'Eine KI setzt sich an den Tisch.']
      : ['sys', t.who(e.p, e.name) + ' sitzt jetzt mit am Tisch.'],
  quit: (t, e) => [
    'big',
    t.who(e.p, e.name) +
      t.vb(e.p, ' hast den Tisch verlassen und bist raus.', ' hat den Tisch verlassen und ist raus.'),
  ],
  leave: (t, e) => ['sys', t.wrap(e.name || 'Jemand') + ' ist gegangen.'],
  takeover: (t, e) => [
    'big',
    t.who(e.p, e.name) +
      t.vb(e.p, ' übernimmst', ' übernimmt') +
      ' den Platz von ' +
      t.wrap(e.from) +
      // In der Lobby gibt es noch keine Karten
      (e.lobby ? '.' : ' samt Karten.'),
  ],
  tobot: (t, e) => [
    'big',
    t.who(e.p, e.name) +
      t.vb(
        e.p,
        ' bist gegangen. Ab jetzt spielt die KI für dich weiter.',
        ' ist gegangen. Ab jetzt spielt die KI für ' + t.whom(e.p, e.name) + ' weiter.',
      ),
  ],
  timeout: (t, e) => ['big', '⏰ Zeit um, die KI spielt einmal für ' + t.whom(e.p, e.name) + '.'],
  back: (t, e) => [
    'big',
    t.who(e.p, e.name) + t.vb(e.p, ' bist zurück und spielst wieder selbst.', ' ist zurück und spielt wieder selbst.'),
  ],
  game: (_t, e) => [
    'round',
    'Partie ' + num(e.g) + ' beginnt' + (isGame(e.game) && e.game !== 'schnautz' ? ' · ' + GAME_NAME[e.game] : ''),
  ],
  lobby: () => ['sys', 'Zurück in der Lobby.'],
  abort: (t, e) => [
    'big',
    t.who(e.p, e.name) +
      t.vb(e.p, ' hast die Partie abgebrochen.', ' hat die Partie abgebrochen.') +
      (e.bets ? ' Die Tipps verfallen.' : ''),
  ],
  ffwd: (t, e) => [
    'sys',
    '⏩ ' + t.who(e.p, e.name) + t.vb(e.p, ' spulst vor.', ' spult vor.') + ' Die KIs spielen die Partie zügig aus.',
  ],
  chat: (t, e) => ['chat' + (t.self(e.p) ? ' mine' : ''), (t.self(e.p) ? '' : t.who(e.p)) + t.esc(e.text)],
  emote: hidden,
  toss: hidden,
  sound: hidden,
  dev: hidden,

  // Revanche
  rematch: (t, e) => {
    const nr = e.c >= 2 ? ` Nummer ${e.c}` : '';
    if (!e.to) return ['big', t.self(e.p) ? '⚔️ Du willst Revanche.' : `⚔️ ${t.who(e.p, e.name)} will Revanche.`];
    if (t.self(e.p)) return ['big', `⚔️ Du forderst ${t.who(e.to, e.tn)} zur Revanche${nr}.`];
    if (t.self(e.to)) return ['big', `⚔️ ${t.who(e.p, e.name)} fordert dich zur Revanche${nr}.`];
    return ['big', `⚔️ ${t.who(e.p, e.name)} fordert ${t.who(e.to, e.tn)} zur Revanche${nr}.`];
  },
  rematchend: (t, e) => ['big', `⚔️ ${duelText(t, { by: e.p ?? '', vs: e.to, res: e.res }, e.name, e.tn)}`],

  // Schnautz
  round: (t, e) => [
    'round',
    'Runde ' +
      num(e.r) +
      ' · ' +
      t.nm(e.p) +
      t.vb(e.p, ' gibst', ' gibt') +
      (e.start ? ', ' + t.du(e.start) + t.vb(e.start, ' fängst an', ' fängt an') : ''),
  ],
  keep: (t, e) => ['', t.who(e.p, e.name) + t.vb(e.p, ' behältst das eigene Blatt.', ' behält das eigene Blatt.')],
  take: (t, e) => [
    '',
    t.who(e.p, e.name) + t.vb(e.p, ' nimmst blind das zweite Blatt.', ' nimmt blind das zweite Blatt.'),
  ],
  swap: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' nimmst ', ' nimmt ') +
      t.card(e.take) +
      t.vb(e.p, ' und legst ', ' und legt ') +
      t.card(e.give) +
      ' hin.',
  ],
  swapAll: (t, e) => ['', t.who(e.p, e.name) + t.vb(e.p, ' tauschst alle drei Karten.', ' tauscht alle drei Karten.')],
  pass: (t, e) => ['', t.who(e.p, e.name) + t.vb(e.p, ' schiebst.', ' schiebt.')],
  renew: () => ['sys', 'Alle haben geschoben. Drei neue Karten liegen aus.'],
  knock: (t, e) => [
    'big',
    t.who(e.p, e.name) +
      t.vb(e.p, ' klopfst! Alle anderen haben noch einen Zug.', ' klopft! Alle anderen haben noch einen Zug.'),
  ],
  result: (t, e) => {
    const parts: string[] = [];
    // Wer 31 oder Feuer hat, steht in `by`, nicht in `p`
    const by = e.by;
    const byName = () => t.who(by, by ? e.names?.[by] : undefined);
    if (e.reason === 'schnautz' && by) parts.push('Schnautz! ' + byName() + t.vb(by, ' hast 31.', ' hat 31.'));
    else if (e.reason === 'feuer' && by)
      parts.push('Feuer! ' + byName() + t.vb(by, ' hast drei Asse.', ' hat drei Asse.'));
    else parts.push('Aufgedeckt.');
    if (e.tie) parts.push('Gleichstand. Niemand verliert ein Leben.');
    Object.keys(e.changes || {}).forEach((id) => {
      const c = e.changes[id],
        w = t.who(id, e.names?.[id]);
      if (c.to === 'out') parts.push(w + t.vb(id, ' bist raus.', ' ist raus.'));
      else if (c.to === 'swim') parts.push(w + t.vb(id, ' schwimmst jetzt.', ' schwimmt jetzt.'));
      else parts.push(w + t.vb(id, ' verlierst ', ' verliert ') + (c.n === 2 ? 'zwei Leben.' : 'ein Leben.'));
    });
    return ['big', parts.join(' ')];
  },
  winner: (t, e) => [
    'big',
    e.p
      ? '🏆 ' + t.who(e.p, e.name) + t.vb(e.p, ' gewinnst die Partie!', ' gewinnt die Partie!')
      : 'Die Partie ist vorbei.',
  ],

  // Shithead
  shdeal: () => ['sys', 'Die Karten sind verteilt. Vor dem Start darf jeder Hand- und Tischkarten tauschen.'],
  shstart: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' fängst an', ' fängt an') +
      (e.card ? ' (niedrigste Karte ' + t.card(e.card) + ').' : '.'),
  ],
  shplay: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' legst ', ' legt ') +
      t.cards(e.cards) +
      (e.src === 'up' ? ' vom Tisch' : e.src === 'down' ? ' blind' : '') +
      '.',
  ],
  shthrow: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' wirfst ', ' wirft ') +
      t.cards(e.cards) +
      (e.src === 'up' ? ' vom Tisch' : '') +
      ' rein.',
  ],
  shbomb: (t, e) => [
    'big',
    '💣 ' +
      t.who(e.p, e.name) +
      t.vb(e.p, ' wirfst ', ' wirft ') +
      t.cards(e.cards) +
      (e.out ? ' außer der Reihe' : '') +
      ' als Bombe ein.',
  ],
  shburn: (t, e) => [
    'big',
    (e.four ? '💣 Bombe! ' : '🔥 ') +
      t.who(e.p, e.name) +
      t.vb(e.p, ' verbrennst den Stapel.', ' verbrennt den Stapel.'),
  ],
  shpickup: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' nimmst den Stapel auf (', ' nimmt den Stapel auf (') +
      num(e.cnt) +
      (num(e.cnt) === 1 ? ' Karte).' : ' Karten).'),
  ],
  shblindfail: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' deckst blind ', ' deckt blind ') +
      t.card(e.card) +
      ' auf. Die passt nicht. ' +
      t.nm(e.p, e.name) +
      t.vb(e.p, ' nimmst ', ' nimmt ') +
      num(e.cnt) +
      (num(e.cnt) === 1 ? ' Karte auf.' : ' Karten auf.'),
  ],
  shdone: (t, e) => [
    'big',
    t.who(e.p, e.name) + t.vb(e.p, ' bist fertig! Platz ', ' ist fertig! Platz ') + num(e.place) + '.',
  ],
  shend: (t, e) => [
    'big',
    e.p
      ? LOSER_MARK.shithead + ' ' + t.who(e.p, e.name) + t.vb(e.p, ' bist der Shithead!', ' ist der Shithead!')
      : 'Die Partie ist vorbei.',
  ],
  shbet: hidden,

  // Durak
  dkdeal: (t, e) =>
    e.prev
      ? [
          'big',
          'Trumpf ist ' +
            t.card(e.trump) +
            '. ' +
            LOSER_MARK.durak +
            ' ' +
            t.who(e.def) +
            t.vb(e.def, ' warst letztes Mal der Durak und kriegst ', ' war letztes Mal der Durak und kriegt ') +
            'als Erstes eins drauf. ' +
            t.who(e.att) +
            t.vb(e.att, ' greifst an.', ' greift an.'),
        ]
      : [
          '',
          'Trumpf ist ' +
            t.card(e.trump) +
            '. ' +
            t.who(e.att) +
            t.vb(e.att, ' greifst ', ' greift ') +
            t.whom(e.def) +
            ' als Erstes an.',
        ],
  dkattack: (t, e) => [
    '',
    t.who(e.p, e.name) +
      (e.lead
        ? t.vb(e.p, ' greifst mit ', ' greift mit ') + t.cards(e.cards) + ' an.'
        : t.vb(e.p, ' legst ', ' legt ') + t.cards(e.cards) + ' nach.'),
  ],
  dkdefend: (t, e) => [
    '',
    t.who(e.p, e.name) + t.vb(e.p, ' schlägst ', ' schlägt ') + t.card(e.a) + ' mit ' + t.card(e.d) + '.',
  ],
  dktransfer: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' schiebst ', ' schiebt ') +
      t.cards(e.cards) +
      ' weiter an ' +
      t.whom(e.to, e.tn) +
      '.',
  ],
  dktake: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(
        e.p,
        ' gibst auf und nimmst alles. Die anderen dürfen dir noch was dazulegen.',
        ' gibt auf und nimmt alles. Jetzt noch schnell nachlegen!',
      ),
  ],
  dkpass: hidden,
  dkbito: (t, e) => [
    '',
    'Bito! ' +
      t.who(e.p, e.name) +
      t.vb(e.p, ' wehrst alles ab, ', ' wehrt alles ab, ') +
      t.count(e.cnt) +
      (num(e.cnt) === 1 ? ' geht auf den Bito-Stapel.' : ' gehen auf den Bito-Stapel.'),
  ],
  dkpickup: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' nimmst ', ' nimmt ') +
      t.count(e.cnt) +
      ' auf.' +
      (num(e.cnt) >= 8 ? ' Schöner Fächer.' : ''),
  ],
  dkout: (t, e) => [
    'big',
    t.who(e.p, e.name) + t.vb(e.p, ' bist fertig! Platz ', ' ist fertig! Platz ') + num(e.place) + '.',
  ],
  dkend: (t, e) => [
    'big',
    e.p
      ? LOSER_MARK.durak + ' ' + t.who(e.p, e.name) + t.vb(e.p, ' bist der Durak!', ' ist der Durak!')
      : '🤝 Unentschieden! Die Letzten sind gleichzeitig fertig geworden. Diesmal gibt es keinen Durak.',
  ],

  // Cabo
  cbdeal: (t, e) => ['round', 'Runde ' + num(e.r) + ' · ' + t.nm(e.start) + t.vb(e.start, ' fängst an', ' fängt an')],
  cblook: hidden,
  cbskip: hidden,
  cbdraw: (t, e) =>
    e.from === 'pile'
      ? ['', t.who(e.p, e.name) + t.vb(e.p, ' nimmst ', ' nimmt ') + t.card(e.c) + ' von der Ablage.']
      : ['', t.who(e.p, e.name) + t.vb(e.p, ' ziehst vom Stapel.', ' zieht vom Stapel.')],
  cbswap: (t, e) => {
    const n = num(e.slots);
    if (!e.ok)
      return [
        'big',
        t.who(e.p, e.name) +
          t.vb(e.p, ' willst ', ' will ') +
          t.cards(e.out) +
          ' zusammen loswerden. Daneben! Die Karten liegen jetzt offen' +
          (e.pen ? t.vb(e.p, ', dazu kriegst du eine Strafkarte.', ', dazu gibt es eine Strafkarte.') : '.'),
      ];
    if (n > 1)
      return [
        '',
        t.who(e.p, e.name) +
          t.vb(e.p, ' wirfst ', ' wirft ') +
          (NUM_WORD[n] ?? String(n)) +
          ' gleiche auf einmal ab (' +
          t.cards(e.out) +
          ').',
      ];
    return [
      '',
      t.who(e.p, e.name) + t.vb(e.p, ' tauschst ein und wirfst ', ' tauscht ein und wirft ') + t.cards(e.out) + ' ab.',
    ];
  },
  cbdiscard: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' legst ', ' legt ') +
      t.card(e.c) +
      ' ab' +
      (e.power ? t.vb(e.p, ' und darfst ', ' und darf ') + CB_MAY[e.power] : '') +
      '.',
  ],
  cbpeek: (t, e) => [
    '',
    t.who(e.p, e.name) + t.vb(e.p, ' schaust dir eine eigene Karte an.', ' schaut sich eine eigene Karte an.'),
  ],
  cbspy: (t, e) => [
    '',
    '🔍 ' + t.who(e.p, e.name) + t.vb(e.p, ' spionierst ', ' spioniert ') + t.whom(e.to, e.tn) + ' aus.',
  ],
  cbblind: (t, e) => [
    '',
    t.who(e.p, e.name) +
      t.vb(e.p, ' tauschst blind eine Karte mit ', ' tauscht blind eine Karte mit ') +
      t.toWhom(e.to, e.tn) +
      (t.self(e.to) ? '. Hoffentlich war es nicht dein roter König.' : '.'),
  ],
  cbcabo: (t, e) => [
    'big',
    '📣 ' +
      t.who(e.p, e.name) +
      t.vb(e.p, ' rufst CABO! Alle anderen haben noch einen Zug.', ' ruft CABO! Alle anderen haben noch einen Zug.'),
  ],
  cbsnap: (t, e) =>
    e.ok
      ? ['', '⚡ ' + t.who(e.p, e.name) + t.vb(e.p, ' schnappst ', ' schnappt ') + t.card(e.c) + ' auf die Ablage.']
      : [
          'big',
          t.who(e.p, e.name) +
            t.vb(e.p, ' schnappst mit ', ' schnappt mit ') +
            t.card(e.c) +
            ' daneben. Zu gierig! Die Karte bleibt offen liegen, dazu gibt es eine Strafkarte.',
        ],
  cbround: (t, e) => {
    const c = e.caller;
    let head: string;
    if (e.kami)
      head =
        '💥 Kamikaze! ' +
        t.who(e.kami) +
        t.vb(e.kami, ' hast', ' hat') +
        ' zwei Damen und zwei schwarze Könige, alle anderen kassieren ' +
        CB_KAMI +
        '.';
    else if (c && e.ok === true)
      head = '🎯 ' + t.who(c) + t.vb(c, ' hattest mit Cabo recht, 0 Punkte.', ' hatte mit Cabo recht, 0 Punkte.');
    else if (c && e.ok === false)
      head =
        '🙈 ' +
        t.who(c) +
        t.vb(c, ' hast dich mit Cabo verzockt, ', ' hat sich mit Cabo verzockt, ') +
        CB_PENALTY +
        ' Strafpunkte obendrauf.';
    else head = c ? 'Aufgedeckt!' : 'Der Stapel ist leer, alle decken auf.';
    const scores = e.scores || {};
    const list = Object.keys(scores)
      .sort((a, b) => num(scores[a]) - num(scores[b]))
      .map((id) => t.nm(id) + ' +' + num(scores[id]))
      .join(' · ');
    return ['big', head + (list ? ' ' + list : '')];
  },
  cbreset: (t, e) => [
    'big',
    t.who(e.p, e.name) +
      t.vb(e.p, ' landest genau auf ', ' landet genau auf ') +
      CB_RESET_AT +
      t.vb(e.p, ' und fällst zurück auf ', ' und fällt zurück auf ') +
      CB_RESET_TO +
      '. Glück gehabt!',
  ],
  cbend: (t, e) => [
    'big',
    e.p
      ? e.again
        ? '👑 ' +
          t.who(e.p, e.name) +
          t.vb(e.p, ' verteidigst die Krone und bleibst Cabo-König!', ' verteidigt die Krone und bleibt Cabo-König!')
        : '👑 ' + t.who(e.p, e.name) + t.vb(e.p, ' bist der neue Cabo-König!', ' ist der neue Cabo-König!')
      : '🤝 Unentschieden! Vorne liegen mehrere gleichauf. Diesmal gibt es keinen neuen Cabo-König.',
  ],
};

/**
 * Zeile zu einem Eintrag. Eine unbekannte Logart von einem neueren Gastgeber (gemischte Versionen) wird still
 * übersprungen, auch wenn sie zufällig wie eine geerbte Eigenschaft heißt („toString“).
 */
export function logText(t: P, e: LogEntry): LogLine {
  if (!Object.hasOwn(LOG, e.k)) return null;
  const f = (LOG as Readonly<Record<string, (t: P, e: LogEntry) => LogLine>>)[e.k];
  return f(t, e);
}
