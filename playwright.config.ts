import { defineConfig, devices } from '@playwright/test';

/*
 * Ende-zu-Ende-Tests: echte Browser spielen über WebRTC gegeneinander.
 * Ein lokaler PeerServer ersetzt den öffentlichen Vermittlungsserver, damit die Tests offline laufen.
 * Lokal kann PW_CHROME auf ein installiertes Chrome zeigen, sonst nimmt Playwright sein eigenes Chromium.
 */
const PORT = 4173;
const PEER_PORT = 9000;
// Chrome verweigert seine Sandbox als root (CI-Container); auf dem Mac bleibt sie an
const noSandbox = !!process.env.CI || process.getuid?.() === 0;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PW_CHROME || undefined,
      // Lokale IP-Adressen statt mDNS-Namen, sonst finden sich die Browser ohne STUN nicht
      args: ['--disable-features=WebRtcHideLocalIpsWithMdns', ...(noSandbox ? ['--no-sandbox'] : [])],
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
      command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
      port: PORT,
      // Immer frisch bauen, sonst testet man womöglich einen alten Stand
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
