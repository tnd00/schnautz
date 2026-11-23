/* Shithead: lange Hand ohne Scrollen. Karten überlappen, bei sehr vielen in mehreren Reihen. */
import { App } from '../app';
import { $, $opt, isMobile } from '../dom';

const MAX_ROWS = 3;

interface HandRows {
  rows: number;
  per: number;
  slice: number;
}

/** Wie viele Reihen braucht die Hand bei dieser Kartenbreite und wie weit schaut jede Karte heraus? */
function handRows(n: number, hw: number, avail: number, mobile: boolean): HandRows {
  // Jede Karte soll mindestens so weit herausschauen, dass man Wert und Farbe erkennt
  const minSlice = mobile ? Math.max(15, hw * 0.27) : Math.max(20, hw * 0.3);
  let rows = 1;
  let per: number;
  let slice: number;
  for (;;) {
    per = Math.ceil(n / rows);
    slice = per > 1 ? (avail - hw) / (per - 1) : hw;
    if (slice >= minSlice || rows >= MAX_ROWS) break;
    rows++;
  }
  return { rows, per, slice };
}

export function fitHand(): void {
  const el = $opt('#me .shhand');
  if (!el) return;
  el.querySelectorAll('.hbr').forEach((x) => x.remove());
  el.classList.remove('many');
  const cards = Array.from(el.querySelectorAll<HTMLElement>('.card'));
  const n = cards.length;
  cards.forEach((c) => c.classList.remove('r2'));
  if (!n) return;
  const row = el.parentElement as HTMLElement;
  const meEl = $('#me');
  const mcs = getComputedStyle(meEl);
  let avail = meEl.clientWidth - parseFloat(mcs.paddingLeft || '0') - parseFloat(mcs.paddingRight || '0');
  const tc = row.querySelector<HTMLElement>('.tcards');
  if (tc && getComputedStyle(row).flexDirection === 'row') avail -= tc.offsetWidth + 26;
  avail -= 24 + 6;
  const mobile = isMobile();
  let hw = cards[0].offsetWidth || 80;
  let L = handRows(n, hw, avail, mobile);
  // Mobil wird es mit mehreren Reihen eng: kleinere Karten, damit Stapel und Knöpfe Platz behalten
  if (L.rows > 1 && mobile) {
    el.classList.add('many');
    hw = cards[0].offsetWidth || hw;
    L = handRows(n, hw, avail, mobile);
  }
  el.style.setProperty('--ov', Math.max(-0.82, Math.min(-0.06, L.slice / hw - 1)).toFixed(3));
  for (let r = 1; r < L.rows; r++) {
    const first = cards[r * L.per];
    if (!first) break;
    const br = document.createElement('i');
    br.className = 'hbr';
    el.insertBefore(br, first);
    for (let k = r * L.per; k < Math.min(n, (r + 1) * L.per); k++) cards[k].classList.add('r2');
  }
}

function myCardEl(src: 'hand' | 'up', i: number): HTMLElement | null {
  const sel = src === 'hand' ? '#me .shhand .card' : '#me .tcards .upc .card';
  return document.querySelectorAll<HTMLElement>(sel)[i] ?? null;
}

/** Merkt sich, wo die ausgespielten Karten lagen, damit sie von dort zum Stapel fliegen. */
export function grabRects(src: 'hand' | 'up', idx: number[]): void {
  const rects = idx.flatMap((i) => {
    const el = myCardEl(src, i);
    return el ? [el.getBoundingClientRect()] : [];
  });
  App.playRects = rects.length ? { t: Date.now(), src, rects } : null;
}
