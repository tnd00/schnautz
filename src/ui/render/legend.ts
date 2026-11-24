/* Übersicht, was die Karten können. Am Desktop an der Seite, außerdem oben im Regelfenster. */
import {
  CB_KAMI,
  CB_PENALTY,
  CB_RESET_AT,
  CB_RESET_TO,
  DEFAULT_RULES,
  DK_FULL_DECK,
  DK_MAX_ATTACK,
  SH_WIN_MS,
} from '../../game/constants';
import type { GameKind, Rules, View } from '../../game/types';
import { $, esc, isMobile } from '../dom';
import { LS } from '../storage';
import { unreachable } from '../../game/games';

type LegendItem = [badge: string, title: string, text: string, style?: 'e' | 'r'];

/** Am Desktop standardmäßig an, mobil standardmäßig zu. */
export function legendOn(mobile: boolean): boolean {
  const x = LS.get<boolean | null>(mobile ? 'legendM' : 'legend', null);
  return x == null ? !mobile : x;
}

function legendItems(game: GameKind, rules: Rules): LegendItem[] {
  switch (game) {
    case 'shithead':
      return legendSh(rules);
    case 'durak':
      return legendDurak(rules);
    case 'schnautz':
      return legendSchnautz(rules);
    case 'cabo':
      return legendCabo(rules);
    default:
      return unreachable(game);
  }
}

function legendSh(rules: Rules): LegendItem[] {
  const R = rules.sh ?? DEFAULT_RULES.sh;
  const it: LegendItem[] = [];
  if (R.two) it.push(['2', 'Neustart', 'Geht immer. Danach ist wieder alles erlaubt.']);
  if (R.three) it.push(['3', 'Durchsichtig', 'Geht immer. Es zählt die Karte darunter.']);
  if (R.seven) it.push(['7', 'Drunter', 'Der Nächste muss 7 oder niedriger legen.']);
  if (R.eight) it.push(['8', 'Aussetzen', 'Pro 8 setzt ein Spieler aus.']);
  if (R.ten) it.push(['10', 'Verbrennt', 'Geht immer. Der Stapel ist weg und du legst nochmal.']);
  it.push([
    '4×',
    'Bombe',
    'Vier gleiche hintereinander sind eine Bombe und verbrennen den Stapel. Du legst nochmal.',
    'e',
  ]);
  if (R.cut) {
    it.push([
      '💣',
      'Einwerfen',
      'Hast du die fehlenden Karten zu vier gleichen, wirf sie jederzeit rein. Auch wenn du nicht dran bist.',
      'e',
    ]);
  }
  if (R.four) {
    it.push([
      '4',
      '4er reinwerfen',
      `Bei jedem neuen Stapel per Knopf, alle dürfen. Wer dran ist, wirft auch rein und spielt nach bis zu ${Math.round(SH_WIN_MS / 1000)} Sekunden normal.`,
    ]);
  }
  it.push(['A', 'Reihenfolge', '2 bis 10, dann Bube, Dame, König und Ass.']);
  return it;
}

function legendDurak(rules: Rules): LegendItem[] {
  const R = rules.dk ?? DEFAULT_RULES.dk;
  const it: LegendItem[] = [
    [
      '★',
      'Trumpf',
      'Die Farbe der Karte unter dem Stapel sticht alles. Gegen Trumpf hilft nur ein höherer Trumpf.',
      'e',
    ],
    ['K', 'Schlagen', 'Mit einer höheren Karte derselben Farbe oder mit Trumpf. Sonst nimmst du alles auf.'],
    ['+', 'Nachlegen', 'Alle außer dem Verteidiger dürfen Werte nachlegen, die schon auf dem Tisch liegen.'],
    [
      `${DK_MAX_ATTACK}×`,
      'Höchstens sechs',
      'Nie mehr Angriffskarten, als der Verteidiger zu Beginn auf der Hand hatte.',
      'e',
    ],
  ];
  if (R.transfer) {
    it.push([
      '↪',
      'Weiterschieben',
      'Solange nichts geschlagen ist, gleichen Wert dazulegen. Dann muss der Nächste alles abwehren.',
      'e',
    ]);
  }
  it.push(['✓', 'Bito', 'Alles geschlagen, die Karten sind weg und der Verteidiger greift als Nächstes an.', 'e']);
  it.push([
    'A',
    'Reihenfolge',
    `6 bis 10, dann Bube, Dame, König und Ass. Ab ${DK_FULL_DECK} Leuten geht es schon bei der 2 los.`,
  ]);
  return it;
}

function legendSchnautz(rules: Rules): LegendItem[] {
  const it: LegendItem[] = [
    ['A', '11 Punkte', 'Das Ass ist die stärkste Karte.'],
    ['K', '10 Punkte', 'König, Dame, Bube und Zehn zählen je 10.'],
    ['9', 'Augenzahl', 'Neun, Acht und Sieben zählen, was draufsteht.'],
    ['♥', 'Eine Farbe', 'Gezählt werden nur Karten derselben Farbe.', 'r'],
    ['3×', '30,5', 'Drei gleiche Werte, etwa drei Buben.', 'e'],
    ['31', 'Schnautz', 'Sofort aufdecken, die Runde ist vorbei.', 'e'],
  ];
  if (rules.feuer) it.push(['🔥', 'Feuer', 'Drei Asse zählen 33. Alle anderen verlieren einen Deckel.', 'e']);
  return it;
}

function legendCabo(rules: Rules): LegendItem[] {
  const R = rules.cb ?? DEFAULT_RULES.cb;
  const it: LegendItem[] = [
    ['A', 'Wenig ist gut', 'Ass 1, 2 bis 10 wie draufsteht, Bube 11, Dame 12.'],
    ['K', 'König 13 oder 0', 'Schwarz zählt 13, Rot zählt 0 und ist Gold wert.', 'r'],
    ['7/8', 'Eigene ansehen', 'Vom Stapel ziehen, ablegen und eine eigene Karte ansehen.'],
    ['9/10', 'Fremde ansehen', 'Ablegen und bei jemand anderem eine Karte ansehen.'],
    ['B/D', 'Blind tauschen', 'Ablegen und eine eigene Karte ungesehen gegen eine fremde tauschen.'],
    ['2×', 'Gleiche zusammen', 'Gleiche Werte auf einmal tauschen. Daneben kostet eine Strafkarte.', 'e'],
    [
      '📣',
      'Cabo rufen',
      `Statt zu ziehen. Alle anderen sind noch einmal dran. Nicht am wenigsten heißt ${CB_PENALTY} obendrauf.`,
      'e',
    ],
    ['💥', 'Kamikaze', `Zwei Damen und zwei schwarze Könige geben allen anderen ${CB_KAMI}, dir 0.`, 'e'],
    [
      `${CB_RESET_AT}`,
      `Zurück auf ${CB_RESET_TO}`,
      `Genau ${CB_RESET_AT} Punkte fallen einmal pro Partie auf ${CB_RESET_TO}.`,
      'e',
    ],
  ];
  if (R.snap)
    it.push(['⚡', 'Schnappen', 'Gleichen Wert jederzeit auf die Ablage werfen. Daneben kostet eine Strafkarte.', 'e']);
  return it;
}

/** Raster mit Kartensymbol und Erklärung, für Seitenleiste und Regelfenster. */
export function legendGrid(game: GameKind, rules: Rules): string {
  const rows = legendItems(game, rules).map(
    ([badge, title, text, style]) =>
      `<span class="rk${style ? ` ${style}` : ''}">${esc(badge)}</span><span class="t"><b>${esc(title)}</b><span>${esc(text)}</span></span>`,
  );
  return `<div class="lg">${rows.join('')}</div>`;
}

export function legendTitle(game: GameKind): string {
  switch (game) {
    case 'shithead':
      return 'Sonderkarten';
    case 'durak':
      return 'Das Wichtigste';
    case 'schnautz':
      return 'Kartenwerte';
    case 'cabo':
      return 'Werte und Fähigkeiten';
    default:
      return unreachable(game);
  }
}

function legendHTML(v: View, mobile: boolean): string {
  const on = legendOn(mobile);
  let h =
    `<div class="legend-h"><span>${legendTitle(v.game)}</span>` +
    `<button type="button" data-act="legend" data-m="${mobile ? 1 : 0}">${on ? 'ausblenden' : 'einblenden'}</button></div>`;
  if (on) h += legendGrid(v.game, v.rules);
  return h;
}

let lastKey: string | null = null;

/** Zeichnet die Legende nur neu, wenn sich Spiel, Regeln, Schalter oder Bildschirmbreite geändert haben. */
export function renderLegend(v: View, force = false): void {
  const mobile = isMobile();
  // Die Legende hängt nur vom Spiel und seinen Regeln ab
  const key = v.game + JSON.stringify(v.rules) + legendOn(mobile) + mobile;
  if (!force && lastKey === key) return;
  lastKey = key;
  $('#legend').innerHTML = legendHTML(v, mobile);
}

export function resetLegend(): void {
  lastKey = null;
}
