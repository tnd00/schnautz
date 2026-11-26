/* Shithead-Tisch: Gegner, Stapel, Status mit 4er-Fenster und Bombe, eigener Platz, Tauschrunde und Ergebnis. */
import { rankOf } from '../../game/cards';
import { SH_WIN_MS } from '../../game/constants';
import { shCanBomb, shCanPlay, shCanThrow, shNeed, shTopRun } from '../../game/shithead';
import type { Card, Player, Rank, ShitheadResult, ShPlayerView, ShView, View } from '../../game/types';
import { LOSER_MARK } from '../../game/games';
import { App } from '../app';
import { cardHTML, HAND_ICON } from '../cards';
import { layoutOpps } from '../carousel';
import { aimAttrs, marksHTML, reignHTML } from './marks';
import { markClocks } from '../clock';
import { markTosses } from '../toss';
import { $, esc, hashStr, isMobile, num } from '../dom';
import { myTurn, nameOf, onlyBotsPlaying, pById, seatOrder, turnId, vb } from '../helpers';
import { fitHand } from '../shithead/hand';
import { SEQ } from '../shithead/sequence';
import { winLeft, winSecs } from '../shithead/window';
import { taunt } from '../taunts';
import { betActionHTML, betsOnMeSub, betSub, betTagHTML } from './bets';
import { betResultHTML, botsOnlyHTML, renderResult, type Sheet, type SheetRow } from './result';
import { STATUS, SH_SHEET, SH_STATUS, OFFLINE_WAIT, offline, playFor, waitWho } from '../../content/texts/status';
import { ceremonyOn } from '../ceremony';
import { endMain, renderStatus, turnMain, waitSub, type Status } from '../status';
import type { OldTable } from '../table/spec';

type Source = 'hand' | 'up' | 'down';
type OwnCards = { hand: Card[]; up: Card[]; down: Card[] | number };

const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';
const count = (x: Card[] | number): number => (typeof x === 'number' ? x : x.length);

/** Wie oft jemand schon Shithead war. Das Mal der gerade beendeten Partie zählt erst nach der Enthüllung. */
export function shcHTML(p: Pick<Player, 'shc' | 'id'>): string {
  const n = num(p.shc) - (App.zerHide === p.id ? 1 : 0);
  return n > 0 ? `<span class="shc" title="So oft Shithead gewesen">💩 ${n}</span>` : '';
}

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

/** Was als Nächstes auf den Stapel darf. Die Regel dahinter steht in shNeed, dieselbe prüft shWhyNot. */
export function shPileInfo(v: View, pile: Card[]): string {
  const n = shNeed({ rules: v.rules, sh: { pile } });
  switch (n.k) {
    case 'empty':
      return 'Leer, alles geht';
    case 'threes':
      return 'Nur Dreier, alles geht';
    case 'two':
    case 'max':
    case 'min': {
      const txt =
        n.k === 'two' ? 'Nach der 2 geht alles' : n.k === 'max' ? '7 oder niedriger' : `${shRankLabel(n.r)} oder höher`;
      return txt + (n.through ? ' (durch die 3)' : '');
    }
  }
}

const cardStyle = (delay: number) => `style="--d:${delay}s"`;

/** Verdeckte und offene Tischkarten einer Person. `focus`: Die Hand ist leer, jetzt sind sie dran. */
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
      // Ausgegraut bleibt antippbar, der Tipp nennt dann den Grund (src/ui/shithead/input.ts)
      const dim = playing && src === 'up' && !shCanPlay(v, rankOf(c));
      const cls = (selectable ? ' pick' : '') + (selected ? ' sel' : '') + (dim ? ' dim' : '') + deal;
      const attrs =
        (selectable ? `data-act="shu" data-i="${i}" role="button" tabindex="0" ` : '') + cardStyle(0.2 + i * 0.05);
      h += `<div class="upc">${cardHTML(c, cls, attrs)}</div>`;
    }
    h += '</div>';
  }
  return `${h}</div>`;
}

/**
 * Handkarten eines Gegners ohne Tischkarten: ein gehaltener Fächer mit „auf der Hand“ in der Mitte.
 * Ohne die Worte sähen zwei Kartenrücken aus wie verdeckte Tischkarten, die man nur einzeln aufdecken darf.
 * Höchstens vier Karten, damit es auch in schmale Kacheln passt.
 */
function bigHandHTML(hn: number): string {
  let fan = '';
  const shown = Math.min(hn, 4);
  for (let i = 0; i < shown; i++) {
    const rot = (i - (shown - 1) / 2) * 14;
    fan += cardHTML(null, App.anim.deal ? 'deal' : '', `style="--rot:${rot}deg; --d:${i * 0.05}s"`);
  }
  return (
    `<div class="bighand" title="Keine Tischkarten mehr, nur noch ${hn} ${hn === 1 ? 'Handkarte' : 'Handkarten'}">` +
    `<span class="ohand bigfan">${fan}</span>` +
    `<span class="bhn"><b>${hn}</b><span class="bht">auf der Hand</span></span></div>`
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
  if (p.out) tag = '<span class="tag outt">gegangen</span>';
  else if (done) tag = `<span class="tag">Platz ${num(p.place)}</span>`;
  // Bis zur Enthüllung verrät auch das Etikett den Shithead nicht
  else if (over && S.shithead === p.id && App.zerHide !== p.id)
    tag = `<span class="tag outt">${LOSER_MARK.shithead} Shithead</span>`;
  else if (v.phase === 'swap')
    tag = p.ready ? '<span class="tag done">bereit ✓</span>' : `<span class="tag turn">tauscht${THINKING}</span>`;
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
  const warn = shNeed({ rules: v.rules, sh: { pile } }).k === 'max';
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

/**
 * Status über dem eigenen Platz als Daten: wer dran ist, neuer Stapel mit 4er-Knopf, Bombe-Knopf. Ohne DOM, damit
 * Vitest jede Phase prüfen kann. `renderStatus` (src/ui/status.ts) schreibt ihn.
 */
export function shStatus(v: View): Status {
  const S = v.sh;
  const me = pById(v, App.me);
  const mine = shMine(v);
  const src = shSrc(v);
  const tId = turnId(v);
  if (!S) return { main: '', sub: '', tone: 'calm' };
  if (v.phase === 'swap') {
    const wait = v.players.filter((p) => !p.ready && !p.out).map((p) => p.id);
    return me && !me.ready
      ? { main: `<em>${SH_STATUS.swap}</em>`, sub: SH_STATUS.swapSub, tone: 'turn' }
      : { main: SH_STATUS.swap, sub: waitSub(v, wait), tone: 'calm' };
  }
  if (v.phase === 'over') {
    const revealing = !!App.zerHide || ceremonyOn();
    return { main: endMain(v, revealing), sub: revealing ? SH_STATUS.overSub : '', tone: 'over' };
  }
  if (v.phase !== 'play') return { main: '', sub: '', tone: 'calm' };
  const canAny = !!mine && (src === 'hand' || src === 'up') && mine[src].some((c) => shCanPlay(v, rankOf(c)));
  const meDone = S.finished.includes(App.me);
  let st: Status = { main: '', sub: '', tone: 'calm' };
  let quick = '';
  if (meDone && me) {
    st = {
      main: STATUS.done,
      sub: betSub(v, num(me.place)) ?? SH_STATUS.doneSub(num(me.place)),
      tone: 'calm',
    };
    // Nur noch KIs am Spielen: abkürzen statt zuschauen
    if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
  }
  if (myTurn(v) && S.win?.lock) {
    const wl = winLeft();
    st = {
      main: `<em>${STATUS.soon}</em><span class="wincd" id="wincd" style="--p:${Math.min(1, wl / SH_WIN_MS).toFixed(3)}"><b>${winSecs(wl)}</b></span>`,
      sub: SH_STATUS.winMine,
      tone: 'alert',
    };
  } else if (myTurn(v)) {
    const sub =
      src === 'down' ? SH_STATUS.blindSub : !canAny ? SH_STATUS.noFit : src === 'up' ? SH_STATUS.upNow : SH_STATUS.pick;
    st = { main: `<em>${src === 'down' ? SH_STATUS.blind : STATUS.myTurn}</em>`, sub, tone: 'turn' };
  } else if (!meDone) {
    // Mit eigener 4 steht der Knopf statt der Unterzeile (quickHTML), ohne bleibt nur der Tipp-Hinweis
    const four = !!shCanThrow(v, App.me);
    st = { main: turnMain(v, tId), sub: betsOnMeSub(v) ?? '', tone: S.win && four ? 'alert' : 'calm' };
  }
  if (mine && !quick) quick = quickHTML(v);

  const actor = tId ? pById(v, tId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    const nm = esc(actor.name);
    // Ein schneller Knopf (4er, Bombe, Vorspulen) hat Vorrang, sonst hätte der Gastgeber gar keine Aktion mehr
    if (App.role === 'host' && !quick) {
      if (!meDone) st = { ...st, main: offline(`<b>${nm}</b>`) };
      quick = `<button class="btn ghost small" data-act="skip"${S.win?.lock ? ' disabled' : ''}><span class="qlbl">${playFor(nm)}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  // Schnelle Knöpfe ersetzen den Hinweis, die Zeile behält ihre Höhe
  return quick ? { ...st, quick } : st;
}

/** Tauschrunde: eigene Tisch- und Handkarten groß über dem Spielfeld, das noch nicht gebraucht wird. */
function swapHTML(v: View, me: Player, mine: OwnCards): string {
  const ready = me.ready;
  let head: string;
  let foot: string;
  if (!ready) {
    head =
      '<b>Tauschrunde</b><span>Tippe eine Handkarte und eine Tischkarte an, um sie zu tauschen. Starke Karten gehören auf den Tisch.</span>';
    foot = '<button class="btn primary" data-act="shready">Bereit</button>';
  } else {
    const wn = v.players.filter((p) => !p.ready && !p.out).map((p) => p.name);
    head = wn.length
      ? `<b>Bereit!</b><span>Warte auf ${waitWho(wn.map(esc))}${THINKING}</span>`
      : '<b>Bereit!</b><span>Gleich geht es los.</span>';
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
    const dim = playing && src === 'hand' && !shCanPlay(v, rankOf(c));
    const cls =
      (selectable ? 'pick' : '') + (selected ? ' sel' : '') + (dim ? ' dim' : '') + (App.anim.deal ? ' deal' : '');
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

  renderStatus(v);

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

/** Raster der Tauschrunde weg, damit andere Spiele wieder das Karussell bekommen. */
export function clearSwapGrid(): void {
  const el = $('#opps');
  delete el.dataset.grid;
  el.style.removeProperty('--cols');
  el.style.removeProperty('--rowh');
}

/**
 * Tauschrunde am Handy: Die Mitte wird noch nicht gebraucht, also füllen die Gegner den Platz.
 * Alle Kacheln sind gleich groß. Gewählt wird die Aufteilung in eine bis drei Reihen mit den größten Karten,
 * bei drei Gegnern auf einem langen Handy also zwei oben und einer darunter.
 */
export function layoutSwapOpps(v: View): void {
  const el = $('#opps');
  const n = el.children.length;
  if (v.phase !== 'swap' || !isMobile() || !n) {
    clearSwapGrid();
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
    clearSwapGrid();
    return;
  }
  el.style.setProperty('--cols', String(best.cols));
  el.style.setProperty('--rowh', `${Math.floor(best.rowh)}px`);
}

function shitheadResult(v: View): ShitheadResult | null {
  return v.result?.reason === 'shithead' ? v.result : null;
}

/**
 * Ergebnisblatt am Ende als Daten: Shithead mit übrigen Karten als Schlüsselzeile, Spruch oder Duell, Tipps,
 * eigene Zeile und die übrigen in Reihenfolge. `null` außerhalb des Partieendes.
 */
export function shSheet(v: View): Sheet | null {
  const r = shitheadResult(v);
  if (v.phase !== 'over' || !r) return null;
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
  const lead = r.quit ? `${nm(r.quit)}${vb(r.quit, ' hast', ' hat')} den Tisch verlassen.` : '';
  let tt: Sheet['taunt'] = null;
  if (!r.quit && loser) {
    const seed = `o${v.games}`;
    if (loser === App.me) tt = { text: taunt('shLoserSelf', null, seed), good: false };
    else if (first === App.me) tt = { text: taunt('shWinSelf', null, seed), good: true };
    else tt = { text: taunt('shLoserOther', { name: nameOf(v, loser, names[loser]) }, seed), good: false };
  }
  const order = loser ? [...r.ranking, loser] : r.ranking;
  const rows: SheetRow[] = order.map((id, i) => {
    const p = pById(v, id);
    const isL = id === loser;
    const P = v.sh?.P[id];
    const left: Card[] =
      isL && P
        ? [...(Array.isArray(P.hand) ? P.hand : []), ...(P.up ?? []), ...(Array.isArray(P.down) ? P.down : [])]
        : [];
    const what = isL ? SH_SHEET.left(left.length) : i === 0 ? SH_SHEET.first : SH_SHEET.done;
    const n = num(p?.shc);
    return {
      id,
      place: i + 1,
      name: nm(id),
      hat: isL ? LOSER_MARK.shithead : i === 0 ? '👑' : undefined,
      core: n ? `${what} · ${SH_SHEET.count(n)}` : what,
      // Kurzform für lange Namen am Handy: Platz und Krone sagen „fertig“ und „zuerst“ schon, der Zähler wie am Tisch
      short: n ? SH_SHEET.countShort(n) : i === 0 ? SH_SHEET.firstShort : undefined,
      cards: isL ? left : undefined,
      tone: isL ? 'lose' : i === 0 ? 'win' : undefined,
    };
  });
  return {
    icon: loser === App.me ? LOSER_MARK.shithead : loser ? '🏆' : '👋',
    title,
    lead,
    key: loser,
    taunt: tt,
    bets: betResultHTML(v, r.bets, r.shithead, 'Shithead'),
    rows,
    next: 'game',
  };
}

/** Ergebnis am Ende über das gemeinsame Blatt. */
export function renderShOverlay(v: View): void {
  renderResult(v, shSheet(v));
}

export const shSpec: OldTable = { badge: false, old: { draw: renderSh, overlay: renderShOverlay } };
