/*
 * Cabo-Tisch als `NewTable` (Plan 2.8 Runde 4a, 4b): Gegner mit ihrer Reihe aus verdeckten Karten und ihren Punkten,
 * in der Mitte Stapel, gezogene Karte und Ablage, unten die eigene Reihe mit Knöpfen, alles als Modelle für die
 * Bausteine in src/ui/table. Was man ansieht, blitzt nur kurz auf (App.cbShow), danach muss man es sich merken. Was
 * ich gerade tun kann, steht in `cbRole`. Tipps verarbeitet src/ui/cabo/input.ts.
 */
import { cbPower, cbWaiting, cbWhyNot } from '../../game/cabo';
import { cbVal, rankOf, suitOf } from '../../game/cards';
import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO, CB_REVEAL_MS } from '../../game/constants';
import type { Action, CaboResult, Card, CbSlotView, CbView, Player, View } from '../../game/types';
import { App } from '../app';
import { cardHTML, cardName } from '../cards';
import { esc, num } from '../dom';
import { nameOf, onlyBotsPlaying, pById, turnId, vb } from '../helpers';
import { unreachable } from '../../game/games';
import { taunt } from '../taunts';
import { reignHTML } from './marks';
import { botsOnlyHTML, type Sheet, type SheetRow } from './result';
import { OFFLINE_WAIT, offline, playFor, STATUS } from '../../content/texts/status';
import { CB_STATUS, cbHeld, cbLastSub, cbOtherDeck, cbOtherPile, cbOtherPower } from '../../content/texts/status-cb';
import { TABLE } from '../../content/texts/table';
import { CB_TABLE } from '../../content/texts/table-cb';
import { ceremonyOn } from '../ceremony';
import { endMain, turnMain, waitSub, type Status } from '../status';
import { twoLabel } from '../table/bar';
import { whyText } from '../table/hand';
import { deckCards } from '../table/pile';
import { numHTML, valueHTML } from '../table/seat';
import type { NewTable } from '../table/spec';
import type {
  BarButton,
  BarModel,
  BtnIntent,
  CenterModel,
  MeModel,
  MeOut,
  MeState,
  SeatModel,
  SeatState,
  TagModel,
} from '../table/types';

export type CbRole = 'look' | 'looked' | 'draw' | 'hold' | 'ownpeek' | 'spy' | 'blind' | 'wait' | 'none';

/** Was eine abgelegte Karte kann: Zeichen, Name für Knöpfe und Etiketten, Verb für Hinweise („du darfst …“). */
const POWER_ICON = { peek: '👁️', spy: '🔍', swap: '🔀' } as const;
const POWER_NAME = { peek: 'Ansehen', spy: 'Spionieren', swap: 'Blindtausch' } as const;
const POWER_LONG = {
  peek: 'eine eigene Karte ansehen',
  spy: 'spionieren',
  swap: 'blind tauschen',
} as const;

/** Unbestimmt und bestimmt: „eine Dame“, „die Dame“, „einen roten König“. Zahlen bleiben Zahlen. */
const CB_WORDS: Record<string, [string, string]> = {
  A: ['ein Ass', 'das Ass'],
  B: ['einen Buben', 'den Buben'],
  D: ['eine Dame', 'die Dame'],
};

/**
 * Eine Cabo-Karte im Satz, der Name vor dem Wert: „eine Dame“ und „, 12“. Bei Zahlenkarten ist der Name schon
 * der Wert, dort gibt es keinen Nachsatz.
 */
function cbCardWords(c: Card, def: boolean): { name: string; val: string } {
  const r = rankOf(c);
  const red = suitOf(c) === 'H' || suitOf(c) === 'D';
  const w: [string, string] | undefined =
    r === 'K'
      ? red
        ? ['einen roten König', 'den roten König']
        : ['einen schwarzen König', 'den schwarzen König']
      : CB_WORDS[r];
  if (!w) return { name: `${def ? 'die' : 'eine'} ${r}`, val: '' };
  return { name: w[def ? 1 : 0], val: `, ${cbVal(c)}` };
}

/** Eigene Reihe, wenn ich diese Runde mitspiele. */
export function cbMine(v: View): CbSlotView[] | null {
  return v.cb?.P[App.me] ?? null;
}

/** Was ich gerade tun kann. */
export function cbRole(v: View): CbRole {
  const C = v.cb;
  if (!C || !C.P[App.me]) return 'none';
  if (v.phase === 'peek') return pById(v, App.me)?.ready ? 'looked' : 'look';
  if (v.phase !== 'play') return 'none';
  if (turnId(v) !== App.me) return 'wait';
  if (C.power?.by === App.me) return C.power.kind === 'peek' ? 'ownpeek' : C.power.kind === 'spy' ? 'spy' : 'blind';
  if (C.hold?.by === App.me) return 'hold';
  return 'draw';
}

/** Darf ich gerade schnappen? Nur mit Schalter, während der Runde und wenn ich nicht gerade selbst ziehe. */
export function cbCanSnap(v: View): boolean {
  const C = v.cb;
  const role = cbRole(v);
  return !!v.rules.cb?.snap && !!C?.pile.length && !!cbMine(v)?.length && (role === 'wait' || role === 'draw');
}

/** Knöpfe am eigenen Platz, Stapel und Ablage */
export type CbBtn = 'cbdeck' | 'cbpile' | 'cbcabo' | 'cbswap' | 'cbdiscard' | 'cbblind' | 'cbskip' | 'cbsnapmode';

/** Zug hinter einem Knopf, Stapel oder der Ablage, für den Tipp und für den Grund am gesperrten Knopf. */
export function cbBtnAct(kind: CbBtn): Action | null {
  const o = App.cs.opp;
  switch (kind) {
    case 'cbdeck':
      return { type: 'cbdraw', from: 'deck' };
    case 'cbpile':
      return { type: 'cbdraw', from: 'pile' };
    case 'cbcabo':
      return { type: 'cbcabo' };
    case 'cbswap':
      return { type: 'cbswap', ids: App.cs.ids.slice() };
    case 'cbdiscard':
      return { type: 'cbdiscard' };
    case 'cbblind':
      return { type: 'cbblind', id: App.cs.ids[0] ?? -1, to: o?.to ?? '', oid: o?.id ?? -1 };
    // Ohne eigenen Zug dahinter, cbButton in src/ui/cabo/input.ts erledigt sie
    case 'cbskip':
    case 'cbsnapmode':
      return null;
    default:
      return unreachable(kind);
  }
}

/**
 * Zug, an dem eine eigene, gerade nicht wählbare Karte ihren Grund prüft (cbWhyNot). Er geht nie raus, er liefert
 * nur den Code für den Tipp und den Vorleser.
 */
export function cbProbe(v: View, id: number): Action | null {
  switch (cbRole(v)) {
    case 'draw':
    case 'wait':
      return { type: 'cbswap', ids: [id] };
    case 'spy':
      return { type: 'cbspy', to: App.me, id };
    default:
      return null;
  }
}

/** Karte, die ich gerade kurz sehen darf, sonst null. */
export function cbSeen(owner: string, slot: number): Card | null {
  const S = App.cbShow;
  if (Date.now() >= S.until) return null;
  return S.items.find((x) => x.owner === owner && x.slot === slot)?.c ?? null;
}

/**
 * Punkte, die gerade angezeigt werden. Bis zur Krönung steht noch der Stand vor der letzten Runde da, sonst verriete
 * der kleinste Wert den neuen Cabo-König schon vorher.
 */
export function cbShownPoints(v: View, p: Player): number {
  const r = caboResult(v);
  if (!App.zerHide || v.phase !== 'over' || !r || !(p.id in r.scores)) return num(p.cbp);
  const before = r.resets.includes(p.id) ? CB_RESET_AT : num(r.totals[p.id]);
  return Math.max(0, before - num(r.scores[p.id]));
}

/** Wie stark sich Karten überlappen, damit `n` Karten in den Platz für `room` Karten passen. */
const overlap = (n: number, room: number): number => (n <= room ? 0 : (room - 1) / (n - 1) - 1);

/**
 * Wertmarke unter offenen Karten. Die Zahl zeichnet CSS aus `data-v`, den Wert nennt schon der Name der Karte, und als
 * Text stünde sie in Ablage und Plätzen zwischen den Wörtern ihres Namens (WCAG 2.5.3).
 */
const valBadge = (c: Card): string => `<span class="cbv${cbVal(c) === 0 ? ' zero' : ''}" data-v="${cbVal(c)}"></span>`;

/** Eine Karte ohne eigene Rolle, die Rolle trägt der Platz drumherum. Offen nennt sie ihren Wert („Pik 7, 7 Punkte“) */
const card = (c: Card | null | undefined, cls = '', mute = false): string =>
  cardHTML(c ?? null, { key: '', cls, mute, value: c ? cbVal(c) : undefined });

interface SlotOpts {
  act?: string;
  sel?: boolean;
  /** Leuchtet als wählbar. Ohne Angabe jede Karte mit `act`, sonst bleibt sie antippbar und nennt ihren Grund */
  pick?: boolean;
  /** Name für den Vorleser, etwa „Deine 2. Karte“ */
  name?: string;
  /** Zug, an dem eine antippbare, aber nicht wählbare Karte ihren Grund prüft (cbProbe), geht nie raus */
  probe?: Action | null;
}

/**
 * Ein Platz: verdeckt, offen für alle, oder nur für mich gerade kurz zu sehen. Der Platz bleibt eine Hülle um die
 * Karte (`.cbslot > .card`), damit Legacy gleich aussieht. Antippbar ist er ein Knopf mit Namen und Fokus-Schlüssel.
 */
function slotHTML(v: View, owner: string, s: CbSlotView, o: SlotOpts = {}): string {
  const seen = s.c ? null : cbSeen(owner, s.id);
  const c = s.c ?? seen;
  const pick = o.pick ?? !!o.act;
  const cls = ['cbslot', s.up && 'up', seen && 'seen', o.sel && 'sel', pick && 'pick'].filter(Boolean).join(' ');
  // Der Balken, der die Restzeit zeigt, läuft beim Neuzeichnen an derselben Stelle weiter
  const left = seen ? Math.max(0, App.cbShow.until - Date.now()) : 0;
  const style = seen ? ` style="--cbms:${CB_REVEAL_MS}ms; --cbgone:${CB_REVEAL_MS - left}ms"` : '';
  // Gesperrt mit Grund wie in allen Spielen (aria-disabled), ausgegraut wird sie dabei nicht, nur nicht hervorgehoben
  const why = o.act && !pick && o.probe ? whyText(cbWhyNot(v, App.me, o.probe)) : null;
  const name = `${o.name ?? ''}${c ? `: ${cardName(c)}${TABLE.points(cbVal(c))}` : CB_TABLE.hidden}`;
  const attrs = o.act
    ? ` data-act="${o.act}" data-o="${esc(owner)}" data-fk="cb:${esc(owner)}:${s.id}" role="button" tabindex="0"` +
      ` aria-pressed="${!!o.sel}" aria-label="${esc(name)}"` +
      (why ? ` aria-disabled="true" aria-description="${esc(why)}"` : '')
    : '';
  return (
    `<div class="${cls}" data-sid="${s.id}"${attrs}${style}>` +
    card(c, App.anim.deal ? 'deal' : '') +
    (c ? valBadge(c) : '') +
    (seen ? '<span class="cbeye" aria-hidden="true">👁️</span>' : '') +
    '</div>'
  );
}

/** Etikett an der Kachel: schaut, ist dran, überlegt, Cabo!, noch einmal, +n, Platz oder Cabo-König */
function cbTag(v: View, C: CbView, p: Player, waiting: string[]): TagModel | null {
  const r = caboResult(v);
  const turn = (text: string): TagModel => ({ text, kind: 'turn', cls: 'turn', think: true });
  const plain = (text: string): TagModel => ({ text, kind: 'plain' });
  if (v.phase === 'over') {
    // Bis zur Krönung keine Plätze, auch Platz 2 und 3 verrieten den König
    if (App.zerHide) return null;
    if (v.winner === p.id) return { text: CB_TABLE.tag.king, kind: 'king', cls: 'king' };
    return p.place ? plain(TABLE.tag.place(num(p.place))) : null;
  }
  if (v.phase === 'end' && r && p.id in r.scores) return plain(`+${num(r.scores[p.id])}`);
  const T = CB_TABLE.tag;
  if (v.phase === 'peek') return p.ready ? { text: TABLE.tag.ready, kind: 'done', cls: 'done' } : turn(T.look);
  if (C.cabo === p.id) return { text: T.call, kind: 'call', cls: 'cabo' };
  if (!waiting.includes(p.id)) return C.cabo && C.left.includes(p.id) ? plain(T.again) : null;
  if (C.power?.by === p.id) return turn(C.power.kind === 'peek' ? T.look : C.power.kind === 'spy' ? T.spy : T.blind);
  return turn(C.hold?.by === p.id ? T.hold : TABLE.tag.turn);
}

/** Wer gerade gefragt ist, nur während Ansehen und Runde */
const waitingOf = (v: View): string[] => (v.phase === 'play' || v.phase === 'peek' ? cbWaiting(v) : []);

/**
 * Gegnerkachel: Reihe samt gezogener Karte über ihr (verdeckt, außer sie kam von der Ablage), Name, KI-Zeichen, die
 * Krone als Eckaufkleber und die Punkte dieser Partie als Wert auf der Unterkante. Bis zur Krönung zeigt der Wert den
 * Stand vor der letzten Runde (cbShownPoints), Krone und Etikett bleiben leer.
 */
function cbSeat(v: View, p: Player): SeatModel | null {
  const C = v.cb;
  if (!C) return null;
  const row = C.P[p.id];
  const role = cbRole(v);
  const act = role === 'spy' || role === 'blind' ? 'cbo' : '';
  const waiting = waitingOf(v);
  const slots = row
    ? row
        .map((s, i) =>
          slotHTML(v, p.id, s, {
            act,
            sel: App.cs.opp?.to === p.id && App.cs.opp.id === s.id,
            name: CB_TABLE.theirs(i, p.name),
          }),
        )
        .join('')
    : `<div class="tnone">${CB_TABLE.later}</div>`;
  const held = C.hold?.by === p.id ? `<div class="cbheld" title="${CB_TABLE.held}">${card(C.hold.c)}</div>` : '';
  const called = C.cabo === p.id && v.phase === 'play';
  const st: SeatState[] = [];
  if (waiting.includes(p.id)) st.push('turn');
  if (!p.online) st.push('offline');
  if (act) st.push('target');
  if (called) st.push('called');
  const tag = cbTag(v, C, p, waiting);
  const pts = cbShownPoints(v, p);
  const marks = reignHTML(v, p.id);
  return {
    id: p.id,
    name: p.name,
    marks,
    bot: !!p.bot,
    value: valueHTML({ k: 'points', html: CB_TABLE.points(pts), title: CB_TABLE.points(pts) }),
    count: '',
    tag,
    body:
      `<div class="cbrow${row && row.length > 4 ? ' many' : ''}" style="--ov:${overlap(row?.length ?? 0, 4.2).toFixed(3)}">` +
      `${slots}${held}</div>`,
    st,
    aim: v.players.some((q) => q.id === App.me),
    cls: ['sh', 'cb', ...(act ? ['aimable'] : []), ...(called ? ['called'] : [])],
    // reignHTML ist bis zur Krönung leer, das Etikett ebenso. „Cabo gerufen“ statt des Etiketts mit 📣
    say: CB_TABLE.seat({ bot: !!p.bot, crown: !!marks, points: pts, called, tag: called ? '' : (tag?.text ?? '') }),
  };
}

/** Tischmitte: Stapel, gezogene Karte, Ablage und darüber, was gerade los ist. */
function cbCenter(v: View): CenterModel | null {
  const C = v.cb;
  if (!C) return null;
  const role = cbRole(v);
  const dn = num(C.deck);
  const play = v.phase === 'play';
  const deckAct = role === 'draw' && dn > 0;
  const top = C.pile[C.pile.length - 1];
  const under = C.pile[C.pile.length - 2];
  const canPile = role === 'draw' && !!top && !!cbMine(v)?.length;
  const pileAct = canPile ? 'cbpile' : role === 'hold' && C.hold?.from === 'deck' ? 'cbdiscard' : '';
  // Stapel und Ablage bleiben während der Runde antippbar und nennen sonst ihren Grund, leuchten aber nur, wenn es geht
  const live = play && !!cbMine(v);
  const pileTap = pileAct || (live ? (role === 'hold' ? 'cbdiscard' : 'cbpile') : '');
  const pile = top
    ? // Untere Karte ohne sichtbaren Text, sonst stünde ihr Wert im Knopf „Von der Ablage nehmen“ (WCAG 2.5.3)
      (under ? card(under, 'under', true) : '') + card(top, App.anim.pilePop ? 'pop' : '') + valBadge(top)
    : `<div class="emptyslot">${TABLE.empty}</div>`;
  // Die Namen von Stapel und Ablage enthalten, was sichtbar darauf steht (WCAG 2.5.3)
  const pileSay = top ? `, ${cardName(top)}${TABLE.points(cbVal(top))}` : `, ${TABLE.empty}`;
  // Meine gezogene Karte liegt groß in der Mitte, fremde schweben über der Reihe der Person
  const mineHeld = C.hold?.by === App.me && C.hold.c;
  let hold = '<div class="emptyslot">gezogen</div>';
  let holdCnt = '';
  if (mineHeld && C.hold?.c) {
    hold = card(C.hold.c, 'held') + valBadge(C.hold.c);
    const pw = C.hold.from === 'deck' ? cbPower(C.hold.c) : null;
    // Am Handy bleibt nur das Zeichen der Fähigkeit, wie im Knopf „Ablegen 🔀“
    holdCnt = pw
      ? `<span class="cnl">Deine Karte · </span>${POWER_ICON[pw]}<span class="cnl"> ${POWER_NAME[pw]}</span>`
      : 'Deine Karte';
  } else if (C.power) {
    // Die Karte liegt schon auf der Ablage, hier steht nur, was sie gerade erlaubt
    hold = `<div class="emptyslot cbpow">${POWER_ICON[C.power.kind]}</div>`;
    if (C.power.by === App.me) holdCnt = POWER_NAME[C.power.kind];
  }
  let cap = `Runde ${num(v.round)} · bis ${num(v.rules.cb?.target ?? 100)} Punkte`;
  if (C.cabo && play) {
    const n = C.left.length;
    // Kurz halten, wer gerufen hat, steht schon an der Kachel
    cap = `📣 Cabo gerufen · noch ${n} ${n === 1 ? 'Zug' : 'Züge'}`;
  } else if (play && dn <= 5) cap = dn ? `Nur noch ${dn} ${dn === 1 ? 'Karte' : 'Karten'} im Stapel` : 'Stapel leer';
  else if (v.phase === 'peek') cap = `Runde ${num(v.round)} · alle sehen sich zwei Karten an`;
  return {
    cap,
    label: CB_TABLE.center(cap),
    stacks: [
      {
        k: 'deck',
        cls: 'deck cbdeck',
        title: 'Stapel',
        body: deckCards(dn) + (dn ? numHTML(dn, { cls: 'pcount', title: CB_TABLE.deckCount }) : ''),
        can: deckAct,
        act: live || deckAct ? { act: 'cbdeck', label: CB_TABLE.deckSay(dn) } : undefined,
      },
      {
        k: 'hold',
        cls: `cbhold${mineHeld || C.power ? ' on' : ''}`,
        title: '',
        // Die Beschriftung trägt HTML (am Handy nur das Zeichen), deshalb im Körper statt in `cnt`
        body: hold + (holdCnt ? `<span class="cnt">${holdCnt}</span>` : ''),
      },
      {
        k: 'pile',
        cls: 'pile cbpile',
        title: 'Ablage',
        body: pile,
        can: !!pileAct,
        act: pileTap
          ? { act: pileTap, label: (pileTap === 'cbpile' ? CB_TABLE.pile : CB_TABLE.discard) + pileSay }
          : undefined,
      },
    ],
  };
}

/** Name im Nebensatz, ohne KI-Zeichen (das trägt nur die Hauptzeile) */
const plainName = (v: View, id: string | null): string => esc(nameOf(v, id));

/**
 * Status über dem eigenen Platz als Daten: was ich tun soll oder worauf wir warten. Ohne DOM, damit Vitest jede
 * Phase prüfen kann. `renderStatus` (src/ui/status.ts) schreibt ihn.
 */
export function cbStatus(v: View): Status {
  const C = v.cb;
  if (!C) return { main: '', sub: '', tone: 'calm' };
  const role = cbRole(v);
  const n = App.cs.ids.length;
  const cur = turnId(v);
  const cards = !!cbMine(v)?.length;
  let st: Status = { main: '', sub: '', tone: 'calm' };
  let quick = '';
  switch (role) {
    case 'look':
      st = { main: `<em>${CB_STATUS.peek}</em>`, sub: n === 1 ? CB_STATUS.peekOne : CB_STATUS.peekSub, tone: 'turn' };
      break;
    case 'looked':
      st = { main: CB_STATUS.peek, sub: waitSub(v, cbWaiting(v)) || CB_STATUS.peekGo, tone: 'calm' };
      break;
    case 'draw': {
      const after = C.left.filter((id) => id !== App.me).length;
      st = C.cabo
        ? { main: `<em>${CB_STATUS.last}</em>`, sub: cbLastSub(after, cards), tone: 'knock' }
        : { main: `<em>${STATUS.myTurn}</em>`, sub: cards ? CB_STATUS.draw : CB_STATUS.drawNoCards, tone: 'turn' };
      break;
    }
    case 'hold': {
      const c = C.hold?.c;
      const fromPile = C.hold?.from === 'pile';
      const pw = !fromPile && c ? cbPower(c) : null;
      const sub =
        n > 1
          ? CB_STATUS.holdMany(n)
          : fromPile
            ? CB_STATUS.holdPile
            : pw
              ? CB_STATUS.holdPower(POWER_LONG[pw])
              : CB_STATUS.holdPlain;
      st = { main: `<em>${c ? cbHeld(cbCardWords(c, false).name, fromPile) : STATUS.myTurn}</em>`, sub, tone: 'turn' };
      break;
    }
    case 'ownpeek':
      st = { main: `<em>${CB_STATUS.ownpeek}</em>`, sub: CB_STATUS.ownpeekSub, tone: 'turn' };
      break;
    case 'spy':
      st = { main: `<em>${CB_STATUS.spy}</em>`, sub: CB_STATUS.spySub, tone: 'turn' };
      break;
    case 'blind':
      st = {
        main: `<em>${CB_STATUS.blind}</em>`,
        sub: n && App.cs.opp ? CB_STATUS.blindReady : CB_STATUS.blindSub,
        tone: 'turn',
      };
      break;
    case 'wait': {
      let sub = '';
      if (C.power?.by === cur) sub = cbOtherPower(plainName(v, cur), POWER_LONG[C.power.kind]);
      else if (C.hold?.by === cur) {
        const cw = C.hold.from === 'pile' && C.hold.c ? cbCardWords(C.hold.c, true) : null;
        sub = cw ? cbOtherPile(plainName(v, cur), cw.name, cw.val) : cbOtherDeck(plainName(v, cur));
      } else if (C.cabo) sub = C.left.includes(App.me) ? CB_STATUS.again : CB_STATUS.noMore;
      st = { main: turnMain(v, cur), sub, tone: C.cabo ? 'knock' : 'calm' };
      break;
    }
    case 'none':
      if (v.phase === 'end' || v.phase === 'over') {
        const revealing = v.phase === 'over' && (!!App.zerHide || ceremonyOn());
        st = { main: endMain(v, revealing), sub: revealing ? CB_STATUS.overSub : '', tone: 'over' };
      } else if (v.phase === 'play' || v.phase === 'peek') {
        // Erst ab der nächsten Runde dabei: zusehen, bei reinen KI-Runden abkürzen
        st = {
          main: v.phase === 'play' ? turnMain(v, cur) : CB_STATUS.peek,
          sub: CB_STATUS.nextRound,
          tone: 'calm',
        };
        if (onlyBotsPlaying(v)) quick = botsOnlyHTML(v, true);
      }
      break;
  }
  if ((role === 'draw' || role === 'wait') && cbCanSnap(v) && App.cs.snap) st = { ...st, sub: CB_STATUS.snap };
  // Wer gerade aufhält und offline ist. Wer selbst noch ansehen muss, liest erst seinen eigenen Hinweis
  const waiting = cbWaiting(v);
  const off = v.players.find((p) => waiting.includes(p.id) && !p.online && !p.bot && p.id !== App.me);
  if ((v.phase === 'play' || v.phase === 'peek') && off && role !== 'look') {
    const nm = esc(off.name);
    if (App.role === 'host' && !quick) {
      st = { ...st, main: offline(`<b>${nm}</b>`) };
      quick = `<button class="btn ghost small" data-act="skip"><span class="qlbl">${playFor(nm)}</span></button>`;
    } else st = { ...st, sub: `${offline(nm)} ${OFFLINE_WAIT}` };
  }
  return quick ? { ...st, quick } : st;
}

/**
 * Knöpfe am eigenen Platz. Sie stehen je Rolle immer an derselben Stelle und werden nur gesperrt (aria-disabled mit
 * Grund aus cbWhyNot), damit nicht plötzlich ein anderer Knopf unter dem Finger liegt. Ändert sich die Zeile, sind
 * Tipps kurz gesperrt (barGuard in src/ui/cabo/input.ts).
 */
function cbBar(v: View, C: CbView): BarModel {
  const role = cbRole(v);
  const n = App.cs.ids.length;
  const b = (act: CbBtn, intent: BtnIntent, cls: string, label: string, ok: boolean): BarButton => {
    const a = ok ? null : cbBtnAct(act);
    return { act, intent, cls, label, ok, why: a && cbWhyNot(v, App.me, a) };
  };
  const btns: BarButton[] = [];
  switch (role) {
    case 'draw':
      btns.push(b('cbdeck', 'go', 'primary', twoLabel('Vom Stapel', 'Ziehen'), C.deck > 0));
      btns.push(
        b('cbpile', 'alt', 'ghost', twoLabel('Ablage nehmen', 'Ablage'), C.pile.length > 0 && !!cbMine(v)?.length),
      );
      btns.push(b('cbcabo', 'call', 'wood cabo', '📣 Cabo!', !C.cabo));
      break;
    case 'hold': {
      const fromDeck = C.hold?.from === 'deck';
      const pw = fromDeck && C.hold?.c ? cbPower(C.hold.c) : null;
      // Die Breite für „9 eintauschen“ ist reserviert, dann wächst der Knopf beim Wählen nicht und bricht nie um
      const swap = `<span>${n > 1 ? `${n} eintauschen` : 'Eintauschen'}</span><span aria-hidden="true">9 eintauschen</span>`;
      btns.push(b('cbswap', 'go', 'primary', `<span class="cbres">${swap}</span>`, n > 0));
      // Am Handy reicht das Zeichen der Fähigkeit, sonst bricht „Eintauschen“ daneben um
      const discard = pw ? twoLabel(`Ablegen + ${POWER_NAME[pw]}`, `Ablegen ${POWER_ICON[pw]}`) : 'Ablegen';
      btns.push(b('cbdiscard', 'alt', 'ghost', discard, fromDeck));
      break;
    }
    case 'ownpeek':
    case 'spy':
      btns.push(b('cbskip', 'alt', 'ghost', 'Auslassen', true));
      break;
    case 'blind':
      btns.push(b('cbblind', 'go', 'primary', 'Blind tauschen', n === 1 && !!App.cs.opp));
      btns.push(b('cbskip', 'alt', 'ghost', 'Auslassen', true));
      break;
    default:
      break;
  }
  if (cbCanSnap(v)) {
    const on = App.cs.snap;
    const label = on ? twoLabel('Doch nicht', '✕') : twoLabel('⚡ Schnappen', '⚡');
    btns.push({ ...b('cbsnapmode', 'toggle', `${on ? 'primary' : 'ghost'} snapb`, label, true), on });
  }
  return { btns };
}

/** Eigener Platz: Kopf mit Punkten, die eigene Reihe und Knöpfe. Wer diese Runde nicht mitspielt, bekommt einen Satz. */
function cbMe(v: View): MeModel | MeOut | null {
  const C = v.cb;
  if (!C) return null;
  const me = pById(v, App.me);
  const row = cbMine(v);
  if (!me || !row) return { out: CB_TABLE.out, cls: ['shme', 'cbme'] };
  const role = cbRole(v);
  const snap = App.cs.snap && cbCanSnap(v);
  const pickable = role === 'look' || role === 'hold' || role === 'ownpeek' || role === 'blind' || snap;
  // Auch sonst antippbar, dann nennt die Karte ihren Grund (src/ui/cabo/input.ts)
  const tappable = pickable || ((v.phase === 'play' || v.phase === 'peek') && role !== 'looked');
  const sel = new Set(App.cs.ids);
  const r = caboResult(v);
  const score =
    v.phase === 'end' && r && App.me in r.scores ? `<span class="tag">+${num(r.scores[App.me])}</span>` : '';
  const called = C.cabo === App.me && v.phase === 'play';
  const turn = v.phase === 'play' && cbWaiting(v).includes(App.me);
  const st: MeState[] = [];
  if (turn) st.push('turn');
  if (role === 'look') st.push('looking');
  if (snap) st.push('snapping');
  const n = cbShownPoints(v, me);
  const slots = row.map((s, i) =>
    slotHTML(v, App.me, s, {
      act: tappable ? 'cbm' : '',
      pick: pickable,
      sel: sel.has(s.id),
      name: CB_TABLE.mine(i),
      probe: pickable ? null : cbProbe(v, s.id),
    }),
  );
  return {
    head: {
      marks: reignHTML(v, me.id),
      tags: (called ? `<span class="tag cabo">${CB_TABLE.tag.call}</span>` : '') + score,
      pill: `<span class="pill">${CB_TABLE.points(n)}</span>`,
    },
    rows:
      `<div class="cbrow mine${row.length > 4 ? ' many' : ''}${snap ? ' snapping' : ''}" role="group"` +
      ` aria-label="${CB_TABLE.row}" style="--ov:${overlap(row.length, 6).toFixed(3)}">${slots.join('')}</div>`,
    bar: cbBar(v, C),
    st,
    cls: ['shme', 'cbme'],
    say: CB_TABLE.me({ turn, called, points: n }),
  };
}

export function caboResult(v: View): CaboResult | null {
  return v.result?.reason === 'cabo' ? v.result : null;
}

/**
 * Kernzahl jeder Zeile, kurz, damit lange Namen stehen bleiben. Der Stand steht rechts. Die Summe nur, wenn sie von
 * den Punkten abweicht (Rufer, Kamikaze, Strafe). Bei Kamikaze zählt die Summe der anderen nicht, ihre 50 erklärt
 * schon der Satz unter dem Titel. Am Partieende steht das Urteil der letzten Runde in der Zeile, denn der Kopf nennt
 * dann nur den König. Urteil und Rückfall auf 50 stecken in `.cbwhy`, damit sie am Handy unter den Namen rücken
 * (src/styles/cabo.css).
 */
function rowNote(r: CaboResult, id: string, over: boolean): string {
  const sum = num(r.sums[id]);
  const score = num(r.scores[id]);
  const reset = r.resets.includes(id) ? ` · auf ${CB_RESET_TO}` : '';
  if (over) {
    if (reset) return `<span class="cbwhy">genau 100 · auf ${CB_RESET_TO}</span>`;
    const why = r.kami === id ? 'Kamikaze' : r.caller === id && r.ok === false ? 'Cabo daneben' : '';
    return why ? `<span class="cbwhy">${why} · +${score}</span>` : `+${score}`;
  }
  const withSum = score !== sum && !(r.kami && r.kami !== id);
  const note = `${withSum ? `Summe ${sum} · ` : ''}+${score}${reset}`;
  // Wer auf 50 zurückfällt, bekommt am Handy ebenfalls eine zweite Zeile
  return reset ? `<span class="cbwhy">${note}</span>` : note;
}

/**
 * Kurzform der Kernzahl am Rundenende ohne Summe, wenn ein langer Name sonst nicht ganz passt (fitRows in
 * src/ui/render/result.ts). Warum die Punkte von der Summe abweichen, sagt der Satz unter dem Titel.
 */
function rowShort(r: CaboResult, id: string, over: boolean): string | undefined {
  const sum = num(r.sums[id]);
  const score = num(r.scores[id]);
  if (over || score === sum || (r.kami && r.kami !== id)) return undefined;
  const reset = r.resets.includes(id) ? ` · auf ${CB_RESET_TO}` : '';
  return reset ? `<span class="cbwhy">+${score}${reset}</span>` : `+${score}`;
}

/** Spruch passend zum Ende der Runde oder der Partie, aus meiner Sicht. */
function overlayTaunt(v: View, r: CaboResult): { text: string; good: boolean } {
  const seed = `c${v.games}.${v.round}`;
  const names = r.names ?? {};
  const nm = (id: string) => nameOf(v, id, names[id]);
  if (v.phase === 'over') {
    if (!r.winner) return { text: '', good: false };
    if (r.winner === App.me) return { text: taunt('cbKingSelf', null, seed), good: true };
    // Hat der König seine Krone verteidigt, klingt der Spruch anders
    const again = v.log.some((e) => e.k === 'cbend' && e.p === r.winner && e.again);
    return { text: taunt(again ? 'cbKingStays' : 'cbKingOther', { name: nm(r.winner) }, seed), good: false };
  }
  if (r.kami === App.me) return { text: taunt('cbKamiSelf', null, seed), good: true };
  if (r.kami) return { text: taunt('cbKamiOther', { name: nm(r.kami) }, seed), good: false };
  if (r.resets.includes(App.me)) return { text: taunt('cbResetSelf', null, seed), good: true };
  if (r.caller === App.me) {
    return r.ok
      ? { text: taunt('cbCaboOkSelf', null, seed), good: true }
      : { text: taunt('cbCaboFailSelf', null, seed), good: false };
  }
  if (r.caller && r.ok === false) return { text: taunt('cbCaboFailOther', { name: nm(r.caller) }, seed), good: false };
  return { text: '', good: false };
}

/**
 * Ergebnisblatt als Daten. Am Rundenende ist die Schlüsselzeile, wer Cabo rief (oder Kamikaze hatte), mit Karten,
 * am Partieende der neue Cabo-König ohne Karten. Alle Zeilen nach Stand, rechts die Gesamtpunkte. Sonst `null`.
 */
export function cbSheet(v: View): Sheet | null {
  const r = caboResult(v);
  if ((v.phase !== 'end' && v.phase !== 'over') || !r) return null;
  const names = r.names ?? {};
  const nm = (id: string) => esc(nameOf(v, id, names[id]));
  const over = v.phase === 'over';
  let icon = '🃏';
  let title: string;
  let lead: string;
  if (over) {
    const w = r.winner;
    icon = w ? '👑' : '🤝';
    title = w
      ? `${nm(w)}${vb(w, ' bist', ' ist')} <span class="g" style="white-space:nowrap">Cabo-König!</span>`
      : 'Unentschieden!';
    // Wer über die Grenze kam, zeigen die Punkte rechts. Bei acht Leuten kostet der Satz sonst zwei Zeilen
    lead = w ? '' : 'Vorne liegen mehrere gleichauf, diesmal gibt es keinen neuen König.';
  } else if (r.kami) {
    icon = '💥';
    title = 'Kamikaze!';
    lead = `Alle anderen bekommen ${CB_KAMI} Punkte.`;
  } else if (r.caller) {
    icon = r.ok ? '🎯' : '🙈';
    title = r.ok ? 'Cabo geschafft!' : 'Cabo daneben!';
    // Kurz, bei acht Leuten und langen Namen zählt jede Zeile
    lead = r.ok
      ? `${nm(r.caller)}${vb(r.caller, ' hattest', ' hatte')} am wenigsten.`
      : `${nm(r.caller)} ${vb(r.caller, 'bekommst', 'bekommt')} ${CB_PENALTY} Strafpunkte obendrauf.`;
  } else {
    title = 'Stapel leer!';
    lead = 'Keine Karten mehr, die Runde ist vorbei.';
  }
  const key = over ? (r.winner ?? null) : (r.kami ?? r.caller ?? null);
  const order = Object.keys(r.totals).sort((a, b) => r.totals[a] - r.totals[b] || num(r.scores[a]) - num(r.scores[b]));
  const rows: SheetRow[] = order.map((id, i) => {
    const win = over && v.winner === id;
    const ok = !over && r.caller === id && r.ok;
    const fail = !over && r.caller === id && r.ok === false;
    return {
      id,
      place: over ? num(pById(v, id)?.place) || i + 1 : i + 1,
      name: nm(id),
      hat: win ? '👑' : r.kami === id ? '💥' : r.caller === id ? '📣' : undefined,
      core: rowNote(r, id, over),
      short: rowShort(r, id, over),
      val: String(num(r.totals[id])),
      // Am Rundenende zählen die Karten von Rufer oder Kamikaze, am Partieende nur noch die Punkte
      cards: over ? undefined : (r.hands[id] ?? []),
      tone: win || ok ? 'win' : fail ? 'lose' : undefined,
    };
  });
  const tt = overlayTaunt(v, r);
  return {
    icon,
    title,
    lead,
    key,
    taunt: tt.text ? tt : null,
    bets: '',
    rows,
    next: over ? 'game' : 'round',
    cls: 'cbsheet',
  };
}

export const cbSpec: NewTable = {
  badge: false,
  actor: (v) => (v.phase === 'play' ? turnId(v) : null),
  seat: cbSeat,
  center: cbCenter,
  me: cbMe,
  status: cbStatus,
  sheet: cbSheet,
  drag: null,
};
