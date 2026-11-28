/*
 * Zeremonie am Partieende: Bei Shithead fliegt die letzte Karte in Zeitlupe, dann wird es dunkel, ein Spotlicht
 * fällt auf den Platz des Verlierers, sein Zeichen (💩 oder 🤡) plumpst darauf, die Posaune spielt und Konfetti
 * fällt. Bei Cabo ist es eine Krönung: goldener Ring um den neuen Cabo-König, die Krone fällt, Fanfare. Reine
 * Darstellung, jeder Browser spielt sie selbst aus dem Logeintrag shend, dkend oder cbend. Antippen beendet sie.
 */
import type { GameKind, LogEntry, View } from '../game/types';
import { confetti, dropOn } from './animations';
import { App } from './app';
import { focusOpp, CAR_GLIDE_MS } from './carousel';
import { plain, sentences } from './a11y/say';
import { $opt, esc, num, reduceMotion, type Timer } from './dom';
import { announce, dropAnnouncements, holdForAnnouncements, holdOverlay, panelFor, skipHint } from './feedback';
import { nameOf } from './helpers';
import { render } from './render/index';
import { renderLog } from './render/log';
import { SEQ } from './shithead/sequence';
import { planOf, type Stage, ZER_REVEAL_MS } from './ceremony-plan';
import { paletteOf, sparkOf } from './look';
import { prefs } from './prefs';
import { sfx } from './sound';
import { taunt } from './taunts';

type EndEntry = Extract<LogEntry, { k: 'shend' | 'dkend' | 'cbend' }>;

const isEnd = (e: LogEntry): e is EndEntry => e.k === 'shend' || e.k === 'dkend' || e.k === 'cbend';

export const ZER = {
  /** Enthüllung läuft */
  on: false,
  /** Kinobalken der Zeitlupe sichtbar */
  slow: false,
  gen: 0,
  /** Partie, zu der Balken, Warteschlange oder Enthüllung gehören, sonst -1 */
  games: -1,
  /** Spiel dieser Partie */
  game: 'shithead' as GameKind,
  pid: '',
  /** Ab diesem Eintrag hält der Verlauf zurück, damit er den Shithead nicht vorher verrät */
  logN: 0,
  stop: null as (() => void) | null,
  raf: 0,
  t: null as Timer | null,
};

/** Wer zuerst fertig war, bei Shithead und Durak. */
const firstOf = (v: View): string | undefined => (v.sh?.finished ?? v.dk?.finished)?.[0];

function stage(): HTMLElement | null {
  return $opt('#zer');
}

/**
 * Neue Ansicht mit frischem Partieende: Bis zur Enthüllung zeigen Platz und Zähler den Shithead noch nicht,
 * auch nicht während die letzte Karte in Zeitlupe fliegt. Endet die Partie anders, räumt ceremonyGuard auf.
 */
export function hideShithead(v: View, fresh: readonly LogEntry[]): void {
  if (v.phase !== 'over') return;
  const e = fresh.find(isEnd);
  if (!e?.p) return;
  App.zerHide = e.p;
  ZER.games = v.games;
  ZER.game = v.game;
}

/** Ab jetzt darf man es sehen. */
function unhide(): void {
  if (!App.zerHide) return;
  App.zerHide = '';
  if (App.view && App.role) render();
}

function releaseLog(): void {
  if (!ZER.logN) return;
  ZER.logN = 0;
  if (App.view) renderLog(App.view);
}

/** Kinobalken an oder aus. */
export function zerSlow(on: boolean, games?: number): void {
  const z = stage();
  ZER.slow = on;
  if (on && games != null) ZER.games = games;
  if (!z) return;
  if (on) z.hidden = false;
  z.classList.toggle('slow', on);
  if (!on && !ZER.on) setTimeout(() => !ZER.on && !ZER.slow && z && (z.hidden = true), 400);
}

/** Ring um den Platz des Shitheads, folgt der Kachel, solange sie gleitet. */
/** Kanten der Kachel samt Pille, Etikett und Aufkleber, die über ihren Rand ragen, damit der Ring nichts davon deckt */
function outline(el: HTMLElement, r: DOMRect): { l: number; t: number; r: number; b: number } {
  const b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
  for (const k of el.querySelectorAll<HTMLElement>(':scope > .val, :scope > .tag, :scope > .rmark')) {
    const q = k.getBoundingClientRect();
    if (!q.width || getComputedStyle(k).visibility === 'hidden') continue;
    b.l = Math.min(b.l, q.left);
    b.t = Math.min(b.t, q.top);
    b.r = Math.max(b.r, q.right);
    b.b = Math.max(b.b, q.bottom);
  }
  return b;
}

function track(): void {
  cancelAnimationFrame(ZER.raf);
  const z = stage();
  const ring = $opt('#zer .zer-ring');
  if (!z || !ring || !ZER.on) return;
  const el = panelFor(ZER.pid);
  const r = el?.getBoundingClientRect();
  const visible =
    !!el &&
    !!r &&
    r.width > 0 &&
    getComputedStyle(el).visibility !== 'hidden' &&
    r.right > 0 &&
    r.left < innerWidth &&
    r.bottom > 0 &&
    r.top < innerHeight;
  z.classList.toggle('hole', visible);
  z.classList.toggle('nohole', !visible);
  if (visible && r) {
    const b = outline(el, r);
    // translate statt transform, damit das Heranzoomen über scale um die Mitte des Rings läuft
    const t = `${Math.round(b.l - 6)}px ${Math.round(b.t - 6)}px`;
    if (ring.style.translate !== t) ring.style.translate = t;
    const w = `${Math.round(b.r - b.l + 12)}px`;
    const h = `${Math.round(b.b - b.t + 12)}px`;
    if (ring.style.width !== w) ring.style.width = w;
    if (ring.style.height !== h) ring.style.height = h;
  }
  ZER.raf = requestAnimationFrame(track);
}

/** Bühne an: Abdunkeln, Spotlicht, Posaune, Haufen und Konfetti. */
function reveal(v: View, pid: string, gen: number): void {
  const cur = App.view;
  if (gen !== ZER.gen || !cur || cur.game !== v.game || cur.phase !== 'over' || cur.games !== v.games) return;
  const look = planOf(v.game);
  if (look.kind === 'none') return;
  releaseLog();
  unhide();
  if (document.hidden) return;
  const z = stage();
  if (!z) return;
  ZER.on = true;
  ZER.pid = pid;
  const moved = focusOpp(pid);
  z.hidden = false;
  z.classList.remove('slow');
  void z.offsetWidth;
  const crown = look.kind === 'crown';
  z.classList.toggle('crown', crown);
  $opt<HTMLElement>('#zer .zer-ring')?.style.setProperty('--zmark', `'${look.mark}'`);
  z.classList.add('reveal');
  track();
  ZER.stop = sfx(look.sfx);
  if (crown) setTimeout(() => gen === ZER.gen && ZER.on && sfx('win'), 650);
  const calm = reduceMotion();
  const ring = $opt('#zer .zer-ring');
  setTimeout(
    () => {
      if (gen !== ZER.gen || !ZER.on) return;
      const el = panelFor(pid);
      if (el && !calm && z.classList.contains('hole')) dropOn(el, look.mark, () => ring?.classList.add('mark'));
      else ring?.classList.add('mark');
    },
    // Erst zoomt das Spotlicht heran, dann plumpst der Haufen
    moved ? CAR_GLIDE_MS + 300 : 500,
  );
  if (!calm) {
    const loser = pid === App.me && !crown;
    const first = firstOf(v) === App.me || (crown && pid === App.me);
    setTimeout(() => {
      if (gen !== ZER.gen || !ZER.on) return;
      const l = prefs().look;
      const colors = paletteOf(l, look.palette);
      // Wer den Titel zum ersten Mal hat, bekommt zusätzlich Funken
      const spark = sparkOf(l, crown);
      confetti({
        colors: first ? [...colors, spark, spark] : [...colors],
        n: 80,
        dur: [3200, 1400],
        extra: [{ ch: look.mark, n: loser || (crown && pid === App.me) ? 12 : 4 }],
        cls: 'zerc',
      });
    }, 500);
  }
  if (ZER.t) clearTimeout(ZER.t);
  ZER.t = setTimeout(() => stopCeremony(true), ZER_REVEAL_MS + 5000);
}

/** Ende der Enthüllung. Übersprungen heißt: alles sofort weg, auch Klang und Konfetti. */
export function stopCeremony(skipped: boolean): void {
  if (ZER.t) clearTimeout(ZER.t);
  ZER.t = null;
  cancelAnimationFrame(ZER.raf);
  ZER.on = false;
  ZER.games = -1;
  releaseLog();
  unhide();
  const z = stage();
  if (z) {
    z.classList.remove('reveal', 'hole', 'nohole', 'slow', 'crown');
    $opt('#zer .zer-ring')?.classList.remove('mark');
    setTimeout(() => !ZER.on && !ZER.slow && (z.hidden = true), 260);
  }
  ZER.slow = false;
  if (skipped) {
    ZER.stop?.();
    document.querySelectorAll<HTMLElement>('.zerc, .zerdrop').forEach((c) => {
      c.style.transition = 'opacity .2s';
      c.style.opacity = '0';
      setTimeout(() => c.remove(), 220);
    });
  }
  ZER.stop = null;
}

/** Neuer Tisch, Verlassen, Fortsetzen: alles zurück. */
export function resetCeremony(): void {
  ZER.gen++;
  App.zerHide = '';
  stopCeremony(true);
}

/**
 * Jede neue Ansicht: Gehört sie nicht mehr zur Partie der Zeremonie (Lobby, neue Tauschrunde),
 * wird alles abgebrochen. Chat oder Reaktionen während der Zeitlupe lassen sie laufen.
 */
export function ceremonyGuard(v: View): void {
  if (ZER.games < 0) return;
  if (v.game === ZER.game && v.phase === 'over' && v.games === ZER.games) return;
  ZER.gen++;
  // Die neue Ansicht zeichnet gleich ohnehin alles neu
  App.zerHide = '';
  dropAnnouncements('zer');
  stopCeremony(true);
}

/** Meldung für den Verlierer, mit Spruch, Zähler und Ergebnis des eigenen Tipps, dazu derselbe Text für den Vorleser. */
function message(v: View, e: EndEntry, look: Stage): { title: string; sub: string; say: string } {
  const pid = e.p ?? '';
  const mine = pid === App.me;
  const name = nameOf(v, pid, e.name);
  const what = look.what;
  const crown = look.kind === 'crown';
  // Verteidigt der Cabo-König die Krone, gibt es dafür einen eigenen Spruch
  const stays = e.k === 'cbend' && !!e.again && !mine ? look.taunts.stays : undefined;
  const t = mine ? taunt(look.taunts.self, null, e.n) : taunt(stays ?? look.taunts.other, { name }, e.n);
  const cnt = look.count(v, pid);
  let sub = `<span class="tt">${esc(t)}</span>`;
  if (cnt >= 2) sub += `<span class="zer-n">Zum ${cnt}. Mal ${what} an diesem Tisch.</span>`;
  const hit = 'hits' in e ? e.hits?.[App.me] : undefined;
  const bet = (v.sh?.bets ?? v.dk?.bets)?.[App.me];
  if (hit) sub += `<span class="tt bt">🔮 Richtig getippt! +${num(hit.q)} ${hit.q === 1 ? 'Punkt' : 'Punkte'}.</span>`;
  else if (bet && typeof bet.on === 'string') sub += '<span class="tt bt">🔮 Tipp daneben.</span>';
  // Ohne den Hinweis zum Überspringen, jeder Teil ein eigener Satz
  const said = [...sub.matchAll(/<span[^>]*>(.*?)<\/span>/g)].map((x) => plain(x[1]));
  sub += `<span class="zer-hint">${skipHint()}</span>`;
  const cls = crown ? 'g' : 'r';
  const title = mine
    ? `Du bist ${crown ? '' : 'der '}<span class="${cls}">${what}!</span>`
    : `${esc(name)} ist ${crown ? '' : 'der '}<span class="${cls}">${what}!</span>`;
  return { title, sub, say: sentences(plain(title), ...said) };
}

/** Startet die Zeremonie zum Eintrag shend, dkend oder cbend. Die Enthüllung beginnt, wenn die Meldung dran ist. */
export function shitheadCeremony(v: View, e: EndEntry): void {
  const pid = e.p;
  if (!pid) return;
  const look = planOf(v.game);
  // Ohne Zeremonie in diesem Spiel (Schnautz) oder mit einem Eintrag aus einem anderen Spiel gibt es keine Show
  if (look.kind === 'none' || e.k !== look.endKind) {
    unhide();
    return;
  }
  // Steht schon eine Ansicht aus einer anderen Partie an, lohnt sich nichts mehr
  const nx = SEQ.next;
  if (nx && !(nx.game === v.game && nx.phase === 'over' && nx.games === v.games)) {
    unhide();
    return;
  }
  ZER.games = v.games;
  ZER.game = v.game;
  const gen = ++ZER.gen;
  ZER.logN = e.n;
  renderLog(v);
  const m = message(v, e, look);
  announce({
    icon: look.mark,
    tone: look.tone,
    cls: 'zer',
    title: m.title,
    sub: m.sub,
    ms: ZER_REVEAL_MS,
    // annNext spricht ihn nach onShow, also mit der Enthüllung und erst nach unhide (App.zerHide)
    say: m.say,
    onShow: () => reveal(v, pid, gen),
    onEnd: (skipped) => {
      if (gen === ZER.gen) stopCeremony(skipped);
    },
  });
  holdForAnnouncements();
  holdOverlay();
}

/** Dev-Menü: Die Enthüllung der letzten Partie noch einmal zeigen, nur in diesem Browser. */
export function replayCeremony(): boolean {
  const v = App.view;
  if (!v || v.phase !== 'over' || ZER.on) return false;
  const look = planOf(v.game);
  if (look.kind === 'none') return false;
  for (let i = v.log.length - 1; i >= 0; i--) {
    const e = v.log[i];
    if (!isEnd(e) || e.k !== look.endKind || !e.p) continue;
    shitheadCeremony(v, e);
    return true;
  }
  return false;
}

/** Tippt jemand während der Enthüllung auf den Tisch, ist sie vorbei. */
export const ceremonyOn = (): boolean => ZER.on;
