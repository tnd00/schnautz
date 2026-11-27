/*
 * Gemeinsames Ergebnisblatt aller Spiele (`renderSheet`) mit Knöpfen, Wartetext und Tippzeile, dazu „Tisch ansehen“
 * und die Leiste, wenn nur noch KIs spielen.
 */
import { shCanBet } from '../../game/bets';
import { onlyBotsPlaying, reignOf } from '../../game/games';
import type { Card, Player, ShBetResult, View } from '../../game/types';
import { ffwdInLog } from '../../net/pace';
import { App } from '../app';
import { cardHTML } from '../cards';
import { holdFocus, restoreFocus } from '../a11y/focus';
import { $, $opt, esc, isMobile, listJoin, num } from '../dom';
import { holdOverlay } from '../feedback';
import { aimAttrs } from './marks';
import { AUTO_NEXT_MS } from '../../game/constants';
import { nextIn, WAIT_GO, WAIT_MARK, waitFor, waitForms } from '../../content/texts/status';
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
  /**
   * Kürzere Kernzahl, HTML, darf leer sein, wenn das Zeichen vor dem Namen es schon sagt. Passt ein Name neben
   * `core` nicht ganz, nimmt das Blatt in allen Zeilen die Kurzform (fitRows). Nicht für die Schlüsselzeile, deren
   * Kernzahl steht ohnehin unter dem Namen.
   */
  short?: string;
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

/**
 * Auf wen das Blatt wartet: Menschen, die online und noch nicht bereit sind, nie ich selbst. Am Rundenende nur, wer
 * noch im Spiel ist. Gilt für „Nicht warten“, den Wartetext und ⏳ an den Zeilen.
 */
export function waitsFor(v: View, p: Player): boolean {
  return p.online && !p.ready && !p.bot && p.id !== App.me && (v.phase === 'over' || !p.out);
}

/**
 * Zeilen mit ⏳: alle, auf die das Blatt wartet. Zu sehen ist es erst, wenn ich selbst bereit bin (`shown`), dann
 * nennt die Knopfreihe oft nur noch die Zahl. Verborgen steht es trotzdem da, damit fitRows den Platz einplant und
 * das Blatt beim Bereitmelden nicht umspringt.
 */
export function sheetWaits(v: View): { ids: string[]; shown: boolean } {
  const me = v.players.find((p) => p.id === App.me);
  return { ids: v.players.filter((p) => waitsFor(v, p)).map((p) => p.id), shown: !!me?.ready };
}

/** 0: kein ⏳, 1: verborgen, 2: zu sehen */
type WaitMark = 0 | 1 | 2;

function sheetRowHTML(v: View, r: SheetRow, key: boolean, withCards = key, wait: WaitMark = 0): string {
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
  // ⏳ steht wie die Zeichen vor dem Namen, fitRows rechnet es immer mit ein
  const mark = wait
    ? `<span class="hat rwait" title="${WAIT_MARK}" aria-label="${WAIT_MARK}"${wait === 1 ? ' hidden' : ''}>⏳</span>`
    : '';
  // Lang und kurz, fitRows zeigt eine davon. Die Schlüsselzeile bricht um und braucht keine Kurzform
  const core =
    !key && r.short != null && r.short !== r.core
      ? `<span class="cf">${r.core}</span><span class="cf" hidden>${r.short}</span>`
      : r.core;
  return (
    `<div class="${cls}" data-pid="${esc(r.id)}"${aimAttrs(p, true)}>` +
    `<span class="rpl">${r.place != null ? `${num(r.place)}.` : ''}</span>` +
    `<span class="rnm">${r.hat ? `<span class="hat">${r.hat}</span>` : ''}${mark}<b>${r.name}</b>${rematchMark(v, r.id)}</span>` +
    `<span class="rcore">${core}</span>` +
    (r.val != null ? `<span class="rval">${r.val}</span>` : '') +
    mini +
    '</div>'
  );
}

/** Fordern heißt: Duell gegen den Sieger, die nächste Partie entscheidet. Der Name sagt, gegen wen es geht. */
function rematchBtn(v: View): string {
  const w = v.players.find((p) => p.id === reignOf(v)?.win);
  const vs = w ? esc(nameOf(v, w.id)) : '';
  const tip = vs ? `Fordere ${vs} zum Duell, die nächste Partie entscheidet` : 'Duell, die nächste Partie entscheidet';
  return `<button class="btn primary rv" data-act="rematch" title="${tip}"><span class="blong">⚔️ Revanche${vs ? ` gegen ${vs}` : ''}</span><span class="bshort">⚔️ Revanche</span></button>`;
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
    if (host && v.players.some((p) => waitsFor(v, p)))
      h +=
        '<button class="btn ghost" data-act="force"><span class="blong">Nicht warten</span><span class="bshort">Los</span></button>';
    return h;
  }
  if (mustAccept(v))
    return h + '<button class="btn primary rv" data-act="ready" aria-label="Revanche annehmen">⚔️ Revanche</button>';
  if (canChallenge(v))
    return (
      h +
      `<button class="btn ghost" data-act="ready"><span class="blong">${label}</span><span class="bshort">Nochmal</span></button>` +
      rematchBtn(v)
    );
  // Ein Span hält Text und Zahl zusammen, sonst setzt das gap von .btn Lücken: „Nächste Runde ( 9 s)“
  return h + `<button class="btn primary" data-act="ready"><span>${label}</span></button>`;
}

/**
 * Wartetext nach dem Bereitmelden, sonst nichts. Er steht in der Knopfreihe an der Stelle des Knopfs, der mit dem
 * Bereitmelden wegfällt, einzeilig. So wird das Blatt dadurch nicht höher. Neben drei Knöpfen bleiben am Handy nur
 * rund 100 px, deshalb stehen alle Fassungen vom längsten zur kürzesten da und `fitWait` zeigt die erste, die ganz
 * passt. Der Countdown zur nächsten Runde geht vor, reicht der Platz für nichts sonst, bleibt nur er. Wer fehlt,
 * steht dann trotzdem da: ⏳ an der eigenen Zeile im Blatt.
 */
function sheetWait(v: View, me: Player | null): string {
  if (!me?.ready) return '';
  const secs = v.phase === 'end' ? nextSecs() : 0;
  const waiting = v.players.filter((p) => waitsFor(v, p)).map((p) => p.name);
  const cd = secs ? nextIn(`<b class="nextcd">${secs}</b>`) : '';
  const forms = waitForms(waiting).map((t) => (cd ? `${cd} · ${esc(t)}` : esc(t)));
  if (cd && waiting.length) forms.push(cd);
  const title = waiting.length ? waitFor(listJoin(waiting)) : WAIT_GO;
  return (
    `<span class="waittxt" title="${esc(title)}">` +
    forms.map((f, i) => `<span${i ? ' hidden' : ''}>${f}</span>`).join('') +
    '</span>'
  );
}

/**
 * Ragt der Inhalt über das Element hinaus? Mit Bruchteilen gemessen: `scrollWidth` ist gerundet und gleicht
 * `clientWidth` auch dann, wenn schon Auslassungspunkte stehen.
 */
function overflows(el: HTMLElement): boolean {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01;
}

/** Zeigt von mehreren Fassungen die erste, bei der `ok` gilt, sonst die letzte. */
function pickForm(forms: readonly HTMLElement[], ok: () => boolean): void {
  forms.forEach((f, i) => (f.hidden = i > 0));
  for (let i = 0; i < forms.length - 1 && !ok(); i++) {
    forms[i].hidden = true;
    forms[i + 1].hidden = false;
  }
}

/**
 * Zeigt im Wartetext die erste Fassung, die ohne Kürzen in die Knopfreihe passt (siehe sheetWait). Der Countdown
 * zählt danach jede Sekunde herunter und Ziffern sind verschieden breit, deshalb muss die Fassung mit jeder Zahl
 * passen, die noch kommen kann. Sonst kippt sie eine Sekunde später in die Auslassungspunkte. Geprüft wird bis zum
 * Höchstwert, denn der Host kann die Restzeit auch nach oben nachstellen (syncNext).
 */
function fitWait(): void {
  const box = document.querySelector<HTMLElement>('#overlay .waittxt');
  if (!box) return;
  const cds = [...box.querySelectorAll<HTMLElement>('.nextcd')];
  const now = cds[0]?.textContent ?? '';
  const max = Math.max(Math.ceil(AUTO_NEXT_MS / 1000), num(now));
  const all = now ? Array.from({ length: max + 1 }, (_, k) => String(k)) : [''];
  pickForm([...box.children] as HTMLElement[], () =>
    all.every((n) => {
      if (n) cds.forEach((c) => (c.textContent = n));
      return !overflows(box);
    }),
  );
  cds.forEach((c) => (c.textContent = now));
}

/**
 * Namen im Blatt werden nie gekürzt. Passt einer neben seiner Kernzahl nicht ganz, nehmen erst alle Zeilen die
 * Kurzform (ein Wortlaut im ganzen Blatt), dann wird der Name etwas kleiner (`snug`, result.css), zuletzt rückt die
 * Kernzahl unter den Namen (`under`). ⏳ zählt dabei immer mit, auch solange es verborgen ist, so sieht das Blatt
 * nach dem eigenen Bereitmelden aus wie davor.
 */
function fitRows(): void {
  const sheet = document.querySelector<HTMLElement>('#overlay .paper.result');
  if (!sheet) return;
  const rows = [...sheet.querySelectorAll<HTMLElement>('.row.rr')];
  const held = [...sheet.querySelectorAll<HTMLElement>('.rwait[hidden]')];
  held.forEach((w) => (w.hidden = false));
  const tight = (row: HTMLElement): boolean => {
    const nm = row.querySelector<HTMLElement>(':scope > .rnm');
    return !!nm && overflows(nm);
  };
  const form = (row: HTMLElement, i: number): void =>
    row.querySelectorAll<HTMLElement>(':scope > .rcore > .cf').forEach((f, k) => (f.hidden = k !== i));
  for (const row of rows) {
    row.classList.remove('snug', 'under');
    form(row, 0);
  }
  if (rows.some((r) => !r.classList.contains('key') && tight(r))) rows.forEach((r) => form(r, 1));
  for (const row of rows) {
    if (!tight(row)) continue;
    row.classList.add('snug');
    if (!tight(row) || row.classList.contains('key')) continue;
    row.classList.replace('snug', 'under');
    if (tight(row)) row.classList.add('snug');
  }
  held.forEach((w) => (w.hidden = true));
}

function fitSheet(): void {
  fitRows();
  fitWait();
}

let fitHooked = false;
/** Neue Breite oder nachgeladene Schrift: die Fassungen neu wählen */
function hookFitSheet(): void {
  if (fitHooked) return;
  fitHooked = true;
  window.addEventListener('resize', fitSheet);
  void document.fonts?.ready.then(fitSheet);
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
  const waits = sheetWaits(v);
  const mark = (id: string): WaitMark => (waits.ids.includes(id) ? (waits.shown ? 2 : 1) : 0);
  const row = (r: SheetRow, isKey: boolean, cards: boolean): string => sheetRowHTML(v, r, isKey, cards, mark(r.id));
  // Ohne Plätze (Schnautz am Rundenende) fällt die leere Platzspalte weg, die Namen bekommen ihre Breite
  const noPlace = s.rows.every((r) => r.place == null);
  const rline = rematchLine(v);
  const say = rline
    ? `<p class="taunt rv">${rline}</p>`
    : s.taunt
      ? `<p class="taunt${s.taunt.good ? ' good' : ''}">${esc(s.taunt.text)}</p>`
      : '';
  return (
    `<div class="rhead"><span class="trophy">${s.icon}</span><h2>${s.title}</h2></div>` +
    (s.lead ? `<p class="lead">${s.lead}</p>` : '') +
    `<div class="rows${noPlace ? ' noplace' : ''}">` +
    (key ? row(key, true, true) : '') +
    (s.keyNote ? `<p class="rnote">${s.keyNote}</p>` : '') +
    say +
    s.bets +
    (own ? row(own, false, !!s.rowCards) : '') +
    rest.map((r) => row(r, false, !!s.rowCards)).join('') +
    (s.extra ?? '') +
    '</div>' +
    '<div class="rfoot">' +
    (me ? '<div class="emotes oemotes"></div>' : '') +
    `<div class="foot rbtns${me?.ready ? ' waiting' : ''}">${sheetWait(v, me)}${sheetBtns(v, me, s)}</div>` +
    '</div>'
  );
}

/** Steht das Blatt als Dialog? Dann ist #table inert und der Fokus gehört ins Blatt. */
let sheetOpen = false;

/** Wer gerade tippt (Chat, Name), behält den Fokus, wenn das Blatt aufgeht */
const typing = (a: Element | null): boolean =>
  !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable);

/** Blatt zu (nächste Runde, „Tisch ansehen“): Tisch wieder bedienbar, ein verlorener Fokus geht auf den eigenen Platz. */
function closeSheet(): void {
  if (!sheetOpen) return;
  sheetOpen = false;
  $('#table').inert = false;
  const a = document.activeElement;
  const st = $opt('#me');
  if (st && (!a || a === document.body)) {
    st.tabIndex = -1;
    st.focus({ preventScroll: true });
  }
}

let watched = false;
/** Andere leeren #overlay auch direkt (Bildschirmwechsel, Verlassen): dann darf #table nicht inert bleiben */
function watchOverlay(): void {
  if (watched) return;
  watched = true;
  new MutationObserver(() => {
    if (!$opt('#overlay .paper.result')) closeSheet();
  }).observe($('#overlay'), { childList: true });
}

/**
 * Das Blatt als Dialog (Plan 4.14): am Handy modal mit Tab-Falle (dialog.ts), am PC ohne aria-modal, damit Verlauf
 * und Chat bedienbar bleiben. inert liegt nur auf #table. Beim Aufgehen wandert der Fokus auf den Titel, ohne Ring.
 */
function openSheet(mark: ReturnType<typeof holdFocus>): void {
  const paper = $opt('#overlay .paper.result');
  const h = paper?.querySelector<HTMLElement>('.rhead h2');
  if (!paper || !h) return;
  paper.setAttribute('role', 'dialog');
  if (isMobile()) paper.setAttribute('aria-modal', 'true');
  h.id = 'rs-t';
  h.tabIndex = -1;
  paper.setAttribute('aria-labelledby', 'rs-t');
  $('#table').inert = true;
  watchOverlay();
  if (sheetOpen) {
    restoreFocus(mark);
    return;
  }
  sheetOpen = true;
  if (!typing(document.activeElement)) h.focus({ preventScroll: true });
}

/** Schreibt #overlay: wartet auf Meldungen und Zeremonie, zeigt bei „Tisch ansehen“ die Leiste, sonst das Blatt. */
export function renderResult(v: View, s: Sheet | null): void {
  const ov = $('#overlay');
  if (!s) {
    ov.innerHTML = '';
    closeSheet();
    return;
  }
  if (holdOverlay()) return;
  const me = v.players.find((p) => p.id === App.me) ?? null;
  if (App.peek) {
    ov.innerHTML = peekHTML(v, me);
    closeSheet();
    return;
  }
  const mark = sheetOpen ? holdFocus() : null;
  ov.innerHTML = `<div class="modal"><div class="paper sheet result rs${s.cls ? ` ${s.cls}` : ''}">${renderSheet(v, s)}</div></div>`;
  openSheet(mark);
  hookFitSheet();
  fitSheet();
}
