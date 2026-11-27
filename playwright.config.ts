import { defineConfig, devices } from '@playwright/test';

/*
 * Ende-zu-Ende-Tests: echte Browser spielen über WebRTC gegeneinander.
 * Ein lokaler PeerServer ersetzt den öffentlichen Vermittlungsserver, damit die Tests offline laufen.
 * Lokal kann PW_CHROME auf ein installiertes Chrome zeigen, sonst nimmt Playwright sein eigenes Chromium.
 * PW_PORT, PEER_PORT und PW_DIST erlauben mehrere Läufe nebeneinander (eigene Ports, eigener Build-Ordner).
 * PW_FAST=1 baut ohne Typprüfung, damit halbfertige Dateien anderer Arbeiten einen Einzellauf nicht blockieren.
 * PW_LOOK und PW_THEME legen schnautz:look und schnautz:theme für alle Specs vorab in localStorage (fit.spec prüft
 * zusätzlich, ob der Look ankommt).
 */
const PORT = Number(process.env.PW_PORT ?? 4173);
const PEER_PORT = Number(process.env.PEER_PORT ?? 9000);
const DIST = process.env.PW_DIST ?? 'dist';
const BUILD = process.env.PW_FAST
  ? `npx vite build --outDir ${DIST} --emptyOutDir`
  : `npm run build -- --outDir ${DIST}`;
// Chrome verweigert seine Sandbox als root (CI-Container); auf dem Mac bleibt sie an
const noSandbox = !!process.env.CI || process.getuid?.() === 0;
const PRESET = [
  ['schnautz:look', process.env.PW_LOOK],
  ['schnautz:theme', process.env.PW_THEME],
].flatMap(([name, v]) => (v ? [{ name: name as string, value: JSON.stringify(v) }] : []));

export default defineConfig({
  testDir: 'tests/e2e',
  // Eigener Ordner je Lauf, damit parallele Läufe sich nicht die Ausgaben löschen (PW_OUT)
  outputDir: process.env.PW_OUT ?? 'test-results',
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  // Dateien laufen nebeneinander, Tests einer Datei nacheinander. Lokal vier Worker (12 Kerne), in der CI zwei
  // (öffentliche Runner haben vier Kerne). Mehr kippt unter Last die Tests, die auf Zeit spielen (4er-Fenster,
  // Werfen, Vorspulen). PW_WORKERS stellt es um.
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? (process.env.CI ? 2 : 4)),
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    ...(PRESET.length
      ? { storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${PORT}`, localStorage: PRESET }] } }
      : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PW_CHROME || undefined,
      // Lokale IP-Adressen statt mDNS-Namen, sonst finden sich die Browser ohne STUN nicht
      args: [
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        // Damit der Audio-Kontext fürs Soundboard auch ohne echten Tipp läuft
        '--autoplay-policy=no-user-gesture-required',
        ...(noSandbox ? ['--no-sandbox'] : []),
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/e2e/peer-server.js',
      port: PEER_PORT,
      env: { PEER_PORT: String(PEER_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `${BUILD} && npx vite preview --outDir ${DIST} --host 127.0.0.1 --port ${PORT} --strictPort`,
      port: PORT,
      // Immer frisch bauen, sonst testet man womöglich einen alten Stand
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
