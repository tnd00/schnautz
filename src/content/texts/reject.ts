/*
 * Texte zu den Ablehnungscodes (src/game/reject.ts). Eine Vorlage pro Code, der Record erzwingt das. Der Wortlaut
 * bleibt im Umbau so nah wie möglich am alten Text (Entscheidung E2). Drei Vorlagen sind eingefroren, weil Gäste von
 * 2.6 an ihnen erkennen, ob die Einladung bleibt: „Der Tisch ist voll.“, „alle Plätze sind besetzt“ und
 * „Lade die Seite neu“. Gerendert wird als reiner Text, wer ihn in HTML setzt, maskiert ihn selbst.
 */
import { GAME_NAME, isGame } from '../../game/games';
import { isReject, type Reject, type RejectArgs, type RejectCode } from '../../game/reject';
import type { State, View } from '../../game/types';

/** Wer liest (eigener Platz heißt „du“) und wie Platz-IDs zu Namen werden. */
export interface RejectCtx {
  me: string;
  name: (id: string) => string | undefined;
}

/** Zugriff auf die Argumente beim Rendern. null heißt: fehlt oder passt nicht, dann gilt der Rückfall. */
interface Fill {
  /** Ist das Argument der eigene Platz? */
  me: (k: string) => boolean;
  /** Steht das Argument überhaupt da? */
  has: (k: string) => boolean;
  /** Name zur Platz-ID, „Jemand“ bei unbekannter ID */
  name: (k: string) => string | null;
  num: (k: string) => number | null;
  game: (k: string) => string | null;
}

/** Text mit Platzhaltern ({n}, {min}, {max}, {game} aus `g`, {p}, {on}) oder Funktion für Blickwinkel und Mehrzahl. */
type Tpl = string | ((f: Fill) => string | null);

const NUM_WORD: Readonly<Record<number, string>> = { 2: 'zwei' };

export const REJECT_TEXT: Readonly<Record<RejectCode, Tpl>> = {
  'any.unknown': 'Unbekannte Aktion.',
  'any.notSeated': 'Du sitzt nicht an diesem Tisch.',
  'any.noSuchSeat': 'Die Person sitzt nicht mehr am Tisch.',
  'any.hostOnly': 'Nur der Gastgeber kann das.',
  'any.lobbyOnly': 'Das geht nur in der Lobby.',
  'any.running': 'Die Partie läuft schon.',
  'any.notStarted': 'Die Partie hat noch gar nicht angefangen.',
  'any.over': 'Die Partie ist vorbei.',
  'any.roundOver': 'Die Runde ist vorbei.',
  'any.notYourTurn': 'Du bist gerade nicht dran.',
  'any.cardGone': 'Die Karte ist nicht mehr da.',
  'any.pickCard': 'Wähle zuerst eine Karte.',
  'any.sameRank': 'Zusammen geht nur mit gleichem Wert.',
  'any.notPlaying': 'Du spielst diese Partie nicht mit.',
  'any.done': 'Du bist schon fertig.',
  'any.ready': 'Du hast schon auf Fertig gedrückt.',
  'any.allHere': (f) => {
    if (!f.has('p')) return 'Alle sind da.';
    if (f.me('p')) return 'Du bist wieder da.';
    const p = f.name('p');
    return p && `${p} ist wieder da.`;
  },
  'seat.tooFew': (f) => {
    const n = f.num('min');
    return n == null ? null : `Ihr braucht mindestens ${NUM_WORD[n] ?? n} Leute am Tisch.`;
  },
  'seat.tooMany': '{game} geht mit höchstens {max} Leuten.',
  'seat.full': 'Der Tisch ist voll.',
  'seat.fullPlaying': 'Die Partie läuft schon und alle Plätze sind besetzt.',
  'seat.taken': 'Dieser Platz ist schon besetzt.',
  'net.oldPage': 'An diesem Tisch läuft {game}. Lade die Seite neu, dann kannst du mitspielen.',
  'sh.swapOver': 'Tauschen geht nur vor dem Start.',
  'sh.swapping': "Erst wird getauscht. Los geht's, wenn alle fertig getauscht haben.",
  'sh.noFour': 'Du hast keine 4.',
  'sh.winClosed': 'Zu spät, die erste Karte liegt schon.',
  'sh.blindOnly': 'Mit verdeckten Karten geht das nicht.',
  'sh.bombWin': 'Moment, die 4er werden noch reingeworfen.',
  'sh.bombLate': 'Zu spät, das geht nicht mehr.',
  'sh.cutOff': 'Bomben sind an diesem Tisch aus.',
  'sh.winLock': 'Kurz warten, erst dürfen alle ihre 4er reinwerfen.',
  'sh.handFirst': 'Erst die Handkarten ausspielen.',
  'sh.noFit': 'Die Karte passt nicht auf den Stapel.',
  'sh.pileEmpty': 'Der Stapel ist leer. Leg einfach eine Karte.',
  'sh.blindLast': 'Erst Hand und offene Karten spielen.',
  'dk.defending': 'Du verteidigst gerade.',
  'dk.notLead': 'Zuerst greift jemand anderes an.',
  'dk.rankNotOnTable': 'Nachlegen geht nur mit Werten, die schon auf dem Tisch liegen.',
  'dk.passed': 'Du hast gepasst. Nachlegen geht erst wieder bei einem neuen Wert oder wenn aufgenommen wird.',
  'dk.passedTake': 'Du hast gepasst. In diesen Angriff legst du nichts mehr nach.',
  'dk.room': (f) => {
    const n = f.num('n');
    if (n == null) return null;
    if (n <= 0) return 'In diesen Angriff passt nichts mehr.';
    return n === 1
      ? 'Es passt nur noch eine Karte in diesen Angriff.'
      : `Es passen nur noch ${n} Karten in diesen Angriff.`;
  },
  'dk.transferOff': 'Weiterschieben ist an diesem Tisch aus.',
  'dk.notDefender': 'Das kann nur, wer verteidigt.',
  'dk.transferLate': 'Weiterschieben geht nur, bevor du etwas geschlagen hast.',
  'dk.taking': 'Du nimmst schon auf.',
  'dk.tableEmpty': 'Noch liegt nichts auf dem Tisch.',
  'dk.transferRank': 'Weiterschieben geht nur mit dem gleichen Wert.',
  'dk.nextShort': 'Der Nächste hat dafür zu wenige Karten.',
  'dk.pairGone': 'Diese Karte liegt nicht auf dem Tisch.',
  'dk.beaten': 'Diese Karte ist schon geschlagen.',
  'dk.noBeat': 'Die Karte schlägt das nicht.',
  'dk.allBeaten': 'Alles ist geschlagen.',
  'dk.leadFirst': 'Du musst zuerst angreifen.',
  'dk.openCards': 'Erst muss alles geschlagen sein.',
  'dk.noTarget': 'Diese Karte schlägt keinen offenen Angriff.',
  'cb.peekOver': 'Ansehen geht nur zu Beginn der Runde.',
  'cb.pickTwo': (f) => (f.num('n') === 1 ? 'Wähle eine deiner Karten.' : 'Wähle zwei deiner Karten.'),
  'cb.peeking': 'Erst sehen sich alle ihre zwei Karten an.',
  'cb.drawn': 'Du hast schon gezogen.',
  'cb.pileNoCards': 'Ohne eigene Karten kannst du die Ablage nicht nehmen. Zieh vom Stapel.',
  'cb.pileEmpty': 'Die Ablage ist leer.',
  'cb.deckEmpty': 'Der Stapel ist leer.',
  'cb.caboLate': 'Cabo rufst du statt zu ziehen.',
  'cb.called': 'Cabo wurde schon gerufen.',
  'cb.drawFirst': 'Zieh zuerst eine Karte.',
  'cb.mustSwap': 'Eine Karte von der Ablage musst du tauschen.',
  'cb.noPeek': 'Ansehen geht nur mit einer 7 oder 8.',
  'cb.pickOwn': 'Wähle eine deiner Karten.',
  'cb.noSpy': 'Ausspionieren geht nur mit einer 9 oder 10.',
  'cb.pickOther': 'Wähle eine Karte von jemand anderem.',
  'cb.noBlind': 'Blind tauschen geht nur mit Bube oder Dame.',
  'cb.pickPair': 'Wähle eine eigene und eine fremde Karte.',
  'cb.pickSwap': 'Wähle die Karten, die du tauschen willst.',
  'cb.snapOff': 'Schnappen ist an diesem Tisch aus.',
  'cb.finishTurn': 'Spiel erst deinen Zug zu Ende.',
  'sz.chosen': 'Die Karten sind schon verteilt, gewählt wird jetzt nicht mehr.',
  'sz.dealerOnly': 'Das entscheidet, wer gibt.',
  'sz.choosing': (f) => {
    if (!f.has('p')) return 'Erst wird entschieden, ob die Karten bleiben.';
    if (f.me('p')) return 'Erst entscheidest du, ob deine Karten bleiben.';
    const p = f.name('p');
    return p && `Erst entscheidet ${p}, ob die Karten bleiben.`;
  },
  'sz.knocked': 'Es wurde schon geklopft.',
  'sz.knockEarly': 'Klopfen geht erst, wenn jeder einmal dran war.',
  'bet.closed': 'Tippen geht nur während der Partie.',
  'bet.notDone': 'Tippen kannst du, sobald du fertig bist.',
  'bet.twice': 'Du hast schon getippt.',
  'bet.targetDone': (f) => {
    if (f.me('p')) return 'Du bist schon fertig. Tipp auf jemand anderen.';
    const p = f.name('p');
    return p && `${p} ist schon fertig. Tipp auf jemand anderen.`;
  },
};

/** Argumente nie roh einsetzen: Namen über die Platz-ID, Spiele über GAME_NAME, Zahlen nur endlich. */
function fillOf(a: RejectArgs | undefined, ctx: RejectCtx): Fill {
  const id = (k: string): string | null => {
    const v = a?.[k];
    return typeof v === 'string' && v.length > 0 && v.length <= 40 ? v : null;
  };
  return {
    me: (k) => {
      const v = id(k);
      return !!v && v === ctx.me;
    },
    has: (k) => a?.[k] != null,
    name: (k) => {
      const v = id(k);
      return v ? (ctx.name(v) ?? 'Jemand') : null;
    },
    num: (k) => {
      const v = a?.[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    },
    game: (k) => {
      const v = a?.[k];
      return isGame(v) ? GAME_NAME[v] : null;
    },
  };
}

function render(r: Reject, ctx: RejectCtx): string | null {
  const tpl = REJECT_TEXT[r.e];
  if (tpl == null) return null;
  const f = fillOf(r.a, ctx);
  if (typeof tpl === 'function') return tpl(f);
  let ok = true;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = k === 'game' ? f.game('g') : k === 'p' || k === 'on' ? f.name(k) : f.num(k);
    if (v == null) ok = false;
    return String(v ?? '');
  });
  return ok ? out : null;
}

/**
 * Text zur Ablehnung aus Sicht von `ctx.me`. Unbekannter Code (Gastgeber neuer als Gast), fehlendes oder krummes
 * Argument: dann steht `fallback` da.
 */
export function rejectText(r: Reject | null | undefined, ctx: RejectCtx, fallback = 'Das geht gerade nicht.'): string {
  if (r == null) return '';
  return (isReject(r) && render(r, ctx)) || fallback;
}

/** Blickwinkel und Namen aus einer Ansicht. Beim Beitritt gibt es noch keine, dann ohne Namen. */
export function ctxOfView(v: View | null | undefined): RejectCtx {
  return { me: v?.me ?? '', name: (id) => v?.players.find((p) => p.id === id)?.name };
}

/** Blickwinkel einer bestimmten Person aus dem vollen Zustand, beim Gastgeber für den Text an einen Gast. */
export function ctxOfState(st: State | null | undefined, me: string): RejectCtx {
  return { me, name: (id) => st?.players.find((p) => p.id === id)?.name };
}

/** Fürs Protokoll: Text und Code mit Argumenten, Platz-IDs stehen dort als ID. */
export function rejectLog(r: Reject | null | undefined, ctx?: RejectCtx): string {
  if (r == null) return '';
  const args = Object.entries(r.a ?? {})
    .map(([k, v]) => ` ${k}=${v}`)
    .join('');
  return `${rejectText(r, ctx ?? { me: '', name: (id) => id })} [${r.e}${args}]`;
}
