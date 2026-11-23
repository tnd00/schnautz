/*
 * Zeitlimit anzeigen: Bei Gegnern ein schmaler Balken, der abläuft, am eigenen Platz eine kleine Uhr mit Sekunden.
 * Die Restzeit kommt mit jeder Ansicht vom Host, dazwischen zählt die Anzeige selbst weiter.
 */
import type { View } from '../game/types';
import { App } from './app';
import { $opt, num } from './dom';
import { panelFor } from './feedback';

export const CLK = {
  end: 0,
  total: 0,
  ids: [] as string[],
  iv: null as ReturnType<typeof setInterval> | null,
};

/** Ab so vielen Sekunden wird die Anzeige rot. */
const LOW_S = 10;

/**
 * Wie dringend es am eigenen Platz ist: 0 ruhig, ab der Hälfte 1, ab einem Viertel 2, die letzten 10 Prozent 3.
 * Der Rand pulsiert dann heller und schneller, höchstens so hell wie bei Gegnern am Zug.
 */
function urgency(p: number): number {
  if (p > 0.5) return 0;
  if (p > 0.25) return 1;
  return p > 0.1 ? 2 : 3;
}

function setUrgency(level: number | null): void {
  const me = $opt('#me');
  if (!me) return;
  const want = level ? String(level) : null;
  if ((me.dataset.urg ?? null) === want) return;
  if (want) me.dataset.urg = want;
  else delete me.dataset.urg;
}

function stop(): void {
  if (CLK.iv) clearInterval(CLK.iv);
  CLK.iv = null;
}

/** Übernimmt die Uhr aus der Ansicht. Kleine Abweichungen durch die Übertragung werden ignoriert. */
export function syncClock(v: View | null): void {
  const c = v?.clock;
  if (!c?.ids.length) {
    CLK.ids = [];
    stop();
    return;
  }
  const end = c.at ? num(c.at) : Date.now() + num(c.left);
  if (!CLK.ids.length || c.total !== CLK.total || Math.abs(end - CLK.end) > 700) CLK.end = end;
  CLK.total = num(c.total);
  CLK.ids = c.ids.slice();
  CLK.iv ??= setInterval(tick, 250);
}

export function resetClockUI(): void {
  CLK.ids = [];
  stop();
  document.querySelectorAll('.clk').forEach((e) => e.remove());
  setUrgency(null);
}

const left = (): number => Math.max(0, CLK.end - Date.now());

/** Nach jedem Zeichnen: Uhren an die Plätze hängen, die gerade dran sind. */
export function markClocks(): void {
  document.querySelectorAll('.clk').forEach((e) => e.remove());
  if (!CLK.ids.length || App.view?.phase === 'lobby') {
    setUrgency(null);
    return;
  }
  CLK.ids.forEach((id) => {
    const el = panelFor(id);
    if (!el) return;
    const c = document.createElement('span');
    c.className = id === App.me ? 'clk mine' : 'clk';
    c.setAttribute('aria-label', 'Restzeit für diesen Zug');
    c.innerHTML = id === App.me ? '<i></i><b></b>' : '';
    el.appendChild(c);
  });
  tick();
}

function tick(): void {
  if (!CLK.ids.length) {
    stop();
    setUrgency(null);
    return;
  }
  const l = left();
  const p = CLK.total ? Math.min(1, l / CLK.total) : 0;
  setUrgency(CLK.ids.includes(App.me) ? urgency(p) : null);
  const s = Math.ceil(l / 1000);
  document.querySelectorAll<HTMLElement>('.clk').forEach((c) => {
    c.style.setProperty('--p', p.toFixed(3));
    c.classList.toggle('low', s <= LOW_S);
    const b = c.querySelector('b');
    if (b) b.textContent = `${s} s`;
  });
  // Die eigene Uhr soll auch im offenen Chat sichtbar bleiben
  const note = $opt('#turnnote .clkn');
  if (note) note.textContent = `${s} s`;
}
