/* Shithead-Tisch: Gegner, Stapel, Status mit 4er-Fenster und Bombe, eigener Platz und Ergebnis. */
import { rankOf } from '../../game/cards';
import { DEFAULT_RULES, SH_WIN_MS } from '../../game/constants';
import { shCanBomb, shCanPlay, shCanThrow, shTop } from '../../game/shithead';
import type { Card, Player, Rank, ShitheadResult, ShPlayerView, ShView, View } from '../../game/types';
import { App } from '../app';
import { cardHTML } from '../cards';
import { $, esc, hashStr, listJoin, num } from '../dom';
import { holdOverlay } from '../feedback';
import { W, myTurn, nameOf, pById, seatOrder, turnId, vb } from '../helpers';
import { fitHand } from '../shithead/hand';
import { SEQ } from '../shithead/sequence';
import { winLeft } from '../shithead/window';
import { taunt } from '../taunts';
import { overlayFoot } from './schnautz';

type Source = 'hand' | 'up' | 'down';
type OwnCards = { hand: Card[]; up: Card[]; down: Card[] | number };

const THINKING = '<span class="thinking"><i></i><i></i><i></i></span>';
const count = (x: Card[] | number): number => (typeof x === 'number' ? x : x.length);

/** Wie oft jemand schon Shithead war. */
export const shcHTML = (p: Pick<Player, 'shc'>): string =>
  p.shc ? `<span class="shc" title="So oft Shithead gewesen">💩 ${num(p.shc)}</span>` : '';

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

/** Verdeckte und offene Tischkarten eines Spielers. */
function shTableHTML(v: View, P: ShPlayerView, mine: boolean): string {
  const down = count(P.down);
  const up = P.up ?? [];
  const slots = Math.max(down, up.length);
  const src = mine ? shSrc(v) : null;
  const playing = mine && myTurn(v) && !v.sh?.win;
  const meP = pById(v, App.me);
  const swapping = mine && v.phase === 'swap' && !!meP && !meP.ready;
  if (!slots) return '<div class="tcards"><div class="tnone">keine Tischkarten</div></div>';
  const deal = App.anim.deal ? ' deal' : '';
  let h = '<div class="tcards">';
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
      const selectable = swapping || (playing && src === 'up');
      const selected = (swapping && App.sw.u === i) || (App.ss.src === 'up' && App.ss.idx.includes(i));
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

function opponentHTML(v: View, S: ShView, p: Player): string {
  const P = S.P[p.id];
  if (!P) return '';
  const over = v.phase === 'over';
  const tId = turnId(v);
  const hn = count(P.hand);
  let hand = '';
  if (Array.isArray(P.hand) && over)
    hand = P.hand
      .slice(0, 8)
      .map((c) => cardHTML(c))
      .join('');
  else
    for (let i = 0; i < Math.min(hn, 5); i++) hand += cardHTML(null, App.anim.deal ? 'deal' : '', cardStyle(i * 0.05));
  const done = S.finished.includes(p.id);
  let tag = '';
  if (p.out) tag = '<span class="tag outt">raus</span>';
  else if (done) tag = `<span class="tag">Platz ${num(p.place)}</span>`;
  else if (over && S.shithead === p.id) tag = '<span class="tag outt">Shithead</span>';
  else if (v.phase === 'swap')
    tag = p.ready ? '<span class="tag">fertig</span>' : `<span class="tag turn">tauscht${THINKING}</span>`;
  else if (v.phase === 'play' && S.win) {
    if (S.win.by.includes(p.id))
      tag = `<span class="tag turn">${S.win.by[0] === p.id ? 'fängt an' : '4er rein'}</span>`;
  } else if (v.phase === 'play' && tId === p.id) tag = `<span class="tag turn">ist dran${THINKING}</span>`;
  const on = v.phase === 'play' && tId === p.id && !S.win;
  const cls = ['opp sh', on && 'turn', (p.out || done) && 'out', !p.online && 'offline'].filter(Boolean).join(' ');
  return (
    `<div data-pid="${esc(p.id)}" class="${cls}">` +
    shTableHTML(v, P, false) +
    `<div class="ometa"><span class="nm">${esc(p.name)}</span>` +
    `<span class="ohand" title="Karten auf der Hand">${hand}<span class="hcount${hn ? '' : ' zero'}">${hn}</span></span>` +
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
  const deck =
    (dn
      ? cardHTML(null) + (dn > 1 ? cardHTML(null) : '') + (dn > 2 ? cardHTML(null) : '')
      : '<div class="emptyslot"></div>') +
    (dn ? `<span class="pcount" title="Karten zum Nachziehen">${dn}</span>` : '') +
    `<span class="cnt">${dn ? 'ziehen' : 'leer'}</span>`;
  let pileHTML = '';
  for (let k = Math.max(0, pile.length - 5); k < pile.length; k++) {
    // Jede Karte liegt leicht schief, aber immer gleich (Hash statt Zufall)
    const hh = hashStr(`${pile[k]}:${k}`);
    const isTop = k === pile.length - 1;
    const style = `style="--rot:${(hh % 25) - 12}deg; left:${(hh % 11) - 5}px; top:${((hh >> 3) % 9) - 4}px"`;
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
    `<div class="burned" title="Verbrannte Karten"><span class="flame">🔥</span><b>${burned}</b><span>verbrannt</span></div>`;
}

/** Status über dem eigenen Platz: wer dran ist, 4er-Fenster mit Countdown, Bombe-Knopf. */
function statusHTML(
  v: View,
  S: ShView,
  me: Player | null,
  mine: OwnCards | null,
  src: Source | null,
  canAny: boolean,
): string {
  const tId = turnId(v);
  const playing = myTurn(v) && !S.win;
  const meDone = S.finished.includes(App.me);
  let main = '';
  let sub = '';
  if (v.phase === 'swap') {
    if (me && !me.ready) {
      main = '<em>Tauschrunde.</em>';
      sub =
        'Tippe eine Handkarte und dann eine offene Tischkarte an, um sie zu tauschen. Starke Karten lohnen sich auf dem Tisch.';
    } else {
      const wn = v.players.filter((p) => !p.ready && !p.out).map((p) => p.name);
      main = wn.length ? `Warte auf ${esc(listJoin(wn))}…` : 'Gleich geht es los.';
      if (wn.length && App.role === 'host')
        sub = '<button class="btn ghost small" data-act="force">Nicht warten, jetzt starten</button>';
    }
  } else if (v.phase === 'play' && S.win) {
    const canT = shCanThrow(v, App.me);
    const wl = winLeft();
    main = `<em>4er reinwerfen!</em><span class="wincd" id="wincd" style="--p:${(wl / SH_WIN_MS).toFixed(3)}"><b>${Math.ceil(wl / 1000)}</b></span>`;
    const starter = S.win.by[0];
    if (canT) {
      const label = canT.length > 1 ? `Meine ${canT.length} Vieren rein!` : 'Meine 4 rein!';
      sub = `<div class="quick"><button class="btn primary pulse big" data-act="shthrow">${label}</button></div>`;
    } else if (S.win.by.includes(App.me)) {
      sub = `${starter === App.me ? 'Du fängst mit der 4 an.' : 'Deine 4 ist drin.'} Mal sehen, wer noch schnell genug ist.`;
    } else {
      sub = `${W(v, starter)}${vb(starter, ' fängst', ' fängt')} mit der 4 an. Wer noch eine 4 hat, muss schnell sein.`;
    }
  } else if (v.phase === 'play') {
    if (meDone && me) {
      main = 'Du bist fertig!';
      sub = `Platz ${num(me.place)}. Jetzt in Ruhe zuschauen.`;
    }
    if (playing) {
      main = src === 'down' ? '<em>Jetzt blind!</em>' : '<em>Du bist dran.</em>';
      if (src === 'down') sub = 'Tippe eine verdeckte Karte an. Passt sie nicht, nimmst du den Stapel auf.';
      else if (!canAny) sub = 'Keine Karte passt. Du musst den Stapel aufnehmen.';
      else if (src === 'up') sub = 'Deine Hand ist leer. Jetzt sind die offenen Tischkarten dran.';
      else sub = 'Tippe gleiche Karten an und leg sie ab.';
    } else if (!meDone) main = `${W(v, tId)} ist dran.`;
  } else if (v.phase === 'over') main = 'Partie vorbei.';

  const actor = v.phase === 'play' && tId && !S.win ? pById(v, tId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    sub =
      `${esc(actor.name)} ist gerade offline.` +
      (App.role === 'host'
        ? ` <button class="btn ghost small" data-act="skip">Für ${esc(actor.name)} spielen</button>`
        : ' Das Spiel wartet.');
  }
  const bm = v.phase === 'play' && !S.win && mine ? shCanBomb(v, App.me) : null;
  if (bm) {
    const what = `${bm.idx.length > 1 ? `${bm.idx.length}× ` : ''}${esc(shRankLabel(bm.r))}`;
    sub =
      (sub && !sub.includes('quick') ? sub : '') +
      `<div class="quick"><button class="btn bomb pulse" data-act="shbomb">💣 Bombe! ${what} einwerfen</button></div>`;
  }
  return `<div class="main">${main}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
}

/** Eigener Platz: Tischkarten, Hand und Knöpfe. */
function myPlaceHTML(v: View, S: ShView, me: Player, mine: OwnCards, src: Source | null, canAny: boolean): string {
  const playing = myTurn(v) && !S.win;
  const meDone = S.finished.includes(App.me);
  const hand = SEQ.ov?.myHand ?? mine.hand;
  const swapping = v.phase === 'swap' && !me.ready;
  let mh =
    `<div class="mehead"><span class="nm">${esc(me.name)}</span>${shcHTML(me)}` +
    (meDone ? `<span class="tag">Platz ${num(me.place)}</span>` : '') +
    `<span class="pill">${hand.length} ${hand.length === 1 ? 'Karte' : 'Karten'}</span></div>`;
  mh += `<div class="shrow">${shTableHTML(v, mine, true)}<div class="shhand">`;
  hand.forEach((c, i) => {
    const selectable = swapping || (playing && src === 'hand');
    const selected = (swapping && App.sw.h === i) || (App.ss.src === 'hand' && App.ss.idx.includes(i));
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
  mh += '</div></div><div class="actions">';
  if (swapping) {
    mh += '<button class="btn primary" data-act="shready">Fertig getauscht</button>';
  } else if (playing && (src === 'hand' || src === 'up')) {
    const arr = mine[src];
    const selIdx = App.ss.src === src ? App.ss.idx : [];
    const selRank = selIdx.length ? rankOf(arr[selIdx[0]]) : null;
    const label = selRank
      ? `${selIdx.length > 1 ? `${selIdx.length}× ` : ''}${shRankLabel(selRank)} ausspielen`
      : 'Ausspielen';
    const okSel = !!selRank && shCanPlay(v, selRank);
    mh += `<button class="btn primary${okSel ? ' pulse' : ''}" data-act="shplay"${okSel ? '' : ' disabled'}>${esc(label)}</button>`;
    if (selRank) {
      const sameN = arr.filter((c) => rankOf(c) === selRank).length;
      if (sameN > selIdx.length) mh += `<button class="btn ghost" data-act="shselall">Alle ${sameN} wählen</button>`;
    }
    const pileN = S.pile.length;
    mh += `<button class="btn ${canAny ? 'ghost' : 'wood pulse'}" data-act="shpickup"${pileN ? '' : ' disabled'}>Aufnehmen (${pileN})</button>`;
  }
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

  const playing = myTurn(v) && !S.win;
  const meEl = $('#me');
  meEl.className = `me shme${playing || (v.phase === 'swap' && me && !me.ready) ? ' turn' : ''}`;
  meEl.innerHTML =
    me && mine
      ? myPlaceHTML(v, S, me, mine, src, canAny)
      : '<div class="outmsg">Du spielst diese Partie nicht mit.</div>';
  fitHand();
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
    ov.innerHTML = '<button class="btn primary peek" data-act="unpeek">Ergebnis zeigen</button>';
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
        `<div class="row${isL ? ' lose' : i === 0 ? ' win' : ''}"><div class="val" style="min-width:34px;text-align:left">${i + 1}.</div>` +
        `<div class="who"><b>${hat}${nm(id)}</b><span>${what}${p?.shc ? ` · ${num(p.shc)}× Shithead` : ''}</span>${leftCards}</div></div>`
      );
    })
    .join('');
  ov.innerHTML =
    `<div class="modal"><div class="paper"><div class="trophy">${loser === App.me ? '💩' : loser ? '🏆' : '👋'}</div>` +
    `<h2>${title}</h2><p class="lead">${lead}</p>` +
    (tt ? `<p class="taunt${good ? ' good' : ''}">${esc(tt)}</p>` : '') +
    `<div class="rows">${rows}</div>${overlayFoot(v, me)}</div></div>`;
}
