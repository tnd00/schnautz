/*
 * Shithead-Zeremonie: Die letzte Karte fliegt in Zeitlupe, dann wird es dunkel, ein Spotlicht fällt auf den
 * Platz des Shitheads, ein Kackhaufen plumpst darauf, die Posaune spielt und braunes Konfetti fällt.
 * Reine Darstellung, jeder Browser spielt sie selbst aus dem Logeintrag shend. Antippen beendet sie.
 */
import type { LogEntry, View } from '../game/types';
import { confetti, dropOn } from './animations';
import { App } from './app';
import { focusOpp, CAR_GLIDE_MS } from './carousel';
import { $opt, esc, num, reduceMotion, type Timer } from './dom';
import { announce, dropAnnouncements, holdForAnnouncements, holdOverlay, panelFor } from './feedback';
import { nameOf, pById } from './helpers';
import { renderLog } from './render/log';
import { SEQ } from './shithead/sequence';
import { ZER_REVEAL_MS } from './shithead/ceremony-plan';
import { sfx } from './sound';
import { taunt } from './taunts';

type EndEntry = Extract<LogEntry, { k: 'shend' }>;

export const ZER = {
  /** Enthüllung läuft */
  on: false,
  /** Kinobalken der Zeitlupe sichtbar */
  slow: false,
  gen: 0,
  /** Partie, zu der Balken, Warteschlange oder Enthüllung gehören, sonst -1 */
  games: -1,
  pid: '',
  /** Ab diesem Eintrag hält der Verlauf zurück, damit er den Shithead nicht vorher verrät */
  logN: 0,
  stop: null as (() => void) | null,
  raf: 0,
  t: null as Timer | null,
};

const BROWN = ['#9c6b3a', '#b07a42', '#c08a50', '#d9a96b', '#e8c9a0'];

function stage(): HTMLElement | null {
  return $opt('#zer');
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
    const t = `translate(${Math.round(r.left - 6)}px, ${Math.round(r.top - 6)}px)`;
    if (ring.style.transform !== t) ring.style.transform = t;
    const w = `${Math.round(r.width + 12)}px`;
    const h = `${Math.round(r.height + 12)}px`;
    if (ring.style.width !== w) ring.style.width = w;
    if (ring.style.height !== h) ring.style.height = h;
  }
  ZER.raf = requestAnimationFrame(track);
}

/** Bühne an: Abdunkeln, Spotlicht, Posaune, Haufen und Konfetti. */
function reveal(v: View, pid: string, gen: number): void {
  const cur = App.view;
  if (gen !== ZER.gen || !cur || cur.game !== 'shithead' || cur.phase !== 'over' || cur.games !== v.games) return;
  releaseLog();
  if (document.hidden) return;
  const z = stage();
  if (!z) return;
  ZER.on = true;
  ZER.pid = pid;
  const moved = focusOpp(pid);
  z.hidden = false;
  z.classList.remove('slow');
  void z.offsetWidth;
  z.classList.add('reveal');
  track();
  ZER.stop = sfx('trombone');
  const calm = reduceMotion();
  const ring = $opt('#zer .zer-ring');
  setTimeout(
    () => {
      if (gen !== ZER.gen || !ZER.on) return;
      const el = panelFor(pid);
      if (el && !calm && z.classList.contains('hole')) dropOn(el, '💩', () => ring?.classList.add('mark'));
      else ring?.classList.add('mark');
    },
    moved ? CAR_GLIDE_MS : 150,
  );
  if (!calm) {
    const loser = pid === App.me;
    const first = v.sh?.finished[0] === App.me;
    setTimeout(() => {
      if (gen !== ZER.gen || !ZER.on) return;
      confetti({
        colors: first ? [...BROWN, '#f3cd7d', '#f3cd7d'] : BROWN,
        n: 44,
        dur: [2800, 1200],
        extra: loser ? [{ ch: '💩', n: 6 }] : [],
        cls: 'zerc',
      });
    }, 300);
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
  const z = stage();
  if (z) {
    z.classList.remove('reveal', 'hole', 'nohole', 'slow');
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
  stopCeremony(true);
}

/**
 * Jede neue Ansicht: Gehört sie nicht mehr zur Partie der Zeremonie (Lobby, neue Tauschrunde),
 * wird alles abgebrochen. Chat oder Reaktionen während der Zeitlupe lassen sie laufen.
 */
export function ceremonyGuard(v: View): void {
  if (ZER.games < 0) return;
  if (v.game === 'shithead' && v.phase === 'over' && v.games === ZER.games) return;
  ZER.gen++;
  dropAnnouncements('zer');
  stopCeremony(true);
}

/** Meldung für den Shithead, mit Spruch, Zähler und Ergebnis des eigenen Tipps. */
function message(v: View, e: EndEntry): { title: string; sub: string } {
  const pid = e.p ?? '';
  const mine = pid === App.me;
  const name = nameOf(v, pid, e.name);
  const t = mine ? taunt('shLoserSelf', null, e.n) : taunt('shLoserOther', { name }, e.n);
  const shc = num(pById(v, pid)?.shc);
  let sub = `<span class="tt">${esc(t)}</span>`;
  if (shc >= 2) sub += `<span class="zer-n">Zum ${shc}. Mal Shithead an diesem Tisch.</span>`;
  const hit = e.hits?.[App.me];
  const bet = v.sh?.bets?.[App.me];
  if (hit) sub += `<span class="tt bt">🔮 Richtig getippt! +${num(hit.q)} ${hit.q === 1 ? 'Punkt' : 'Punkte'}.</span>`;
  else if (bet && typeof bet.on === 'string') sub += '<span class="tt bt">🔮 Tipp daneben.</span>';
  sub += '<span class="zer-hint">Antippen zum Überspringen</span>';
  return {
    title: mine
      ? 'Du bist der <span class="r">Shithead!</span>'
      : `${esc(name)} ist der <span class="r">Shithead!</span>`,
    sub,
  };
}

/** Startet die Zeremonie zum Eintrag shend. Die Enthüllung beginnt, wenn die Meldung dran ist. */
export function shitheadCeremony(v: View, e: EndEntry): void {
  const pid = e.p;
  if (!pid) return;
  // Steht schon eine Ansicht aus einer anderen Partie an, lohnt sich nichts mehr
  const nx = SEQ.next;
  if (nx && !(nx.game === 'shithead' && nx.phase === 'over' && nx.games === v.games)) return;
  ZER.games = v.games;
  const gen = ++ZER.gen;
  ZER.logN = e.n;
  renderLog(v);
  const m = message(v, e);
  announce({
    icon: '💩',
    tone: 'brown',
    cls: 'zer',
    title: m.title,
    sub: m.sub,
    ms: ZER_REVEAL_MS,
    onShow: () => reveal(v, pid, gen),
    onEnd: (skipped) => {
      if (gen === ZER.gen) stopCeremony(skipped);
    },
  });
  holdForAnnouncements();
  holdOverlay();
}

/** Tippt jemand während der Enthüllung auf den Tisch, ist sie vorbei. */
export const ceremonyOn = (): boolean => ZER.on;
