import { handValue, szWhyNot } from '../../game/schnautz';
import type { Card, HandValue, LifeChange, SchnautzResult, View } from '../../game/types';
import { activeList } from '../../game/state';
import { onlyBotsPlaying } from '../../game/games';
import { App } from '../app';
import { cardHTML, fmtVal, livesHTML, valHTML } from '../cards';
import { layoutOpps } from '../carousel';
import { aimAttrs, marksHTML } from './marks';
import { markClocks } from '../clock';
import { markTosses } from '../toss';
import { $, esc, listJoin, num } from '../dom';
import { dealerId, myTurn, nameOf, pById, roundBest, schnautzResult, seatOrder, turnId } from '../helpers';
import { botsOnlyHTML, renderResult, type Sheet, type SheetRow } from './result';
import { taunt } from '../taunts';
import { ceremonyOn } from '../ceremony';
import { endMain, renderStatus, turnMain, whoHTML, type Status } from '../status';
import { OFFLINE_WAIT, offline, STATUS } from '../../content/texts/status';
import { SZ_SHEET, SZ_STATUS } from '../../content/texts/status-schnautz';
import { ctxOfView, rejectText } from '../../content/texts/reject';

/** Schnautz-Tisch: Gegner, Mitte, Status und eigene Hand. */
export function renderGame(v: View): void {
  const tId = turnId(v);
  const dId = dealerId(v);
  const reveal: SchnautzResult | null = v.phase === 'end' || v.phase === 'over' ? schnautzResult(v) : null;
  // Gegner
  let oh = '';
  seatOrder(v).forEach((p) => {
    let cards = '';
    const hidden = v.hands[p.id];
    if (reveal?.hands[p.id]) cards = reveal.hands[p.id].map((c) => cardHTML(c)).join('');
    else if (typeof hidden === 'number') {
      for (let i = 0; i < hidden; i++)
        cards += cardHTML(null, App.anim.deal ? 'deal' : '', 'style="--d:' + (i * 0.08 + 0.05) + 's"');
    }
    let tag = '';
    const live = v.phase === 'choose' || v.phase === 'play';
    if (p.out) tag = '';
    else if (!live) tag = '';
    else if (v.phase === 'play' && tId === p.id)
      tag = '<span class="tag turn">ist dran<span class="thinking"><i></i><i></i><i></i></span></span>';
    else if (v.phase === 'choose' && dId === p.id)
      tag = '<span class="tag turn">gibt<span class="thinking"><i></i><i></i><i></i></span></span>';
    else if (v.knocker === p.id) tag = '<span class="tag knock">hat geklopft</span>';
    else if (dId === p.id) tag = '<span class="tag">gibt</span>';
    const on = (v.phase === 'play' && tId === p.id) || (v.phase === 'choose' && dId === p.id);
    let rcls = '';
    if (reveal?.changes) {
      if (reveal.changes[p.id]) rcls = ' rlose';
      else if (roundBest(v).includes(p.id) && Object.keys(reveal.changes).length) rcls = ' rwin';
    }
    oh +=
      '<div class="opp' +
      (on ? ' turn' : '') +
      (p.out ? ' out' : '') +
      (!p.online ? ' offline' : '') +
      rcls +
      '" data-pid="' +
      esc(p.id) +
      '"' +
      aimAttrs(p) +
      '>' +
      '<div class="ocards">' +
      cards +
      '</div><div class="ometa">' +
      marksHTML(v, p) +
      '<span class="nm">' +
      esc(p.name) +
      '</span>' +
      livesHTML(p, v.rules) +
      '</div>' +
      (tag || '<span class="tag" style="visibility:hidden">.</span>') +
      '</div>';
  });
  $('#opps').innerHTML = oh;
  layoutOpps(v);

  // Mitte
  const me = pById(v, App.me);
  const ownHand = v.hands[App.me];
  const mine: Card[] | null = Array.isArray(ownHand) ? ownHand : null;
  const playing = myTurn(v),
    sel = App.sel;
  let ch = '<span class="cap">' + (v.phase === 'choose' ? 'Zweites Blatt' : 'Mitte') + '</span>';
  // Die Zahl sitzt als Plakette am Stapel wie bei Shithead, darunter braucht die Mitte keinen Platz
  ch +=
    `<div class="deck" title="${num(v.deck)} Karten im Stapel">` +
    cardHTML(null) +
    cardHTML(null) +
    cardHTML(null) +
    `<span class="pcount">${num(v.deck)}</span></div>`;
  ch += '<div class="middle">';
  if (v.phase === 'choose') {
    for (let j = 0; j < 3; j++)
      ch +=
        '<div class="slot">' +
        cardHTML(null, App.anim.deal ? 'deal' : '', 'style="--d:' + (0.3 + j * 0.08) + 's"') +
        '</div>';
  } else {
    (v.middle || []).forEach((c, i) => {
      const cls =
        (playing ? 'pick' : '') + (sel.m === i ? ' sel' : '') + (App.anim.deal || App.anim.dealMid ? ' deal' : '');
      ch +=
        '<div class="slot">' +
        cardHTML(
          c,
          cls,
          'data-act="mid" data-i="' +
            i +
            '" style="--d:' +
            (0.3 + i * 0.08) +
            's"' +
            (playing ? ' role="button" tabindex="0"' : ''),
        ) +
        '</div>';
    });
  }
  ch += '</div>';
  $('#center').innerHTML = ch;

  renderStatus(v);

  // Eigene Hand
  let mh = '';
  const handCards = reveal?.hands[App.me] ?? mine;
  const isOn = playing || (v.phase === 'choose' && dId === App.me);
  if (!me || me.out) {
    mh =
      '<div class="mehead"><span class="nm">Du</span>' +
      (me ? livesHTML(me, v.rules) : '') +
      `</div><div class="outmsg">${SZ_STATUS.out}</div>`;
  } else {
    const hv = handValue(handCards ?? undefined, v.rules);
    // Sind Hand- und Tischkarte gewählt, zeigt die Pille den Wert nach dem Tausch. Der Knopf bleibt gleich breit
    const both = playing && sel.h != null && sel.m != null && !!mine;
    let preview = '';
    if (both && mine && sel.h != null && sel.m != null) {
      const nh = mine.slice();
      nh[sel.h] = v.middle[sel.m];
      preview = shortVal(handValue(nh, v.rules));
    }
    const liveMe = v.phase === 'choose' || v.phase === 'play';
    const tagMe = !liveMe
      ? ''
      : v.knocker === App.me
        ? '<span class="tag knock">geklopft</span>'
        : dId === App.me
          ? '<span class="tag">du gibst</span>'
          : '';
    mh +=
      '<div class="mehead"><span class="nm">Du</span>' +
      livesHTML(me, v.rules) +
      tagMe +
      (handCards
        ? '<span class="pill' +
          (hv.v >= 30.5 ? ' hot' : '') +
          (preview ? ' pre' : '') +
          '">' +
          (preview ? shortVal(hv) + ' <span class="to">→ ' + preview + '</span>' : valHTML(hv)) +
          '</span>'
        : '') +
      '</div>';
    mh += '<div class="hand">';
    (handCards || []).forEach((c, i) => {
      const cls =
        (playing ? 'pick' : '') + (sel.h === i ? ' sel' : '') + (App.anim.deal || App.anim.dealHand ? ' deal' : '');
      mh += cardHTML(
        c,
        cls,
        'data-act="hand" data-i="' +
          i +
          '" style="--d:' +
          (0.1 + i * 0.1) +
          's"' +
          (playing ? ' role="button" tabindex="0"' : ''),
      );
    });
    mh += '</div><div class="actions">';
    if (v.phase === 'choose' && dId === App.me) {
      mh +=
        '<button class="btn primary" data-act="keep">Blatt behalten</button><button class="btn ghost" data-act="take">Zweites Blatt nehmen</button>';
    } else if (playing) {
      // Ausgegraut, aber antippbar: Ein Tipp nennt den Grund am Tisch (showReject), statt stumm zu bleiben
      const whyKnock = szWhyNot(v, App.me, 'knock');
      mh +=
        '<button class="btn primary' +
        (both ? ' pulse' : '') +
        '" data-act="swap"' +
        (both ? '' : ` aria-disabled="true" title="${esc(SZ_STATUS.tip)}"`) +
        '>Tauschen</button>';
      mh +=
        '<button class="btn ghost" data-act="swapAll" title="Alle drei Karten mit der Mitte tauschen">Alle drei → ' +
        shortVal(handValue(v.middle, v.rules)) +
        '</button>';
      mh += '<button class="btn ghost" data-act="pass">Schieben</button>';
      mh +=
        '<button class="btn wood" data-act="knock"' +
        (whyKnock
          ? ` aria-disabled="true" title="${esc(rejectText(whyKnock, ctxOfView(v)))}"`
          : ' title="Alle anderen haben noch einen Zug"') +
        '>Klopfen</button>';
      if (whyKnock?.e === 'sz.knockEarly') mh += `<div class="hint">${esc(rejectText(whyKnock, ctxOfView(v)))}</div>`;
    }
    mh += '</div>';
  }
  let mcls = '';
  if (reveal?.changes) {
    if (reveal.changes[App.me]) mcls = ' rlose';
    else if (roundBest(v).includes(App.me) && Object.keys(reveal.changes).length) mcls = ' rwin';
  }
  const meEl = $('#me');
  meEl.className = 'me' + (isOn ? ' turn' : '') + mcls;
  meEl.setAttribute('data-pid', App.me);
  meEl.innerHTML = mh;
  markClocks();
  markTosses();
}

/** Kurzer Handwert für Pille und Knopf: Zahl mit Farbe, besondere Hände nur als Zahl. So bleibt die Breite fest. */
function shortVal(hv: HandValue): string {
  if (hv.kind === 'normal') return valHTML(hv);
  if (hv.kind === 'none') return '';
  return fmtVal(hv.v);
}

/**
 * Status über dem eigenen Platz als Daten: wer gibt oder dran ist, Klopfen, Schieben, Offline. Ohne DOM, damit
 * Vitest jede Phase prüfen kann. Die Hauptzeile hat die festen Formen, alles Schnautz-Eigene steht in der Unterzeile.
 */
export function szStatus(v: View): Status {
  if (v.phase === 'end' || v.phase === 'over') return { main: endMain(v, ceremonyOn()), sub: '', tone: 'over' };
  if (v.phase !== 'choose' && v.phase !== 'play') return { main: '', sub: '', tone: 'calm' };
  const me = pById(v, App.me);
  const tId = turnId(v);
  const dId = dealerId(v);
  const knocker = v.knocker;
  let st: Status;
  let quick = '';
  if (v.phase === 'choose') {
    st =
      dId === App.me
        ? { main: `<em>${STATUS.myTurn}</em>`, sub: SZ_STATUS.chooseMine, tone: 'turn' }
        : { main: turnMain(v, dId), sub: SZ_STATUS.chooseOther, tone: 'calm' };
  } else {
    const active = activeList(v).length;
    const np = num(v.passes);
    const passed = !knocker && np > 0 ? `<span class="np">${SZ_STATUS.passed(np, active)}</span>` : '';
    if (myTurn(v)) {
      st = knocker
        ? { main: `<em>${STATUS.myTurn}</em>`, sub: SZ_STATUS.lastMine(whoHTML(v, knocker)), tone: 'knock' }
        : {
            main: `<em>${STATUS.myTurn}</em>`,
            // Auf sehr kurzen Handys entfällt der Tipp, sobald jemand geschoben hat (fit.css), dann zählt der Stand
            sub: `<span class="tip">${SZ_STATUS.tip}</span>${passed ? ` ${passed}` : ''}`,
            tone: 'turn',
          };
    } else {
      const mine = knocker === App.me;
      st = knocker
        ? {
            main: turnMain(v, tId),
            sub: SZ_STATUS.knocked(mine ? SZ_STATUS.you : whoHTML(v, knocker), mine, Math.max(1, num(v.afterKnock))),
            tone: 'knock',
          }
        : {
            main: turnMain(v, tId),
            sub: passed ? `${passed} <span class="np">${SZ_STATUS.passedAll}</span>` : '',
            tone: 'calm',
          };
    }
  }
  // Raus und nur noch KIs am Spielen: abkürzen statt zuschauen
  if (me?.out && onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);

  const actorId = v.phase === 'choose' ? dId : tId;
  const actor = actorId ? pById(v, actorId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    const nm = esc(actor.name);
    if (App.role === 'host' && !quick) {
      st = { ...st, main: offline(`<b>${nm}</b>`) };
      const label = v.phase === 'choose' ? SZ_STATUS.skipKeep(nm) : SZ_STATUS.skipPass(nm);
      quick = `<button class="btn ghost small" data-act="skip"><span class="qlbl">${label}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  return quick ? { ...st, quick } : st;
}

/** Folge für eine Zeile im Blatt: Leben weg, schwimmt, raus. */
function lifeCore(c: LifeChange, mine: boolean): { hat: string; core: string } {
  if (c.to === 'out') return { hat: '🫧', core: `<span class="conseq">${SZ_SHEET.outNow(mine)}</span>` };
  if (c.to === 'swim') return { hat: '🛟', core: `<span class="conseq swim">${SZ_SHEET.swim(mine)}</span>` };
  return { hat: '💔', core: `<span class="conseq">${SZ_SHEET.life(c.n)}</span>` };
}

/** Bis zu dieser Länge passt „Name gewinnt!“ auch bei 360 px in eine Zeile */
const TITLE_NAME_MAX = 10;

function sheetTitle(v: View, r: SchnautzResult): string {
  if (v.phase === 'over') {
    if (v.winner === App.me) return `Du <span class="r">${SZ_SHEET.won}</span>`;
    if (!v.winner) return SZ_SHEET.over;
    // Lange Namen brächen den Kopf am Handy auf zwei Zeilen um, der Name steht ohnehin in der Siegerzeile darunter
    const name = nameOf(v, v.winner);
    return name.length <= TITLE_NAME_MAX
      ? `${esc(name)} <span class="r">${SZ_SHEET.wins}</span>`
      : `<span class="r">${SZ_SHEET.decided}</span>`;
  }
  // Kurz, damit der Kopf auch mit langen Namen einzeilig bleibt, wer es war, sagt die Zeile darunter
  if (r.reason === 'schnautz') return `<span class="r">${SZ_SHEET.schnautz}</span>`;
  if (r.reason === 'feuer') return `<span class="r">${SZ_SHEET.feuer}</span>`;
  return SZ_SHEET.shown;
}

/**
 * Unterzeile des Kopfs nur, wenn jemand gegangen ist. Wie die Runde ausging, sagen Titel und Zeilen (👑 mit 31 oder
 * Feuer, „hat geklopft“), so bleibt bei acht Leuten am kurzen Handy Platz für alle Zeilen.
 */
function sheetLead(v: View, r: SchnautzResult): string {
  return r.reason === 'quit' ? SZ_SHEET.quit(esc(nameOf(v, r.by)), r.by === App.me) : '';
}

function sheetTaunt(v: View, r: SchnautzResult): Sheet['taunt'] {
  const myC = r.changes[App.me];
  const loserIds = Object.keys(r.changes);
  if (v.phase === 'over' && v.winner) {
    return v.winner === App.me
      ? { text: taunt('gameWinSelf', null, `o${v.games}`), good: true }
      : { text: taunt('gameLoseSelf', { name: nameOf(v, v.winner) }, `o${v.games}`), good: false };
  }
  const seed = `o${v.games}:${v.round}`;
  if (myC)
    return {
      text: taunt(myC.to === 'out' ? 'scOutSelf' : myC.to === 'swim' ? 'scSwimSelf' : 'scLoseSelf', null, seed),
      good: false,
    };
  if (loserIds.length && r.reason !== 'quit') {
    const c0 = r.changes[loserIds[0]];
    const key = c0.to === 'out' ? 'scOutOther' : c0.to === 'swim' ? 'scSwimOther' : 'scLoseOther';
    return { text: taunt(key, { name: nameOf(v, loserIds[0]) }, seed), good: true };
  }
  return null;
}

/**
 * Ergebnisblatt als Daten. Rundenende: wer Leben verliert (💔 🛟 🫧) als Schlüsselzeile mit Karten, ich zuerst,
 * dann alle nach Handwert, wer schon raus war, zuletzt. Partieende: Sieger als Schlüsselzeile, darunter, wer zuletzt
 * untergegangen ist, dann die übrigen nach der Runde, in der sie rausflogen. `null` außerhalb von Runden- und Partieende.
 */
export function szSheet(v: View): Sheet | null {
  const r = schnautzResult(v);
  if ((v.phase !== 'end' && v.phase !== 'over') || !r) return null;
  const over = v.phase === 'over';
  const best = roundBest(v);
  const losers = Object.keys(r.changes);
  const hv = (id: string) => handValue(r.hands[id], v.rules);
  const valOf = (id: string): string | undefined => {
    if (!r.hands[id]) return undefined;
    const h = hv(id);
    return h.kind === 'feuer' ? '33' : fmtVal(num(h.v));
  };
  const nm = (id: string) => esc(nameOf(v, id));
  let rows: SheetRow[];
  let key: string | null;
  let keyNote: string | undefined;
  if (!over) {
    const inRound = v.players.filter((p) => r.hands[p.id]).sort((a, b) => hv(b.id).v - hv(a.id).v);
    const before = v.players.filter((p) => !r.hands[p.id]);
    rows = [
      ...inRound.map((p): SheetRow => {
        const c = r.changes[p.id];
        const lc = c ? lifeCore(c, p.id === App.me) : null;
        const isBest = !c && best.includes(p.id) && losers.length > 0;
        return {
          id: p.id,
          place: null,
          name: nm(p.id),
          hat: lc?.hat ?? (isBest ? '👑' : undefined),
          core: lc?.core ?? (isBest ? `<span class="conseq good">${SZ_SHEET.best}</span>` : livesHTML(p, v.rules)),
          val: valOf(p.id),
          cards: r.hands[p.id],
          tone: c ? 'lose' : isBest ? 'win' : undefined,
        };
      }),
      ...before.map((p): SheetRow => ({ id: p.id, place: null, name: nm(p.id), core: SZ_SHEET.outBefore })),
    ];
    key = losers.includes(App.me) ? App.me : (r.losers.find((id) => losers.includes(id)) ?? losers[0] ?? null);
    if (!losers.length && r.reason !== 'quit') keyNote = SZ_SHEET.tie;
  } else {
    const lastDown = losers.filter((id) => r.changes[id].to === 'out');
    const others = v.players
      .filter((p) => p.id !== v.winner)
      .sort((a, b) => num(b.outRound) - num(a.outRound) || hv(b.id).v - hv(a.id).v);
    const win = v.winner ? pById(v, v.winner) : null;
    rows = [
      ...(win
        ? [
            {
              id: win.id,
              place: 1,
              name: nm(win.id),
              hat: '👑',
              core: SZ_SHEET.winner(win.id === App.me),
              val: valOf(win.id),
              cards: r.hands[win.id],
              tone: 'win',
            } satisfies SheetRow,
          ]
        : []),
      ...others.map((p, i): SheetRow => {
        const last = lastDown.includes(p.id);
        return {
          id: p.id,
          place: i + (win ? 2 : 1),
          name: nm(p.id),
          hat: last ? '🫧' : undefined,
          core: p.outRound ? SZ_SHEET.outIn(num(p.outRound)) : SZ_SHEET.outBefore,
          val: valOf(p.id),
          tone: last ? 'lose' : undefined,
        };
      }),
    ];
    key = win?.id ?? null;
    if (lastDown.length) {
      const ids = [...lastDown.filter((id) => id === App.me), ...lastDown.filter((id) => id !== App.me)];
      keyNote = SZ_SHEET.lastDownNote(listJoin(ids.map(nm)), ids.length, ids.includes(App.me));
    }
  }
  // Die Schlüsselzeile trägt Karten, ihr Handwert steht mit in der Folge statt allein in der Kartenreihe
  rows = rows.map((row) => {
    // Wer geklopft hat, steht in der eigenen Zeile, statt einer eigenen Zeile unter dem Titel
    const core =
      !over && r.reason === 'knock' && row.id === r.knocker
        ? `${SZ_SHEET.knocked(row.id === App.me)} · ${row.core}`
        : row.core;
    return row.id === key && row.val != null
      ? { ...row, core: `${core} · ${SZ_SHEET.handVal(row.val)}`, val: undefined }
      : { ...row, core };
  });
  const myC = r.changes[App.me];
  const icon = over
    ? '🏆'
    : myC
      ? lifeCore(myC, true).hat
      : best.includes(App.me) && losers.length
        ? '👑'
        : !losers.length && r.reason !== 'quit'
          ? '🤝'
          : '🃏';
  return {
    icon,
    title: sheetTitle(v, r),
    lead: sheetLead(v, r),
    key,
    keyNote,
    taunt: sheetTaunt(v, r),
    bets: '',
    rows,
    next: over ? 'game' : 'round',
    // Am Rundenende zeigt an kleinen Tischen jede Zeile ihre Hand. Ab fünf Leuten kostet das am Handy zu viel Höhe
    rowCards: !over && rows.length <= 4,
  };
}

/** Ergebnisfenster nach einer Schnautz-Runde oder am Ende der Partie, über das gemeinsame Blatt. */
export function renderOverlay(v: View): void {
  renderResult(v, szSheet(v));
}
