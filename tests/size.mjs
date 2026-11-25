#!/usr/bin/env node
/*
 * Größengrenze ohne eigene Abhängigkeit: liest einen fertigen Build, sucht in index.html das Einstiegsstück und das
 * Stylesheet, packt beide mit gzip (Stufe 9) und bricht mit Code 1 ab, wenn eine Grenze überschritten ist.
 *
 *   node tests/size.mjs [ordner] [--clean]
 *
 * Ohne Ordner gilt dist. Mit --clean wird der Ordner danach gelöscht (für npm run size, das in dist-size baut).
 * Die Grenzen stehen unten, angehoben werden sie nur mit gutem Grund (etwa wenn ein Teil nachgeladen wird).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Grenzen in kB (1000 Bytes) nach gzip */
const LIMITS = { js: 175, css: 40 };

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const flagged = args.indexOf('--dist');
const dir = resolve(flagged >= 0 ? args[flagged + 1] : (args.find((a) => !a.startsWith('--')) ?? 'dist'));

const kB = (n) => (n / 1000).toFixed(1).replace('.', ',');

function check() {
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
    const raw = readFileSync(file);
    const gz = gzipSync(raw, { level: 9 }).byteLength;
    const limit = LIMITS[p.kind] * 1000;
    const over = gz > limit;
    if (over) bad++;
    console.log(
      `${over ? 'ZU GROSS' : 'ok'}  ${p.what} ${p.src}: ${kB(raw.byteLength)} kB roh, ${kB(gz)} kB gzip, ` +
        `Grenze ${LIMITS[p.kind]} kB`,
    );
  }
  return bad ? 1 : 0;
}

let code;
try {
  code = check();
} finally {
  if (clean) rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
