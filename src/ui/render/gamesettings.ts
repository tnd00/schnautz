/*
 * Einstellungen eines Spiels als Bogen in #modal: Regeln als Schalter, Leben oder Zielpunkte und die Zeit pro Zug.
 * Der Gastgeber kann alles ändern, Gäste sehen dieselben Zeilen gesperrt, Abweichungen vom Standard markiert.
 * Die Lobby (render/lobby.ts) ruft syncGameSettings bei jeder neuen Ansicht auf. Geht die Partie los oder schließt
 * der Tisch, verschwindet der Bogen von selbst. Die Listener für change und input hängen in events.ts am document.
 */
import { CB_TARGETS, DEFAULT_RULES, DK_FULL_DECK, CB_TWO_DECKS, SH_WIN_MS, TURN_SECS } from '../../game/constants';
import type { CbRules, DkRules, GameKind, Rules, ShRules, View } from '../../game/types';
import { GAME_NAME, LOSER_MARK, unreachable } from '../../game/games';
export { resetRulesFor } from '../../game/games';
import { App } from '../app';
import { sheetHTML } from '../dialog';
import { $opt, esc, num } from '../dom';
import { pById } from '../helpers';
import { MARK } from '../gamestickers';

export const svg = (d: string, w = 2.5): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON_MINUS = svg('<path d="M6 12h12"/>');
export const ICON_PLUS = svg('<path d="M6 12h12M12 6v12"/>');
export const ICON_CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 3);
const ICON_OFF = svg('<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>', 2.2);
const ICON_CLOCK = svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>', 2);
const ICON_LOCK = svg(
  '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  2,
);

/** Zeit pro Zug als Wort: „20 s“ oder „aus“. */
export const turnLabel = (s: number): string => (s ? `${s} s` : 'aus');
/** Dasselbe zum Vorlesen am Regler */
export const turnText = (s: number): string => (s ? `${s} Sekunden pro Zug` : 'ohne Zeitlimit');

/** Doppelte Zeit gibt es nur in der Shithead-Tauschrunde und beim Ansehen zu Beginn jeder Cabo-Runde. */
function turnSub(s: number, game: GameKind): string {
  if (!s) return 'Niemand wird gehetzt';
  switch (game) {
    case 'shithead':
      return `Danach zieht die KI für dich, in der Tauschrunde nach ${s * 2} s`;
    case 'cabo':
      return `Danach zieht die KI für dich, beim Ansehen nach ${s * 2} s`;
    case 'schnautz':
    case 'durak':
      return 'Danach zieht die KI einen Zug für dich';
    default:
      return unreachable(game);
  }
}

/** Eine Regel als Schalter. Gesperrt bei Gästen. */
export type RuleDef = {
  attr: 'rule' | 'shrule' | 'dkrule' | 'cbrule';
  key: string;
  on: boolean;
  def: boolean;
  label: string;
  sub: string;
};

export function ruleDefs(r: Rules, g: GameKind): RuleDef[] {
  switch (g) {
    case 'shithead': {
      const sr: ShRules = r.sh ?? DEFAULT_RULES.sh;
      const t = (key: keyof ShRules, label: string, sub: string): RuleDef => ({
        attr: 'shrule',
        key,
        on: sr[key],
        def: DEFAULT_RULES.sh[key],
        label,
        sub,
      });
      return [
        t('two', '2 setzt zurück', 'Geht immer, danach ist wieder alles erlaubt'),
        t('ten', '10 verbrennt', 'Geht immer, der Stapel ist weg und du legst gleich nochmal'),
        t('seven', '7 heißt drunter', 'Der Nächste muss 7 oder niedriger legen'),
        t('three', '3 ist durchsichtig', 'Geht immer, es zählt die Karte darunter'),
        t('eight', '8 lässt aussetzen', 'Jede 8 überspringt einen Spieler'),
        t(
          'four',
          '4er reinwerfen',
          `Bei jedem neuen Stapel dürfen alle, auch wer dran ist. Gespielt wird nach bis zu ${Math.round(SH_WIN_MS / 1000)} Sekunden`,
        ),
        t('cut', 'Bombe einwerfen', 'Wer die fehlenden Karten zu vier gleichen hat, darf jederzeit reinwerfen'),
        t('deck5', 'Zwei Decks schon ab 5', 'Ab 6 Leuten wird immer mit zwei Decks gespielt'),
      ];
    }
    case 'durak': {
      const dr: DkRules = r.dk ?? DEFAULT_RULES.dk;
      return [
        {
          attr: 'dkrule',
          key: 'transfer',
          on: dr.transfer,
          def: DEFAULT_RULES.dk.transfer,
          label: 'Weiterschieben',
          sub: 'Vor dem ersten Schlag legt der Verteidiger den gleichen Wert dazu, dann muss der Nächste ran',
        },
      ];
    }
    case 'cabo': {
      const cr: CbRules = r.cb ?? DEFAULT_RULES.cb;
      return [
        {
          attr: 'cbrule',
          key: 'snap',
          on: cr.snap,
          def: DEFAULT_RULES.cb.snap,
          label: 'Schnappen',
          sub: 'Gleichen Wert wie oben auf der Ablage jederzeit draufwerfen, daneben kostet eine Strafkarte',
        },
      ];
    }
    case 'schnautz': {
      const t = (
        key: 'feuer' | 'dealerChoice' | 'knockFirst' | 'knockDouble',
        label: string,
        sub: string,
      ): RuleDef => ({
        attr: 'rule',
        key,
        on: r[key],
        def: DEFAULT_RULES[key],
        label,
        sub,
      });
      return [
        t('feuer', 'Drei Asse sind Feuer', 'Zählt 33, alle anderen verlieren ein Leben'),
        t('dealerChoice', 'Geber bekommt ein zweites Blatt', 'Behalten oder blind tauschen'),
        t('knockFirst', 'Klopfen sofort erlaubt', 'Sonst erst, wenn jeder einmal dran war'),
        t('knockDouble', 'Klopfer verliert doppelt', 'Wer klopft und am wenigsten hat, verliert zwei Leben'),
      ];
    }
    default:
      return unreachable(g);
  }
}

/** Was zum Spiel selbst gehört und sich nicht schalten lässt. Leer, wenn es nichts zu sagen gibt. */
export function ruleNote(g: GameKind): string {
  switch (g) {
    case 'shithead':
      return 'Vier gleiche Karten hintereinander sind immer eine Bombe und verbrennen den Stapel. Wer sie vollmacht, legt gleich nochmal.';
    case 'durak':
      return `Bis ${DK_FULL_DECK - 1} Leute spielt ihr mit 36 Karten von der 6 bis zum Ass, ab ${DK_FULL_DECK} mit allen 52. Wer als Letzter Karten hat, ist der Durak und trägt den ${LOSER_MARK.durak}.`;
    case 'cabo':
      return `Ab ${CB_TWO_DECKS} Leuten wird mit zwei Decks gespielt. Wer am Ende die wenigsten Punkte hat, wird Cabo-König und behält die Krone, bis jemand anderes gewinnt.`;
    case 'schnautz':
      return '';
    default:
      return unreachable(g);
  }
}

/**
 * Was vom Üblichen abweicht, als Chips: Zahlen (Zeit, Leben, Zielpunkte) genauso wie die Schalter.
 * Leer heißt, es wird nach Standard gespielt.
 */
export function deviations(r: Rules, g: GameKind): string[] {
  const out: string[] = [];
  const s = r.turnSecs;
  if (g === 'schnautz' && r.lives !== DEFAULT_RULES.lives)
    out.push(`<li class="rc on num">${num(r.lives)} Leben pro Person</li>`);
  const target = (r.cb ?? DEFAULT_RULES.cb).target;
  if (g === 'cabo' && target !== DEFAULT_RULES.cb.target)
    out.push(`<li class="rc on num">Bis ${num(target)} Punkte</li>`);
  if (s !== DEFAULT_RULES.turnSecs)
    out.push(`<li class="rc on num">${ICON_CLOCK}${s ? `${s} s pro Zug` : 'Ohne Zeitlimit'}</li>`);
  ruleDefs(r, g)
    .filter((d) => d.on !== d.def)
    .forEach((d) =>
      out.push(
        `<li class="rc${d.on ? ' on' : ' off'}">${d.on ? ICON_CHECK : ICON_OFF}${d.label}` +
          (d.on ? '<span class="sr"> an</span>' : '<span class="rc-off">aus</span>') +
          '</li>',
      ),
    );
  return out;
}

/** Dieselben Abweichungen als kurze Wörter für eine einzige Zeile, etwa „8 lässt aussetzen aus“. */
export function deviationWords(r: Rules, g: GameKind): string[] {
  const out: string[] = [];
  if (g === 'schnautz' && r.lives !== DEFAULT_RULES.lives) out.push(`${num(r.lives)} Leben`);
  const target = (r.cb ?? DEFAULT_RULES.cb).target;
  if (g === 'cabo' && target !== DEFAULT_RULES.cb.target) out.push(`bis ${num(target)} Punkte`);
  if (r.turnSecs !== DEFAULT_RULES.turnSecs) out.push(r.turnSecs ? `${r.turnSecs} s pro Zug` : 'ohne Zeitlimit');
  ruleDefs(r, g)
    .filter((d) => d.on !== d.def)
    .forEach((d) => out.push(`${d.label} ${d.on ? 'an' : 'aus'}`));
  return out;
}

/* ---------- Zeilen im Bogen ---------- */

/** Kleiner Aufkleber an Zeilen, die vom Standard abweichen. Nur bei Gästen, der Gastgeber sieht es am Schalter. */
const DEV_TAG = '<span class="rdev">anders</span>';
const dis = (edit: boolean): string => (edit ? '' : ' disabled');

function switchRow(d: RuleDef, edit: boolean): string {
  const dev = d.on !== d.def;
  return (
    `<label class="rrow${dev ? ' dev' : ''}"><span class="rl"><span class="rt">${d.label}${dev && !edit ? DEV_TAG : ''}</span>` +
    `<small>${d.sub}</small></span>` +
    `<input type="checkbox" class="switch" data-${d.attr}="${d.key}"${d.on ? ' checked' : ''}${dis(edit)}></label>`
  );
}

/** Zahlen und Auswahl, die es nur in einem Spiel gibt: Leben bei Schnautz, Zielpunkte bei Cabo. */
function extraRow(r: Rules, g: GameKind, edit: boolean, flip: boolean): string {
  switch (g) {
    case 'schnautz': {
      const dev = r.lives !== DEFAULT_RULES.lives;
      return (
        `<div class="rrow${dev ? ' dev' : ''}"><span class="rl"><span class="rt">Leben pro Person${dev && !edit ? DEV_TAG : ''}</span>` +
        '<small>Wer das letzte verliert, schwimmt und darf weiterspielen</small></span>' +
        '<div class="stepper" role="group" aria-label="Leben pro Person">' +
        `<button class="stp" data-act="lives" data-d="-1" aria-label="ein Leben weniger"${dis(edit)}>${ICON_MINUS}</button>` +
        `<b class="st-num snum${flip ? ' st-flip' : ''}">${num(r.lives)}</b>` +
        `<button class="stp" data-act="lives" data-d="1" aria-label="ein Leben mehr"${dis(edit)}>${ICON_PLUS}</button></div></div>`
      );
    }
    case 'cabo': {
      const t = (r.cb ?? DEFAULT_RULES.cb).target;
      const dev = t !== DEFAULT_RULES.cb.target;
      const btn = (n: number) =>
        `<button class="st-num seg${t === n ? ' on' : ''}" data-act="cbtarget" data-v="${n}" aria-pressed="${t === n}"${dis(edit)}>${num(n)}</button>`;
      return (
        `<div class="rrow${dev ? ' dev' : ''}"><span class="rl"><span class="rt">Zielpunkte${dev && !edit ? DEV_TAG : ''}</span>` +
        '<small>Wer drüber kommt, beendet die Partie</small></span>' +
        `<div class="segs" role="group" aria-label="Zielpunkte">${CB_TARGETS.map(btn).join('')}</div></div>`
      );
    }
    case 'shithead':
    case 'durak':
      return '';
    default:
      return unreachable(g);
  }
}

function timeRow(r: Rules, g: GameKind, edit: boolean): string {
  const s = r.turnSecs;
  const i = Math.max(0, TURN_SECS.indexOf(s));
  const dev = s !== DEFAULT_RULES.turnSecs;
  return (
    `<div class="rrow rtime${dev ? ' dev' : ''}"><span class="rt">Zeit pro Zug${dev && !edit ? DEV_TAG : ''}</span>` +
    `<input type="range" class="range" min="0" max="${TURN_SECS.length - 1}" step="1" value="${i}" data-range="turnSecs" ` +
    `aria-label="Zeit pro Zug" aria-valuetext="${turnText(s)}"${dis(edit)}>` +
    `<b class="st-num tval" id="tval">${turnLabel(s)}</b><small id="tsub">${turnSub(s, g)}</small></div>`
  );
}

function bodyHTML(r: Rules, g: GameKind, edit: boolean, flip: boolean): string {
  const note = ruleNote(g);
  return (
    `<div class="rlist">${extraRow(r, g, edit, flip)}${ruleDefs(r, g)
      .map((d) => switchRow(d, edit))
      .join('')}${timeRow(r, g, edit)}</div>` +
    (note
      ? `<div class="rgame"><h3 class="rs-h">Bei ${GAME_NAME[g]} gilt immer</h3><p class="rnote">${note}</p></div>`
      : '')
  );
}

/* ---------- Bogen öffnen und mitziehen ---------- */

/** Was zuletzt im Bogen stand: Neu gezeichnet wird nur, wenn sich etwas geändert hat. */
const GS = { g: '' as GameKind | '', html: '', lives: 0 };

const paper = (): HTMLElement | null => $opt('#modal .paper.gset');

/** Kopfzeile unter dem Titel: Gäste erfahren, warum sie nichts schalten können. */
function headHTML(v: View, edit: boolean): string {
  if (edit) return '';
  const host = pById(v, v.host)?.name ?? 'Der Gastgeber';
  return `<p class="gset-note">${ICON_LOCK}Nur ${esc(host)} kann das ändern.</p>`;
}

const ICON_RESET = svg('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4.5h4.5"/>', 2.4);

/** Zurücksetzen links neben dem Kreuz, nur für den Gastgeber. Gesperrt, solange alles nach Standard ist. */
function resetHTML(r: Rules, g: GameKind, edit: boolean): string {
  if (!edit) return '';
  const same = !deviations(r, g).length;
  return (
    `<button type="button" class="dlg-tool gsreset" data-act="gsreset" data-g="${g}" ` +
    `aria-label="Auf Standard zurücksetzen" title="Auf Standard zurücksetzen"${same ? ' disabled' : ''}>${ICON_RESET}</button>`
  );
}

/** Öffnet den Bogen für ein Spiel. Gäste sehen immer das gewählte Spiel. */
export function openGameSettings(v: View, g: GameKind): void {
  const edit = App.role === 'host';
  const game = edit ? g : v.game;
  const html = bodyHTML(v.rules, game, edit, false);
  GS.g = game;
  GS.html = html;
  GS.lives = v.rules.lives;
  const box = $opt('#modal');
  if (!box) return;
  box.innerHTML = sheetHTML({
    kind: `gset g-${game}${edit ? '' : ' ro'}`,
    title: GAME_NAME[game],
    badge: `<span class="gset-mark" aria-hidden="true">${MARK[game]}</span>`,
    tools: resetHTML(v.rules, game, edit),
    head: headHTML(v, edit),
    body: html,
  });
  paper()?.setAttribute('data-g', game);
}

/** Welches Bedienelement den Fokus hat, als Selektor, damit es nach dem Neuzeichnen wieder gefunden wird. */
function focusKey(el: Element | null): string {
  if (!(el instanceof HTMLElement)) return '';
  for (const a of ['shrule', 'dkrule', 'cbrule', 'rule', 'range']) {
    const val = el.dataset[a];
    if (val) return `[data-${a}="${val}"]`;
  }
  const act = el.dataset.act;
  if (!act) return '';
  const extra = el.dataset.d ? `[data-d="${el.dataset.d}"]` : el.dataset.v ? `[data-v="${el.dataset.v}"]` : '';
  return `[data-act="${act}"]${extra}`;
}

/**
 * Bei jeder neuen Ansicht in der Lobby: offenen Bogen auf den neuen Stand bringen. Nur der Inhalt wird neu
 * geschrieben, damit Kopf, Fokus und Scrollstand bleiben. Hat der Gastgeber das Spiel gewechselt, kommt der Bogen
 * des neuen Spiels.
 */
export function syncGameSettings(v: View): void {
  const p = paper();
  if (!p) return;
  if (p.dataset.g !== v.game) {
    // Der Gastgeber öffnet den Bogen erst nach dem Wechsel, Gäste folgen immer dem gewählten Spiel
    openGameSettings(v, v.game);
    return;
  }
  const edit = App.role === 'host';
  // Zurücksetzen gibt es nur, solange etwas vom Standard abweicht. Hatte der Knopf den Fokus, geht er ans Kreuz
  const reset = p.querySelector<HTMLButtonElement>('.gsreset');
  if (reset) {
    const same = !deviations(v.rules, v.game).length;
    if (same && document.activeElement === reset)
      p.querySelector<HTMLElement>('.dlg-x')?.focus({ preventScroll: true });
    reset.toggleAttribute('disabled', same);
  }
  const flip = !!GS.lives && GS.lives !== v.rules.lives;
  const html = bodyHTML(v.rules, v.game, edit, false);
  if (html === GS.html) return;
  const body = p.querySelector<HTMLElement>('.dlg-body');
  if (!body) return;
  const key = body.contains(document.activeElement) ? focusKey(document.activeElement) : '';
  const top = body.scrollTop;
  body.innerHTML = bodyHTML(v.rules, v.game, edit, flip);
  GS.html = html;
  GS.lives = v.rules.lives;
  body.scrollTop = top;
  if (key) body.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
}

/** Geht die Partie los oder schließt der Tisch, ist die Lobby weg und mit ihr der Bogen. */
function watchLobby(): void {
  const lob = $opt('#scr-lobby');
  if (!lob) return;
  new MutationObserver(() => {
    if (!lob.hidden) return;
    const p = paper();
    const box = $opt('#modal');
    if (p && box) box.innerHTML = '';
  }).observe(lob, { attributes: true, attributeFilter: ['hidden'] });
}

if (typeof document !== 'undefined') watchLobby();
