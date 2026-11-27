/*
 * Bildvergleich des Tisches über feste Spielstände. Jeder Stand aus tests/design/fixtures (erzeugt mit
 * tests/design/fixtures.mjs) wird als gespeicherter Gastgeber in localStorage gelegt, dann tippt der Test
 * „Fortsetzen“. Die KIs stehen (`BOTS.hold` vor dem Tipp), das Zeitlimit ist im Stand aus, die Uhr der Seite läuft
 * über page.clock ab einem festen Datum und wird vor der Aufnahme angehalten. So sieht derselbe Stand bei jedem Lauf
 * gleich aus. Aufruf und Umgebung stehen in playwright.visual.config.ts und tests/design/README.md.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(process.cwd(), 'tests/design/fixtures');
const START = `./?peerhost=127.0.0.1&peerport=${process.env.PEER_PORT ?? 9312}&noice=1`;
// Standards wie in playwright.visual.config.ts: die App nimmt Sticker, Legacy-Vorlagen haben klassische Karten
const LOOK = process.env.PW_LOOK || 'sticker';
const DECK = process.env.PW_DECK || (LOOK === 'legacy' ? 'classic' : 'vinyl');
const THEME = process.env.PW_THEME || 'light';
/** Fester Zeitpunkt für Date.now in der Seite */
const T0 = new Date('2026-11-26T18:00:00+01:00').getTime();
const SIZES = ['390x844', '360x640', '375x548', '1280x720'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface Fixture {
  meta: { id: string; game: string; goal: string; seats: number; long: boolean; screen: 'lobby' | 'game' | 'result' };
  host: { code: string; me: string; name: string; st: unknown; keys: Record<string, string> };
  guest: { pid: string; key: string; name: string } | null;
}

const fixtures: Fixture[] = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as Fixture);

/**
 * Tischcode je Stand und Größe, immer gleich. Der Code ist die Peer-ID des Gastgebers, parallele Tests dürfen sich
 * nicht denselben teilen. Er steht sichtbar am Tisch, deshalb kein Zufall.
 */
function codeFor(id: string, size: string): string {
  let h = 2166136261;
  for (const c of `${id}|${size}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += ALPHA[h % 32];
    h = Math.floor(h / 32);
  }
  return s;
}

async function open(browser: Browser, size: string): Promise<BrowserContext> {
  const [width, height] = size.split('x').map(Number);
  const phone = width <= 960;
  return browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  });
}

/** Speicher vor dem ersten Skript der Seite füllen: Look, Deck, Thema, Name und der gespeicherte Platz. */
async function seed(page: Page, entries: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([entries, look, deck, theme]) => {
      for (const [k, v] of Object.entries(entries)) {
        const x = v && typeof v === 'object' ? { ...v, ts: Date.now() } : v;
        localStorage.setItem(`schnautz:${k}`, JSON.stringify(x));
      }
      localStorage.setItem('schnautz:design', JSON.stringify(look));
      localStorage.setItem('schnautz:deck', JSON.stringify(deck));
      localStorage.setItem('schnautz:theme', JSON.stringify(theme));
      document.documentElement.dataset.theme = theme;
    },
    [entries, LOOK, DECK, THEME] as const,
  );
}

/** Startseite laden, KIs anhalten und die Karte „Fortsetzen“ (oder „Zurück an den Tisch“) tippen. */
async function resume(page: Page, act: 'resumehost' | 'resumeguest'): Promise<void> {
  await page.goto(START);
  await page.waitForFunction(() => !!window.__schnautz);
  // Sonst misst PW_LOOK=legacy still Sticker
  const d = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  expect([d.look, d.deck]).toEqual([LOOK, DECK]);
  await page.evaluate(() => {
    window.__schnautz!.BOTS.hold = true;
  });
  const play = page.locator('.playbtn');
  if (await play.isVisible()) await play.click();
  await page.click(`[data-act=${act}]`);
  // Die Maus bliebe sonst über dem Tisch stehen und hielte dort einen Hover (Karten heben sich und fallen zurück)
  await page.mouse.move(0, 0);
}

/** Warten, bis Abläufe, Schriften und Übergänge durch sind, dann die Uhr der Seite anhalten. */
async function settle(page: Page, screen: Fixture['meta']['screen']): Promise<void> {
  const sel = { lobby: '#scr-lobby', game: '#scr-game', result: '#overlay .result' }[screen];
  await page.locator(sel).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded' && !window.__schnautz?.SEQ.busy);
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => !window.__schnautz?.SEQ.busy);
  await freeze(page);
}

/**
 * Uhr der Seite anhalten. pauseAt will einen Zeitpunkt in der Zukunft, unter Last vergeht zwischen Abfrage und Aufruf
 * aber Zeit. Deshalb mit wachsendem Vorlauf noch einmal versuchen.
 */
async function freeze(page: Page): Promise<void> {
  for (const ahead of [300, 1000, 3000]) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + ahead);
      return;
    } catch (e) {
      if (!String(e).includes('to the past')) throw e;
    }
  }
  throw new Error('Uhr der Seite ließ sich nicht anhalten');
}

async function snap(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`);
}

for (const fx of fixtures) {
  const { id, screen } = fx.meta;
  for (const size of SIZES) {
    const code = codeFor(id, size);
    const host = { ...fx.host, code };

    if (!fx.guest) {
      test(`${id} ${size}`, async ({ browser }) => {
        const ctx = await open(browser, size);
        try {
          const page = await ctx.newPage();
          await page.clock.install({ time: T0 });
          await seed(page, { name: fx.host.name, host });
          await resume(page, 'resumehost');
          await settle(page, screen);
          await snap(page, `${id}-${size}`);
          // Offenes Menü am eigenen Zug
          if (fx.meta.goal === 'turn' && fx.meta.seats === 4) {
            await page.clock.resume();
            await page.click('#btn-menu');
            await page.mouse.move(0, 0);
            await page.locator('#menu').waitFor({ state: 'visible' });
            await page.waitForTimeout(600);
            await freeze(page);
            await snap(page, `${id.replace('-turn-', '-menu-')}-${size}`);
          }
        } finally {
          await ctx.close();
        }
      });
      continue;
    }

    // Gast-Fall: Der Gastgeber läuft im Hintergrund, aufgenommen wird der Gast an seinem Platz
    const g = fx.guest;
    test(`${id} ${size}`, async ({ browser }) => {
      const hctx = await open(browser, '1280x720');
      const gctx = await open(browser, size);
      try {
        const hp = await hctx.newPage();
        await hp.clock.install({ time: T0 });
        await seed(hp, { name: fx.host.name, host });
        await resume(hp, 'resumehost');
        await settle(hp, screen);
        await hp.clock.resume();
        const page = await gctx.newPage();
        await page.clock.install({ time: T0 });
        await seed(page, { name: g.name, guest: { code, pid: g.pid, key: g.key, name: g.name } });
        await resume(page, 'resumeguest');
        // Gast sitzt erst, wenn der Gastgeber ihn wieder online sieht
        await hp.waitForFunction((pid) => window.__schnautz?.H.st?.players.find((p) => p.id === pid)?.online, g.pid);
        await settle(page, screen);
        await snap(page, `${id}-${size}`);
      } finally {
        await gctx.close();
        await hctx.close();
      }
    });
  }
}
