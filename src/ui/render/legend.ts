/* Übersicht, was die Karten können. Am Desktop an der Seite, außerdem oben im Regelfenster. */
import { DEFAULT_RULES, SH_WIN_MS } from '../../game/constants';
import type { GameKind, Rules, View } from '../../game/types';
import { $, esc, isMobile } from '../dom';
import { LS } from '../storage';

type LegendItem = [badge: string, title: string, text: string, style?: 'e' | 'r'];

/** Am Desktop standardmäßig an, mobil standardmäßig zu. */
export function legendOn(mobile: boolean): boolean {
  const x = LS.get<boolean | null>(mobile ? 'legendM' : 'legend', null);
  return x == null ? !mobile : x;
}

function legendItems(game: GameKind, rules: Rules): LegendItem[] {
  if (game === 'shithead') {
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

/** Raster mit Kartensymbol und Erklärung, für Seitenleiste und Regelfenster. */
export function legendGrid(game: GameKind, rules: Rules): string {
  const rows = legendItems(game, rules).map(
    ([badge, title, text, style]) =>
      `<span class="rk${style ? ` ${style}` : ''}">${esc(badge)}</span><span class="t"><b>${esc(title)}</b><span>${esc(text)}</span></span>`,
  );
  return `<div class="lg">${rows.join('')}</div>`;
}

export const legendTitle = (game: GameKind): string => (game === 'shithead' ? 'Sonderkarten' : 'Kartenwerte');

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
  const key = v.game + JSON.stringify(v.game === 'shithead' ? v.rules.sh : v.rules.feuer) + legendOn(mobile) + mobile;
  if (!force && lastKey === key) return;
  lastKey = key;
  $('#legend').innerHTML = legendHTML(v, mobile);
}

export function resetLegend(): void {
  lastKey = null;
}
