/*
 * Neue Ansicht anwenden. Herzstück der Oberfläche: setzt Auswahl zurück, startet Animationen,
 * spielt bei Shithead Sequenzen ab und löst Töne und Meldungen aus.
 */
import type { View } from '../game/types';
import { markLost, runFlights } from './animations';
import { App } from './app';
import { num } from './dom';
import { effects } from './effects';
import { pById } from './helpers';
import { render } from './render/index';
import { renderLog } from './render/log';
import { SEQ, runSeq, shPlan, totalMs, type Step } from './shithead/sequence';
import { syncWin } from './shithead/window';
import { syncClock } from './clock';
import { sfxCalm } from './sound';
import { ceremonyGuard, ZER, zerSlow } from './ceremony';
import { liveFx } from './livefx';
import { syncNext } from './nextround';
import { placePick } from './toss';
import { viewSig } from './viewsig';

function bumpSeen(v: View): void {
  App.seenN = v.log.reduce((mx, e) => Math.max(mx, e.n), App.seenN);
}

/** Sequenzen, die wegen Hintergrund-Tab o. ä. hängen, nach einer Weile beenden. */
const SEQ_WATCHDOG_MS = 2500;

export function applyView(v: View): void {
  // Gehört die Zeremonie nicht mehr zu dieser Partie, endet sie sofort
  ceremonyGuard(v);
  // Würfe und Klänge sofort, auch während eine Sequenz die Ansicht noch zurückhält
  liveFx(v);
  if (SEQ.busy && Date.now() > SEQ.endAt + SEQ_WATCHDOG_MS) {
    if (SEQ.t) clearTimeout(SEQ.t);
    SEQ.t = null;
    if (SEQ.done) SEQ.done();
    else {
      SEQ.busy = false;
      SEQ.ov = null;
      zerSlow(false);
    }
  }
  if (SEQ.busy) {
    SEQ.next = v;
    return;
  }
  const prev = App.view;
  const sig = viewSig(v);
  if (prev && App.lastSig === sig) {
    // Nur Chat, Reaktionen, Würfe, Klänge oder neue Restzeiten: kein volles Neuzeichnen
    App.view = v;
    syncWin(v);
    syncClock(v);
    syncNext(v);
    effects(prev, v);
    bumpSeen(v);
    renderLog(v);
    return;
  }
  const fresh = v.log.filter((e) => e.n > App.seenN);
  App.lastSig = sig;
  App.view = v;
  App.busy = false;
  syncWin(v);
  syncClock(v);
  syncNext(v);
  resetSelection(prev, v);
  setAnimations(prev, v);

  const steps = prev ? shPlan(prev, v, fresh) : [];
  if (prev && steps.length && startSequence(prev, v, steps)) return;

  const lostNow: Record<string, true> = {};
  prev?.players.forEach((q) => {
    const p = pById(v, q.id);
    if (p && (p.lives < q.lives || (p.out && !q.out))) lostNow[p.id] = true;
  });
  if (prev) effects(prev, v);
  bumpSeen(v);
  render();
  if (prev) runFlights(prev, v);
  markLost(lostNow, v);
  placePick();
}

function resetSelection(prev: View | null, v: View): void {
  const turnChanged = !prev || prev.turn !== v.turn || prev.phase !== v.phase || prev.round !== v.round;
  if (turnChanged || prev?.last?.n !== v.last?.n) App.ss = { src: null, idx: [] };
  if (turnChanged) {
    App.sel = { h: null, m: null };
    App.sw = { h: null, u: null };
  }
  if (!prev || prev.phase !== v.phase) App.peek = false;
}

function setAnimations(prev: View | null, v: View): void {
  App.anim = {};
  const live = v.phase === 'choose' || v.phase === 'play';
  if ((!prev || v.round !== prev.round) && live) App.anim.deal = true;
  if (prev && v.phase === 'play' && prev.phase === 'choose') {
    App.anim.dealMid = true;
    if (v.last?.k === 'take' && v.last.p === App.me) App.anim.dealHand = true;
  }
  if (v.last && v.last.n > (prev?.last?.n ?? 0) && v.last.k === 'shplay' && v.last.p !== App.me)
    App.anim.pilePop = true;
  if (v.game === 'shithead' && v.phase === 'swap' && prev?.phase !== 'swap') App.anim.deal = true;
  // Karten erscheinen: kurzes Austeilgeräusch
  if (prev && (App.anim.deal || App.anim.dealMid)) sfxCalm('deal', 600);
}

/** Startet eine Shithead-Sequenz. Gibt false zurück, wenn das Zeichnen scheitert (dann normal weiter). */
function startSequence(prev: View, v: View, steps: Step[]): boolean {
  const total = totalMs(steps);
  App.holdUntil = Math.max(App.holdUntil, Date.now() + total + 250);
  App.anim.pilePop = false;
  SEQ.busy = true;
  SEQ.endAt = Date.now() + total;
  SEQ.ov = { pile: (prev.sh?.pile ?? []).slice(), burned: num(prev.sh?.burned), myHand: null };
  const pm = prev.sh?.P[App.me];
  const iPickUp = steps.some((x) => (x.k === 'pickup' || x.k === 'blind') && x.e.p === App.me);
  if (pm && Array.isArray(pm.hand) && iPickUp) SEQ.ov.myHand = pm.hand.slice();
  try {
    render();
  } catch (er) {
    console.warn(er);
    SEQ.busy = false;
    SEQ.ov = null;
    App.holdUntil = 0;
    return false;
  }
  const gen = SEQ.gen;
  SEQ.done = () => {
    SEQ.done = null;
    if (ZER.slow) zerSlow(false);
    if (gen !== SEQ.gen) return;
    SEQ.busy = false;
    SEQ.ov = null;
    App.anim = {};
    if (App.view !== v || !App.role) return;
    render();
    effects(prev, v, true);
    bumpSeen(v);
    renderLog(v);
    if (SEQ.next) {
      const nx = SEQ.next;
      SEQ.next = null;
      applyView(nx);
    }
  };
  runSeq(steps, v, () => SEQ.done?.());
  return true;
}
