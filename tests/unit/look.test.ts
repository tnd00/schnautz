/*
 * Look am Tisch (src/ui/look.ts): Standard Sticker mit Vinyl, das Deck gilt in beiden Looks, data-theme nie unter
 * Legacy, unter Legacy lädt das Stück nach und setzt danach look-ready. Paletten und Farbe der Browserleiste je Look.
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREFS_DEFAULT } from '../../src/net/protocol';
import {
  applyLook,
  DEFAULT_DECK,
  DEFAULT_LOOK,
  designOf,
  paletteOf,
  setDeck,
  setLook,
  sparkOf,
  themeColorOf,
} from '../../src/ui/look';
import { prefs } from '../../src/ui/prefs';
import { designHTML } from '../../src/ui/render/design';

afterEach(() => vi.unstubAllGlobals());

/** Kleines html mit dataset und Klassen, Speicher aus einer Map, dazu die Browserleiste für setLook */
function fakeDom(store: Record<string, string>) {
  const cls = new Set<string>();
  const html = { dataset: {} as Record<string, string>, classList: { add: (c: string) => void cls.add(c) } };
  const bar: Record<string, string> = {};
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
  });
  vi.stubGlobal('document', {
    documentElement: html,
    body: { classList: { contains: (c: string) => c === 'ingame' } },
    querySelector: (q: string) =>
      q === 'meta[name="theme-color"]' ? { setAttribute: (k: string, v: string) => (bar[k] = v) } : null,
    getElementById: () => null,
  });
  return { html, cls, bar };
}

const PALETTE_NAMES = ['gold', 'brown', 'jester', 'party'] as const;

describe('look', () => {
  it('ist Sticker mit Vinyl', () => {
    expect(DEFAULT_LOOK).toBe('sticker');
    expect(DEFAULT_LOOK).toBe(PREFS_DEFAULT.look);
    expect(DEFAULT_DECK).toBe('vinyl');
    expect(DEFAULT_DECK).toBe(PREFS_DEFAULT.deck);
  });

  it('liefert Paletten und Browserleiste je Look', () => {
    expect(themeColorOf('legacy', 'game')).toBe('#123326');
    expect(themeColorOf('legacy', 'start')).toBe('#6f6cf0');
    expect(themeColorOf('sticker', 'game')).toBe('#6f6cf0');
    expect(themeColorOf('sticker', 'game', true)).toBe('#1b194e');
    expect(themeColorOf('sticker', 'start', true)).toBe('#6f6cf0');
    expect(themeColorOf('legacy', 'game', true)).toBe('#123326');
    expect(paletteOf('legacy', 'gold')[0]).toBe('#f3cd7d');
    for (const l of ['legacy', 'sticker'] as const) {
      for (const n of PALETTE_NAMES) {
        expect(paletteOf(l, n).length).toBeGreaterThan(3);
        for (const c of paletteOf(l, n)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    // Sticker: kein Sonnengelb (gehört dem Logo), Limette nur in der Cabo-Krone
    const sticker = PALETTE_NAMES.flatMap((n) => paletteOf('sticker', n));
    expect(sticker).not.toContain('#ffd84d');
    for (const n of PALETTE_NAMES) if (n !== 'gold') expect(paletteOf('sticker', n)).not.toContain('#c8f25c');
  });

  it('setzt unter Legacy kein Thema, lädt nach und meldet look-ready', async () => {
    const { html, cls } = fakeDom({ 'schnautz:design': '"legacy"', 'schnautz:theme': '"dark"' });
    applyLook();
    expect(html.dataset).toEqual({ look: 'legacy', deck: 'vinyl' });
    await vi.waitFor(() => expect(cls.has('look-ready')).toBe(true));
  });

  it('setzt unter Sticker Look, Deck und Thema', () => {
    const { html } = fakeDom({ 'schnautz:theme': '"dark"' });
    applyLook();
    expect(html.dataset).toEqual({ look: 'sticker', deck: 'vinyl', theme: 'dark' });
  });

  it('nimmt das Deck in beiden Looks', () => {
    const { html } = fakeDom({ 'schnautz:deck': '"classic"' });
    applyLook();
    expect(html.dataset).toEqual({ look: 'sticker', deck: 'classic', theme: 'light' });
    const legacy = fakeDom({ 'schnautz:design': '"legacy"', 'schnautz:deck': '"classic"' });
    applyLook();
    expect(legacy.html.dataset).toEqual({ look: 'legacy', deck: 'classic' });
  });

  it('merkt die Wahl aus dem Bogen „Design“ und setzt sie an html', async () => {
    const store: Record<string, string> = {};
    const { html, bar } = fakeDom(store);
    setDeck('classic');
    expect(store['schnautz:deck']).toBe('"classic"');
    expect(html.dataset).toEqual({ look: 'sticker', deck: 'classic', theme: 'light' });
    const legacy = setLook('legacy');
    // Legacy gilt und wird gespeichert, erst wenn sein Stück geladen ist, dann auch die Browserleiste am Tisch
    expect(html.dataset.look).toBe('sticker');
    expect(store['schnautz:design']).toBeUndefined();
    expect(await legacy).toBe(true);
    expect(store['schnautz:design']).toBe('"legacy"');
    expect(html.dataset).toEqual({ look: 'legacy', deck: 'classic' });
    expect(bar.content).toBe('#123326');
    expect(await setLook('dark')).toBe(true);
    expect(store['schnautz:design']).toBe('"sticker"');
    expect(store['schnautz:theme']).toBe('"dark"');
    expect(html.dataset).toEqual({ look: 'sticker', deck: 'classic', theme: 'dark' });
    expect(bar.content).toBe('#1b194e');
    expect(designOf(prefs())).toBe('dark');
    void setLook('sticker');
    expect(store['schnautz:design']).toBe('"sticker"');
    expect(store['schnautz:theme']).toBe('"light"');
    expect(html.dataset).toEqual({ look: 'sticker', deck: 'classic', theme: 'light' });
    expect(bar.content).toBe('#6f6cf0');
    expect(prefs()).toMatchObject({ look: 'sticker', deck: 'classic' });
  });

  it('bleibt bei Sticker, wenn das Legacy-Stück nicht lädt', async () => {
    vi.resetModules();
    vi.doMock('../../src/styles/looks/legacy.css', () => {
      throw new Error('offline');
    });
    const look = await import('../../src/ui/look');
    const store: Record<string, string> = {};
    const { html } = fakeDom(store);
    expect(await look.setLook('legacy')).toBe(false);
    expect(store['schnautz:design']).toBeUndefined();
    expect(look.lookLoading()).toBe(false);
    // Auch beim Start mit gespeichertem Legacy steht der Tisch dann in Sticker statt ohne Farben
    store['schnautz:design'] = '"legacy"';
    look.applyLook();
    await vi.waitFor(() => expect(html.dataset).toMatchObject({ look: 'sticker', theme: 'light' }));
    vi.doUnmock('../../src/styles/looks/legacy.css');
  });

  it('bleibt hell, wenn das dunkle Stück nicht lädt', async () => {
    vi.resetModules();
    vi.doMock('../../src/styles/looks/dark.css', () => {
      throw new Error('offline');
    });
    const look = await import('../../src/ui/look');
    const store: Record<string, string> = {};
    const { html } = fakeDom(store);
    expect(await look.setLook('dark')).toBe(false);
    expect(store['schnautz:theme']).toBeUndefined();
    expect(look.lookLoading()).toBe(false);
    store['schnautz:theme'] = '"dark"';
    look.applyLook();
    await vi.waitFor(() => expect(html.dataset).toMatchObject({ look: 'sticker', theme: 'light' }));
    vi.doUnmock('../../src/styles/looks/dark.css');
  });

  it('gibt Limette als Funken nur der Cabo-Krone', () => {
    expect(sparkOf('sticker', true)).toBe('#c8f25c');
    expect(sparkOf('sticker', false)).toBe('#ffffff');
    expect(sparkOf('legacy', false)).toBe(paletteOf('legacy', 'gold')[0]);
  });

  it('zeigt Sticker dunkel als eigene Wahl, das Thema zählt nur unter Sticker', () => {
    expect(designOf({ look: 'sticker', theme: 'dark' })).toBe('dark');
    expect(designOf({ look: 'legacy', theme: 'dark' })).toBe('legacy');
    const html = designHTML({ ...PREFS_DEFAULT, theme: 'dark' });
    expect([...html.matchAll(/data-dsg="look" data-v="(\w+)"/g)].map((m) => m[1])).toEqual([
      'sticker',
      'dark',
      'legacy',
    ]);
    expect(html).toContain('aria-checked="true" tabindex="0" data-dsg="look" data-v="dark"');
  });

  it('zeigt im Bogen zwei Radiogruppen mit der aktuellen Wahl', () => {
    const html = designHTML({ ...PREFS_DEFAULT, look: 'legacy', deck: 'vinyl' });
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
    const checked = [...html.matchAll(/data-dsg="(\w+)" data-v="(\w+)"/g)].filter((m) =>
      html.includes(`aria-checked="true" tabindex="0" data-dsg="${m[1]}" data-v="${m[2]}"`),
    );
    expect(checked.map((m) => `${m[1]}:${m[2]}`)).toEqual(['look:legacy', 'deck:vinyl']);
    // Jedes Deck zeigt seine Karten unter eigenem data-deck, unabhängig vom Deck an html
    expect(html).toContain('data-deck="vinyl"');
    expect(html).toContain('data-deck="classic"');
    // Name kurz, Erklärsatz als Beschreibung
    expect(html).toContain('aria-labelledby="dsg-legacy" aria-describedby="dsg-legacy-d"');
    expect(html).toMatch(/<span class="rt" id="dsg-legacy">Legacy<\/span><small id="dsg-legacy-d">/);
  });
});

/*
 * Wächter aus legacy.md 13.1. Speicherwert (1) prüft tests/unit/asprefs.test.ts, Token-Parität und Literal-Verbot
 * (3, 4) tests/unit/look-css.test.ts.
 */
const ROOT = path.resolve(__dirname, '../..');
const STYLES = path.join(ROOT, 'src/styles');
const css = (f: string): string => fs.readFileSync(path.join(STYLES, f), 'utf8');
const cssFiles = (dir: string): string[] =>
  fs
    .readdirSync(path.join(STYLES, dir))
    .filter((f) => f.endsWith('.css'))
    .map((f) => (dir ? `${dir}/${f}` : f));
const STICKER_FILES = cssFiles('table').filter((f) => /\/(?:look-sticker|sticker-[\w-]+)\.css$/.test(f));

/** Alle Regeln einer Datei als [Selektor, Deklarationen], ohne @keyframes, Selektorlisten einzeln */
function rules(f: string): { sel: string; decls: string[] }[] {
  const out: { sel: string; decls: string[] }[] = [];
  postcss.parse(css(f)).walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes$/.test((r.parent as AtRule).name)) return;
    const decls = r.nodes.flatMap((n) => (n.type === 'decl' ? [n.prop] : []));
    for (const s of r.selectors) out.push({ sel: s.replace(/\s+/g, ' ').trim(), decls });
  });
  return out;
}

/** Tischzonen aus legacy.md 7.2 nach dem Look-Präfix */
const ZONES = [
  /^body\.ingame(?:::(?:before|after))?$/,
  /^body\.ingame(?: \.top|(?: :is\((?:\.toasts|\.netbar|#updbar)(?:, (?:\.toasts|\.netbar|#updbar))*\)))(?=$| |:|\.)/,
  /^(?:#scr-game|#overlay|#announce|#banner|#zer|#fly|#modal \.betm)(?=$| |:|\.|\[)/,
];
/** Sticker-Formen: am Tisch (body.ingame, body.emoopen) oder in einer Tischebene */
const STICKER_ZONE =
  /^(?:body\.(?:ingame|emoopen)|#(?:scr-game|table|overlay|announce|banner|zer|fly)|#modal \.betm)(?=$| |:|\.|\[)/;
/** Klassen, die der Code zusammensetzt (status.ts schreibt tone-<x>) */
const BUILT = /^tone-/;
/** Rahmen: in keinem Look umgefärbt */
const FRAME = /#menu\b|\.menudim\b|#modal(?! \.betm)|\.st-peel\b|#dev\b|\.dev\b/;

describe('Wächter Legacy-Design', () => {
  it('2: der Tisch steht in index.html statisch versteckt', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/<section\b[^>]*\bid="scr-game"[^>]*\bhidden\b[^>]*>/);
  });

  it('5: Legacy-Regeln tragen Präfix und Tischzone, Sticker-Regeln ihr Präfix und treffen nie den Rahmen', () => {
    const LEG = ":root[data-look='legacy']";
    const legacyBad = rules('looks/legacy.css')
      .filter(({ sel, decls }) => {
        if (!sel.startsWith(LEG)) return true;
        const rest = sel.slice(LEG.length).trim();
        if (!rest) return !decls.every((d) => d.startsWith('--'));
        return !ZONES.some((z) => z.test(rest)) || FRAME.test(rest);
      })
      .map((r) => r.sel);
    expect(legacyBad).toEqual([]);
    // Die Wache in base.css ist die eine Legacy-Regel im Haupt-CSS
    const guard = rules('base.css').filter((r) => r.sel.includes("data-look='legacy'"));
    expect(guard.map((r) => r.decls)).toEqual([['visibility']]);

    const STK = /^:root\[data-look='sticker'\](?:\[data-theme='dark'\])?/;
    const stickerBad = STICKER_FILES.flatMap((f) =>
      rules(f)
        .filter(({ sel, decls }) => {
          const m = STK.exec(sel);
          if (!m) return true;
          const rest = sel.slice(m[0].length).trim();
          if (!rest) return !decls.every((d) => d.startsWith('--'));
          return !STICKER_ZONE.test(rest) || FRAME.test(rest);
        })
        .map((r) => `${f}: ${r.sel}`),
    );
    expect(stickerBad).toEqual([]);
  });

  it('6: der Rahmen liest keine Tisch-Tokens', () => {
    const frameFiles = ['sticker.css', 'start.css', 'lobby.css', 'dev.css', 'design.css', 'prefs.css', 'updates.css'];
    const FRAME_SEL = /#modal(?! \.betm)|#menu\b|#scr-start\b|#scr-lobby\b|body:not\(\.ingame\)/;
    const bad: string[] = [];
    for (const f of cssFiles('')) {
      const whole = frameFiles.includes(f);
      postcss.parse(css(f)).walkDecls((d) => {
        if (!d.value.includes('var(--tb-')) return;
        const r = d.parent as Rule;
        if (whole || (r.type === 'rule' && r.selectors.some((s) => FRAME_SEL.test(s))))
          bad.push(`${f}: ${r.type === 'rule' ? r.selector : '?'} { ${d.prop} }`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('7: jede Klasse in den Look-Dateien gibt es noch im Markup', () => {
    const src = (dir: string): string[] =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((d) =>
          d.isDirectory() ? src(path.join(dir, d.name)) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : [],
        );
    const code = [...src(path.join(ROOT, 'src')), path.join(ROOT, 'index.html')]
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    const dead = new Set<string>();
    for (const f of ['looks/legacy.css', 'looks/dark.css', ...STICKER_FILES]) {
      for (const { sel } of rules(f)) {
        for (const [, c] of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
          if (!BUILT.test(c) && !new RegExp(`(?<![\\w-])${c.replace(/-/g, '\\-')}(?![\\w-])`).test(code))
            dead.add(`${f}: .${c}`);
        }
      }
    }
    expect([...dead]).toEqual([]);
  });
});
