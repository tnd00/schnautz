/*
 * Gemeinsames Ergebnisblatt aller Spiele (`renderSheet`) mit Knöpfen, Wartetext und Tippzeile, dazu „Tisch ansehen“
 * und die Leiste, wenn nur noch KIs spielen.
 */
import { shCanBet } from '../../game/bets';
import { onlyBotsPlaying } from '../../game/games';
import type { Card, Player, ShBetResult, View } from '../../game/types';
import { ffwdInLog } from '../../net/pace';
import { App } from '../app';
import { cardHTML } from '../cards';
import { $, esc, listJoin, num } from '../dom';
import { holdOverlay } from '../feedback';
import { aimAttrs } from './marks';
import { nameOf } from '../helpers';
import { nextSecs } from '../nextround';
import { canChallenge, mustAccept, rematchLine, rematchMark } from './rematch';

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

/** Statt des Knopfs, sobald vorgespult wird */
export const FFWD_ON_HTML = '<span class="botsonly">⏩ Die KIs spielen es aus.</span>';

/**
 * Ich bin raus oder fertig und nur noch KIs spielen: Der Gastgeber spult vor oder beendet die Partie, Gäste sehen
 * einen Hinweis. Ob schon vorgespult wird, steht im Verlauf (`ffwd` seit Partiebeginn und seit der letzten Übernahme).
 */
export function botsOnlyHTML(v: View, small = false): string {
  if (!onlyBotsPlaying(v)) return '';
  const fast = ffwdInLog(v.log);
  if (App.role !== 'host')
    return `<span class="botsonly">Nur noch KIs im Spiel. ${fast ? 'Die KIs spielen es gleich aus.' : 'Der Gastgeber kann vorspulen.'}</span>`;
  const sz = small ? ' small' : '';
  // Wer fertig ist und noch tippen kann, soll es vor dem Vorspulen wissen. Gesperrt wird nicht, sonst hält ein
  // Gast, der nicht mehr hinschaut, den ganzen Tisch auf
  const bettors = v.players.filter((p) => !p.bot && p.online && shCanBet(v, p.id));
  const meBets = bettors.some((p) => p.id === App.me);
  const names = [...(meBets ? ['Du'] : []), ...bettors.filter((p) => p.id !== App.me).map((p) => esc(p.name))];
  const verb = names.length === 1 ? (meBets ? 'kannst' : 'kann') : meBets ? 'könnt' : 'können';
  const hint = names.length
    ? `<span class="botsonly" style="flex-basis:100%;text-align:center">${listJoin(names)} ${verb} noch tippen.</span>`
    : '';
  return (
    hint +
    (fast ? FFWD_ON_HTML : `<button class="btn primary${sz}" data-act="ffwd">⏩ Vorspulen</button>`) +
    `<button class="btn ghost${sz}" data-act="restart">Neue Partie</button>` +
    `<button class="btn ghost${sz}" data-act="lobbynow">Zur Lobby</button>`
  );
}

/**
 * Eine Zeile im Blatt: Wer hat richtig getippt? Für Shithead und Durak. Höchstens ein Name, sonst nur die Zahl, sonst
 * wird die Zeile mit langen Namen drei Zeilen hoch und das Blatt scrollt am Handy. Alle Namen stehen im Tooltip.
 */
export function betResultHTML(v: View, raw: ShBetResult[] | undefined, loser: string | null, what: string): string {
  const bets = Array.isArray(raw) ? raw : [];
  if (!bets.length) return '';
  if (!loser) return `<p class="betres">🔮 Ohne ${what} zählt kein Tipp.</p>`;
  const r = { bets, names: v.result && 'names' in v.result ? v.result.names : {} };
  const mine = bets.find((b) => b.p === App.me);
  const others = bets.filter((b) => b.ok && b.p !== App.me);
  const names = r.names ?? {};
  const list = others.map((b) => `${nameOf(v, b.p, names[b.p])} (+${num(b.q)})`);
  const n = list.length;
  let text: string;
  if (mine?.ok)
    text =
      `Richtig getippt! +${num(mine.q)} ${mine.q === 1 ? 'Punkt' : 'Punkte'}` +
      (n ? `, wie ${n === 1 ? 'noch jemand' : `${n} andere`}.` : '.');
  else if (mine)
    text = !n
      ? 'Dein Tipp lag daneben.'
      : `Daneben getippt, ${n === 1 ? 'jemand anders lag' : `${n} andere lagen`} richtig.`;
  else if (n === 1) text = `${esc(list[0])} hat richtig getippt.`;
  else if (n > 1) text = `${n} Leute haben richtig getippt.`;
  else text = 'Niemand hat richtig getippt.';
  const tip = n > 1 || (mine && n) ? ` title="${esc(listJoin(list))}"` : '';
  return `<p class="betres"${tip}>🔮 ${text}</p>`;
}

/** Eine Zeile im Ergebnisblatt. */
export interface SheetRow {
  /** Platz-ID: data-pid, Wurfziel, Wurfmarken */
  id: string;
  /** null, wenn es keinen Platz gibt (Schnautz-Rundenende) */
  place: number | null;
  /** HTML, maskiert, „Du“ für mich */
  name: string;
  /** Zeichen vor dem Namen (💩 🤡 👑 📣) */
  hat?: string;
  /** Kernzahl oder Folge, HTML */
  core: string;
  /** Rechte Spalte, Handwert oder Gesamtpunkte */
  val?: string;
  /** Minikarten, gekappt auf 8 plus „+n“ */
  cards?: readonly Card[];
  tone?: 'win' | 'lose' | 'swim';
}

/** Ergebnisblatt als Daten. Jedes Spiel baut nur sein Blatt, `renderResult` zeichnet es. */
export interface Sheet {
  icon: string;
  /** HTML, enthält das Wort für die E2E-Prüfung (Shithead, Durak, Cabo-König, Unentschieden) */
  title: string;
  /** HTML, darf leer sein */
  lead: string;
  /** ID der Schlüsselzeile (Verlierer, König, Sieger), sie steht direkt unter dem Kopf */
  key: string | null;
  /** Urteil zur Schlüsselzeile, HTML */
  keyNote?: string;
  /** Spruch, rematchLine ersetzt ihn */
  taunt: { text: string; good: boolean } | null;
  /** Fertige Tippzeile aus betResultHTML, sonst leer */
  bets: string;
  /** Alle Zeilen in Platzreihenfolge, auch Schlüssel und ich, renderSheet ordnet um */
  rows: SheetRow[];
  /** Zusatz unter den Zeilen, etwa „Schon raus“-Chips */
  extra?: string;
  next: 'round' | 'game';
  cls?: string;
  /** Minikarten in jeder Zeile statt nur in der Schlüsselzeile (Schnautz am Rundenende an kleinen Tischen) */
  rowCards?: boolean;
}

const MAX_CARDS = 8;

function sheetRowHTML(v: View, r: SheetRow, key: boolean, withCards = key): string {
  const p = v.players.find((x) => x.id === r.id);
  const mine = r.id === App.me;
  const cls = ['row', 'rr', r.tone, key && 'key', mine && 'mine'].filter(Boolean).join(' ');
  const cards = r.cards ?? [];
  const mini =
    withCards && cards.length
      ? `<span class="rcards mini">${cards
          .slice(0, MAX_CARDS)
          .map((c) => cardHTML(c))
          .join('')}${cards.length > MAX_CARDS ? `<span class="more">+${cards.length - MAX_CARDS}</span>` : ''}</span>`
      : '';
  return (
    `<div class="${cls}" data-pid="${esc(r.id)}"${aimAttrs(p, true)}>` +
    `<span class="rpl">${r.place != null ? `${num(r.place)}.` : ''}</span>` +
    `<span class="rnm">${r.hat ? `<span class="hat">${r.hat}</span>` : ''}<b>${r.name}</b>${rematchMark(v, r.id)}</span>` +
    `<span class="rcore">${r.core}</span>` +
    (r.val != null ? `<span class="rval">${r.val}</span>` : '') +
    mini +
    '</div>'
  );
}

/** Knöpfe des Blatts, in allen Spielen gleich: Zur Lobby, Tisch ansehen, Neue Partie oder Nächste Runde, Revanche. */
function sheetBtns(v: View, me: Player | null, s: Sheet): string {
  const ready = !!me?.ready;
  const host = App.role === 'host';
  const secs = v.phase === 'end' ? nextSecs() : 0;
  const next = s.next === 'game' ? 'Neue Partie' : 'Nächste Runde';
  const label = `${next}${secs ? ` (<b class="nextcd">${secs}</b> s)` : ''}`;
  let h = '';
  if (host && v.phase === 'over')
    h +=
      '<button class="btn ghost" data-act="lobbynow"><span class="blong">Zur Lobby</span><span class="bshort">Lobby</span></button>';
  h +=
    '<button class="btn ghost" data-act="peek"><span class="blong">Tisch ansehen</span><span class="bshort">Tisch</span></button>';
  if (!me) return h;
  if (ready) {
    const waiting = v.players.some(
      (p) => p.online && !p.ready && !p.bot && p.id !== App.me && (v.phase === 'over' || !p.out),
    );
    if (host && waiting)
      h +=
        '<button class="btn ghost" data-act="force"><span class="blong">Nicht warten</span><span class="bshort">Los</span></button>';
    return h;
  }
  if (mustAccept(v))
    return h + '<button class="btn primary rv" data-act="ready" aria-label="Revanche annehmen">⚔️ Revanche</button>';
  if (canChallenge(v))
    return (
      h +
      `<button class="btn ghost" data-act="ready"><span class="blong">${label}</span><span class="bshort">Weiter</span></button>` +
      '<button class="btn primary rv" data-act="rematch">⚔️ Revanche</button>'
    );
  // Ein Span hält Text und Zahl zusammen, sonst setzt das gap von .btn Lücken: „Nächste Runde ( 9 s)“
  return h + `<button class="btn primary" data-act="ready"><span>${label}</span></button>`;
}

/**
 * Wartetext nach dem Bereitmelden, sonst nichts. Er steht in der Knopfreihe an der Stelle des Knopfs, der mit dem
 * Bereitmelden wegfällt, einzeilig und notfalls gekürzt. So wird das Blatt dadurch nicht höher.
 */
function sheetWait(v: View, me: Player | null): string {
  if (!me?.ready) return '';
  const secs = v.phase === 'end' ? nextSecs() : 0;
  const waiting = v.players
    .filter((p) => p.online && !p.ready && !p.bot && p.id !== App.me && (v.phase === 'over' || !p.out))
    .map((p) => p.name);
  const txt = waiting.length ? `Warte auf ${listJoin(waiting)}…` : "Los geht's…";
  // Der Countdown zuerst, gekürzt wird hinten bei den Namen
  const cd = secs ? `Weiter in <b class="nextcd">${secs}</b> s · ` : '';
  return `<span class="waittxt" title="${esc(txt)}">${cd}${esc(txt)}</span>`;
}

/**
 * Inhalt des Ergebnisblatts: Kopf, Schlüsselzeile, Duell oder Spruch, Tipps, eigene Zeile, alle übrigen als
 * Einzeiler, Fuß mit Reaktionen und Knöpfen. Jede Platz-ID steht genau einmal als `.row[data-pid]` da.
 */
export function renderSheet(v: View, s: Sheet): string {
  const me = v.players.find((p) => p.id === App.me) ?? null;
  const key = s.key ? s.rows.find((r) => r.id === s.key) : undefined;
  const own = s.rows.find((r) => r.id === App.me && r.id !== s.key);
  const rest = s.rows.filter((r) => r !== key && r !== own);
  const rline = rematchLine(v);
  const say = rline
    ? `<p class="taunt rv">${rline}</p>`
    : s.taunt
      ? `<p class="taunt${s.taunt.good ? ' good' : ''}">${esc(s.taunt.text)}</p>`
      : '';
  return (
    `<div class="rhead"><span class="trophy">${s.icon}</span><h2>${s.title}</h2></div>` +
    (s.lead ? `<p class="lead">${s.lead}</p>` : '') +
    '<div class="rows">' +
    (key ? sheetRowHTML(v, key, true) : '') +
    (s.keyNote ? `<p class="rnote">${s.keyNote}</p>` : '') +
    say +
    s.bets +
    (own ? sheetRowHTML(v, own, false, !!s.rowCards) : '') +
    rest.map((r) => sheetRowHTML(v, r, false, !!s.rowCards)).join('') +
    (s.extra ?? '') +
    '</div>' +
    '<div class="rfoot">' +
    (me ? '<div class="emotes oemotes"></div>' : '') +
    `<div class="foot rbtns${me?.ready ? ' waiting' : ''}">${sheetWait(v, me)}${sheetBtns(v, me, s)}</div>` +
    '</div>'
  );
}

/** Schreibt #overlay: wartet auf Meldungen und Zeremonie, zeigt bei „Tisch ansehen“ die Leiste, sonst das Blatt. */
export function renderResult(v: View, s: Sheet | null): void {
  const ov = $('#overlay');
  if (!s) {
    ov.innerHTML = '';
    return;
  }
  if (holdOverlay()) return;
  const me = v.players.find((p) => p.id === App.me) ?? null;
  if (App.peek) {
    ov.innerHTML = peekHTML(v, me);
    return;
  }
  ov.innerHTML = `<div class="modal"><div class="paper sheet result rs${s.cls ? ` ${s.cls}` : ''}">${renderSheet(v, s)}</div></div>`;
}
