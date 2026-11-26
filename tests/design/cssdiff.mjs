/*
 * CSS-Vergleich: Wächter für den Umbau der Stile auf Tokens. Liest das Haupt-CSS (src/styles/index.css samt aller
 * @import in Reihenfolge) einmal aus git und einmal aus dem Arbeitsbaum, lädt beide Fassungen in Chromium und
 * vergleicht jede Regel über ihre im Browser aufgelösten Langformen. Kein Vite, kein TypeScript, damit halbfertige
 * Arbeit anderer an src/**.ts nicht stört. Aufrufe und Grenzen stehen in README.md im selben Ordner.
 *
 *   node tests/design/cssdiff.mjs [--base=cfb5e08] [--only=fit.css,lobby.css] [--out=<ordner>] [--selftest]
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STYLES = join(REPO, 'src/styles');
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BASE = arg('base', 'cfb5e08');
const OUT = resolve(arg('out', '/Users/tnd/schnautz-2-8/r2/cssdiff'));
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SELFTEST = process.argv.includes('--selftest');

const GAMES = ['shithead', 'schnautz', 'durak', 'cabo'];
const CTXS = ['lobby', ...GAMES];
/** Regeln dieser Datei sind in Runde 2 neu und kein Fehler. */
const EXPECTED_NEW = new Set(['a11y.css']);
const ERRORS = new Set([
  'geändert',
  'fehlt',
  'neu',
  'reihenfolge',
  'unaufgelöst',
  'import-fehlt',
  'import-reihenfolge',
  'datei-fehlt',
  'Verlauf-Raum',
  'Kontext',
]);

// ---------- Text: Kommentare, Blöcke, Listen ----------

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Teilt an `sep` auf oberster Ebene (nicht in Klammern oder Anführungszeichen). */
function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0,
    q = '',
    last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '\\') i++;
      else if (ch === q) q = '';
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      out.push(s.slice(last, i));
      last = i + 1;
    }
  }
  out.push(s.slice(last));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Blöcke auf oberster Ebene eines CSS-Texts: Anfang (samt Kommentaren davor), öffnende Klammer, Ende. */
function blocks(text) {
  const out = [];
  let depth = 0,
    q = '',
    start = 0,
    open = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '\\') i++;
      else if (ch === q) q = '';
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '{') {
      if (depth++ === 0) open = i;
    } else if (ch === '}') {
      if (--depth === 0) {
        const prelude = stripComments(text.slice(start, open)).trim().replace(/\s+/g, ' ');
        out.push({ start, open, end: i + 1, sel: prelude, body: text.slice(open + 1, i) });
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) start = i + 1;
  }
  return out;
}

const declNames = (body) =>
  splitTop(stripComments(body), ';')
    .map((d) => d.slice(0, d.indexOf(':')).trim())
    .filter(Boolean);

// ---------- Quellen ----------

const IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?[^;]*;/g;

/** Liest eine Datei relativ zu src/styles aus git. */
const gitSource = (base) => (rel) => {
  try {
    return execFileSync('git', ['show', `${base}:src/styles/${rel}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};
const dirSource = (root) => (rel) => {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

/** Alle Dateien ab index.css in der Reihenfolge, in der der Browser sie anwendet (innere @import zuerst). */
function collect(read) {
  const files = [],
    seen = new Set(),
    missing = [];
  let imports = [];
  const visit = (rel, from) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const text = read(rel);
    if (text == null) return void missing.push({ file: rel, from });
    const list = [...stripComments(text).matchAll(IMPORT)].map((m) =>
      posix.normalize(posix.join(posix.dirname(rel), m[1])),
    );
    if (rel === 'index.css') imports = list;
    for (const r of list) visit(r, rel);
    files.push({ file: rel, css: text.replace(IMPORT, ''), raw: text });
  };
  visit('index.css');
  return { files, imports, missing };
}

// ---------- Im Browser: CSSOM ablaufen und Werte auflösen ----------

/* Läuft in der Seite. Jede Datei als eigenes <style>, die Probe sitzt in einem Shadow-Root, damit keine Regel des
   Blatts sie trifft. Sie erbt nur Variablen und vererbte Werte aus dem Kontext. */
function extractInPage({ files, ctxs }) {
  document.head.replaceChildren();
  const sheets = files.map((f) => {
    const s = document.createElement('style');
    s.dataset.file = f.file;
    s.textContent = f.css;
    document.head.append(s);
    return { file: f.file, sheet: s.sheet };
  });
  document.body.innerHTML = '<div id="table"><div id="cx-g"></div></div><div id="cx-l"></div><div id="cx-k"></div>';
  const table = document.getElementById('table');
  const roots = Object.fromEntries(
    ['l', 'g', 'k'].map((k) => [k, document.getElementById(`cx-${k}`).attachShadow({ mode: 'open' })]),
  );
  /* Jede Regel auf einer frischen Probe: Eine Probe, die schon Stil hatte, startet sonst Übergänge (transition) und
     getComputedStyle liefert den Startwert vom Stil der vorigen Regel. */
  const probeWith = (k, cssText) => {
    const p = document.createElement('i');
    p.style.cssText = cssText;
    roots[k].replaceChildren(p);
    return getComputedStyle(p);
  };
  const scratch = document.createElement('div');
  const cache = new Map();
  const longhands = (name) => {
    if (name.startsWith('--')) return [name];
    let l = cache.get(name);
    if (!l) {
      scratch.style.cssText = `${name}: inherit`;
      l = Array.from({ length: scratch.style.length }, (_, i) => scratch.style.item(i));
      if (!l.length) l = [name];
      cache.set(name, l);
    }
    return l;
  };
  const split = (s) => {
    const out = [];
    let depth = 0,
      q = '',
      last = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '\\') i++;
        else if (ch === q) q = '';
      } else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ';' && depth === 0) {
        out.push(s.slice(last, i));
        last = i + 1;
      }
    }
    out.push(s.slice(last));
    return out.map((x) => x.trim()).filter(Boolean);
  };

  const rules = [];
  const walk = (list, chain, file) => {
    for (const r of list) {
      if (r instanceof CSSStyleRule) {
        rules.push({ file, chain, type: 'style', sel: r.selectorText, st: r.style });
        if (r.cssRules?.length) walk(r.cssRules, [...chain, `& ${r.selectorText}`], file);
      } else if (r instanceof CSSKeyframesRule) {
        for (const k of r.cssRules)
          rules.push({
            file,
            chain: [...chain, `@keyframes ${r.name}`],
            type: 'keyframe',
            sel: k.keyText,
            st: k.style,
          });
      } else if (r instanceof CSSFontFaceRule) {
        const g = (p) => r.style.getPropertyValue(p);
        rules.push({
          file,
          chain: [...chain, '@font-face'],
          type: 'text',
          sel: `${g('font-family')} ${g('font-weight')} ${g('font-style')}`.trim(),
          text: r.style.cssText,
        });
      } else if (r.cssRules) walk(r.cssRules, [...chain, r.cssText.slice(0, r.cssText.indexOf('{')).trim()], file);
      else rules.push({ file, chain, type: 'text', sel: r.cssText.split('{')[0].trim().slice(0, 80), text: r.cssText });
    }
  };
  for (const s of sheets) walk(s.sheet.cssRules, [], s.file);

  // Deklarationen je Regel vorbereiten: Langformen, !important, Variablen ohne Ersatzwert
  for (const r of rules) {
    if (!r.st) continue;
    r.decls = split(r.st.cssText).map((d) => {
      const c = d.indexOf(':');
      const name = d.slice(0, c).trim();
      let spec = d.slice(c + 1).trim();
      const imp = /!\s*important$/i.test(spec);
      if (imp) spec = spec.replace(/\s*!\s*important$/i, '');
      const refs = [...spec.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]);
      const reads = [...spec.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
      return { name, spec, imp, refs, reads, lh: longhands(name) };
    });
    r.props = {};
    for (const d of r.decls) for (const lh of d.lh) r.props[lh] = { spec: d.spec, imp: d.imp, v: [], miss: [] };
  }

  /* Kontexte: Regeln, die unterhalb von :root Variablen setzen (etwa .paper.sheet mit --display). Ein Token auf
     :root folgt dem nicht. Die Probe sitzt dafür unter einem Wirt, der die Variablen der Regel inline trägt. */
  const rootOnly = (sel) => topParts(sel).every((p) => /^(html|:root)[^\s>+~]*$/.test(p));
  function topParts(sel) {
    const out = [];
    let depth = 0,
      last = 0;
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] === '(' || sel[i] === '[') depth++;
      else if (sel[i] === ')' || sel[i] === ']') depth--;
      else if (sel[i] === ',' && depth === 0) {
        out.push(sel.slice(last, i).trim());
        last = i + 1;
      }
    }
    out.push(sel.slice(last).trim());
    return out;
  }
  const kctx = new Map();
  for (const r of rules) {
    if (r.type !== 'style' || rootOnly(r.sel)) continue;
    if (!r.chain.every((c) => c.startsWith('@media ') && matchMedia(c.slice(7)).matches)) continue;
    const own = r.decls.filter((d) => d.name.startsWith('--'));
    if (!own.length) continue;
    const k = [...r.chain, r.sel].join(' » ');
    kctx.set(k, [...(kctx.get(k) ?? []), ...own]);
  }
  const kvars = new Set([...kctx.values()].flat().map((d) => d.name));
  const host = document.getElementById('cx-k');
  document.body.className = '';
  table.removeAttribute('data-game');
  const reading = rules.filter(
    (r) => r.st && r.decls.some((d) => d.reads.some((n) => n.startsWith('--tb-') || kvars.has(n))),
  );
  for (const [k, decls] of kctx) {
    host.style.cssText = decls.map((d) => `${d.name}: ${d.spec}`).join('; ');
    for (const r of reading) {
      const cs = probeWith('k', r.st.cssText);
      for (const d of r.decls) {
        const miss = d.refs.some((n) => cs.getPropertyValue(n) === '');
        for (const lh of d.lh) (r.props[lh].k ??= {})[k] = miss ? null : cs.getPropertyValue(lh);
      }
    }
  }
  host.style.cssText = '';

  ctxs.forEach((ctx, ci) => {
    const lobby = ctx === 'lobby';
    document.body.className = lobby ? '' : `ingame g-${ctx}`;
    if (lobby) table.removeAttribute('data-game');
    else table.dataset.game = ctx;

    for (const r of rules) {
      if (!r.st) continue;
      const cs = probeWith(lobby ? 'l' : 'g', r.st.cssText);
      for (const d of r.decls) {
        const miss = d.refs.filter((n) => cs.getPropertyValue(n) === '');
        for (const lh of d.lh) {
          r.props[lh].v[ci] = miss.length ? null : cs.getPropertyValue(lh);
          if (miss.length) r.props[lh].miss[ci] = miss.join(' ');
        }
      }
    }
  });

  return rules.map((r, i) => ({
    i,
    file: r.file,
    chain: r.chain,
    type: r.type,
    sel: r.sel,
    text: r.text,
    props: r.props,
  }));
}

/* Läuft in der Seite. Prüft Paare unterschiedlicher Variablenwerte, ob sie als Farbe, Schatten oder Verlauf gleich
   ausfallen. Liefert je Paar die aufgelösten Werte der ersten Eigenschaft, die beide annimmt. */
function resolveCustomInPage(pairs) {
  const e = document.createElement('i');
  document.body.append(e);
  const tries = ['color', 'box-shadow', 'background-image', 'transform', 'font-family', 'width', 'transition'];
  const out = pairs.map(([a, b]) => {
    for (const p of tries) {
      e.style.cssText = '';
      e.style.setProperty(p, a);
      if (!e.style.getPropertyValue(p)) continue;
      const va = getComputedStyle(e).getPropertyValue(p);
      e.style.cssText = '';
      e.style.setProperty(p, b);
      if (!e.style.getPropertyValue(p)) continue;
      return [va, getComputedStyle(e).getPropertyValue(p)];
    }
    return null;
  });
  e.remove();
  return out;
}

// ---------- Werte mit Toleranz vergleichen ----------

const COLOR = /rgba?\([^)]*\)|color\(srgb [^)]*\)|oklab\([^)]*\)/g;
const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/** Farbe aus Chromium auf sRGB 0 bis 255 und Alpha 0 bis 1. */
function toRGBA(m) {
  const [main, alpha] = m.slice(m.indexOf('(') + 1, -1).split('/');
  const n = main
    .replace(/^srgb\s+/, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const a = alpha != null ? Number(alpha) : n.length > 3 ? n[3] : 1;
  if (m.startsWith('color(')) return [n[0] * 255, n[1] * 255, n[2] * 255, a];
  if (m.startsWith('oklab(')) {
    const [L, A, B] = n;
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
    ];
    return [...rgb.map((x) => gamma(Math.min(1, Math.max(0, x))) * 255), a];
  }
  return [n[0], n[1], n[2], a];
}

const GRADIENT = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\(/g;
const SPACE = /(?:^|\s)in\s+([a-z0-9-]+(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?)/;
/* Ohne Angabe rechnet Chrome einen Verlauf in sRGB, ist aber ein Farbstopp nicht klassisch (color(srgb …) aus
   color-mix(), oklab() und so weiter), in Oklab. Den so geltenden Raum lässt Chrome in der Ausgabe weg. */
const MODERN = /\b(?:color|color-mix|oklab|oklch|lab|lch|hwb)\(/;

/** Verläufe ohne Angabe „in <raum>“ und der Raum, in dem jeder Verlauf tatsächlich gerechnet wird. */
function gradients(s) {
  const spaces = [];
  let out = '',
    last = 0;
  for (const m of s.matchAll(GRADIENT)) {
    if (m.index < last) continue;
    const open = m.index + m[0].length - 1;
    const end = close(s, open, '(', ')');
    const args = splitTop(s.slice(open + 1, end));
    const sp = SPACE.exec(args[0] ?? '');
    if (sp) {
      args[0] = args[0].replace(SPACE, '').trim();
      if (!args[0]) args.shift();
    }
    spaces.push(
      sp ? sp[1].replace(/\s+/g, ' ').replace(SRGB_MARK, 'srgb') : MODERN.test(s.slice(open, end)) ? 'oklab' : 'srgb',
    );
    out += `${s.slice(last, open + 1)}${args.join(', ')})`;
    last = end + 1;
  }
  return { text: out + s.slice(last), spaces };
}
/* Chrome lässt beim Serialisieren der Regel (cssText, aus dem die Probe liest) ein ausdrückliches „in srgb“ fallen,
   auch wenn ein Stopp aus color-mix() kommt. Vor dem Laden wird es deshalb zu „in xyz-d50“, das bleibt stehen und
   zählt hier wieder als sRGB. */
const SRGB_MARK = 'xyz-d50';
function markSrgb(css) {
  if (css.includes(SRGB_MARK))
    throw new Error(`${SRGB_MARK} kommt im CSS vor, die Markierung für „in srgb“ geht nicht`);
  let out = '',
    last = 0;
  for (const m of css.matchAll(GRADIENT)) {
    if (m.index < last) continue;
    const open = m.index + m[0].length - 1;
    const end = close(css, open, '(', ')');
    const first = splitTop(css.slice(open + 1, end))[0] ?? '';
    const head = css.slice(open + 1, open + 1 + css.slice(open + 1).indexOf(first) + first.length);
    out += css.slice(last, open + 1) + head.replace(/(^|\s)in\s+srgb(?![\w-])/, `$1in ${SRGB_MARK}`);
    last = open + 1 + head.length;
  }
  return out + css.slice(last);
}
const unmark = (v) => (typeof v === 'string' ? v.replaceAll(`in ${SRGB_MARK}`, 'in srgb') : v);
const spaceDiff = (a, b) => gradients(a).spaces.join() !== gradients(b).spaces.join();

function canon(s) {
  const colors = [],
    nums = [];
  const skel = gradients(s)
    .text.replace(COLOR, (m) => {
      colors.push(toRGBA(m));
      return '§C';
    })
    .replace(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g, (m) => {
      nums.push(Number(m));
      return '§N';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { skel, colors, nums };
}

/** Gleich bis 1 je Farbkanal und 0,01 Alpha, Zahlen bis 0,01. Ganz durchsichtige Farben sind immer gleich. */
function same(a, b) {
  if (a === b) return true;
  const x = canon(a),
    y = canon(b);
  if (x.skel !== y.skel || x.colors.length !== y.colors.length || x.nums.length !== y.nums.length) return false;
  for (let i = 0; i < x.nums.length; i++) if (Math.abs(x.nums[i] - y.nums[i]) > 0.01) return false;
  for (let i = 0; i < x.colors.length; i++) {
    const [p, q] = [x.colors[i], y.colors[i]];
    if (Math.abs(p[3] - q[3]) > 0.01) return false;
    if (p[3] <= 0.01 && q[3] <= 0.01) continue;
    for (let k = 0; k < 3; k++) if (Math.abs(p[k] - q[k]) > 1.0001) return false;
  }
  return true;
}

// ---------- Regeln zuordnen ----------

const RM = /\(prefers-reduced-motion:\s*reduce\)/;
/** Selektor ohne Ruhig-Marke (`:where(html.calm) x`, `html:where(.calm)`, `:root:where(.calm)`), sonst null. */
function stripCalm(s) {
  if (s.startsWith(':where(html.calm) ')) return s.slice(18);
  const m = /^(html|:root)([^\s>+~]*?):where\(\.calm\)/.exec(s);
  return m ? s.replace(':where(.calm)', '') : null;
}

/** Schlüssel aus Kontext, Art und Selektor. Ein Block unter prefers-reduced-motion und die Form mit
    :where(html.calm) bekommen denselben Schlüssel. */
function keyOf(r) {
  let calm = false;
  const chain = [];
  for (const c of r.chain) {
    if (c.startsWith('@media') && RM.test(c)) {
      calm = true;
      const rest = c
        .slice(6)
        .replace(/\s+and\s+\(prefers-reduced-motion:\s*reduce\)/, '')
        .replace(/\(prefers-reduced-motion:\s*reduce\)\s+and\s+/, '')
        .trim();
      if (!RM.test(rest)) chain.push(`@media ${rest}`);
    } else chain.push(c);
  }
  let sel = r.sel;
  if (r.type === 'style') {
    const parts = splitTop(sel).map(stripCalm);
    if (parts.every((p) => p !== null)) {
      calm = true;
      sel = parts.join(', ');
    }
  }
  return `${r.type}|${chain.join(' » ')}|${calm ? 'calm' : ''}|${sel}`;
}

const sig = (r) =>
  r.text ??
  Object.entries(r.props)
    .map(([k, v]) => `${k}:${v.spec}${v.imp ? '!' : ''}`)
    .join(';');

/** Paare je Schlüssel: erst längste gemeinsame Folge mit gleichem Inhalt, der Rest der Reihe nach. */
function pairUp(A, B) {
  const sa = A.map(sig),
    sb = B.map(sig);
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      L[i][j] = sa[i] === sb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = [],
    ra = [],
    rb = [];
  let i = 0,
    j = 0;
  while (i < A.length && j < B.length) {
    if (sa[i] === sb[j]) pairs.push([A[i++], B[j++]]);
    else if (L[i + 1][j] >= L[i][j + 1]) ra.push(A[i++]);
    else rb.push(B[j++]);
  }
  ra.push(...A.slice(i));
  rb.push(...B.slice(j));
  const n = Math.min(ra.length, rb.length);
  for (let k = 0; k < n; k++) pairs.push([ra[k], rb[k]]);
  return { pairs, gone: ra.slice(n), added: rb.slice(n) };
}

// ---------- Spezifität für die Reihenfolge ----------

function close(s, i, o, c) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === o) d++;
    else if (s[k] === c && --d === 0) return k;
  }
  return s.length - 1;
}
const ident = (s, i) => {
  while (i < s.length && /[\w-]|\\/.test(s[i])) i += s[i] === '\\' ? 2 : 1;
  return i;
};
const OLD_PE = new Set(['before', 'after', 'first-line', 'first-letter']);
function maxSpec(list) {
  let best = [0, 0, 0];
  for (const s of splitTop(list)) {
    const x = specOf(s).abc;
    if (x[0] > best[0] || (x[0] === best[0] && (x[1] > best[1] || (x[1] === best[1] && x[2] > best[2])))) best = x;
  }
  return best;
}
/** Spezifität eines einfachen Selektors und sein Pseudo-Element (zwei Regeln mit anderem treffen nie dasselbe). */
function specOf(s) {
  let a = 0,
    b = 0,
    c = 0,
    pe = '',
    i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#') {
      a++;
      i = ident(s, i + 1);
    } else if (ch === '.') {
      b++;
      i = ident(s, i + 1);
    } else if (ch === '[') {
      b++;
      i = close(s, i, '[', ']') + 1;
    } else if (ch === ':' && s[i + 1] === ':') {
      const j = ident(s, i + 2);
      pe = s.slice(i + 2, j);
      c++;
      i = s[j] === '(' ? close(s, j, '(', ')') + 1 : j;
    } else if (ch === ':') {
      const j = ident(s, i + 1);
      const name = s.slice(i + 1, j).toLowerCase();
      i = j;
      if (OLD_PE.has(name)) {
        pe = name;
        c++;
      } else if (s[i] === '(') {
        const k = close(s, i, '(', ')');
        const inner = s.slice(i + 1, k);
        i = k + 1;
        if (name === 'where') continue;
        const m = ['is', 'not', 'has', 'matches'].includes(name)
          ? maxSpec(inner)
          : name.startsWith('nth-') && / of /.test(inner)
            ? maxSpec(inner.split(/ of /)[1]).map((x, n) => x + (n === 1 ? 1 : 0))
            : [0, 1, 0];
        a += m[0];
        b += m[1];
        c += m[2];
      } else b++;
    } else if (/[A-Za-z_-]/.test(ch)) {
      c++;
      i = ident(s, i);
    } else i++;
  }
  return { abc: [a, b, c], pe };
}
const specsOf = (sel) => splitTop(sel).map((s) => specOf(s));
const specKey = (x) => `${x.abc.join(',')}${x.pe}`;

// ---------- Vergleich ----------

const where = (r) => (r.chain.length ? `${r.chain.join(' » ')} ` : '') + r.sel;
const firstVal = (p) => p?.v.find((x) => x != null) ?? p?.spec;

async function compare(page, base, next) {
  const findings = [];
  const add = (f) => findings.push({ ...f, alt: unmark(f.alt), neu: unmark(f.neu) });

  // Imports in index.css
  const bi = base.imports,
    ni = next.imports;
  for (const f of bi.filter((x) => !ni.includes(x))) add({ kind: 'import-fehlt', file: 'index.css', sel: f });
  for (const f of ni.filter((x) => !bi.includes(x))) add({ kind: 'import-neu', file: 'index.css', sel: f });
  const cb = bi.filter((x) => ni.includes(x)),
    cn = ni.filter((x) => bi.includes(x));
  if (cb.join() !== cn.join())
    add({ kind: 'import-reihenfolge', file: 'index.css', sel: 'Imports', alt: cb.join(' '), neu: cn.join(' ') });
  for (const m of next.missing) add({ kind: 'datei-fehlt', file: m.file, sel: `importiert in ${m.from}` });

  // Zuordnen
  const groups = new Map();
  const put = (r, side) => {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, { A: [], B: [] });
    groups.get(k)[side].push(r);
  };
  base.rules.forEach((r) => put(r, 'A'));
  next.rules.forEach((r) => put(r, 'B'));
  const pairs = [];
  for (const { A, B } of groups.values()) {
    const res = pairUp(A, B);
    pairs.push(...res.pairs);
    for (const r of res.gone) add({ kind: 'fehlt', file: r.file, sel: where(r) });
    for (const r of res.added)
      add({ kind: EXPECTED_NEW.has(r.file) ? 'neu-erwartet' : 'neu', file: r.file, sel: where(r) });
  }

  // Werte je Paar, Variablen mit anderem Text erst im Browser nachprüfen
  const custom = [];
  for (const [a, b] of pairs) {
    if (a.file !== b.file) add({ kind: 'verschoben', file: b.file, from: a.file, sel: where(b) });
    if (a.type === 'text') {
      if (a.text !== b.text)
        add({ kind: 'geändert', file: b.file, sel: where(b), prop: '(Text)', alt: a.text, neu: b.text });
      continue;
    }
    for (const lh of new Set([...Object.keys(a.props), ...Object.keys(b.props)])) {
      const pa = a.props[lh],
        pb = b.props[lh];
      const base = { file: b.file, sel: where(b), prop: lh };
      if (!pa || !pb) {
        add({ kind: 'geändert', ...base, alt: pa ? firstVal(pa) : '(fehlt)', neu: pb ? firstVal(pb) : '(fehlt)' });
        continue;
      }
      if (pa.imp !== pb.imp) {
        add({
          kind: 'geändert',
          ...base,
          alt: `${pa.spec}${pa.imp ? ' !important' : ''}`,
          neu: `${pb.spec}${pb.imp ? ' !important' : ''}`,
        });
        continue;
      }
      const diff = { ctx: [], alt: null, neu: null },
        unres = { ctx: [], vars: null },
        space = { ctx: [], alt: null, neu: null };
      CTXS.forEach((ctx, c) => {
        const va = pa.v[c],
          vb = pb.v[c];
        if (va != null && vb == null) {
          unres.ctx.push(ctx);
          unres.vars ??= pb.miss[c];
        } else if (va != null && vb != null) {
          if (same(va, vb)) {
            // Verlauf-Raum nur an Regeln, die den Verlauf zeichnen, eine Variable wirkt erst dort
            if (lh.startsWith('--') || !spaceDiff(va, vb)) return;
            space.ctx.push(ctx);
            space.alt ??= va;
            space.neu ??= vb;
            return;
          }
          if (lh.startsWith('--')) return void custom.push({ ...base, ctx, alt: va, neu: vb });
          diff.ctx.push(ctx);
          diff.alt ??= va;
          diff.neu ??= vb;
        } else if (pa.spec.replace(/\s+/g, ' ') !== pb.spec.replace(/\s+/g, ' ')) {
          diff.ctx.push(ctx);
          diff.alt ??= va ?? `(nicht auflösbar) ${pa.spec}`;
          diff.neu ??= vb ?? `(nicht auflösbar) ${pb.spec}`;
        }
      });
      if (diff.ctx.length) add({ kind: 'geändert', ...base, ...diff });
      if (space.ctx.length) add({ kind: 'Verlauf-Raum', ...base, ...space });
      // Unter Regeln, die Variablen unterhalb von :root setzen, nur melden, was sonst gleich ist
      if (!diff.ctx.length && !unres.ctx.length && pa.k && pb.k) {
        const kd = { ctx: [], alt: null, neu: null };
        for (const k of Object.keys(pa.k)) {
          const va = pa.k[k],
            vb = pb.k[k];
          if (va == null || vb == null || same(va, vb)) continue;
          if (lh.startsWith('--')) {
            custom.push({ ...base, kind: 'Kontext', ctx: k, alt: va, neu: vb });
            continue;
          }
          kd.ctx.push(k);
          kd.alt ??= va;
          kd.neu ??= vb;
        }
        if (kd.ctx.length) add({ kind: 'Kontext', ...base, ...kd });
      }
      if (unres.ctx.length)
        add({ kind: 'unaufgelöst', ...base, ctx: unres.ctx, alt: firstVal(pa), neu: pb.spec, vars: unres.vars });
    }
  }
  if (custom.length) {
    const res = await page.evaluate(
      resolveCustomInPage,
      custom.map((c) => [c.alt, c.neu]),
    );
    const merged = new Map();
    custom.forEach((c, i) => {
      const kind = c.kind ?? 'geändert';
      if (res[i] && same(res[i][0], res[i][1])) return;
      const k = `${kind}|${c.file}|${c.sel}|${c.prop}`;
      if (!merged.has(k))
        merged.set(k, { kind, file: c.file, sel: c.sel, prop: c.prop, ctx: [], alt: c.alt, neu: c.neu });
      merged.get(k).ctx.push(c.ctx);
    });
    for (const f of merged.values()) add(f);
  }

  // Reihenfolge: zwei zugeordnete Regeln stehen umgekehrt und konkurrieren um mindestens eine Langform
  const P = pairs
    .filter(([a]) => a.type !== 'text')
    .map(([a, b]) => ({
      a,
      b,
      keys: a.type === 'style' ? new Set(specsOf(b.sel).map(specKey)) : null,
      chain: a.chain.join('»'),
    }))
    .sort((x, y) => x.a.i - y.a.i);
  for (let x = 0; x < P.length; x++)
    for (let y = x + 1; y < P.length; y++) {
      const p = P[x],
        q = P[y];
      if (q.b.i > p.b.i || p.a.type !== q.a.type) continue;
      if (p.a.type === 'keyframe' && (p.chain !== q.chain || p.a.sel !== q.a.sel)) continue;
      if (p.keys && ![...p.keys].some((k) => q.keys.has(k))) continue;
      const props = Object.keys(p.b.props).filter((k) => q.b.props[k] && q.b.props[k].imp === p.b.props[k].imp);
      if (props.length)
        add({
          kind: 'reihenfolge',
          file: q.b.file,
          sel: where(q.b),
          vor: { file: p.b.file, sel: where(p.b) },
          props,
        });
    }
  return findings;
}

// ---------- Laden und Ausgabe ----------

async function load(page, read) {
  const { files, imports, missing } = collect(read);
  const rules = await page.evaluate(extractInPage, {
    files: files.map(({ file, css }) => ({ file, css: markSrgb(css) })),
    ctxs: CTXS,
  });
  return { files, imports, missing, rules };
}

const matchesOnly = (f) =>
  !ONLY.length ||
  [f.file, f.from, f.vor?.file].some(
    (x) => x && ONLY.some((o) => x === o || x.endsWith(`/${o}`) || posix.basename(x) === o),
  );

function tally(findings) {
  const kinds = {},
    files = {};
  for (const f of findings) {
    kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    if (ERRORS.has(f.kind)) files[f.file] = (files[f.file] ?? 0) + 1;
  }
  return { kinds, files, errors: findings.filter((f) => ERRORS.has(f.kind)).length };
}

const short = (s, n = 70) => {
  const t = String(s ?? '').replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
function line(f) {
  const ctx = f.ctx?.length && f.ctx.length < CTXS.length ? ` [${f.ctx.join(',')}]` : '';
  if (f.kind === 'reihenfolge')
    return `${f.kind} ${f.file} ${short(f.sel, 50)} steht jetzt vor ${f.vor.file} ${short(f.vor.sel, 50)} (${f.props.slice(0, 3).join(',')})`;
  if (f.kind === 'verschoben') return `${f.kind} ${f.from} -> ${f.file} ${short(f.sel)}`;
  if (f.prop)
    return `${f.kind} ${f.file} ${short(f.sel, 50)} ${f.prop}: ${short(f.alt, 40)} -> ${short(f.neu, 40)}${ctx}`;
  return `${f.kind} ${f.file} ${short(f.sel, 90)}`;
}

function report(findings, head, ms, file) {
  const shown = findings.filter(matchesOnly);
  const t = tally(shown);
  const lines = [head + `, ${(ms / 1000).toFixed(1)} s${ONLY.length ? `, nur ${ONLY.join(',')}` : ''}`];
  const kinds = Object.entries(t.kinds);
  lines.push(`Befunde ${t.errors}, je Art: ${kinds.length ? kinds.map(([k, n]) => `${k} ${n}`).join(', ') : 'keine'}`);
  const byFile = Object.entries(t.files).sort((a, b) => b[1] - a[1]);
  if (byFile.length) lines.push(`Je Datei: ${byFile.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const moved = shown.filter((f) => f.kind === 'verschoben');
  if (moved.length) {
    const m = {};
    for (const f of moved) m[`${f.from} -> ${f.file}`] = (m[`${f.from} -> ${f.file}`] ?? 0) + 1;
    lines.push(
      `Verschoben (kein Fehler): ${Object.entries(m)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')}`,
    );
  }
  const errs = shown.filter((f) => ERRORS.has(f.kind));
  const info = shown.filter((f) => !ERRORS.has(f.kind) && f.kind !== 'verschoben');
  for (const f of [...errs, ...info].slice(0, 38 - lines.length)) lines.push(`  ${line(f)}`);
  lines.push(`JSON: ${file}`);
  console.log(lines.join('\n'));
  return t.errors;
}

// ---------- Selbsttest ----------

const NON_TOKEN = (f) => !/tokens/.test(f) && f !== 'index.css';

/** Ersetzt den ersten Treffer von `re` in der ersten passenden Datei. */
function mutateFirst(map, re, fn, pick = NON_TOKEN) {
  for (const [file, text] of map) {
    if (!pick(file)) continue;
    const m = re.exec(text);
    if (!m) continue;
    map.set(file, text.slice(0, m.index) + fn(m) + text.slice(m.index + m[0].length));
    return `${file}: ${short(m[0], 60)}`;
  }
  throw new Error(`kein Treffer für ${re}`);
}

const calmSel = (s) =>
  /^(html|:root)\b/.test(s) ? s.replace(/^((?:html|:root)[^\s>+~]*)/, '$1:where(.calm)') : `:where(html.calm) ${s}`;

/** Schreibt jeden Block @media (prefers-reduced-motion: reduce) in die Form mit :where(html.calm) um. */
function calmify(text) {
  const bl = blocks(text).filter((b) => b.sel.startsWith('@media') && RM.test(b.sel));
  for (const b of bl.reverse()) {
    const inner = blocks(b.body)
      .map((ib) => {
        if (ib.sel.startsWith('@')) throw new Error(`verschachtelte Regel in ${b.sel}`);
        return `${splitTop(ib.sel).map(calmSel).join(',\n')} {${ib.body}}`;
      })
      .join('\n');
    const rest = b.sel
      .slice(6)
      .replace(/\s+and\s+\(prefers-reduced-motion:\s*reduce\)/, '')
      .replace(/\(prefers-reduced-motion:\s*reduce\)\s+and\s+/, '')
      .trim();
    const out = RM.test(rest) ? inner : `@media ${rest} {\n${inner}\n}`;
    text = text.slice(0, b.start) + '\n' + out + text.slice(b.end);
  }
  return text;
}

/** Eine Grundregel, die später in derselben Datei unter @media mit gemeinsamer Eigenschaft überschrieben wird. */
function moveBehindOverride(map) {
  const top = new Map();
  for (const [, text] of map) for (const b of blocks(text)) top.set(b.sel, (top.get(b.sel) ?? 0) + 1);
  for (const [file, text] of map) {
    const bl = blocks(text);
    for (let i = 0; i < bl.length; i++) {
      const S = bl[i].sel;
      if (S.startsWith('@') || top.get(S) !== 1) continue;
      const props = new Set(declNames(bl[i].body));
      for (let j = i + 1; j < bl.length; j++) {
        if (!bl[j].sel.startsWith('@media') || RM.test(bl[j].sel)) continue;
        const hit = blocks(bl[j].body).find((ib) => ib.sel === S && declNames(ib.body).some((n) => props.has(n)));
        if (!hit) continue;
        const [a, b] = [bl[i], bl[j]];
        map.set(
          file,
          text.slice(0, a.start) + text.slice(a.end, b.end) + text.slice(a.start, a.end) + text.slice(b.end),
        );
        return { what: `${file}: ${S} hinter ${b.sel}`, file, sel: S };
      }
    }
  }
  throw new Error('keine Grundregel mit Media-Überschreibung gefunden');
}

/** Ersetzt im ersten Verlauf mit rgba()-Stopp diesen Stopp durch gleiches color-mix(), auf Wunsch mit „in srgb“. */
const mixGradient = (map, srgb) =>
  mutateFirst(
    map,
    /(\n\s*background(?:-image)?:[^;{}]*?(?:repeating-)?(?:linear|radial|conic)-gradient\()([^;{}()]*?)rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+)\s*\)/,
    (m) => {
      const mix = `color-mix(in srgb, rgb(${m[3]}, ${m[4]}, ${m[5]}) ${Math.round(Number(m[6]) * 1000) / 10}%, transparent)`;
      let head = m[2];
      if (srgb) {
        const c = head.indexOf(',');
        const first = c < 0 ? '' : head.slice(0, c);
        head =
          /^\s*(?:to\s|from\s|at\s|circle|ellipse|closest-|farthest-|-?[\d.]+(?:deg|turn|rad|grad|px|em|rem|%))/.test(
            first,
          )
            ? `${first} in srgb${head.slice(c)}`
            : `in srgb, ${head}`;
      }
      return `${m[1]}${head}${mix}`;
    },
  );

/** Variablen, die eine Regel unterhalb von :root setzt (auch unter @media). */
function contextVars(map) {
  const out = new Set();
  const visit = (text) => {
    for (const b of blocks(text)) {
      if (b.sel.startsWith('@')) visit(b.body);
      else if (!splitTop(b.sel).every((p) => /^(html|:root)[^\s>+~]*$/.test(p)))
        for (const n of declNames(b.body)) if (n.startsWith('--')) out.add(n);
    }
  };
  for (const [, text] of map) visit(text);
  return out;
}

/** Abhängig: --tb-display folgt auf :root var(--display) und eine Stelle liest es statt var(--display). Sonst liest
    eine Stelle ein Token, dessen Variable nirgends unterhalb von :root gesetzt wird. */
function viaToken(map, dependent) {
  const tok = map.get('table/tokens.css');
  if (dependent) {
    if (!/--tb-display:\s*var\(--serif\)/.test(tok)) throw new Error('--tb-display: var(--serif) fehlt');
    map.set('table/tokens.css', tok.replace(/(--tb-display:\s*)var\(--serif\)/, '$1var(--display)'));
    return mutateFirst(map, /(\n\s*font-family:\s*)var\(--display\)(\s*;)/, (m) => `${m[1]}var(--tb-display)${m[2]}`);
  }
  const ctx = contextVars(map);
  for (const [, name, from] of tok.matchAll(/\n\s*(--tb-[\w-]+):\s*var\((--[\w-]+)\)\s*;/g)) {
    if (ctx.has(from)) continue;
    try {
      return (
        mutateFirst(
          map,
          new RegExp(`(\\n\\s*[a-z-]+:\\s*)var\\(${from}\\)(\\s*;)`),
          (m) => `${m[1]}var(${name})${m[2]}`,
        ) + ` -> var(${name})`
      );
    } catch {
      /* nächstes Token */
    }
  }
  throw new Error('kein Token ohne Kontextvariable gefunden');
}

const CASES = [
  { name: 'Basis gegen Basis', mut: () => 'unverändert', ok: (t) => Object.keys(t.kinds).length === 0 },
  {
    name: 'Literal durch Token mit gleichem Wert',
    mut: (map) => {
      const root = blocks(map.get('table/tokens.css')).find((b) => b.sel === ':root');
      for (const d of splitTop(stripComments(root.body), ';')) {
        const c = d.indexOf(':');
        const [name, value] = [d.slice(0, c).trim(), d.slice(c + 1).trim()];
        if (!/^--tb-/.test(name) || /[\n(]/.test(value.replace(/^var\(--[\w-]+\)$/, 'v'))) continue;
        const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          return (
            mutateFirst(map, new RegExp(`(\\n\\s*[a-z-]+:\\s*)${esc}(\\s*;)`), (m) => `${m[1]}var(${name})${m[2]}`) +
            ` -> var(${name})`
          );
        } catch {
          /* nächstes Token */
        }
      }
      throw new Error('kein Literal mit Token-Wert gefunden');
    },
    ok: (t) => t.errors === 0,
  },
  {
    name: 'rgba() gegen gleiches color-mix()',
    mut: (map) =>
      mutateFirst(
        map,
        /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+)\s*\)/,
        (m) =>
          `color-mix(in srgb, rgb(${m[1]}, ${m[2]}, ${m[3]}) ${Math.round(Number(m[4]) * 1000) / 10}%, transparent)`,
      ),
    ok: (t) => t.errors === 0,
  },
  {
    name: 'Kurzform gegen gleiche Langformen',
    mut: (map) =>
      mutateFirst(map, /\n(\s*)padding:\s*(\d+(?:\.\d+)?(?:px|rem|em)|0)\s+(\d+(?:\.\d+)?(?:px|rem|em)|0)\s*;/, (m) =>
        ['top', 'right', 'bottom', 'left'].map((s, k) => `\n${m[1]}padding-${s}: ${k % 2 ? m[3] : m[2]};`).join(''),
      ),
    ok: (t) => t.errors === 0,
  },
  {
    name: 'Alle Blöcke prefers-reduced-motion auf :where(html.calm)',
    mut: (map) => {
      let n = 0;
      for (const [file, text] of map) {
        const next = calmify(text);
        if (next !== text) {
          map.set(file, next);
          n++;
        }
      }
      if (!n) throw new Error('kein Block prefers-reduced-motion');
      return `${n} Dateien`;
    },
    ok: (t) => t.errors === 0,
  },
  {
    name: 'Block in eigene Datei direkt dahinter',
    mut: (map) => {
      const text = map.get('fit.css');
      const bl = blocks(text).slice(-3);
      map.set('fit.css', text.slice(0, bl[0].start) + text.slice(bl[2].end));
      map.set('table/fit-shithead.css', text.slice(bl[0].start, bl[2].end));
      map.set(
        'index.css',
        map
          .get('index.css')
          .replace("@import './fit.css';", "@import './fit.css';\n@import './table/fit-shithead.css';"),
      );
      return 'letzte 3 Blöcke von fit.css nach table/fit-shithead.css';
    },
    ok: (t) => t.errors === 0 && t.kinds.verschoben > 0 && t.kinds['import-neu'] === 1,
  },
  {
    name: 'Verlaufsstopp aus color-mix() mit „in srgb“',
    mut: (map) => mixGradient(map, true),
    ok: (t) => t.errors === 0,
  },
  {
    name: 'Token ohne Abhängigkeit von Kontextvariablen',
    mut: (map) => viaToken(map, false),
    ok: (t) => t.errors === 0,
  },
  {
    name: 'Farbkanal um 2 geändert',
    mut: (map) =>
      mutateFirst(map, /\n\s*color:\s*#([0-9a-fA-F]{2})([0-9a-fA-F]{4})\s*;/, (m) => {
        const r = parseInt(m[1], 16);
        return m[0].replace(`#${m[1]}`, `#${(r > 200 ? r - 2 : r + 2).toString(16).padStart(2, '0')}`);
      }),
    ok: (t, f) => f.some((x) => x.kind === 'geändert' && x.prop === 'color'),
  },
  {
    name: 'Schatten mit anderer Deckkraft',
    mut: (map) =>
      mutateFirst(map, /box-shadow:[^;{}]*?rgba\(\s*\d+,\s*\d+,\s*\d+,\s*(0?\.\d+)\s*\)/, (m) => {
        const a = Number(m[1]);
        return m[0].replace(
          new RegExp(`${m[1].replace('.', '\\.')}(\\s*\\))$`),
          `${(a >= 0.5 ? a - 0.1 : a + 0.1).toFixed(2)}$1`,
        );
      }),
    ok: (t, f) => f.some((x) => x.kind === 'geändert' && x.prop === 'box-shadow'),
  },
  {
    name: 'Token ohne Definition',
    mut: (map) =>
      mutateFirst(map, /\n(\s*)color:\s*#[0-9a-fA-F]{3,6}\s*;/, (m) => `\n${m[1]}color: var(--tb-gibts-nicht);`),
    ok: (t, f) => f.some((x) => x.kind === 'unaufgelöst' && x.prop === 'color'),
  },
  {
    name: 'Verlaufsstopp aus color-mix() ohne „in srgb“',
    mut: (map) => mixGradient(map, false),
    ok: (t) => t.kinds['Verlauf-Raum'] > 0 && t.errors === t.kinds['Verlauf-Raum'],
  },
  {
    name: 'Token auf :root statt var(--display) unter .paper.sheet',
    mut: (map) => viaToken(map, true),
    ok: (t, f) => f.some((x) => x.kind === 'Kontext' && x.prop === 'font-family' && x.ctx.some((c) => /sheet/.test(c))),
  },
  {
    name: 'Ruhig ohne :where (andere Spezifität)',
    mut: (map) => {
      const [file, text] = [...map].find(([, t]) => /@media \(prefers-reduced-motion: reduce\)/.test(t));
      map.set(file, calmify(text).replaceAll(':where(html.calm) ', 'html.calm '));
      return file;
    },
    ok: (t) => t.kinds.fehlt > 0 && t.kinds.neu > 0,
  },
  {
    name: 'Grundregel hinter ihre Media-Überschreibung',
    mut: (map, ctx) => {
      const r = moveBehindOverride(map);
      ctx.sel = r.sel;
      return r.what;
    },
    ok: (t, f, ctx) =>
      f.some((x) => x.kind === 'reihenfolge' && (x.sel.endsWith(ctx.sel) || x.vor.sel.endsWith(ctx.sel))),
  },
];

async function selftest(page) {
  const started = Date.now();
  const read = gitSource(BASE);
  const base = await load(page, read);
  if (!base.rules.length) throw new Error(`keine Regeln aus ${BASE}`);
  const tmp = mkdtempSync(join(tmpdir(), 'cssdiff-'));
  const results = [];
  let pass = true;
  try {
    for (const c of CASES) {
      const map = new Map([['index.css', read('index.css')], ...base.files.map((f) => [f.file, f.raw])]);
      const ctx = {};
      let what, findings, t, ok;
      try {
        what = c.mut(map, ctx);
        const dir = join(tmp, String(results.length));
        for (const [file, text] of map) {
          mkdirSync(dirname(join(dir, file)), { recursive: true });
          writeFileSync(join(dir, file), text);
        }
        findings = await compare(page, base, await load(page, dirSource(dir)));
        t = tally(findings);
        ok = c.ok(t, findings, ctx);
      } catch (e) {
        what = `Fehler: ${e.message}`;
        ok = false;
        t = { kinds: {} };
      }
      pass &&= ok;
      const kinds =
        Object.entries(t.kinds)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ') || 'keine Befunde';
      console.log(`${ok ? 'ok    ' : 'FEHLER'} ${c.name} (${short(what, 80)}): ${kinds}`);
      if (!ok && findings) for (const f of findings.slice(0, 3)) console.log(`         ${line(f)}`);
      results.push({ name: c.name, ok, what, kinds: t.kinds, findings: findings?.slice(0, 50) });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, 'selftest.json');
  writeFileSync(file, JSON.stringify({ base: BASE, rules: base.rules.length, results }, null, 1));
  console.log(
    `Selbsttest ${pass ? 'bestanden' : 'NICHT bestanden'}, ${base.rules.length} Regeln, ${((Date.now() - started) / 1000).toFixed(1)} s, JSON: ${file}`,
  );
  return pass;
}

// ---------- Start ----------

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
let code;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  if (SELFTEST) code = (await selftest(page)) ? 0 : 1;
  else {
    const started = Date.now();
    const base = await load(page, gitSource(BASE));
    const next = await load(page, dirSource(STYLES));
    const findings = await compare(page, base, next);
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, 'cssdiff.json');
    writeFileSync(
      file,
      JSON.stringify(
        { base: BASE, rules: { alt: base.rules.length, neu: next.rules.length }, tally: tally(findings), findings },
        null,
        1,
      ),
    );
    const head = `CSS-Vergleich ${BASE} gegen Arbeitsbaum, Regeln ${base.rules.length} alt und ${next.rules.length} neu`;
    code = report(findings, head, Date.now() - started, file) ? 1 : 0;
  }
} finally {
  await browser.close();
}
process.exit(code);
