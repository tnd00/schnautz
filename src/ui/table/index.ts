/*
 * Gemeinsames Zeichnen des Tisches (Plan 2.8 Abschnitt 8, geruest.md 3.3): Fokus halten, Teile aus den Modellen
 * schreiben, Karussell, Uhren und Würfe nachziehen, Ziehen auffrischen. Ein `OldTable` zeichnet wie heute selbst.
 */
import type { View } from '../../game/types';
import { holdFocus, restoreFocus } from '../a11y/focus';
import { App } from '../app';
import { CAR, layoutOpps } from '../carousel';
import { ceremonyOn } from '../ceremony';
import { markClocks } from '../clock';
import { $, $opt } from '../dom';
import { prefs } from '../prefs';
import { SEQ } from '../shithead/sequence';
import { paintStatus } from '../status';
import { markTosses } from '../toss';
import { TABLE } from '../../content/texts/table';
import { dragRefresh, initDrag } from './drag';
import { meClass, meHTML, meLabel } from './me';
import { opponentsHTML } from './opponents';
import { centerHTML } from './pile';
import { isOld, specOf } from './spec';

/** Teile des Tisches, die einzeln neu gezeichnet werden können */
export type Part = 'opps' | 'center' | 'status' | 'me';

export interface RenderOpts {
  /** Standard alle vier */
  parts?: readonly Part[];
  /** Ansicht für Gegner und Status während einer Sequenz (Kino 36). Standard v */
  hold?: View;
}

const ALL: readonly Part[] = ['opps', 'center', 'status', 'me'];

/** Rolle und Name einer Zone setzen, ohne Namen beides weg (ein OldTable setzt keine) */
function zone(el: HTMLElement, role: string | null, label = ''): void {
  if (role) el.setAttribute('role', role);
  else el.removeAttribute('role');
  if (label) el.setAttribute('aria-label', label);
  else el.removeAttribute('aria-label');
}

/** Ziehen gilt nur für ein umgestelltes Spiel mit Adapter und wenn es in „Bedienung“ an ist */
export function dragOn(v: View): boolean {
  const s = specOf(v.game);
  return !isOld(s) && !!s.drag && prefs().drag;
}

let dragInit = false;

/** Zeichnet den Tisch, für ein OldTable über dessen eigenes Zeichnen. */
export function renderTable(v: View, o: RenderOpts = {}): void {
  const spec = specOf(v.game);
  const me = $('#me');
  CAR.who = isOld(spec) ? null : spec.actor;
  if (isOld(spec)) {
    // Vom umgestellten Spiel übrig gebliebene Rollen weg, das alte Zeichnen kennt sie nicht
    zone($('#opps'), null);
    zone($('#center'), null);
    zone(me, null);
    delete me.dataset.st;
    spec.old.draw(v);
    return;
  }
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
  if (parts.includes('status')) paintStatus(spec.status(hv));
  if (parts.includes('me')) {
    const m = spec.me(v);
    me.className = m ? meClass(m) : 'me';
    me.dataset.pid = App.me;
    me.dataset.st = m && !('out' in m) ? m.st.join(' ') : '';
    zone(me, 'group', m ? meLabel(m) : '');
    me.innerHTML = m ? meHTML(m) : '';
  }
  spec.after?.(v);
  layoutOpps(v);
  markClocks();
  markTosses();
  restoreFocus(fm);
  if (dragOn(v)) {
    if (!dragInit) initDrag();
    dragInit = true;
    dragRefresh(v);
  }
}

/**
 * Läuft am Tisch gerade etwas, das Eingaben wie Ziehen nicht stören dürfen? Sperre nach einem Zug, Shithead-Ablauf,
 * Zeremonie und offene Fenster (Menü, Bogen, Ergebnisblatt).
 */
export function tableBusy(): boolean {
  return App.busy || SEQ.busy || ceremonyOn() || !$('#menu').hidden || !!$opt('#modal > *') || !!$opt('#overlay > *');
}
