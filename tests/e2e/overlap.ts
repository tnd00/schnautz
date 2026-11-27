/**
 * Überschneidungen am Tisch, paarweise zwischen sichtbaren Elementen. Läuft im Browser per `page.evaluate`, deshalb
 * ohne Bezug auf andere Teile dieser Datei. Genutzt von `fitFindings` (tests/e2e/helpers.ts) und `measure`
 * (tests/design/lib.mjs, Node lädt die Datei mit Type Stripping, also nur löschbare Typen verwenden).
 *
 * Ein Befund nennt beide Elemente und die Pixel: `Überlappung A / B 12x8 px` (Breite x Höhe der Schnittfläche) oder bei
 * Paaren mit Mindestabstand `Abstand A / B 2 px`. Nicht gezählt wird, was unsichtbar, außerhalb des Bildes oder fast
 * ganz durchsichtig ist (auch über einen Vorfahren). Steckt ein Element im anderen, ist das kein Befund.
 */
export function overlapFindings(): string[] {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const seen = (el: Element): boolean => {
    if (!el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= W || r.bottom <= 0 || r.top >= H) return false;
    if (getComputedStyle(el).visibility === 'hidden') return false;
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement)
      if (Number(getComputedStyle(a).opacity) < 0.05) return false;
    return true;
  };
  // Bei Meldungen sagt die erste Klasse, welche es ist (fieldlbl, nopelbl, tauntlbl, ann), an Gegnern die Platz-ID
  const label = (el: Element, kind: string) => {
    const cls = ['Meldung', 'Ansage'].includes(kind) ? `(${el.classList[0]})` : '';
    const p = el.closest<HTMLElement>('.opp[data-pid]')?.dataset.pid;
    return `${kind}${cls}${p ? ` an ${p}` : ''}`;
  };
  const all = (sel: string, kind: string) =>
    [...document.querySelectorAll(sel)].filter(seen).map((el) => ({ el, r: el.getBoundingClientRect(), kind }));
  type Item = ReturnType<typeof all>[number];
  /** Pro Paar nur der schlimmste Fall (etwa die Handkarte, die einem Knopf am nächsten kommt) */
  const out = new Map<string, { score: number; msg: string }>();
  /** `gap`: Abstand darunter zählt mit (nur Kanten, die sich gegenüberstehen, nicht über Eck) */
  const check = (as: Item[], bs: Item[], gap = 0, same?: (a: Item, b: Item) => boolean) => {
    for (const [i, a] of as.entries())
      for (const [j, b] of bs.entries()) {
        // Innerhalb einer Liste jedes Paar nur einmal
        if (
          (as === bs && j <= i) ||
          a.el === b.el ||
          a.el.contains(b.el) ||
          b.el.contains(a.el) ||
          (same && !same(a, b))
        )
          continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        const pair = `${label(a.el, a.kind)} / ${label(b.el, b.kind)}`;
        let hit: { score: number; msg: string } | null = null;
        if (ix > 1 && iy > 1)
          hit = { score: ix * iy, msg: `Überlappung ${pair} ${Math.round(ix)}x${Math.round(iy)} px` };
        else if (gap && (ix > 0 || iy > 0)) {
          const d = Math.max(-ix, -iy);
          if (d < gap) hit = { score: -d, msg: `Abstand ${pair} ${Math.max(0, Math.round(d))} px` };
        }
        if (hit && hit.score > (out.get(pair)?.score ?? -Infinity)) out.set(pair, hit);
      }
  };
  if (!document.querySelector('#scr-game')?.getClientRects().length) return [];
  const msgs = [
    ...all('#fly .mid:not(.out)', 'Meldung'),
    ...all('#announce .ann:not(.out)', 'Ansage'),
    ...all('#table .hint', 'Hinweis'),
  ];
  const clocks = all('.clk, .clkn', 'Uhr');
  // Pillen: Wert an der Gegnerkachel, Zahl im gehaltenen Fächer (Durak) und die Pille im Kopf des eigenen Platzes
  const pills = all('.hcount, .opp .bhn, #me .mehead .pill', 'Pille');
  const opps = all('#opps .opp', 'Kachel');
  // Die ganze Statuszeile, ihr Hintergrund ist im Sticker-Look eine Fläche
  const status = all('#status', 'Statuszeile');
  check(msgs, msgs);
  check(msgs, clocks, 4);
  check(msgs, pills);
  check(msgs, opps);
  check(msgs, status);
  const myClock = clocks.filter((c) => c.el.closest('#me'));
  const myCards = all('#me .tb-hand .card', 'Handkarte');
  // Jede Uhr gegen alle Pillen (auch die des Nachbarn) und fremde Kacheln, die eigene zusätzlich gegen die Handkarten
  check(clocks, pills, 4);
  check(clocks, opps);
  check(clocks, status);
  check(myClock, myCards, 4);
  check(myCards, all('#table .actions .btn', 'Knopf'), 4);
  // An der Gegnerkachel: Eckaufkleber (Krone, Shithead), Etikett, KI-Zeichen, Name, Pille und Zähler untereinander
  const tile = (a: Item, b: Item) => a.el.closest('.opp') === b.el.closest('.opp');
  const marks = all('.opp > .rmark', 'Aufkleber');
  const tags = [
    ...all('.opp > .tag', 'Etikett'),
    ...all('.opp .botb', 'KI'),
    ...all('.opp .nm', 'Name'),
    ...all('.opp .tb-count > *', 'Zähler'),
  ];
  check(marks, [...tags, ...pills], 0, tile);
  check(pills, tags, 2, tile);
  check(tags, tags, 0, tile);
  return [...out.values()].map((h) => h.msg);
}
