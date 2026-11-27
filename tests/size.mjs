#!/usr/bin/env node
/*
 * Größengrenze ohne eigene Abhängigkeit: liest einen fertigen Build, sucht in index.html das Einstiegsstück und das
 * Stylesheet, packt beide mit gzip (Stufe 9) und bricht mit Code 1 ab, wenn eine Grenze überschritten ist. Stücke,
 * die index.html per modulepreload mitlädt, zählen zum Einstieg (Rolldown lagert gemeinsame Module dorthin aus).
 *
 *   node tests/size.mjs [ordner] [--clean]
 *
 * Ohne Ordner gilt dist. Mit --clean wird der Ordner danach gelöscht (für npm run size, das in dist-size baut).
 * Die Grenzen stehen unten, angehoben werden sie nur mit gutem Grund (etwa wenn ein Teil nachgeladen wird).
 *
 * Das Legacy-Stück (assets/legacy-*.css aus src/styles/looks/legacy.css) hat eine eigene Grenze, fehlt es, ist das
 * ein Befund. Die übrigen nachgeladenen CSS-Stücke meldet es ohne Grenze.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Grenzen in kB (1000 Bytes) nach gzip */
// CSS 44 kB: vom User am 27.11.2026 freigegeben, damit Sticker und Vinyl ohne Nachladen im Haupt-CSS stehen (Runde 6)
// legacy 4 kB: Tokens und Filz-Dekor des Legacy-Designs, nachgeladen (Plan 2.8 legacy.md 13.5)
// JS 176 kB: Look, Deck und Paletten (Runde 6 von 2.8) brauchen 0,4 kB. Notfalls bis 185 kB freigegeben (User 25.11.2026),
// Abnahme 1 (27.11.2026): Ladebildschirm, Ziehen und Decks brauchen 0,5 kB, deshalb 180 kB aus der Freigabe
const LIMITS = { js: 180, css: 44, legacy: 4 };

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const flagged = args.indexOf('--dist');
const dir = resolve(flagged >= 0 ? args[flagged + 1] : (args.find((a) => !a.startsWith('--')) ?? 'dist'));

const kB = (n) => (n / 1000).toFixed(1).replace('.', ',');

/** Alle Dateien mit Endung ext unter d, rekursiv */
function filesIn(d, ext) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(join(d, e.name), ext) : e.name.endsWith(ext) ? [join(d, e.name)] : [],
  );
}

/** Prüft das Legacy-Stück und meldet die übrigen nachgeladenen CSS-Stücke. main ist das Haupt-Stylesheet. Liefert
 * die Zahl der Befunde */
async function lazyCss(main) {
  const built = filesIn(dir, '.css').filter((f) => f !== main);
  const legacy = built.filter((f) => /^legacy-[\w-]+\.css$/.test(basename(f)));
  let bad = legacy.length === 1 ? 0 : 1;
  if (bad) console.error(`Legacy-Stück: ${legacy.length} statt genau einer Datei legacy-*.css im Build`);
  for (const f of built) {
    const raw = readFileSync(f);
    const gz = gzipSync(raw, { level: 9 }).byteLength;
    const own = legacy.includes(f);
    const over = own && gz > LIMITS.legacy * 1000;
    if (over) bad++;
    const limit = own ? `Grenze ${LIMITS.legacy} kB` : 'ohne Grenze';
    console.log(
      `${over ? 'ZU GROSS' : own ? 'ok' : 'info'}  nachgeladen ${relative(dir, f)}: ${kB(raw.byteLength)} kB roh, ` +
        `${kB(gz)} kB gzip, ${limit}`,
    );
  }
  return bad;
}

async function check() {
  const htmlFile = join(dir, 'index.html');
  if (!existsSync(htmlFile)) {
    console.error(`Kein Build in ${dir} (index.html fehlt). Erst bauen, etwa mit npx vite build.`);
    return 1;
  }
  const html = readFileSync(htmlFile, 'utf8');
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]+)"`))?.[1];
  const script = [...html.matchAll(/<script\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => /\stype="module"/.test(t) && attr(t, 'src'));
  const style = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => /\srel="stylesheet"/.test(t) && attr(t, 'href'));
  const parts = [
    { kind: 'js', what: 'Einstiegsstück', src: script && attr(script, 'src') },
    { kind: 'css', what: 'Stylesheet', src: style && attr(style, 'href') },
  ];
  let bad = 0;
  let mainCss = null;
  for (const p of parts) {
    if (!p.src) {
      console.error(`${p.what} nicht in index.html gefunden`);
      bad++;
      continue;
    }
    const file = join(dir, p.src.replace(/^\.?\//, ''));
    if (!existsSync(file)) {
      console.error(`${p.what} ${p.src} fehlt im Build`);
      bad++;
      continue;
    }
    if (p.kind === 'css') mainCss = file;
    const pre =
      p.kind === 'js'
        ? [...html.matchAll(/<link\b[^>]*>/g)]
            .map((m) => m[0])
            .filter((t) => /\srel="modulepreload"/.test(t))
            .map((t) => join(dir, attr(t, 'href').replace(/^\.?\//, '')))
        : [];
    const files = [file, ...pre];
    const raw = { byteLength: files.reduce((n, f) => n + readFileSync(f).byteLength, 0) };
    const gz = files.reduce((n, f) => n + gzipSync(readFileSync(f), { level: 9 }).byteLength, 0);
    if (pre.length) console.log(`info  vorgeladen: ${pre.map((f) => relative(dir, f)).join(', ')} (zählt mit)`);
    const limit = LIMITS[p.kind] * 1000;
    const over = gz > limit;
    if (over) bad++;
    console.log(
      `${over ? 'ZU GROSS' : 'ok'}  ${p.what} ${p.src}: ${kB(raw.byteLength)} kB roh, ${kB(gz)} kB gzip, ` +
        `Grenze ${LIMITS[p.kind]} kB`,
    );
  }
  bad += await lazyCss(mainCss);
  return bad ? 1 : 0;
}

let code;
try {
  code = await check();
} finally {
  if (clean) rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
