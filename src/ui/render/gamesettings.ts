/*
 * Einstellungen eines Spiels: Regeln, Abweichungen und Kurzzeilen für die Lobby. Den Bogen in #modal zeichnet
 * gamesettings-sheet.ts, das nachgeladen wird. Die Lobby (render/lobby.ts) ruft syncGameSettings bei jeder neuen
 * Ansicht auf und stößt damit das Laden an, damit der Bogen beim ersten Tipp schon da ist.
 */
import { CB_TWO_DECKS, DEFAULT_RULES, DK_FULL_DECK, SH_TWO_DECKS, SH_WIN_MS } from '../../game/constants';
import type { CbRules, DkRules, GameKind, Rules, ShRules, View } from '../../game/types';
import { LOSER_MARK, unreachable } from '../../game/games';
export { resetRulesFor } from '../../game/games';
import { num } from '../dom';
import { CABO_KING_HTML, zuWord } from '../helpers';

export const svg = (d: string, w = 2.5): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON_MINUS = svg('<path d="M6 12h12"/>');
export const ICON_PLUS = svg('<path d="M6 12h12M12 6v12"/>');
export const ICON_CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 3);
const ICON_OFF = svg('<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>', 2.2);
const ICON_CLOCK = svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>', 2);

/** Zeit pro Zug als Wort: „20 s“ oder „aus“. */
export const turnLabel = (s: number): string => (s ? `${s} s` : 'aus');
/** Dasselbe zum Vorlesen am Regler */
export const turnText = (s: number): string => (s ? `${s} Sekunden pro Zug` : 'ohne Zeitlimit');

/** Eine Regel als Schalter. Gesperrt bei Gästen. */
export type RuleDef = {
  attr: 'rule' | 'shrule' | 'dkrule' | 'cbrule';
  key: string;
  on: boolean;
  def: boolean;
  label: string;
  sub: string;
};

export function ruleDefs(r: Rules, g: GameKind): RuleDef[] {
  switch (g) {
    case 'shithead': {
      const sr: ShRules = r.sh ?? DEFAULT_RULES.sh;
      const t = (key: keyof ShRules, label: string, sub: string): RuleDef => ({
        attr: 'shrule',
        key,
        on: sr[key],
        def: DEFAULT_RULES.sh[key],
        label,
        sub,
      });
      return [
        t('two', '2 setzt zurück', 'Geht immer, danach ist wieder alles erlaubt'),
        t('ten', '10 verbrennt', 'Geht immer, der Stapel ist weg und du legst gleich nochmal'),
        t('seven', '7 heißt drunter', 'Der Nächste muss 7 oder niedriger legen'),
        t('three', '3 ist durchsichtig', 'Geht immer, es zählt die Karte darunter'),
        t('eight', '8 lässt aussetzen', 'Jede 8 lässt eine Person aussetzen'),
        t(
          'four',
          '4er reinwerfen',
          `Bei jedem neuen Stapel dürfen alle, auch wer dran ist. Gespielt wird nach bis zu ${Math.round(SH_WIN_MS / 1000)} Sekunden`,
        ),
        t(
          'cut',
          'Bombe einwerfen',
          'Wer die fehlenden Karten zu vier gleichen hat, darf sie jederzeit als Bombe einwerfen',
        ),
        t(
          'deck5',
          `Zwei Decks schon ab ${SH_TWO_DECKS - 1}`,
          `Ab ${SH_TWO_DECKS} Leuten wird immer mit zwei Decks gespielt`,
        ),
      ];
    }
    case 'durak': {
      const dr: DkRules = r.dk ?? DEFAULT_RULES.dk;
      return [
        {
          attr: 'dkrule',
          key: 'transfer',
          on: dr.transfer,
          def: DEFAULT_RULES.dk.transfer,
          label: 'Weiterschieben',
          sub: 'Vor dem ersten Schlag legt der Verteidiger den gleichen Wert dazu, dann muss der Nächste ran',
        },
      ];
    }
    case 'cabo': {
      const cr: CbRules = r.cb ?? DEFAULT_RULES.cb;
      return [
        {
          attr: 'cbrule',
          key: 'snap',
          on: cr.snap,
          def: DEFAULT_RULES.cb.snap,
          label: 'Schnappen',
          sub: 'Gleichen Wert wie oben auf der Ablage jederzeit draufwerfen, daneben kostet eine Strafkarte',
        },
      ];
    }
    case 'schnautz': {
      const t = (
        key: 'feuer' | 'dealerChoice' | 'knockFirst' | 'knockDouble',
        label: string,
        sub: string,
      ): RuleDef => ({
        attr: 'rule',
        key,
        on: r[key],
        def: DEFAULT_RULES[key],
        label,
        sub,
      });
      return [
        t('feuer', 'Drei Asse sind Feuer', 'Zählt 33, alle anderen verlieren ein Leben'),
        t('dealerChoice', 'Geber bekommt ein zweites Blatt', 'Behalten oder blind tauschen'),
        t('knockFirst', 'Klopfen sofort erlaubt', 'Sonst erst, wenn jeder einmal dran war'),
        t('knockDouble', 'Klopfer verliert doppelt', 'Wer klopft und am wenigsten hat, verliert zwei Leben'),
      ];
    }
    default:
      return unreachable(g);
  }
}

/** Was zum Spiel selbst gehört und sich nicht schalten lässt. Leer, wenn es nichts zu sagen gibt. */
export function ruleNote(g: GameKind): string {
  switch (g) {
    case 'shithead':
      return 'Vier gleiche Karten hintereinander sind immer eine Bombe und verbrennen den Stapel. Wer die vierte legt, ist gleich nochmal dran.';
    case 'durak':
      return `Bis ${zuWord(DK_FULL_DECK - 1)} spielt ihr mit 36 Karten von der 6 bis zum Ass, ab ${DK_FULL_DECK} Leuten mit allen 52. Wer als Letzter Karten hat, ist der Durak und trägt den ${LOSER_MARK.durak}.`;
    case 'cabo':
      return `Ab ${CB_TWO_DECKS} Leuten wird mit zwei Decks gespielt. Wer am Ende die wenigsten Punkte hat, wird ${CABO_KING_HTML} und behält die Krone, bis jemand anderes gewinnt.`;
    case 'schnautz':
      return '';
    default:
      return unreachable(g);
  }
}

/**
 * Was vom Üblichen abweicht, als Chips: Zahlen (Zeit, Leben, Zielpunkte) genauso wie die Schalter.
 * Leer heißt, es wird nach Standard gespielt.
 */
export function deviations(r: Rules, g: GameKind): string[] {
  const out: string[] = [];
  const s = r.turnSecs;
  if (g === 'schnautz' && r.lives !== DEFAULT_RULES.lives)
    out.push(`<li class="rc on num">${num(r.lives)} Leben pro Person</li>`);
  const target = (r.cb ?? DEFAULT_RULES.cb).target;
  if (g === 'cabo' && target !== DEFAULT_RULES.cb.target)
    out.push(`<li class="rc on num">Bis ${num(target)} Punkte</li>`);
  if (s !== DEFAULT_RULES.turnSecs)
    out.push(`<li class="rc on num">${ICON_CLOCK}${s ? `${s} s pro Zug` : 'Ohne Zeitlimit'}</li>`);
  ruleDefs(r, g)
    .filter((d) => d.on !== d.def)
    .forEach((d) =>
      out.push(
        `<li class="rc${d.on ? ' on' : ' off'}">${d.on ? ICON_CHECK : ICON_OFF}${d.label}` +
          (d.on ? '<span class="sr"> an</span>' : '<span class="rc-off">aus</span>') +
          '</li>',
      ),
    );
  return out;
}

/** Dieselben Abweichungen als kurze Wörter für eine einzige Zeile, etwa „8 lässt aussetzen aus“. */
export function deviationWords(r: Rules, g: GameKind): string[] {
  const out: string[] = [];
  if (g === 'schnautz' && r.lives !== DEFAULT_RULES.lives) out.push(`${num(r.lives)} Leben`);
  const target = (r.cb ?? DEFAULT_RULES.cb).target;
  if (g === 'cabo' && target !== DEFAULT_RULES.cb.target) out.push(`bis ${num(target)} Punkte`);
  if (r.turnSecs !== DEFAULT_RULES.turnSecs) out.push(r.turnSecs ? `${r.turnSecs} s pro Zug` : 'ohne Zeitlimit');
  ruleDefs(r, g)
    .filter((d) => d.on !== d.def)
    .forEach((d) => out.push(`${d.label} ${d.on ? 'an' : 'aus'}`));
  return out;
}

/* ---------- Bogen, nachgeladen ---------- */

type Sheet = typeof import('./gamesettings-sheet');
let SHEET: Sheet | null = null;
let loading: Promise<Sheet> | null = null;

/** Lädt den Bogen einmal. Scheitert es, versucht es der nächste Aufruf neu. */
function loadSheet(): Promise<Sheet> {
  loading ??= import('./gamesettings-sheet').then(
    (m) => (SHEET = m),
    (er: unknown) => {
      loading = null;
      throw er;
    },
  );
  return loading;
}

/** Öffnet den Bogen für ein Spiel. Gäste sehen immer das gewählte Spiel. */
export function openGameSettings(v: View, g: GameKind): void {
  if (SHEET) SHEET.openGameSettings(v, g);
  else
    loadSheet().then(
      (m) => m.openGameSettings(v, g),
      () => undefined,
    );
}

/** Bei jeder neuen Ansicht in der Lobby: offenen Bogen mitziehen. Ohne geladenen Bogen ist keiner offen. */
export function syncGameSettings(v: View): void {
  if (SHEET) SHEET.syncGameSettings(v);
  else loadSheet().catch(() => undefined);
}
