/* Shithead-Tisch: Gegner, Stapel, Status mit 4er-Fenster und Bombe, eigener Platz, Tauschrunde und Ergebnis. */
import { rankOf } from '../../game/cards';
import { DEFAULT_RULES, SH_WIN_MS } from '../../game/constants';
import { shCanBomb, shCanPlay, shCanThrow, shTop, shTopRun } from '../../game/shithead';
import type { Card, Player, Rank, ShitheadResult, ShPlayerView, ShView, View } from '../../game/types';
import { App } from '../app';
import { cardHTML, HAND_ICON } from '../cards';
import { layoutOpps } from '../carousel';
import { aimAttrs, marksHTML, reignHTML } from './marks';
import { markClocks } from '../clock';
import { markTosses } from '../toss';
import { $, esc, hashStr, isMobile, listJoin, num } from '../dom';
import { holdOverlay } from '../feedback';
import { W, myTurn, nameOf, onlyBotsPlaying, pById, seatOrder, turnId, vb } from '../helpers';
import { fitHand } from '../shithead/hand';
import { SEQ } from '../shithead/sequence';
import { winLeft, winSecs } from '../shithead/window';
import { taunt } from '../taunts';
import { betActionHTML, betsOnMeSub, betSub, betTagHTML } from './bets';
import { rematchLine, rematchMark } from './rematch';
import { botsOnlyHTML, overlayFoot, peekHTML } from './schnautz';

type Source = 'hand' | 'up' | 'down';
type OwnCards = { hand: Card[]; up: Card[]; down: Card[] | number };

const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';
const count = (x: Card[] | number): number => (typeof x === 'number' ? x : x.length);

/** Wie oft jemand schon Shithead war. */
export const shcHTML = (p: Pick<Player, 'shc'>): string =>
  p.shc ? `<span class="shc" title="So oft Shithead gewesen">💩 ${num(p.shc)}</span>` : '';

/** Krone für den letzten Sieger, Haufen für den amtierenden Shithead. */
export { reignHTML };

/** Die eigenen Karten (nur in der eigenen Ansicht sind Handkarten sichtbar). */
export function shMine(v: View): OwnCards | null {
  const P = v.sh?.P[App.me];
  return P && Array.isArray(P.hand) ? { hand: P.hand, up: P.up, down: P.down } : null;
}

/** Woher man gerade spielen muss: erst Hand, dann offene, dann verdeckte Tischkarten. */
export function shSrc(v: View): Source | null {
  const P = shMine(v);
  if (!P) return null;
  if (P.hand.length) return 'hand';
  if (P.up.length) return 'up';
  return count(P.down) ? 'down' : null;
}

const RANK_LABEL: Record<string, string> = { B: 'Bube', D: 'Dame', K: 'König', A: 'Ass' };
export const shRankLabel = (r: Rank): string => RANK_LABEL[r] ?? r;

/** Was als Nächstes auf den Stapel darf. */
function shPileInfo(v: View, pile: Card[]): string {
  const R = v.rules.sh ?? DEFAULT_RULES.sh;
  if (!pile.length) return 'Leer, alles geht';
  const t = shTop({ rules: v.rules, sh: { pile } });
  if (!t) return 'Nur Dreier, alles geht';
  const through = R.three && rankOf(pile[pile.length - 1]) === '3';
  const txt =
    t === '2' && R.two
      ? 'Nach der 2 geht alles'
      : t === '7' && R.seven
        ? '7 oder niedriger'
        : `${shRankLabel(t)} oder höher`;
  return txt + (through ? ' (durch die 3)' : '');
}

const cardStyle = (delay: number) => `style="--d:${delay}s"`;

/** Verdeckte und offene Tischkarten eines Spielers. `focus`: Die Hand ist leer, jetzt sind sie dran. */
function shTableHTML(v: View, P: ShPlayerView, mine: boolean, focus = false): string {
  const down = count(P.down);
  const up = P.up ?? [];
  const slots = Math.max(down, up.length);
  const src = mine ? shSrc(v) : null;
  const playing = mine && myTurn(v) && !v.sh?.win?.lock;
  const meP = pById(v, App.me);
  const swapping = mine && v.phase === 'swap' && !!meP && !meP.ready;
  // Am eigenen Platz sieht man die Hand ohnehin, bei Gegnern steht der Hinweis so hoch wie die Karten
  if (!slots) return mine ? '' : '<div class="tcards"><div class="tnone">keine Tischkarten</div></div>';
  const deal = App.anim.deal ? ' deal' : '';
  let h = `<div class="tcards${focus ? ' focus' : ''}">`;
  for (let i = 0; i < slots; i++) {
    h += '<div class="tslot">';
    if (i < down) {
      const blind = playing && src === 'down';
      const attrs =
        (blind ? `data-act="shd" data-i="${i}" role="button" tabindex="0" ` : '') + cardStyle(0.05 + i * 0.05);
      h += cardHTML(Array.isArray(P.down) ? P.down[i] : null, (blind ? 'pick blindc' : '') + deal, attrs);
    }
    if (i < up.length) {
      const c = up[i];
      const selectable = swapping || (mine && myTurn(v) && src === 'up');
      const selected = mine && ((swapping && App.sw.u === i) || (App.ss.src === 'up' && App.ss.idx.includes(i)));
      const cls =
        (selectable ? ' pick' : '') +
        (selected ? ' sel' : '') +
        (playing && src === 'up' && !shCanPlay(v, rankOf(c)) ? ' dim' : '') +
        deal;
      const attrs =
        (selectable ? `data-act="shu" data-i="${i}" role="button" tabindex="0" ` : '') + cardStyle(0.2 + i * 0.05);
      h += `<div class="upc">${cardHTML(c, cls, attrs)}</div>`;
    }
    h += '</div>';
  }
  return `${h}</div>`;
}

/**
 * Handkarten eines Gegners ohne Tischkarten: ein Fächer mit der Anzahl groß in der Mitte.
 * Höchstens vier Karten, damit es auch in schmale Kacheln passt.
 */
function bigHandHTML(hn: number): string {
  let fan = '';
  const shown = Math.min(hn, 4);
  for (let i = 0; i < shown; i++) {
    const rot = (i - (shown - 1) / 2) * 7;
    fan += cardHTML(null, App.anim.deal ? 'deal' : '', `style="--rot:${rot}deg; --d:${i * 0.05}s"`);
  }
  return (
    `<div class="bighand" title="Nur noch ${hn} ${hn === 1 ? 'Handkarte' : 'Handkarten'}"><span class="ohand bigfan">${fan}</span>` +
    `<span class="bhn"><b>${hn}</b>${HAND_ICON}</span></div>`
  );
}

function opponentHTML(v: View, S: ShView, p: Player): string {
  const P = S.P[p.id];
  if (!P) return '';
  const over = v.phase === 'over';
  const tId = turnId(v);
  const hn = count(P.hand);
  // Keine Tischkarten mehr: Dann zählen nur noch die Handkarten und die sollen alle sehen
  const handOnly = !over && hn > 0 && !P.up.length && !count(P.down);
  // Am Ende liegen die übrigen Handkarten offen
  const revealed =
    Array.isArray(P.hand) && over
      ? P.hand
          .slice(0, 8)
          .map((c) => cardHTML(c))
          .join('')
      : '';
  const done = S.finished.includes(p.id);
  let tag = '';
  if (p.out) tag = '<span class="tag outt">raus</span>';
  else if (done) tag = `<span class="tag">Platz ${num(p.place)}</span>`;
  else if (over && S.shithead === p.id) tag = '<span class="tag outt">Shithead</span>';
  else if (v.phase === 'swap')
    tag = p.ready ? '<span class="tag">fertig</span>' : `<span class="tag turn">tauscht${THINKING}</span>`;
  else if (v.phase === 'play' && tId === p.id) tag = `<span class="tag turn">ist dran${THINKING}</span>`;
  else if (v.phase === 'play' && S.win?.by.includes(p.id)) tag = '<span class="tag four">4er rein</span>';
  // Sonst die Zahl der Tipps auf diese Person
  if (!tag) tag = betTagHTML(v, p.id);
  const on = v.phase === 'play' && tId === p.id;
  const cls = ['opp sh', on && 'turn', (p.out || done) && 'out', !p.online && 'offline', handOnly && 'handonly']
    .filter(Boolean)
    .join(' ');
  const count0 = hn ? '' : ' zero';
  return (
    `<div data-pid="${esc(p.id)}" class="${cls}"${aimAttrs(p)}>` +
    (handOnly ? bigHandHTML(hn) : shTableHTML(v, P, false)) +
    `<div class="ometa">${marksHTML(v, p)}<span class="nm">${esc(p.name)}</span>` +
    (handOnly
      ? ''
      : `<span class="ohand" title="Karten auf der Hand">${revealed}<span class="hcount${count0}">${hn}${HAND_ICON}</span></span>`) +
    `${shcHTML(p)}</div>` +
    (tag || '<span class="tag" style="visibility:hidden">.</span>') +
    '</div>'
  );
}

/** Nachziehstapel, Ablagestapel und verbrannte Karten. Während einer Sequenz zeigt sie deren Zwischenstand. */
export function renderShCenter(v: View): void {
  const S = v.sh;
  if (!S) return;
  const R = v.rules.sh ?? DEFAULT_RULES.sh;
  const ov = SEQ.ov;
  const pile = ov ? ov.pile : S.pile;
  const burned = ov ? ov.burned : num(S.burned);
  const dn = num(S.deck);
  // Die Zahl am Stapel reicht als Beschriftung, darunter ist Platz für lange Hinweise zum Ablagestapel
  const deck = dn
    ? cardHTML(null) +
      (dn > 1 ? cardHTML(null) : '') +
      (dn > 2 ? cardHTML(null) : '') +
      `<span class="pcount" title="Karten zum Nachziehen">${dn}</span>`
    : '<div class="emptyslot">leer</div>';
  let pileHTML = '';
  for (let k = Math.max(0, pile.length - 5); k < pile.length; k++) {
    // Jede Karte liegt leicht schief, aber immer gleich (Hash statt Zufall). Nur wenig, sonst ragt sie in den Hinweis darunter
    const hh = hashStr(`${pile[k]}:${k}`);
    const isTop = k === pile.length - 1;
    const style = `style="--rot:${(hh % 15) - 7}deg; left:${(hh % 7) - 3}px; top:${((hh >> 3) % 5) - 2}px"`;
    pileHTML += cardHTML(pile[k], isTop && App.anim.pilePop && !ov ? 'pop' : '', style);
  }
  if (!pile.length) pileHTML = '<div class="emptyslot">leer</div>';
  const warn = R.seven && pile.length && shTop({ rules: v.rules, sh: { pile } }) === '7';
  $('#center').innerHTML =
    '<span class="cap">Stapel</span>' +
    `<div class="deck" title="Nachziehstapel">${deck}</div>` +
    `<div class="pile">${pileHTML}<span class="cnt${warn ? ' warn' : ''}">${esc(shPileInfo(v, pile))}</span>` +
    (pile.length > 5 ? `<span class="pcount">${pile.length}</span>` : '') +
    '</div>' +
    `<div class="burned" title="Verbrannte Karten"><span class="flame">🔥</span><b>${burned}</b><span class="cnt">verbrannt</span></div>`;
}

/** Knopf zum Reinwerfen der eigenen 4er. Macht die letzte 4 den Stapel voll, ist es eine Bombe. */
function throwBtn(v: View): string {
  const t = shCanThrow(v, App.me);
  if (!t) return '';
  const top = shTopRun(v);
  const have = (top.r === '4' ? top.k : 0) + t.idx.length;
  const n = t.idx.length;
  const label = `${n > 1 ? `${n} Vieren` : '4'}${t.src === 'up' ? ' vom Tisch' : ''} reinwerfen`;
  if (have >= 4) return `<button class="btn bomb pulse" data-act="shthrow">💣 Bombe! ${label}</button>`;
  return `<button class="btn throw pulse" data-act="shthrow">${label}</button>`;
}

/** Knopf für eine schnelle Aktion außer der Reihe: 4er reinwerfen oder Bombe einwerfen. */
export function quickHTML(v: View): string {
  const S = v.sh;
  if (v.game !== 'shithead' || v.phase !== 'play' || !S || !shMine(v)) return '';
  if (S.win) return throwBtn(v);
  const bm = shCanBomb(v, App.me);
  if (!bm) return '';
  const what = `${bm.idx.length > 1 ? `${bm.idx.length}× ` : ''}${esc(shRankLabel(bm.r))}`;
  return `<button class="btn bomb pulse" data-act="shbomb">💣 Bombe! ${what} einwerfen</button>`;
}

/** Status über dem eigenen Platz: wer dran ist, neuer Stapel mit 4er-Knopf, Bombe-Knopf. */
function statusHTML(
  v: View,
  S: ShView,
  me: Player | null,
  mine: OwnCards | null,
  src: Source | null,
  canAny: boolean,
): string {
  const tId = turnId(v);
  const meDone = S.finished.includes(App.me);
  let main = '';
  let sub = '';
  let quick = '';
  if (v.phase === 'play') {
    if (meDone && me) {
      main = 'Du bist fertig!';
      sub = betSub(v, num(me.place)) ?? `Platz ${num(me.place)}. Werfen und tröten darfst du trotzdem.`;
      // Nur noch KIs am Spielen: abkürzen statt zuschauen
      if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
    }
    if (myTurn(v) && S.win?.lock) {
      const wl = winLeft();
      main = `<em>Gleich bist du dran.</em><span class="wincd" id="wincd" style="--p:${Math.min(1, wl / SH_WIN_MS).toFixed(3)}"><b>${winSecs(wl)}</b></span>`;
      sub = 'Neuer Stapel: Alle dürfen jetzt ihre 4er reinwerfen, du auch.';
    } else if (myTurn(v)) {
      main = src === 'down' ? '<em>Jetzt blind!</em>' : '<em>Du bist dran.</em>';
      if (src === 'down') sub = 'Tippe eine verdeckte Karte an. Passt sie nicht, nimmst du den Stapel auf.';
      else if (!canAny) sub = 'Keine Karte passt. Du musst den Stapel aufnehmen.';
      else if (src === 'up') sub = 'Deine Hand ist leer. Jetzt sind die offenen Tischkarten dran.';
      else sub = 'Tippe gleiche Karten an und leg sie ab.';
    } else if (!meDone) {
      main = `${W(v, tId)} ist dran.`;
      if (S.win) sub = 'Neuer Stapel: Wer eine 4 hat, darf sie jetzt reinwerfen.';
      else sub = betsOnMeSub(v) ?? '';
    }
    if (mine && !quick) quick = quickHTML(v);
  } else if (v.phase === 'over') main = 'Partie vorbei.';

  const actor = v.phase === 'play' && tId ? pById(v, tId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    sub =
      `${esc(actor.name)} ist gerade offline.` +
      (App.role === 'host'
        ? ` <button class="btn ghost small" data-act="skip"${S.win?.lock ? ' disabled' : ''}>Für ${esc(actor.name)} spielen</button>`
        : ' Das Spiel wartet.');
  }
  // Schnelle Knöpfe ersetzen den Hinweis, damit die Zeile nicht springt
  const second = quick ? `<div class="quick">${quick}</div>` : sub ? `<div class="sub">${sub}</div>` : '';
  return `<div class="main">${main}</div>${second}`;
}

/** Tauschrunde: eigene Tisch- und Handkarten groß über dem Spielfeld, das noch nicht gebraucht wird. */
function swapHTML(v: View, me: Player, mine: OwnCards): string {
  const ready = me.ready;
  let head: string;
  let foot: string;
  if (!ready) {
    head =
      '<b>Tauschrunde</b><span>Tippe eine Handkarte und eine Tischkarte an, um sie zu tauschen. Starke Karten gehören auf den Tisch.</span>';
    foot = '<button class="btn primary" data-act="shready">Fertig getauscht</button>';
  } else {
    const wn = v.players.filter((p) => !p.ready && !p.out).map((p) => p.name);
    head = wn.length
      ? `<b>Fertig!</b><span>Warte auf ${esc(listJoin(wn))}${THINKING}</span>`
      : '<b>Fertig!</b><span>Gleich geht es los.</span>';
    foot =
      wn.length && App.role === 'host'
        ? '<button class="btn ghost" data-act="force">Nicht warten, jetzt starten</button>'
        : '';
  }
  let hand = '';
  mine.hand.forEach((c, i) => {
    const sel = !ready && App.sw.h === i;
    const cls = (ready ? '' : 'pick') + (sel ? ' sel' : '') + (App.anim.deal ? ' deal' : '');
    const attrs = (ready ? '' : `data-act="shh" data-i="${i}" role="button" tabindex="0" `) + cardStyle(0.3 + i * 0.06);
    hand += cardHTML(c, cls, attrs);
  });
  return (
    `<div class="swhead">${head}</div>` +
    '<div class="swrow"><span class="swlbl">Auf dem Tisch</span>' +
    shTableHTML(v, mine, true) +
    '</div><div class="swrow"><span class="swlbl">Auf der Hand</span>' +
    `<div class="shhand">${hand}</div></div>` +
    `<div class="actions">${foot}</div>`
  );
}

/** Eigener Platz: Tischkarten, Hand und Knöpfe. */
function myPlaceHTML(v: View, S: ShView, me: Player, mine: OwnCards, src: Source | null, canAny: boolean): string {
  if (v.phase === 'swap') return swapHTML(v, me, mine);
  const locked = myTurn(v) && !!S.win?.lock;
  const playing = myTurn(v) && !locked;
  const meDone = S.finished.includes(App.me);
  const hand = SEQ.ov?.myHand ?? mine.hand;
  // Ist die Hand leer, rücken die Tischkarten groß in den Fokus
  const focus = !hand.length && (src === 'up' || src === 'down');
  let mh =
    `<div class="mehead">${reignHTML(v, me.id)}<span class="nm">Du</span>${shcHTML(me)}` +
    (meDone ? `<span class="tag">Platz ${num(me.place)}</span>` : '') +
    `<span class="pill">${hand.length ? `${hand.length}${HAND_ICON}${hand.length === 1 ? 'Handkarte' : 'Handkarten'}` : `${HAND_ICON}Hand leer`}</span></div>`;
  mh += `<div class="shrow${focus ? ' focus' : ''}">${shTableHTML(v, mine, true, focus)}`;
  if (hand.length) mh += '<div class="shhand">';
  hand.forEach((c, i) => {
    // Während der kurzen Sperre darf man schon auswählen, nur noch nicht legen
    const selectable = myTurn(v) && src === 'hand';
    const selected = App.ss.src === 'hand' && App.ss.idx.includes(i);
    const cls =
      (selectable ? 'pick' : '') +
      (selected ? ' sel' : '') +
      (playing && src === 'hand' && !shCanPlay(v, rankOf(c)) ? ' dim' : '') +
      (App.anim.deal ? ' deal' : '');
    const attrs =
      (selectable ? `data-act="shh" data-i="${i}" role="button" tabindex="0" ` : '') +
      cardStyle(0.3 + Math.min(i, 8) * 0.06);
    mh += cardHTML(c, cls, attrs);
  });
  if (hand.length) mh += '</div>';
  mh += '</div><div class="actions">';
  if (myTurn(v) && (src === 'hand' || src === 'up')) {
    const arr = mine[src];
    const selIdx = App.ss.src === src ? App.ss.idx : [];
    const selRank = selIdx.length ? rankOf(arr[selIdx[0]]) : null;
    const label = selRank
      ? `${selIdx.length > 1 ? `${selIdx.length}× ` : ''}${shRankLabel(selRank)} ausspielen`
      : 'Ausspielen';
    const okSel = playing && !!selRank && shCanPlay(v, selRank);
    mh += `<button class="btn primary${okSel ? ' pulse' : ''}" data-act="shplay"${okSel ? '' : ' disabled'}>${esc(locked ? 'Moment…' : label)}</button>`;
    if (selRank) {
      const sameN = arr.filter((c) => rankOf(c) === selRank).length;
      if (sameN > selIdx.length) mh += `<button class="btn ghost" data-act="shselall">Alle ${sameN} wählen</button>`;
    }
    const pileN = S.pile.length;
    const pickOk = playing && pileN > 0;
    mh += `<button class="btn ${canAny || !pickOk ? 'ghost' : 'wood pulse'}" data-act="shpickup"${pickOk ? '' : ' disabled'}>Aufnehmen (${pileN})</button>`;
  } else if (meDone) mh += betActionHTML(v);
  return `${mh}</div>`;
}

export function renderSh(v: View): void {
  const S = v.sh;
  if (!S) return;
  const me = pById(v, App.me);
  const mine = shMine(v);
  const src = shSrc(v);
  const canAny = !!mine && (src === 'hand' || src === 'up') && mine[src].some((c) => shCanPlay(v, rankOf(c)));

  $('#opps').innerHTML = seatOrder(v)
    .map((p) => opponentHTML(v, S, p))
    .join('');
  renderShCenter(v);

  const stEl = $('#status');
  stEl.className = 'status';
  stEl.innerHTML = statusHTML(v, S, me, mine, src, canAny);

  const playing = myTurn(v) && !S.win?.lock;
  const swap = v.phase === 'swap';
  const meEl = $('#me');
  meEl.className = `me shme${swap ? ' swapping' : ''}${playing || (swap && me && !me.ready) ? ' turn' : ''}`;
  meEl.innerHTML =
    me && mine
      ? myPlaceHTML(v, S, me, mine, src, canAny)
      : '<div class="outmsg">Du spielst diese Partie nicht mit.</div>';
  fitHand();
  layoutSwapOpps(v);
  layoutOpps(v);
  markClocks();
  markTosses();
}

/** Abstände zwischen den Gegnerkacheln in der Tauschrunde, wie in fit.css. */
const SWAP_GAP_X = 8;
const SWAP_GAP_Y = 16;
/** Kleiner dürfen Kacheln nicht werden, sonst übernimmt das Karussell. */
const SWAP_MIN_W = 92;
const SWAP_MIN_H = 80;

/**
 * Tauschrunde am Handy: Die Mitte wird noch nicht gebraucht, also füllen die Gegner den Platz.
 * Alle Kacheln sind gleich groß. Gewählt wird die Aufteilung in eine bis drei Reihen mit den größten Karten,
 * bei drei Gegnern auf einem langen Handy also zwei oben und einer darunter.
 */
export function layoutSwapOpps(v: View): void {
  const el = $('#opps');
  const n = el.children.length;
  const off = () => {
    delete el.dataset.grid;
    el.style.removeProperty('--cols');
    el.style.removeProperty('--rowh');
  };
  if (v.phase !== 'swap' || !isMobile() || !n) {
    off();
    return;
  }
  // Als Raster ausmessen: Das Karussell gibt den Platz frei, den das Raster füllen würde
  el.classList.remove('car');
  el.style.removeProperty('height');
  el.dataset.grid = '1';
  const w0 = el.clientWidth;
  const h0 = el.clientHeight - parseFloat(getComputedStyle(el).paddingTop || '0');
  let best: { tw: number; cols: number; rowh: number } | null = null;
  for (let rows = 1; rows <= Math.min(3, n); rows++) {
    const cols = Math.ceil(n / rows);
    const w = (w0 - (cols - 1) * SWAP_GAP_X) / cols;
    const h = (h0 - (rows - 1) * SWAP_GAP_Y) / rows;
    // Zu schmale oder zu flache Kacheln überlappen, dann lieber das Karussell
    if (w < SWAP_MIN_W || h < SWAP_MIN_H) continue;
    // Kartenbreite wie in fit.css: drei Stapel nebeneinander, darunter Name und Anzahl
    const tw = Math.min((w - 18) / 3.25, (h - 54) / 1.5, 78);
    // Mehr Reihen nur, wenn die Karten dadurch spürbar größer werden
    if (!best || tw > best.tw + 2) best = { tw, cols, rowh: Math.min(h, tw * 1.5 + 54) };
  }
  if (!best) {
    off();
    return;
  }
  el.style.setProperty('--cols', String(best.cols));
  el.style.setProperty('--rowh', `${Math.floor(best.rowh)}px`);
}

function shitheadResult(v: View): ShitheadResult | null {
  return v.result?.reason === 'shithead' ? v.result : null;
}

/** Ergebnis am Ende: Reihenfolge, Shithead mit übrigen Karten und ein frecher Spruch. */
export function renderShOverlay(v: View): void {
  const ov = $('#overlay');
  const r = shitheadResult(v);
  if (v.phase !== 'over' || !r) {
    ov.innerHTML = '';
    return;
  }
  if (holdOverlay()) return;
  if (App.peek) {
    ov.innerHTML = peekHTML(v, pById(v, App.me));
    return;
  }
  const me = pById(v, App.me);
  const loser = r.shithead;
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const title =
    loser === App.me
      ? 'Du bist der <span class="r">Shithead!</span>'
      : loser
        ? `${nm(loser)} ist der <span class="r">Shithead!</span>`
        : 'Partie vorbei';
  const first = r.ranking[0];
  const lead = r.quit
    ? `${nm(r.quit)}${vb(r.quit, ' hast', ' hat')} den Tisch verlassen.`
    : first
      ? first === App.me
        ? 'Du warst zuerst fertig.'
        : `${nm(first)} war zuerst fertig.`
      : '';
  let tt = '';
  let good = false;
  if (!r.quit && loser) {
    const seed = `o${v.games}`;
    if (loser === App.me) tt = taunt('shLoserSelf', null, seed);
    else if (first === App.me) {
      tt = taunt('shWinSelf', null, seed);
      good = true;
    } else tt = taunt('shLoserOther', { name: nameOf(v, loser, names[loser]) }, seed);
  }
  const rline = rematchLine(v);
  const order = loser ? [...r.ranking, loser] : r.ranking;
  const rows = order
    .map((id, i) => {
      const p = pById(v, id);
      const isL = id === loser;
      const P = v.sh?.P[id];
      const left: Card[] =
        isL && P
          ? [...(Array.isArray(P.hand) ? P.hand : []), ...(P.up ?? []), ...(Array.isArray(P.down) ? P.down : [])]
          : [];
      const what = isL
        ? `${left.length} ${left.length === 1 ? 'Karte übrig' : 'Karten übrig'}`
        : i === 0
          ? 'zuerst fertig'
          : 'fertig';
      const hat = isL ? '<span class="hat">💩</span>' : i === 0 ? '<span class="hat">👑</span>' : '';
      const leftCards =
        isL && left.length
          ? `<div class="mini shleft">${left
              .slice(0, 8)
              .map((c) => cardHTML(c))
              .join('')}${left.length > 8 ? `<span class="more">+${left.length - 8}</span>` : ''}</div>`
          : '';
      return (
        `<div class="row${isL ? ' lose' : i === 0 ? ' win' : ''}" data-pid="${esc(id)}"${aimAttrs(p, true)}><div class="val" style="min-width:34px;text-align:left">${i + 1}.</div>` +
        `<div class="who"><b>${hat}${nm(id)}${rematchMark(v, id)}</b><span>${what}${p?.shc ? ` · ${num(p.shc)}× Shithead` : ''}</span>${leftCards}</div></div>`
      );
    })
    .join('');
  ov.innerHTML =
    `<div class="modal"><div class="paper sheet result"><div class="trophy">${loser === App.me ? '💩' : loser ? '🏆' : '👋'}</div>` +
    `<h2>${title}</h2><p class="lead">${lead}</p>` +
    (rline ? `<p class="taunt rv">${rline}</p>` : tt ? `<p class="taunt${good ? ' good' : ''}">${esc(tt)}</p>` : '') +
    `<div class="rows">${rows}</div>${betResultHTML(v, r)}${overlayFoot(v, me)}</div></div>`;
}

/** Eine Zeile unter den Plätzen: Wer hat richtig getippt? */
function betResultHTML(v: View, r: ShitheadResult): string {
  const bets = Array.isArray(r.bets) ? r.bets : [];
  if (!bets.length) return '';
  if (!r.shithead) return '<p class="betres">🔮 Ohne Shithead zählt kein Tipp.</p>';
  const mine = bets.find((b) => b.p === App.me);
  const others = bets.filter((b) => b.ok && b.p !== App.me);
  const names = r.names ?? {};
  const list = others.map((b) => `${esc(nameOf(v, b.p, names[b.p]))} (+${num(b.q)})`);
  let text = '';
  if (mine)
    text = mine.ok
      ? `Richtig getippt! +${num(mine.q)} ${mine.q === 1 ? 'Punkt' : 'Punkte'}.`
      : 'Dein Tipp lag daneben.';
  if (list.length) text += `${text ? ' ' : ''}${mine ? 'Auch richtig' : 'Richtig getippt'}: ${listJoin(list)}.`;
  else if (!mine) text = 'Niemand hat richtig getippt.';
  return `<p class="betres">🔮 ${text}</p>`;
}
