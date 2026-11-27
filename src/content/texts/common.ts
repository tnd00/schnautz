/*
 * Gemeinsamer Teil des Textkatalogs: Glossar (ein Wort pro Bedeutung) und Zeichentabelle für alle vier Spiele.
 * Nur Konstanten, ohne DOM und ohne Import aus ui, net oder bots. Die heutigen Stellen müssen sie noch nicht nutzen,
 * neue Texte nehmen ihre Wörter und Zeichen von hier. LOSER_MARK und LOSER_NAME bleiben in src/game/games.ts.
 */
import { LOSER_MARK } from '../../game/games';

/**
 * Glossar nach CLAUDE.md und Plan 2.7. Die Eigenart eines Spiels lebt nur in seinen Ausrufen.
 * „fertig“ heißt alle Karten los (Shithead, Durak), „raus“ heißt ausgeschieden und gibt es nur bei Schnautz.
 */
export const WORD = {
  /** Leute statt Spieler, für eine einzelne Person „Person“ */
  people: 'Leute',
  person: 'Person',
  /** Gastgeber statt Host */
  host: 'Gastgeber',
  /** Tisch statt Raum, der Code dazu heißt Tischcode */
  table: 'Tisch',
  tableCode: 'Tischcode',
  /** Hauptknopf auf der Startseite */
  open: 'Tisch aufmachen',
  /** Leben statt Bierdeckel (Schnautz) */
  life: 'Leben',
  /** Vier Gleiche heißen in allen Meldungen Bombe, das Verb dazu ist einwerfen */
  bomb: 'Bombe',
  bombVerb: 'einwerfen',
  /** Reinwerfen bleibt den 4ern im 4er-Fenster vorbehalten */
  throwIn: 'reinwerfen',
  hand: 'Handkarten',
  /** Alle Karten los, Shithead und Durak */
  done: 'fertig',
  /** Ausgeschieden, nur Schnautz */
  out: 'raus',
  /** Shithead-Tauschrunde und Cabo-Ansehen: Knopf „Bereit“, Etikett „bereit ✓“ */
  ready: 'bereit',
  readyButton: 'Bereit',
  readyTag: 'bereit ✓',
  /** Durak-Verzicht aufs Nachlegen: Knopf „Passen“, gedrückt „Gepasst ✓“, Etikett „passt ✓“ */
  pass: 'passen',
  passButton: 'Passen',
  passedButton: 'Gepasst ✓',
  passTag: 'passt ✓',
  /** Durak: Ausruf und Ablagestapel */
  bito: 'Bito',
  bitoPile: 'Bito-Stapel',
  /** Cabo: die gezogene Karte gegen eine eigene */
  swapIn: 'Eintauschen',
  /** Cabo: Aufdecken gibt es nur am Rundenende */
  reveal: 'Aufdecken',
  /** Ohne Umbruch am Bindestrich */
  caboKing: 'Cabo‑König',
  /** Russisch für Narr */
  durakMeans: 'Narr',
} as const;

/** Die drei festen Fähigkeiten bei Cabo, Zeichen und Name */
export const CB_POWER = {
  peek: { sign: '👁️', name: 'Ansehen' },
  spy: { sign: '🔍', name: 'Spionieren' },
  swap: { sign: '🔀', name: 'Blindtausch' },
} as const;

/**
 * Zeichentabelle. 👑 nur für Sieger und Cabo-König, 🏅 für die beste Hand einer Schnautz-Runde, 💩 nur Shithead,
 * 🤡 nur Durak. Endetiketten bauen alle gleich aus Zeichen plus Titel („💩 Shithead“, „🤡 Durak“, „👑 Cabo-König“).
 */
export const SIGN = {
  win: '👑',
  trophy: '🏆',
  first: '🥇',
  done: '✅',
  shithead: LOSER_MARK.shithead,
  durak: LOSER_MARK.durak,
  timeout: '⏰',
  cabo: '📣',
  caboHit: '🎯',
  caboMiss: '🙈',
  kamikaze: '💥',
  tie: '🤝',
  s31: '⭐',
  fire: '🔥',
  burn: '🔥',
  bomb: '💣',
  knock: '✊',
  /** Schnautz: verliert ein Leben, schwimmt, geht unter */
  life: '💔',
  swim: '🛟',
  sink: '🫧',
  /** Aufgedeckt (Schnautz) und Rundenbeginn oder Stapel leer (Cabo) */
  cards: '🃏',
  peek: CB_POWER.peek.sign,
  spy: CB_POWER.spy.sign,
  blind: CB_POWER.swap.sign,
  bet: '🔮',
  duel: '⚔️',
  ffwd: '⏩',
} as const;

export type SignName = keyof typeof SIGN;
