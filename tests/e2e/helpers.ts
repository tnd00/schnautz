import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { GameKind, View } from '../../src/game/types';

/** Startseite mit lokalem PeerServer und ohne STUN (siehe playwright.config.ts). */
export const START = './?peerhost=127.0.0.1&peerport=9000&noice=1';

/** Sammelt Fehler aus allen Seiten eines Tests, damit der Test am Ende darauf prüfen kann. */
export class Errors {
  readonly list: string[] = [];

  watch(page: Page, label: string): Page {
    page.on('pageerror', (e) => this.list.push(`[${label}] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.list.push(`[${label}] console: ${m.text()}`);
    });
    page.on('dialog', (d) => {
      this.list.push(`[${label}] Dialog: ${d.message()}`);
      void d.dismiss();
    });
    return page;
  }
}

/**
 * Nach jedem Test alle Fenster schließen. Sonst spielen die Partien früherer Tests im selben Browser weiter und
 * bremsen die späteren aus. In jeder Spec-Datei: test.afterEach(closeAll).
 */
export async function closeAll({ browser }: { browser: Browser }): Promise<void> {
  await Promise.all(browser.contexts().map((c) => c.close().catch(() => undefined)));
}

export async function desktop(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 1280, height: 860 } });
}

export async function phone(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
}

/** Die Ansicht, die die Seite gerade anzeigt (Kopie als JSON). */
export async function view(page: Page): Promise<View | null> {
  return page.evaluate(() => {
    const v = window.__schnautz?.App.view;
    return v ? (JSON.parse(JSON.stringify(v)) as View) : null;
  });
}

export async function mustView(page: Page): Promise<View> {
  const v = await view(page);
  if (!v) throw new Error('Keine Ansicht vorhanden');
  return v;
}

export const myId = (page: Page): Promise<string> => page.evaluate(() => window.__schnautz?.App.me ?? '');

/** Läuft gerade eine Shithead-Sequenz? Dann zeigt die Oberfläche noch den alten Stand. */
export const seqBusy = (page: Page): Promise<boolean> => page.evaluate(() => !!window.__schnautz?.SEQ.busy);

/** Wartet, bis sich der Zustand beim Host geändert hat (Zähler n im Verlauf). */
export async function waitForChange(page: Page, n0: number, timeout = 20_000): Promise<void> {
  await expect.poll(async () => (await view(page))?.n, { timeout }).not.toBe(n0);
}

export async function waitForPhase(page: Page, phases: string[], timeout = 20_000): Promise<void> {
  await expect
    .poll(async () => phases.includes((await view(page))?.phase ?? ''), {
      timeout,
      message: `Phase ${phases.join('/')}`,
    })
    .toBe(true);
}

/** Lobby am Handy: Reiter öffnen. Am PC stehen Tisch sowie Spiel und Regeln nebeneinander, dann passiert nichts. */
export async function lobbyTab(page: Page, tab: 'table' | 'game'): Promise<void> {
  if (await page.locator('#lobby-tabs').isVisible()) await page.click(`[data-act=ltab][data-t=${tab}]`);
}

/** Spiel wählen, am Handy im Reiter Spiel und Regeln. */
export async function chooseGame(page: Page, game: GameKind): Promise<void> {
  await lobbyTab(page, 'game');
  await page.click(`[data-act=game][data-g=${game}]`);
  await expect.poll(async () => (await view(page))?.game).toBe(game);
}

/**
 * Regeln, Leben, Zielpunkte und Zeit stehen im Bogen Einstellungen einer Spielkarte: öffnen, fn darin ausführen,
 * wieder schließen. Beim Gastgeber wählt das Öffnen das Spiel gleich mit.
 */
export async function withSettings(page: Page, game: GameKind, fn: (sheet: Locator) => Promise<void>): Promise<void> {
  await lobbyTab(page, 'game');
  await page.click(`[data-act=gsettings][data-g=${game}]`);
  const sheet = page.locator(`#modal .gset[data-g=${game}]`);
  await expect(sheet).toBeVisible();
  await fn(sheet);
  await sheet.locator('[data-act=closemodal]').click();
  await expect(page.locator('#modal .gset')).toHaveCount(0);
}

/** Partie starten. Am Handy führt im Reiter Tisch erst „Weiter zum Spiel“ zu Spiel und Regeln, dort steht der Start. */
export async function startGame(page: Page): Promise<void> {
  const next = page.locator('[data-act=lnext]');
  if (await next.isVisible()) await next.click();
  await page.click('[data-act=start]');
}

/** Tisch eröffnen und den Code zurückgeben. Danach ist der Reiter Tisch offen und kein Fenster mehr. */
export async function hostTable(page: Page, name: string): Promise<string> {
  await page.goto(START);
  // Am Handy liegen Name und Knöpfe im Bogen hinter „Tisch aufmachen“
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', name);
  await page.click('#btn-host');
  await expect(page.locator('#scr-lobby')).toBeVisible();
  const code = await page.evaluate(() => window.__schnautz?.App.code ?? '');
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  // Ohne Zeitlimit: Die Tests warten manchmal länger, als ein Zug dauern darf
  await withSettings(page, (await mustView(page)).game, async (sheet) => {
    await sheet.locator('[data-range=turnSecs]').evaluate((el: HTMLInputElement) => {
      el.value = '0';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__schnautz?.App.view?.rules.turnSecs)).toBe(0);
  });
  await lobbyTab(page, 'table');
  return code;
}

/** Mit Code über den Einladungslink beitreten. */
export async function joinTable(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`${START}#${code}`);
  await page.fill('#name', name);
  await page.click('#btn-join');
  await expect(page.locator('#scr-lobby, #scr-game').first()).toBeVisible();
}

export async function playerCount(page: Page): Promise<number> {
  return (await view(page))?.players.length ?? 0;
}

/** Menüeintrag wählen und die Rückfrage bestätigen. */
export async function menuConfirm(page: Page, item: '#menu-leave' | '#menu-lobby'): Promise<void> {
  await page.click('#btn-menu');
  await page.click(item);
  await page.click('#cfm-ok');
}
