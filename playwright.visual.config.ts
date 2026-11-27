import { defineConfig } from '@playwright/test';

/*
 * Bildvergleich des Tisches über feste Spielstände (tests/visual, Stände aus tests/design/fixtures.mjs).
 * Die Schnappschüsse liegen außerhalb des Repos, weil sie nur auf derselben Maschine vergleichbar sind:
 *   PW_VISUAL_REF   Ordner der Vorlagen, Standard /Users/tnd/schnautz-2-8/visual-ref
 *   PW_LOOK         setzt localStorage schnautz:design, Standard sticker wie in der App
 *   PW_DECK         setzt localStorage schnautz:deck, Standard classic unter legacy und vinyl unter sticker, so wie
 *                   die Vorlagen aufgenommen sind (Legacy vor Runde 6 von 2.8 nur mit den klassischen Karten)
 *   PW_THEME        setzt localStorage schnautz:theme und data-theme an <html>, Standard light
 * Look und Thema stehen im Pfad der Vorlagen, jede Kombination hat also eigene Bilder.
 * Eigene Ports und eigener Build-Ordner, damit es neben anderen Läufen geht: PW_PORT (5312), PEER_PORT (9312),
 * PW_DIST (/Users/tnd/schnautz-2-8/bild/dist). PW_FAST=1 baut ohne Typprüfung. PW_VISUAL_STRICT=1 erlaubt keine
 * einzige Abweichung (Probe auf Stabilität), sonst gilt maxDiffPixelRatio 0,0005.
 * Absichtlich das Chromium von Playwright und nicht PW_CHROME: Ein Update des installierten Chrome würde sonst die
 * Vorlagen ungültig machen. PW_VISUAL_CHROME erlaubt trotzdem einen anderen Browser.
 */
const PORT = Number(process.env.PW_PORT ?? 5312);
const PEER_PORT = Number(process.env.PEER_PORT ?? 9312);
const DIST = process.env.PW_DIST ?? '/Users/tnd/schnautz-2-8/bild/dist';
const REF = process.env.PW_VISUAL_REF ?? '/Users/tnd/schnautz-2-8/visual-ref';
const LOOK = process.env.PW_LOOK || 'sticker';
const THEME = process.env.PW_THEME || 'light';
const BUILD = process.env.PW_FAST
  ? `npx vite build --outDir ${DIST} --emptyOutDir`
  : `npm run build -- --outDir ${DIST} --emptyOutDir`;
// PW_VISUAL_STRICT=1 verlangt jedes Pixel gleich, zum Prüfen, ob die Stände wirklich stabil sind
const STRICT = !!process.env.PW_VISUAL_STRICT;
const noSandbox = !!process.env.CI || process.getuid?.() === 0;

export default defineConfig({
  testDir: 'tests/visual',
  testMatch: '*.visual.ts',
  outputDir: process.env.PW_OUT ?? '/Users/tnd/schnautz-2-8/bild/results',
  snapshotPathTemplate: `${REF}/${LOOK}-${THEME}/{arg}{ext}`,
  // Lesende Läufe schreiben keine fehlenden Vorlagen in den Referenzordner, aufnehmen nur mit --update-snapshots
  updateSnapshots: 'none',
  timeout: 3 * 60_000,
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: STRICT ? 0 : 0.0005,
      threshold: STRICT ? 0 : 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
    },
  },
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS ?? 4),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PW_VISUAL_CHROME || undefined,
      args: [
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--autoplay-policy=no-user-gesture-required',
        // Gleiche Schriftglättung bei jedem Lauf
        '--font-render-hinting=none',
        '--disable-lcd-text',
        // Software-Rendering ohne Nebenläufigkeit im Compositor, sonst wackeln Kanten mit Schatten von Bild zu Bild
        '--disable-gpu',
        '--disable-partial-raster',
        '--disable-threaded-animation',
        '--disable-threaded-scrolling',
        '--disable-checker-imaging',
        '--force-color-profile=srgb',
        ...(noSandbox ? ['--no-sandbox'] : []),
      ],
    },
  },
  projects: [{ name: 'visual' }],
  webServer: [
    {
      command: 'node tests/e2e/peer-server.js',
      port: PEER_PORT,
      env: { PEER_PORT: String(PEER_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `${BUILD} && npx vite preview --outDir ${DIST} --host 127.0.0.1 --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
