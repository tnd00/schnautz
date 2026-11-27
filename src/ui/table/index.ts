/*
 * Gemeinsames Zeichnen des Tisches (Plan 2.8 Abschnitt 8, geruest.md 3.3): Fokus halten, Teile aus den Modellen
 * schreiben, Karussell, Uhren und Würfe nachziehen, Ziehen auffrischen.
 *
 * API fest seit Runde 3: Modelle (types.ts), Spec (spec.ts) und Bausteine ändern sich nur noch mit Begründung.
 * Seit Runde 4a zeichnen alle vier Spiele darüber.
 */
import type { View } from '../../game/types';
import { holdFocus, restoreFocus } from '../a11y/focus';
import { App } from '../app';
import { CAR, layoutOpps } from '../carousel';
import { ceremonyOn, ZER } from '../ceremony';
import { markClocks } from '../clock';
import { $, $opt, isMobile } from '../dom';
import { prefs } from '../prefs';
import { SEQ } from '../shithead/sequence';
import { paintStatus } from '../status';
import { markTosses } from '../toss';
import { TABLE } from '../../content/texts/table';
import { dragRefresh, initDrag } from './drag';
import { meClass, meHTML, meLabel } from './me';
import { opponentsHTML } from './opponents';
import { centerHTML } from './pile';
import { specOf } from './spec';

/** Teile des Tisches, die einzeln neu gezeichnet werden können */
export type Part = 'opps' | 'center' | 'status' | 'me';

export interface RenderOpts {
  /**
   * Standard alle vier. Nur die Mitte (Schritte im Shithead-Ablauf) schreibt nur #center, ohne Karussell, Uhren und
   * Würfe neu zu setzen, so wie früher renderShCenter.
   */
  parts?: readonly Part[];
  /** Ansicht für Gegner, Status und Karussell während einer Sequenz (Kino 36). Standard v, noch nutzt es niemand */
  hold?: View;
}

const ALL: readonly Part[] = ['opps', 'center', 'status', 'me'];

/** Rolle und Name einer Zone setzen, ohne Namen beides weg */
function zone(el: HTMLElement, role: string | null, label = ''): void {
  if (role) el.setAttribute('role', role);
  else el.removeAttribute('role');
  if (label) el.setAttribute('aria-label', label);
  else el.removeAttribute('aria-label');
}

/** Ziehen gilt nur für ein umgestelltes Spiel mit Adapter und wenn es in „Bedienung“ an ist */
export function dragOn(v: View): boolean {
  const s = specOf(v.game);
  return !!s.drag && prefs().drag;
}

let dragInit = false;

/** Zeichnet den Tisch aus den Modellen des Spiels. */
export function renderTable(v: View, o: RenderOpts = {}): void {
  const spec = specOf(v.game);
  const me = $('#me');
  CAR.who = spec.actor;
  const parts = o.parts ?? ALL;
  const hv = o.hold ?? v;
  const fm = holdFocus();
  if (parts.includes('opps')) {
    const el = $('#opps');
    zone(el, 'list', TABLE.opps);
    el.innerHTML = opponentsHTML(hv, spec);
  }
  if (parts.includes('center')) {
    const el = $('#center');
    const m = spec.center(v);
    zone(el, 'group', m?.label);
    el.innerHTML = m ? centerHTML(m) : '';
  }
  // paintStatus meldet einen Wechsel selbst an den Vorleser (sayStatus)
  if (parts.includes('status')) paintStatus(spec.status(hv));
  if (parts.includes('me')) {
    const m = spec.me(v);
    me.className = m ? meClass(m) : 'me';
    me.dataset.pid = App.me;
    me.dataset.st = m && !('out' in m) ? m.st.join(' ') : '';
    zone(me, 'group', m ? meLabel(m) : '');
    me.innerHTML = m ? meHTML(m) : '';
  }
  // Plätze neu geschrieben: Hand einpassen, Karussell, Uhren und Würfe wieder an ihre Kacheln
  if (parts.includes('opps') || parts.includes('me')) {
    spec.after?.(v);
    layoutOpps(hv);
    markClocks();
    markTosses();
  }
  restoreFocus(fm);
  if (dragOn(v)) {
    if (!dragInit) initDrag();
    dragInit = true;
    dragRefresh(v);
  }
}

/**
 * Läuft am Tisch gerade etwas, das Eingaben wie Ziehen nicht stören dürfen? Sperre nach einem Zug, Shithead-Ablauf,
 * Zeremonie samt Zeitlupe und verborgenem Verlierer davor, offene Fenster (Menü, Bogen, Ergebnisblatt) sowie Verlauf
 * und Reaktionen, solange sie am Handy über dem Tisch liegen. src/ui/update.ts wartet darauf mit dem Neuladen.
 */
export function tableBusy(): boolean {
  const b = document.body.classList;
  return (
    App.busy ||
    SEQ.busy ||
    ceremonyOn() ||
    ZER.slow ||
    !!App.zerHide ||
    !$('#menu').hidden ||
    !!$opt('#modal > *') ||
    !!$opt('#overlay > *') ||
    (isMobile() && (b.contains('logopen') || b.contains('emoopen')))
  );
}
