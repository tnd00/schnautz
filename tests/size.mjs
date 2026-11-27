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
 * Dazu meldet es ohne Grenze die nachgeladenen CSS-Stücke (bis Runde 6 von 2.8 nur zur Info): jedes weitere
 * Stylesheet im Build und jeden Einstieg aus src/styles/looks, der noch in keinem Stück des Builds steckt
 * (dann mit lightningcss gebündelt und verkleinert, wie Vite es täte).
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Grenzen in kB (1000 Bytes) nach gzip */
// CSS 44 kB: vom User am 27.11.2026 freigegeben, damit Sticker und Vinyl ohne Nachladen im Haupt-CSS stehen (Runde 6)
const LIMITS = { js: 175, css: 44 };

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const flagged = args.indexOf('--dist');
const dir = resolve(flagged >= 0 ? args[flagged + 1] : (args.find((a) => !a.startsWith('--')) ?? 'dist'));

const kB = (n) => (n / 1000).toFixed(1).replace('.', ',');
const LOOKS = fileURLToPath(new URL('../src/styles/looks/', import.meta.url));

/** Alle Dateien mit Endung ext unter d, rekursiv */
function filesIn(d, ext) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(join(d, e.name), ext) : e.name.endsWith(ext) ? [join(d, e.name)] : [],
  );
}

/** Meldet nachgeladene CSS-Stücke ohne Grenze. main ist der Pfad des Haupt-Stylesheets */
async function lazyCss(main) {
  const built = filesIn(dir, '.css').filter((f) => f !== main);
  for (const f of built) {
    const raw = readFileSync(f);
    const gz = gzipSync(raw, { level: 9 }).byteLength;
    console.log(`info  nachgeladen ${relative(dir, f)}: ${kB(raw.byteLength)} kB roh, ${kB(gz)} kB gzip, ohne Grenze`);
  }
  if (!existsSync(LOOKS)) return;
  const names = built.map((f) => basename(f));
  const open = filesIn(LOOKS, '.css').filter((f) => !names.some((n) => n.startsWith(`${basename(f, '.css')}-`)));
  if (!open.length) return;
  let bundle;
  try {
    ({ bundle } = await import('lightningcss'));
  } catch {
    console.log('info  lightningcss fehlt, Einstiege aus src/styles/looks nicht gemessen');
    return;
  }
  for (const f of open) {
    const { code } = bundle({ filename: f, minify: true });
    const gz = gzipSync(code, { level: 9 }).byteLength;
    console.log(
      `info  Einstieg looks/${basename(f)} (noch nicht im Build): ${kB(code.byteLength)} kB roh, ${kB(gz)} kB gzip, ` +
        'ohne Grenze',
    );
  }
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
  await lazyCss(mainCss);
  return bad ? 1 : 0;
}

let code;
try {
  code = await check();
} finally {
  if (clean) rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
