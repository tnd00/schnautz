/*
 * Bogen „Design“ in #modal (Runde 6 von 2.8, Entscheidungen des Users vom 27.11.2026): Design (Sticker, Sticker dunkel
 * oder Legacy) und Kartendeck (Vinyl oder Klassisch) getrennt, je als Radiogruppe mit Pfeiltasten. Die Wahl wirkt
 * sofort über setLook und setDeck, der Bogen bleibt offen, bis man ihn schließt. Lädt nach (openDesign in
 * src/ui/look.ts) wie „Bedienung“ und nutzt dessen Zeilen (.gset). Der Bogen selbst ist Rahmen und bleibt in beiden
 * Looks Sticker (legacy.md 11).
 */
import '../../styles/design.css';
import { DESIGN_TEXT as T } from '../../content/texts/design';
import type { Card } from '../../game/types';
import { cardHTML } from '../cards';
import { sheetHTML } from '../dialog';
import { $opt } from '../dom';
import { toast } from '../feedback';
import { designOf, lookLoading, setDeck, setLook, type Deck, type Design } from '../look';
import { prefs, type Prefs } from '../prefs';

type Key = 'look' | 'deck';
type Opts = readonly (readonly [string, string, string])[];

/** Zwei echte kleine Karten im jeweiligen Deck, die Bildkarte zeigt den Unterschied am deutlichsten */
const PREVIEW_CARDS: readonly Card[] = ['HK', 'C7'];

function preview(key: Key, v: string): string {
  if (key === 'deck')
    return `<span class="dsg-pv dsg-cards" data-deck="${v}" aria-hidden="true">${PREVIEW_CARDS.map((c) => cardHTML(c)).join('')}</span>`;
  return `<span class="dsg-pv dsg-lk dsg-${v}" aria-hidden="true"><i></i><i></i></span>`;
}

function group(key: Key, label: string, opts: Opts, cur: string): string {
  const opt = ([v, name, sub]: readonly [string, string, string]) => {
    const on = v === cur;
    return (
      `<button type="button" class="rrow dsg-o" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" ` +
      `data-dsg="${key}" data-v="${v}" aria-labelledby="dsg-${v}" aria-describedby="dsg-${v}-d">${preview(key, v)}` +
      `<span class="rl"><span class="rt" id="dsg-${v}">${name}</span><small id="dsg-${v}-d">${sub}</small></span>` +
      '<span class="dsg-dot" aria-hidden="true"></span></button>'
    );
  };
  return (
    `<h3 class="rs-h" id="dsg-${key}">${label}</h3>` +
    `<div class="rlist" role="radiogroup" aria-labelledby="dsg-${key}">${opts.map(opt).join('')}</div>`
  );
}

/** Inhalt des Bogens für einen Stand der Vorlieben */
export function designHTML(p: Prefs): string {
  return (
    `<p class="lead">${T.lead}</p>` +
    group('look', T.look, T.looks, designOf(p)) +
    group('deck', T.deck, T.decks, p.deck)
  );
}

/** Markierung und Tab-Halt in der Gruppe auf diese Wahl setzen */
function mark(btn: HTMLElement): void {
  for (const b of btn.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []) {
    b.setAttribute('aria-checked', String(b === btn));
    b.tabIndex = b === btn ? 0 : -1;
  }
}

/**
 * Eine Wahl treffen und anwenden. Lädt Legacy oder Sticker dunkel nicht, springt die Markierung zurück und ein Toast
 * sagt es.
 */
function choose(btn: HTMLElement): void {
  const v = btn.dataset.v;
  mark(btn);
  // Lädt ein Stück noch, zählt auch die Wahl des gespeicherten Designs: Sie hebt die ladende Wahl auf
  if (btn.dataset.dsg === 'look' && (v !== designOf(prefs()) || lookLoading()))
    void setLook(v as Design).then((ok) => {
      if (ok) return;
      const back = btn.parentElement?.querySelector<HTMLElement>(`[data-v="${designOf(prefs())}"]`);
      if (back) {
        mark(back);
        if (document.activeElement === btn) back.focus();
      }
      toast(v === 'dark' ? T.darkFail : T.legacyFail);
    });
  else if (btn.dataset.dsg === 'deck' && v !== prefs().deck) setDeck(v as Deck);
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

function wire(paper: HTMLElement): void {
  paper.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-dsg]') : null;
    if (b) choose(b);
  });
  // Pfeiltasten wandern in der Gruppe rundherum und wählen dabei, wie bei echten Radioknöpfen
  paper.addEventListener('keydown', (e) => {
    const d = STEP[e.key];
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!d || !t?.dataset.dsg) return;
    const all = [...(t.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    const next = all[(all.indexOf(t) + d + all.length) % all.length];
    e.preventDefault();
    next.focus();
    choose(next);
  });
}

/** Öffnet den Bogen. Das Menü ⋯ schließt events.ts vorher selbst. */
export function renderDesign(): void {
  const box = $opt('#modal');
  if (!box) return;
  box.innerHTML = sheetHTML({ kind: 'gset dsg', title: T.title, body: designHTML(prefs()) });
  const paper = $opt('#modal .paper.dsg');
  if (paper) wire(paper);
}
