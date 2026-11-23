/*
 * Tipps in der Oberfläche: Knopf und Fenster für Fertige, Zahlen an den Kacheln und Sprüche, wenn jemand
 * auf mich tippt. Das Fenster wird beim Aktualisieren nur geflickt, damit eine Auswahl nicht verloren geht.
 */
import { shBetCandidates, shBetQuote, shBetsOn, shCanBet } from '../../game/bets';
import type { LogEntry, View } from '../../game/types';
import { App } from '../app';
import { $, $opt, esc, num } from '../dom';
import { floatLabel, tauntLabel } from '../feedback';
import { myTurn, nameOf, seatOrder } from '../helpers';
import { sfx } from '../sound';
import { taunt } from '../taunts';

export const BETUI = { pend: null as { games: number; text: string } | null };

export function resetBetUI(): void {
  BETUI.pend = null;
  App.betSel = null;
  App.betSeen = -1;
}

const count = (x: unknown): number => (Array.isArray(x) ? x.length : typeof x === 'number' ? x : 0);

function cardsLeft(v: View, id: string): number {
  const P = v.sh?.P[id];
  return P ? count(P.hand) + count(P.up) + count(P.down) : 0;
}

/** 🔮 mit Zahl an der Kachel, wenn auf diese Person getippt wurde. */
export function betTagHTML(v: View, id: string): string {
  if (v.phase !== 'play') return '';
  const n = shBetsOn(v, id).length;
  return n ? `<span class="tag bet" title="So oft getippt">🔮 ${n}</span>` : '';
}

/** Untertitel für Fertige und für alle, auf die getippt wurde. */
export function betSub(v: View, place: number): string | null {
  if (shCanBet(v, App.me)) return `Platz ${num(place)}. Tipp jetzt, wer Shithead wird.`;
  const mine = v.sh?.bets?.[App.me];
  if (mine && typeof mine.on === 'string') return `Platz ${num(place)}. Dein Tipp steht, jetzt heißt es mitfiebern.`;
  return null;
}

export function betsOnMeSub(v: View): string | null {
  const on = shBetsOn(v, App.me);
  if (!on.length) return null;
  if (on.length === 1) {
    const by = Object.entries(v.sh?.bets ?? {}).find(([, b]) => b === on[0])?.[0];
    return `🔮 <b>${esc(nameOf(v, by))}</b> tippt auf dich.`;
  }
  return `🔮 ${on.length} tippen auf dich.`;
}

/** Knopf oder Hinweis am eigenen Platz, wenn ich fertig bin. */
export function betActionHTML(v: View): string {
  if (shCanBet(v, App.me)) {
    const pulse = App.betSeen !== v.games ? ' pulse' : '';
    return `<button class="btn primary betbtn${pulse}" data-act="betopen"><span class="bl">🔮 Tippen, wer Shithead wird</span></button>`;
  }
  const mine = v.sh?.bets?.[App.me];
  if (v.phase === 'play' && mine && typeof mine.on === 'string')
    return `<div class="betnote"><span class="bl">🔮 Du tippst auf ${esc(nameOf(v, mine.on))} · ${num(mine.q)} ${mine.q === 1 ? 'Punkt' : 'Punkte'}</span></div>`;
  return '';
}

export function openBetModal(v: View): void {
  if (!shCanBet(v, App.me)) return;
  App.betSel = null;
  App.betSeen = v.games;
  $('#modal').innerHTML =
    '<div class="modal betm"><div class="paper sheet bets" role="dialog" aria-labelledby="bet-h">' +
    '<button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    '<h2 id="bet-h">Wer wird <span class="r">Shithead</span>?</h2><div class="betbody"></div></div></div>';
  renderBetModal(v);
}

/** Fenster aktualisieren, ohne es neu einzublenden. Geht Tippen nicht mehr, schließt es. */
export function renderBetModal(v: View): void {
  const body = $opt('#modal .paper.bets .betbody');
  if (!body) return;
  if (!shCanBet(v, App.me)) {
    $('#modal').innerHTML = '';
    return;
  }
  const cands = seatOrder(v).filter((p) => shBetCandidates(v).some((c) => c.id === p.id));
  if (App.betSel && !cands.some((p) => p.id === App.betSel)) App.betSel = null;
  const q = shBetQuote(v);
  const ids = cands.map((p) => p.id).join(',');
  if (!body.firstElementChild) {
    body.innerHTML =
      '<p class="lead"><span class="q"></span><span class="more"></span></p><div class="betgrid"></div>' +
      '<div class="foot"><button class="btn primary" id="bet-ok" data-act="shbet"><span class="bl"></span></button></div>';
  }
  const set = (sel: string, text: string) => {
    const el = body.querySelector(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set('.q', `Ein Treffer bringt dir jetzt ${q} ${q === 1 ? 'Punkt' : 'Punkte'}.`);
  set(
    '.more',
    q > 1 ? ' Wer später tippt, bekommt weniger. Dein Tipp gilt bis zum Schluss.' : ' Dein Tipp gilt bis zum Schluss.',
  );
  const grid = body.querySelector<HTMLElement>('.betgrid')!;
  if (grid.dataset.ids !== ids) {
    const focused = grid.contains(document.activeElement);
    grid.dataset.ids = ids;
    grid.innerHTML = cands
      .map(
        (p) =>
          `<button type="button" class="betc" data-act="betpick" data-pid="${esc(p.id)}" aria-pressed="false">` +
          `<span class="bn">${esc(p.name)}${p.bot ? '<i class="botb">KI</i>' : ''}</span><span class="bs"></span></button>`,
      )
      .join('');
    if (focused) (grid.querySelector<HTMLElement>('.betc.sel') ?? grid.querySelector<HTMLElement>('.betc'))?.focus();
  }
  grid.querySelectorAll<HTMLElement>('.betc').forEach((b) => {
    const id = b.dataset.pid ?? '';
    const n = cardsLeft(v, id);
    const k = shBetsOn(v, id).length;
    const txt = `${n} ${n === 1 ? 'Karte' : 'Karten'}${k ? ` · 🔮 ${k}` : ''}`;
    const bs = b.querySelector('.bs');
    if (bs && bs.textContent !== txt) bs.textContent = txt;
    const on = App.betSel === id;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const ok = body.querySelector<HTMLButtonElement>('#bet-ok')!;
  ok.disabled = !App.betSel;
  set('#bet-ok .bl', App.betSel ? `Auf ${nameOf(v, App.betSel)} tippen` : 'Erst jemanden wählen');
}

type BetEntry = Extract<LogEntry, { k: 'shbet' }>;

/** Jemand hat getippt: Spruch für die Person, auf die getippt wurde, sonst ein kleiner Hinweis. */
export function betEffect(v: View, e: BetEntry): void {
  const by = nameOf(v, e.p, e.name);
  const on = nameOf(v, e.on, e.onName);
  if (e.on === App.me && e.p !== App.me) {
    const bets = shBetsOn(v, App.me);
    if (bets[0]?.n === e.n) {
      const text = taunt('betOnMe', { name: by }, e.n);
      if (myTurn(v)) BETUI.pend = { games: v.games, text };
      else tauntLabel(text);
    } else floatLabel(undefined, `Schon ${bets.length} tippen auf dich 🔮`);
    return;
  }
  floatLabel(e.p, `tippt auf ${on}`, `tippst auf ${on}`);
  if (e.p !== App.me) sfx('pop');
}
