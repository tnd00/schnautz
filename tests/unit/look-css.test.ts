/**
 * Vertrag der Looks am Tisch (Plan 2.8, Runde 1).
 *
 * - Die drei Token-Blöcke (Legacy auf :root, Sticker, Sticker dunkel) tragen dieselben Namen --tb-*.
 *   Hilfswerte --st-* und --sn-* zählen nicht mit, --sn-* lebt nur im dunklen Block.
 * - Look-Dateien (Token-Dateien, looks/*.css, später table/sticker-*.css und table/look-sticker.css) setzen keine Maße.
 * - Tisch-CSS schreibt keine Farbwerte direkt, sondern liest Tokens. Ausgenommen ist jede Datei mit der Marke
 *   tb: offen als Kommentar in der ersten Zeile und die Kartenhaut (cards.css, später table/cards-*.css).
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss, { type Declaration, type Root, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { GAMES } from '../../src/game/games';

const STYLES = path.resolve(__dirname, '../../src/styles');
const OPEN_MARK = '/* tb: offen */';

const LEGACY = ':root';
const STICKER = ":root[data-look='sticker']";
const DARK = ":root[data-look='sticker'][data-theme='dark']";
const GAME_IS = `:is(${GAMES.map((g) => `.g-${g}`).join(', ')})`;

const TOKEN_FILES = { legacy: 'table/tokens.css', sticker: 'table/tokens-sticker.css', dark: 'table/tokens-dark.css' };

/** Die Tisch-CSS mit Literal-Verbot, dazu alles unter table/ außer Token-Dateien und Kartenhaut */
const TABLE_CSS = ['table', 'fit', 'shithead-flow', 'feedback', 'status', 'result', 'shithead', 'durak', 'cabo'].map(
  (n) => `${n}.css`,
);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]))
    .filter((f) => f.endsWith('.css'));
}

/** Pfad relativ zu src/styles mit Schrägstrich */
const rel = (f: string): string => path.relative(STYLES, f).split(path.sep).join('/');
const ALL_CSS = walk(STYLES).map(rel).sort();
const read = (r: string): string => fs.readFileSync(path.join(STYLES, r), 'utf8');
const parse = (r: string): Root => postcss.parse(read(r), { from: r });
const isOpen = (src: string): boolean => src.split('\n', 1)[0].trim() === OPEN_MARK;
const isHelper = (name: string): boolean => name.startsWith('--st-') || name.startsWith('--sn-');

/** Namen der Custom Properties je Selektor */
function blocks(root: Root): Map<string, string[]> {
  const out = new Map<string, string[]>();
  root.walkRules((r: Rule) => {
    const names: string[] = [];
    r.each((n) => {
      if (n.type === 'decl') names.push(n.prop);
    });
    const key = r.selector.replace(/\s+/g, ' ').trim();
    out.set(key, [...(out.get(key) ?? []), ...names]);
  });
  return out;
}

const tbNames = (names: readonly string[]): string[] => names.filter((n) => !isHelper(n)).sort();

// Geometrie: alles, was Größe, Lage oder Fluss ändert
const GEOMETRY =
  /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|margin(?:-.+)?|padding(?:-.+)?|inset(?:-.+)?|top|left|right|bottom|(?:row-|column-)?gap|font-size|font|line-height|grid(?:-.+)?|flex(?:-basis|-grow|-shrink)?|aspect-ratio|border(?:-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)?(?:-width)?)$/;
// Maß-Variablen des Gerüsts, die ein Look nicht umsetzen darf
const GEOMETRY_VARS = /^--(?:u|cw|sz)$/;

/** Verbotene Geometrie in einer Look-Datei, als Liste „Datei:Zeile Eigenschaft“ */
function geometryFindings(css: string, file = 'css'): string[] {
  const out: string[] = [];
  postcss.parse(css).walkDecls((d: Declaration) => {
    const prop = d.prop.toLowerCase();
    if (prop.startsWith('--') ? GEOMETRY_VARS.test(prop) : GEOMETRY.test(prop)) {
      out.push(`${file}:${d.source?.start?.line ?? 0} ${d.prop}`);
    }
  });
  return out;
}

// Benannte Farben aus CSS Color 4 (ohne transparent und currentcolor, die bleiben erlaubt)
const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' '),
);
// Eigenschaften, in denen Wörter Namen sind und keine Farben (Animationen, Schriften, Bereiche)
const NAME_PROPS =
  /^(?:animation(?:-name)?|transition(?:-property)?|font-family|will-change|grid-area|grid-template-areas|counter-(?:reset|increment|set)|view-transition-name|container(?:-name)?|list-style(?:-type)?|content|quotes)$/;
const COLOR_FN = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const HEX = /#[0-9a-f]{3,8}(?![\w-])/i;

/** Farbwerte als Literal in einer Tisch-Datei, als Liste „Datei:Zeile Eigenschaft Wert“ */
function literalFindings(css: string, file = 'css'): string[] {
  const out: string[] = [];
  postcss.parse(css).walkDecls((d: Declaration) => {
    const value = d.value.replace(/url\([^)]*\)/gi, 'url()').replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''");
    const prop = d.prop.toLowerCase();
    const named =
      !NAME_PROPS.test(prop) &&
      (value.match(/(?<![\w-])[a-z]+(?![\w-])/gi) ?? []).some((w) => NAMED.has(w.toLowerCase()));
    if (HEX.test(value) || COLOR_FN.test(value) || named) {
      out.push(`${file}:${d.source?.start?.line ?? 0} ${d.prop}: ${d.value}`);
    }
  });
  return out;
}

describe('Prüfer der Look-Regeln', () => {
  it('findet Maße, lässt Farbe, Schatten, rotate und Rundung durch', () => {
    const bad = `a { width: 1px; margin-top: 0; padding-inline: 2px; inset: 0; top: 1px; gap: 3px; row-gap: 1px;
      font-size: 12px; font: 12px x; line-height: 1; grid-template-columns: 1fr; flex: 1; flex-basis: 0;
      border: 1px solid; border-top-width: 2px; min-height: 0; max-inline-size: 3px; --u: 2px; }`;
    expect(geometryFindings(bad)).toHaveLength(18);
    const good = `a { color: var(--tb-text); background: var(--tb-seat-bg); box-shadow: var(--tb-seat-shadow);
      rotate: calc(var(--tb-tilt) * -1.5deg); border-radius: var(--tb-seat-radius); border-color: var(--tb-line);
      font-style: var(--tb-display-style); --tb-x: 4px; position: absolute; }`;
    expect(geometryFindings(good)).toEqual([]);
  });

  it('findet Farbliterale, lässt Tokens, transparent und Namen durch', () => {
    const bad = `a { color: #fff; background: rgba(0, 0, 0, 0.2); border-color: hsl(10 20% 30%);
      box-shadow: 0 0 0 1px color-mix(in srgb, #000 20%, transparent); outline-color: white; --x: oklch(0.5 0.1 20); }`;
    expect(literalFindings(bad)).toHaveLength(6);
    const good = `a { color: var(--tb-text); background: color-mix(in srgb, var(--tb-shade) 12%, transparent);
      border-color: currentColor; animation: gold 1s; font-family: 'White Rabbit', var(--ui);
      background-image: url(data:image/svg+xml,%23fff); content: 'red'; transition: color 0.2s; }`;
    expect(literalFindings(good)).toEqual([]);
  });
});

describe('Token-Blöcke', () => {
  const parsed = {
    legacy: blocks(parse(TOKEN_FILES.legacy)),
    sticker: blocks(parse(TOKEN_FILES.sticker)),
    dark: blocks(parse(TOKEN_FILES.dark)),
  };
  const legacy = tbNames(parsed.legacy.get(LEGACY) ?? []);

  it('stehen nur unter ihrem Selektor und setzen nur Custom Properties', () => {
    expect([...parsed.legacy.keys()]).toEqual([LEGACY]);
    expect([...parsed.sticker.keys()]).toEqual([STICKER, `${STICKER} ${GAME_IS}`]);
    expect([...parsed.dark.keys()]).toEqual([DARK, `${DARK} ${GAME_IS}`]);
    for (const file of Object.values(TOKEN_FILES)) {
      const root = parse(file);
      const props: string[] = [];
      root.walkDecls((d) => {
        if (!d.prop.startsWith('--')) props.push(d.prop);
      });
      expect(props, file).toEqual([]);
      const atRules: string[] = [];
      root.walkAtRules((a) => {
        atRules.push(a.name);
      });
      expect(atRules, file).toEqual([]);
    }
  });

  it('haben den vollen Wortschatz mit denselben Namen in allen drei Blöcken', () => {
    expect(legacy.length).toBeGreaterThanOrEqual(150);
    expect(legacy.every((n) => n.startsWith('--tb-'))).toBe(true);
    expect(new Set(legacy).size).toBe(legacy.length);
    expect(tbNames(parsed.sticker.get(STICKER) ?? [])).toEqual(legacy);
    expect(tbNames(parsed.dark.get(DARK) ?? [])).toEqual(legacy);
  });

  it('setzen an .g-<spiel> nur Namen aus dem Wortschatz, die fünf Spielfarben in beiden Sticker-Blöcken', () => {
    const five = ['--tb-accent', '--tb-brand-bg', '--tb-sheet-win-bg', '--tb-status-turn-bg', '--tb-tag-turn-bg'];
    const st = tbNames(parsed.sticker.get(`${STICKER} ${GAME_IS}`) ?? []);
    const dk = tbNames(parsed.dark.get(`${DARK} ${GAME_IS}`) ?? []);
    expect(st).toEqual(five);
    expect(five.every((n) => dk.includes(n))).toBe(true);
    expect(dk.every((n) => legacy.includes(n))).toBe(true);
  });

  it('lesen nur Namen, die es gibt (ohne Rückfallwert)', () => {
    const declared = new Set<string>();
    for (const f of ALL_CSS) {
      parse(f).walkDecls((d) => {
        if (d.prop.startsWith('--')) declared.add(d.prop);
      });
    }
    const missing: string[] = [];
    for (const file of Object.values(TOKEN_FILES)) {
      parse(file).walkDecls((d) => {
        for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
          if (m[2] === ')' && !declared.has(m[1])) missing.push(`${file} ${d.prop} liest ${m[1]}`);
        }
      });
    }
    expect(missing).toEqual([]);
  });

  it('halten die Hilfswerte --sn-* im dunklen Block', () => {
    const leaks: string[] = [];
    for (const f of ALL_CSS) {
      if (f === TOKEN_FILES.dark) continue;
      const src = read(f);
      for (const m of src.matchAll(/--sn-[\w-]+/g)) leaks.push(`${f} ${m[0]}`);
    }
    expect(leaks).toEqual([]);
  });

  it('Legacy steht im Haupt-CSS direkt nach base.css, Sticker und Dunkel werden nachgeladen', () => {
    const imports = [...read('index.css').matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.slice(0, 3)).toEqual(['./base.css', './table/tokens.css', './sticker.css']);
    expect(imports.some((i) => /tokens-|looks\//.test(i))).toBe(false);
    expect(read('looks/sticker.css')).toContain("@import '../table/tokens-sticker.css';");
    expect(read('looks/dark.css')).toContain("@import '../table/tokens-dark.css';");
  });
});

describe('Look-Dateien', () => {
  const files = ALL_CSS.filter(
    (f) => /^table\/(?:tokens-[\w-]+|sticker-[\w-]+|look-sticker)\.css$/.test(f) || f.startsWith('looks/'),
  );

  it('gibt es für Sticker und Dunkel', () => {
    expect(files).toEqual(expect.arrayContaining([TOKEN_FILES.sticker, TOKEN_FILES.dark, 'looks/sticker.css']));
  });

  it('setzen keine Maße', () => {
    expect(files.flatMap((f) => geometryFindings(read(f), f))).toEqual([]);
  });
});

describe('Tisch-CSS', () => {
  const files = [
    ...TABLE_CSS,
    ...ALL_CSS.filter(
      (f) => f.startsWith('table/') && !/^table\/(?:tokens(?:-[\w-]+)?|cards(?:-[\w-]+)?)\.css$/.test(f),
    ),
  ];

  it('gibt es noch alle', () => {
    expect(TABLE_CSS.filter((f) => !ALL_CSS.includes(f))).toEqual([]);
  });

  it('schreibt keine Farbwerte direkt (außer mit der Marke tb: offen)', () => {
    const checked = files.filter((f) => !isOpen(read(f)));
    expect(checked.flatMap((f) => literalFindings(read(f), f))).toEqual([]);
  });

  it('trägt die Marke nur in der ersten Zeile', () => {
    const late = ALL_CSS.filter((f) =>
      read(f)
        .split('\n')
        .slice(1)
        .some((l) => l.trim() === OPEN_MARK),
    );
    expect(late).toEqual([]);
  });
});
