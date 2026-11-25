import { handValue } from '../../game/schnautz';
import type { Card, HandValue, Player, SchnautzResult, View } from '../../game/types';
import { activeList } from '../../game/state';
import { App } from '../app';
import { cardHTML, fmtVal, livesHTML, valHTML } from '../cards';
import { layoutOpps } from '../carousel';
import { aimAttrs, marksHTML } from './marks';
import { markClocks } from '../clock';
import { markTosses } from '../toss';
import { $, esc, listJoin, num } from '../dom';
import { holdOverlay } from '../feedback';
import {
  W,
  dealerId,
  myTurn,
  nameOf,
  onlyBotsPlaying,
  pById,
  roundBest,
  schnautzResult,
  seatOrder,
  turnId,
  vb,
} from '../helpers';
import { nextSecs } from '../nextround';
import { canChallenge, mustAccept, rematchLine, rematchMark } from './rematch';
import { taunt } from '../taunts';

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

  // Status
  let main = '';
  let sub = '';
  const knocked = !!v.knocker;
  if (v.phase === 'choose') {
    if (dId === App.me) {
      main = 'Du gibst. <em>Behalten</em> oder blind das zweite Blatt nehmen?';
      sub = 'Das Blatt, das du nicht nimmst, kommt offen in die Mitte.';
    } else main = W(v, dId) + ' gibt und schaut sich das Blatt an.';
  } else if (v.phase === 'play') {
    if (playing) {
      main = knocked ? W(v, v.knocker) + ' hat geklopft. <em>Dein letzter Zug!</em>' : '<em>Du bist dran.</em>';
      // Auf sehr kurzen Handys entfällt der Tipp, sobald jemand geschoben hat (fit.css), dann zählt der Stand
      sub = '<span class="tip">Tippe eine Handkarte und eine Karte aus der Mitte an.</span>';
    } else {
      main = knocked
        ? (v.knocker === App.me ? 'Du hast geklopft. ' : W(v, v.knocker) + ' hat geklopft. ') +
          W(v, tId) +
          ' hat noch einen Zug.'
        : W(v, tId) + ' ist dran.';
    }
    if (!knocked && v.passes > 0) {
      const np = num(v.passes);
      sub =
        (sub ? sub + ' ' : '') +
        '<span class="np">' +
        np +
        ' von ' +
        activeList(v).length +
        (np === 1 ? ' hat' : ' haben') +
        ' geschoben. Schieben alle, kommen neue Karten.</span>';
    }
  } else if (v.phase === 'end' || v.phase === 'over') {
    main = 'Runde vorbei.';
  }
  const actorId = v.phase === 'choose' ? dId : v.phase === 'play' ? tId : null;
  const actor = actorId ? pById(v, actorId) : null;
  if (actor && actor.id !== App.me && !actor.online) {
    sub =
      esc(actor.name) +
      ' ist gerade offline.' +
      (App.role === 'host'
        ? ' <button class="btn ghost small" data-act="skip">Für ' +
          esc(actor.name) +
          (v.phase === 'choose' ? ' behalten' : ' schieben') +
          '</button>'
        : ' Das Spiel wartet.');
  }
  const stEl = $('#status');
  stEl.className = 'status' + (knocked ? ' knocked' : '');
  stEl.innerHTML = '<div class="main">' + main + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '');

  // Eigene Hand
  let mh = '';
  const handCards = reveal?.hands[App.me] ?? mine;
  const isOn = playing || (v.phase === 'choose' && dId === App.me);
  if (!me || me.out) {
    mh =
      '<div class="mehead"><span class="nm">Du</span>' +
      (me ? livesHTML(me, v.rules) : '') +
      '</div><div class="outmsg">Du bist raus. Werfen und tröten darfst du trotzdem.</div>' +
      (v.phase === 'play' || v.phase === 'choose' ? `<div class="actions botsrow">${botsOnlyHTML(v)}</div>` : '');
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
      const canKnock = !v.knocker && (v.rules.knockFirst || v.turns >= activeList(v).length);
      mh +=
        '<button class="btn primary' +
        (both ? ' pulse' : '') +
        '" data-act="swap"' +
        (both ? '' : ' disabled') +
        '>Tauschen</button>';
      mh +=
        '<button class="btn ghost" data-act="swapAll" title="Alle drei Karten mit der Mitte tauschen">Alle drei → ' +
        shortVal(handValue(v.middle, v.rules)) +
        '</button>';
      mh += '<button class="btn ghost" data-act="pass">Schieben</button>';
      mh +=
        '<button class="btn wood" data-act="knock"' +
        (canKnock ? '' : ' disabled') +
        ' title="' +
        (v.knocker
          ? 'Es wurde schon geklopft'
          : canKnock
            ? 'Alle anderen haben noch einen Zug'
            : 'Erst wenn jeder einmal dran war') +
        '">Klopfen</button>';
      if (!canKnock && !v.knocker) mh += '<div class="hint">Klopfen geht erst, wenn jeder einmal dran war.</div>';
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

function resultTitle(v: View): string {
  const r = schnautzResult(v);
  if (!r) return '';
  const n = esc(nameOf(v, r.by));
  if (v.phase === 'over') {
    if (v.winner === App.me) return 'Du <span class="r">gewinnst!</span>';
    return v.winner ? esc(nameOf(v, v.winner)) + ' <span class="r">gewinnt!</span>' : 'Partie vorbei';
  }
  if (r.reason === 'schnautz') return '<span class="r">Schnautz!</span> ' + n + vb(r.by, ' hast 31', ' hat 31');
  if (r.reason === 'feuer') return '<span class="r">Feuer!</span> Drei Asse';
  return 'Aufgedeckt';
}

/** Ergebnisfenster nach einer Schnautz-Runde oder am Ende der Partie. */
export function renderOverlay(v: View): void {
  const ov = $('#overlay');
  const r = schnautzResult(v);
  if ((v.phase !== 'end' && v.phase !== 'over') || !r) {
    ov.innerHTML = '';
    return;
  }
  if (holdOverlay()) return;
  if (App.peek) {
    ov.innerHTML = peekHTML(v, pById(v, App.me));
    return;
  }
  const me = pById(v, App.me);
  let lead: string;
  if (r.reason === 'quit') lead = esc(nameOf(v, r.by)) + vb(r.by, ' hast', ' hat') + ' den Tisch verlassen.';
  else if (r.reason === 'knock')
    lead = esc(nameOf(v, r.knocker)) + vb(r.knocker, ' hattest', ' hatte') + ' geklopft. Alle Karten liegen offen.';
  else if (r.reason === 'feuer')
    lead = esc(nameOf(v, r.by)) + vb(r.by, ' hast', ' hat') + ' drei Asse. Alle anderen verlieren ein Leben.';
  else lead = 'Mit 31 ist die Runde sofort vorbei.';
  const best = roundBest(v);
  const loserIds = Object.keys(r.changes || {});
  const myC = r.changes[App.me];
  let verdict = '';
  if (myC)
    verdict =
      '<div class="verdict bad">' +
      (myC.to === 'out' ? '🫧 ' : myC.to === 'swim' ? '🛟 ' : '💔 ') +
      (myC.to === 'out'
        ? 'Du bist raus.'
        : myC.to === 'swim'
          ? 'Du schwimmst jetzt!'
          : myC.n === 2
            ? 'Du verlierst zwei Leben.'
            : 'Du verlierst ein Leben.') +
      '</div>';
  else if (best.indexOf(App.me) >= 0 && loserIds.length)
    verdict = '<div class="verdict good">👑 Rundensieg! Du hattest die beste Hand.</div>';
  else if (!loserIds.length && r.reason !== 'quit')
    verdict = '<div class="verdict">🤝 Gleichstand. Niemand verliert ein Leben.</div>';
  else if (loserIds.length)
    verdict =
      '<div class="verdict">' +
      esc(
        listJoin(
          loserIds.map((id) => {
            return nameOf(v, id);
          }),
        ),
      ) +
      (loserIds.length > 1 ? ' verlieren' : ' verliert') +
      ' diesmal.</div>';
  let tt = '';
  let good = false;
  if (v.phase === 'over' && v.winner) {
    if (v.winner === App.me) {
      tt = taunt('gameWinSelf', null, 'o' + v.games);
      good = true;
    } else tt = taunt('gameLoseSelf', { name: nameOf(v, v.winner) }, 'o' + v.games);
  } else if (myC)
    tt = taunt(
      myC.to === 'out' ? 'scOutSelf' : myC.to === 'swim' ? 'scSwimSelf' : 'scLoseSelf',
      null,
      'o' + v.games + ':' + v.round,
    );
  else if (loserIds.length && r.reason !== 'quit') {
    const c0 = r.changes[loserIds[0]];
    tt = taunt(
      c0.to === 'out' ? 'scOutOther' : c0.to === 'swim' ? 'scSwimOther' : 'scLoseOther',
      { name: nameOf(v, loserIds[0]) },
      'o' + v.games + ':' + v.round,
    );
    good = true;
  }
  const rline = rematchLine(v);
  let rows = '';
  const order = v.players
    .filter((p) => {
      return r.hands[p.id];
    })
    .sort((a, b) => {
      return handValue(r.hands[b.id], v.rules).v - handValue(r.hands[a.id], v.rules).v;
    });
  order.forEach((p) => {
    const cards = r.hands[p.id];
    if (!cards) return;
    const hv = handValue(cards, v.rules);
    const c = r.changes[p.id];
    const mineRow = p.id === App.me;
    let cons = '';
    if (c)
      cons =
        c.to === 'out'
          ? '<span class="conseq">' + (mineRow ? 'bist raus' : 'ist raus') + '</span>'
          : c.to === 'swim'
            ? '<span class="conseq swim">' + (mineRow ? 'schwimmst jetzt' : 'schwimmt jetzt') + '</span>'
            : '<span class="conseq">' + (c.n === 2 ? '2 Leben weg' : '1 Leben weg') + '</span>';
    const isBest = best.includes(p.id) && loserIds.length > 0;
    const isWin = v.phase === 'over' && v.winner === p.id;
    rows +=
      '<div class="row' +
      (c ? ' lose' : '') +
      (isBest || isWin ? ' win' : '') +
      '" data-pid="' +
      esc(p.id) +
      '"' +
      aimAttrs(p, true) +
      '><div class="mini">' +
      cards
        .map((x) => {
          return cardHTML(x);
        })
        .join('') +
      '</div>' +
      '<div class="who"><b>' +
      (isBest ? '👑 ' : '') +
      esc(p.id === App.me ? 'Du' : p.name) +
      rematchMark(v, p.id) +
      '</b><span>' +
      (cons || (isBest ? '<span class="conseq good">beste Hand</span>' : livesHTML(p, v.rules))) +
      '</span></div>' +
      '<div class="val">' +
      (hv.kind === 'feuer' ? '33' : fmtVal(num(hv.v))) +
      '</div></div>';
  });
  const foot = overlayFoot(v, me);
  ov.innerHTML =
    '<div class="modal"><div class="paper sheet result">' +
    (v.phase === 'over' ? '<div class="trophy">🏆</div>' : '') +
    '<h2>' +
    resultTitle(v) +
    '</h2><p class="lead">' +
    lead +
    '</p>' +
    verdict +
    (rline
      ? '<p class="taunt rv">' + rline + '</p>'
      : tt
        ? '<p class="taunt' + (good ? ' good' : '') + '">' + esc(tt) + '</p>'
        : '') +
    '<div class="rows">' +
    rows +
    '</div>' +
    outRow(v, r) +
    foot +
    '</div></div>';
}

/** Fußzeile der Ergebnisfenster: bereit melden, warten, Tisch ansehen. */
/**
 * „Tisch ansehen“ am Ende einer Runde: unten eine Leiste mit Ergebnis, nächster Runde und für den Host am Ende
 * der Partie „Zur Lobby“. Das Reaktionsfenster am Tisch ist dann weg, reagieren geht in der Übersicht.
 */
export function peekHTML(v: View, me: Player | null): string {
  const next = v.phase === 'over' ? 'Neue Partie' : 'Nächste Runde';
  return (
    '<div class="peek">' +
    '<button class="btn ghost" data-act="unpeek"><span class="blong">Ergebnis zeigen</span><span class="bshort">Ergebnis</span></button>' +
    (App.role === 'host' && v.phase === 'over'
      ? '<button class="btn ghost" data-act="lobbynow"><span class="blong">Zur Lobby</span><span class="bshort">Lobby</span></button>'
      : '') +
    (me && !me.ready ? `<button class="btn primary" data-act="ready">${next}</button>` : '') +
    '</div>'
  );
}

/** Ich bin raus und nur noch KIs spielen: Der Host kann abkürzen, Gäste sehen einen Hinweis. */
export function botsOnlyHTML(v: View, small = false): string {
  if (!onlyBotsPlaying(v)) return '';
  if (App.role !== 'host')
    return '<span class="botsonly">Nur noch KIs im Spiel. Der Gastgeber kann neu starten.</span>';
  const sz = small ? ' small' : '';
  return (
    `<button class="btn ghost${sz}" data-act="lobbynow">Zur Lobby</button>` +
    `<button class="btn primary${sz}" data-act="restart">Neue Partie</button>`
  );
}

/** Wer schon vor dieser Runde raus war, steht als Chip da, damit man auch dort hinwerfen kann. */
function outRow(v: View, r: SchnautzResult): string {
  const outs = v.players.filter((p) => !r.hands[p.id]);
  if (!outs.length) return '';
  return (
    '<div class="outrow"><span>Schon raus</span>' +
    outs
      .map(
        (p) =>
          `<span class="chip" data-pid="${esc(p.id)}"${aimAttrs(p)}>${esc(p.id === App.me ? 'Du' : p.name)}</span>`,
      )
      .join('') +
    '</div>'
  );
}

export function overlayFoot(v: View, me: Player | null): string {
  const waiting = v.players
    .filter((p) => {
      return p.online && !p.ready && !p.bot && p.id !== App.me && (v.phase === 'over' || !p.out);
    })
    .map((p) => {
      return p.name;
    });
  const ready = me && me.ready;
  const btnLabel = v.phase === 'over' ? 'Neue Partie' : 'Nächste Runde';
  const cd = v.phase === 'end' && nextSecs() ? `Weiter in <b class="nextcd">${nextSecs()}</b> s` : '';
  return (
    '<div class="rfoot">' +
    (me ? '<div class="emotes oemotes"></div>' : '') +
    `<div class="foot${!ready && (canChallenge(v) || mustAccept(v)) ? ' rv' : ''}">` +
    // Der Wartetext nur, wenn es etwas zu sagen gibt, sonst kostet er Platz in der Knopfreihe
    (ready || cd
      ? '<span class="waittxt">' +
        (ready ? (waiting.length ? 'Warte auf ' + esc(listJoin(waiting)) + '…' : "Los geht's…") : '') +
        (cd ? (ready ? ' · ' : '') + cd : '') +
        '</span>'
      : '') +
    (App.role === 'host' && ready && waiting.length
      ? '<button class="btn ghost" data-act="force"><span class="blong">Nicht warten</span><span class="bshort">Los</span></button>'
      : '') +
    (App.role === 'host' && v.phase === 'over'
      ? '<button class="btn ghost" data-act="lobbynow"><span class="blong">Zur Lobby</span><span class="bshort">Lobby</span></button>'
      : '') +
    '<button class="btn ghost" data-act="peek"><span class="blong">Tisch ansehen</span><span class="bshort">Tisch</span></button>' +
    readyBtns(v, !!ready, btnLabel) +
    '</div></div>'
  );
}

/** Weiter-Knöpfe: Wer verloren hat, darf Revanche fordern, wer gefordert wurde, nimmt an. */
function readyBtns(v: View, ready: boolean, label: string): string {
  if (ready) return '';
  if (mustAccept(v))
    return '<button class="btn primary rv" data-act="ready" aria-label="Revanche annehmen"><span class="blong">⚔️ Revanche annehmen</span><span class="bshort">⚔️ Annehmen</span></button>';
  if (canChallenge(v))
    return (
      `<button class="btn ghost" data-act="ready" aria-label="${label}"><span class="blong">${label}</span><span class="bshort">Weiter</span></button>` +
      '<button class="btn primary rv" data-act="rematch">⚔️ Revanche!</button>'
    );
  return `<button class="btn primary" data-act="ready">${label}</button>`;
}
