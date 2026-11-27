/*
 * Bogen „Bedienung“ in #modal (Plan 4.10, gefuehl.md 3.7): Ruhig, Karten ziehen (nur wenn ein Spiel es kann),
 * Vibration (nur wo es sie gibt), Lautstärke und Zug-Ton. Lädt nach (openPrefs in src/ui/prefs.ts) und nutzt die
 * Zeilen des Spiel-Bogens (.gset). Die Bedienelemente tragen data-pref statt data-act, events.ts kennt sie nicht, die
 * Handler hängen hier am Bogen.
 */
import '../../styles/prefs.css';
import { PREFS_TEXT as T } from '../../content/texts/prefs';
import { GAMES } from '../../game/games';
import { canVibrate } from '../a11y/haptic';
import { sheetHTML } from '../dialog';
import { $opt, esc } from '../dom';
import { applyCalm, prefs, setPref, type Prefs } from '../prefs';
import { setSbVolume, sfx } from '../sound';
import { specOf } from '../table/spec';

type Opts = readonly (readonly [string, string])[];

function segRow(key: 'calm' | 'turnTone', label: string, sub: string, opts: Opts, cur: string): string {
  const btn = ([v, text]: readonly [string, string]) =>
    `<button type="button" class="st-num seg${v === cur ? ' on' : ''}" data-pref="${key}" data-v="${v}" aria-pressed="${v === cur}">${esc(text)}</button>`;
  return (
    `<div class="rrow pseg"><span class="rl"><span class="rt">${label}</span><small>${sub}</small></span>` +
    `<div class="segs" role="group" aria-label="${label}">${opts.map(btn).join('')}</div></div>`
  );
}

function switchRow(
  key: 'drag' | 'zones' | 'dragSame' | 'zoom' | 'haptic',
  label: string,
  sub: string,
  on: boolean,
  hide = false,
): string {
  return (
    `<label class="rrow${key === 'zones' || key === 'dragSame' ? ' rsub' : ''}"${hide ? ' hidden' : ''}><span class="rl"><span class="rt">${label}</span><small>${sub}</small></span>` +
    `<input type="checkbox" class="switch" data-pref="${key}"${on ? ' checked' : ''}></label>`
  );
}

const pct = (v: number): number => Math.round(v * 100);

/** Den Schalter gibt es erst, wenn mindestens ein Spiel ziehen kann */
const canDrag = (): boolean =>
  GAMES.some((g) => {
    const s = specOf(g);
    return !!s.drag;
  });

function volumeRow(v: number): string {
  return (
    `<div class="rrow rtime"><span class="rt">${T.volume}</span>` +
    `<input type="range" class="range" min="0" max="100" step="10" value="${pct(v)}" data-pref="volume" ` +
    `aria-label="${T.volume}" aria-valuetext="${T.volumeText(pct(v))}">` +
    `<b class="st-num tval">${pct(v)} %</b></div>`
  );
}

function bodyHTML(p: Prefs): string {
  return (
    `<p class="lead">${T.lead}</p><div class="rlist">` +
    segRow('calm', T.calm, T.calmSub, T.calmOpts, p.calm) +
    (canDrag()
      ? switchRow('drag', T.drag, T.dragSub, p.drag) +
        switchRow('dragSame', T.dragSame, T.dragSameSub, p.dragSame, !p.drag) +
        switchRow('zones', T.zones, T.zonesSub, p.zones, !p.drag)
      : '') +
    switchRow('zoom', T.zoom, T.zoomSub, p.zoom) +
    (canVibrate() ? switchRow('haptic', T.haptic, T.hapticSub, p.haptic) : '') +
    volumeRow(p.volume) +
    segRow('turnTone', T.turnTone, T.turnToneSub, T.turnToneOpts, p.turnTone) +
    '</div>'
  );
}

/** Auswahl in einer Reihe umschalten, ohne neu zu zeichnen (der Fokus bleibt am Knopf) */
function pick(btn: HTMLElement): void {
  const key = btn.dataset.pref;
  const v = btn.dataset.v ?? '';
  for (const b of btn.parentElement?.querySelectorAll<HTMLElement>('.seg') ?? []) {
    b.classList.toggle('on', b === btn);
    b.setAttribute('aria-pressed', String(b === btn));
  }
  if (key === 'calm' && (v === 'auto' || v === 'on' || v === 'off')) {
    setPref('calm', v);
    applyCalm();
  } else if (key === 'turnTone' && (v === 'always' || v === 'away' || v === 'off')) setPref('turnTone', v);
}

function wire(paper: HTMLElement): void {
  paper.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('.seg[data-pref]') : null;
    if (b) pick(b);
  });
  paper.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const key = t.dataset.pref;
    if (key === 'drag' || key === 'zones' || key === 'dragSame' || key === 'zoom' || key === 'haptic')
      setPref(key, t.checked);
    // Mitziehen und Trefferflächen gibt es nur mit Ziehen
    if (key === 'drag')
      for (const k of ['dragSame', 'zones'])
        paper.querySelector<HTMLElement>(`[data-pref="${k}"]`)?.closest('label')?.toggleAttribute('hidden', !t.checked);
    // Zum Hören, wie laut es jetzt ist
    if (key === 'volume') void sfx('pop');
  });
  paper.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.dataset.pref !== 'volume') return;
    const n = Number(t.value);
    setPref('volume', n / 100);
    setSbVolume();
    t.setAttribute('aria-valuetext', T.volumeText(n));
    const out = t.parentElement?.querySelector('.tval');
    if (out) out.textContent = `${n} %`;
  });
}

/** Öffnet den Bogen. Das Menü ⋯ schließt events.ts nach dem Tipp selbst. */
export function renderPrefs(): void {
  const box = $opt('#modal');
  if (!box) return;
  box.innerHTML = sheetHTML({ kind: 'gset prefs', title: T.title, body: bodyHTML(prefs()) });
  const paper = $opt('#modal .paper.prefs');
  if (paper) wire(paper);
}
