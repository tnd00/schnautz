import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { View } from '../../src/game/types';

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

/** Tisch eröffnen und den Code zurückgeben. */
export async function hostTable(page: Page, name: string): Promise<string> {
  await page.goto(START);
  // Am Handy liegen Name und Knöpfe im Popup hinter "Spielen"
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', name);
  await page.click('#btn-host');
  await expect(page.locator('#scr-lobby')).toBeVisible();
  const code = await page.evaluate(() => window.__schnautz?.App.code ?? '');
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  // Ohne Zeitlimit: Die Tests warten manchmal länger, als ein Zug dauern darf
  if (await page.locator('#lobby-tabs').isVisible()) await page.click('[data-act=ltab][data-t=table]');
  await page.locator('[data-range=turnSecs]').evaluate((el: HTMLInputElement) => {
    el.value = '0';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__schnautz?.App.view?.rules.turnSecs)).toBe(0);
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
