/*
 * Abziehen: Beginnt die Partie, zieht sich der gewählte Spiel-Sticker vom Rahmen ab und gibt den Tisch frei.
 * Die Ecke unten rechts löst sich, die weiße Rückseite klappt um, dann fliegt der Sticker weg. Dafür liegt kurz
 * eine Kopie mit festgeschriebenen Stilen über allem. Sie nimmt keine Klicks an, hat keine IDs und keine
 * data-act und räumt sich selbst weg. Der Tisch darunter wird ganz normal gezeichnet.
 * Bei reduzierter Bewegung blendet die Kopie nur aus.
 */
import { $opt, reduceMotion } from './dom';

const PEEL_MS = 900;
const FADE_MS = 280;
/** Bis hierhin löst sich die Ecke, danach fliegt der Sticker weg (Anteil an PEEL_MS) */
const CURL_END = 0.42;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Kopie eines Elements mit allen berechneten Stilen, ohne Knöpfe, IDs und Datenattribute. */
function frozen(src: Element): Element {
  const tag = src.tagName.toLowerCase();
  let out: Element;
  if (src instanceof SVGElement) {
    out = document.createElementNS(SVG_NS, tag);
    // Die Form steckt in den Attributen (viewBox, d, cx), Stile allein reichen nicht
    for (const a of Array.from(src.attributes)) out.setAttribute(a.name, a.value);
  } else {
    out = document.createElement(tag === 'button' || tag === 'a' ? 'div' : tag);
  }
  const cs = getComputedStyle(src);
  const st = (out as HTMLElement | SVGElement).style;
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    st.setProperty(p, cs.getPropertyValue(p));
  }
  // Nichts darf in der Kopie noch einmal anlaufen
  st.setProperty('animation', 'none');
  st.setProperty('transition', 'none');
  st.setProperty('pointer-events', 'none');
  src.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out.append(n.textContent ?? '');
    else if (n instanceof Element) out.append(frozen(n));
  });
  return out;
}

/**
 * Sichtbar, im Bild und obenauf? Nur dann lohnt das Abziehen. Liegt ein Fenster oder das Menü darüber, bliebe die
 * Kopie sonst über dem Fenster stehen.
 */
function onScreen(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 20 || r.height <= 20 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)
    return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && el.contains(hit);
}

/** Der gewählte Spiel-Sticker, wenn er zu sehen ist, sonst der Spielname oben im Kopf. */
function anchor(): HTMLElement | null {
  for (const sel of ['#scr-lobby .lgs.on', '#scr-lobby .lchosen .lgs', 'body.inlobby .top .brand']) {
    const el = $opt(sel);
    if (onScreen(el)) return el;
  }
  return null;
}

/** Klebende Fläche ohne die abgezogene Ecke: alles links oberhalb der Linie x + y = w + h - d (mit Rand für Schatten). */
const cut = (w: number, h: number, d: number, m = 48): string =>
  `polygon(${-m}px ${-m}px, ${w + m}px ${-m}px, ${w + m}px ${h - d - m}px, ${w - d - m}px ${h + m}px, ${-m}px ${h + m}px)`;

/**
 * Zieht den gewählten Spiel-Sticker ab. Muss laufen, solange die Lobby noch zu sehen ist, also direkt bevor
 * der Tisch sie ersetzt.
 */
export function peelChosen(): void {
  const el = anchor();
  if (!el) return;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) return;

  const layer = document.createElement('div');
  layer.className = 'st-peel';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    left: `${r.left + r.width / 2 - w / 2}px`,
    top: `${r.top + r.height / 2 - h / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
    rotate: cs.rotate,
    scale: cs.scale,
  });
  const face = frozen(el) as HTMLElement;
  face.classList.add('st-peel-face');
  // Lage und Drehung trägt die Ebene, die Kopie füllt sie nur aus
  for (const p of ['position', 'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom']) {
    face.style.removeProperty(p);
  }
  for (const p of ['margin-left', 'width', 'height', 'rotate', 'scale', 'translate', 'transform', 'z-index']) {
    face.style.removeProperty(p);
  }
  layer.append(face);

  const calm = reduceMotion();
  // Die umgeklappte Ecke: ein Quadrat unten rechts, dessen obere linke Hälfte die Rückseite des Stickers zeigt
  const k = Math.round(Math.min(w, h) * 0.62);
  const fold = document.createElement('div');
  fold.className = 'st-peel-fold';
  fold.style.width = fold.style.height = `${k}px`;
  fold.style.setProperty('--r', cs.borderBottomRightRadius);
  fold.append(document.createElement('i'));
  if (!calm) layer.append(fold);
  document.body.append(layer);

  const done = () => layer.remove();
  const safety = setTimeout(done, (calm ? FADE_MS : PEEL_MS) + 400);
  const end = (a: Animation) =>
    a.finished.then(
      () => {
        clearTimeout(safety);
        done();
      },
      () => done(),
    );

  if (calm) {
    end(layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' }));
    return;
  }

  // Erst gleitet die Schnittlinie durch den Schatten bis an die Ecke, dann löst sich die Ecke
  const m = 48;
  const atCorner = (2 * m) / (2 * m + k);
  const tc = CURL_END * atCorner;
  const curl = 'cubic-bezier(0.25, 0.7, 0.35, 1)';
  const flick = 'cubic-bezier(0.55, 0, 0.8, 0.2)';
  face.animate(
    [
      { offset: 0, clipPath: cut(w, h, -2 * m, m), easing: 'linear' },
      { offset: tc, clipPath: cut(w, h, 0, m), easing: curl },
      { offset: CURL_END, clipPath: cut(w, h, k, m) },
      { offset: 1, clipPath: cut(w, h, k, m) },
    ],
    { duration: PEEL_MS, fill: 'forwards' },
  );
  fold.animate(
    [
      { offset: 0, transform: 'scale(0)' },
      { offset: tc, transform: 'scale(0)', easing: curl },
      { offset: CURL_END, transform: 'scale(1)' },
      { offset: 1, transform: 'scale(1)' },
    ],
    { duration: PEEL_MS, fill: 'forwards' },
  );
  end(
    layer.animate(
      [
        { offset: 0, transform: 'none', opacity: 1, filter: 'drop-shadow(0 0 0 rgba(26, 24, 48, 0))', easing: curl },
        {
          offset: CURL_END,
          transform: 'translate(0, -10px) scale(1.04)',
          opacity: 1,
          filter: 'drop-shadow(0 14px 14px rgba(26, 24, 48, 0.32))',
          easing: flick,
        },
        { offset: 0.72, opacity: 1 },
        {
          offset: 1,
          transform: `translate(${Math.round(w * 0.18)}px, ${-Math.round(h * 0.9 + 90)}px) rotate(11deg) scale(0.9)`,
          opacity: 0,
          filter: 'drop-shadow(0 30px 26px rgba(26, 24, 48, 0.2))',
        },
      ],
      { duration: PEEL_MS, fill: 'forwards' },
    ),
  );
}
