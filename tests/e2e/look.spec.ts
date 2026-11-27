/*
 * Design und Kartendeck (Runde 6 von 2.8, legacy.md 13.2): Bogen „Design“ im Menü ⋯, die Wahl wirkt sofort am Tisch
 * dahinter und bleibt nach dem Neuladen. Legacy blitzt beim Start nie in Sticker oder ohne Dekor auf, Menü und Fenster
 * bleiben in beiden Looks Sticker, zurück geht ohne Neuladen. Alle vier Kombinationen stehen am Tisch, kaputter, alter
 * oder gesperrter Speicher ergibt den Standard (Sticker mit Vinyl).
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { closeAll, desktop, Errors, fitFindings, START, startGame } from './helpers';

test.afterEach(closeAll);

test('Design: Wahl über das Menü wirkt sofort und bleibt nach dem Neuladen', async ({ browser }) => {
  const errors = new Errors();
  const ctx = await desktop(browser);
  const page = errors.watch(await ctx.newPage(), 'host');
  const html = page.locator('html');
  await page.goto(START);
  // Unabhängig von PW_LOOK und PW_DECK mit dem Standard anfangen
  await page.evaluate(() => ['design', 'deck', 'theme'].forEach((k) => localStorage.removeItem(`schnautz:${k}`)));
  await page.reload();
  await expect(html).toHaveAttribute('data-look', 'sticker');
  await expect(html).toHaveAttribute('data-deck', 'vinyl');

  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', 'Tahna');
  await page.click('#btn-bots');
  await expect(page.locator('#scr-lobby')).toBeVisible();
  await startGame(page);
  await expect(page.locator('#scr-game')).toBeVisible();

  const sheet = page.locator('#modal .paper.dsg');
  const radio = (k: string, v: string) => sheet.locator(`[role=radio][data-dsg=${k}][data-v=${v}]`);
  await page.click('#btn-menu');
  await page.click('#menu-design');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(sheet.locator('[role=radiogroup]')).toHaveCount(2);
  await expect(radio('look', 'sticker')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('deck', 'vinyl')).toHaveAttribute('aria-checked', 'true');

  // Legacy wirkt sofort, der Bogen bleibt offen, der Tisch dahinter bleibt stehen
  await radio('look', 'legacy').click();
  await expect(html).toHaveAttribute('data-look', 'legacy');
  await expect(html).toHaveClass(/\blook-ready\b/);
  await expect(radio('look', 'legacy')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('look', 'sticker')).toHaveAttribute('aria-checked', 'false');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#scr-game')).toBeVisible();

  // Pfeiltaste wählt das nächste Deck und nimmt den Fokus mit
  await radio('deck', 'vinyl').focus();
  await page.keyboard.press('ArrowDown');
  await expect(radio('deck', 'classic')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('deck', 'classic')).toBeFocused();
  await expect(html).toHaveAttribute('data-deck', 'classic');

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('#btn-menu')).toBeFocused();

  await page.reload();
  await expect(html).toHaveAttribute('data-look', 'legacy');
  await expect(html).toHaveAttribute('data-deck', 'classic');
  await expect(page.locator('#scr-game')).toBeVisible();

  // Zurück zu Sticker ohne Neuladen, Tipp daneben schließt
  await page.click('#btn-menu');
  await page.click('#menu-design');
  await radio('look', 'sticker').click();
  await expect(html).toHaveAttribute('data-look', 'sticker');
  await expect(html).toHaveAttribute('data-theme', 'light');
  // Sticker dunkel ist die dritte Wahl und setzt nur das Thema, das Deck bleibt
  await radio('look', 'dark').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-look', 'sticker');
  await expect(html).toHaveAttribute('data-deck', 'classic');
  await expect(radio('look', 'dark')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('look', 'sticker')).toHaveAttribute('aria-checked', 'false');
  await page.mouse.click(8, 430);
  await expect(sheet).toHaveCount(0);
  expect(errors.list).toEqual([]);
});

const FELT = 'rgb(11, 34, 25)';
type Store = Record<string, string | null>;

/** Speicher genau einmal vor dem ersten Laden setzen (null löscht), danach gilt, was die Seite selbst speichert */
async function seed(ctx: BrowserContext, store: Store): Promise<void> {
  await ctx.addInitScript((s: Store) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    // Unabhängig von PW_LOOK, PW_DECK und PW_THEME (storageState) anfangen
    for (const k of ['design', 'deck', 'theme', 'look', 'prefs']) localStorage.removeItem(`schnautz:${k}`);
    for (const [k, v] of Object.entries(s)) if (v !== null) localStorage.setItem(k, v);
  }, store);
}

/** Partie mit KIs als Gastgeber, danach ist der Tisch offen */
async function botTable(page: Page): Promise<void> {
  await page.goto(START);
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', 'Tahna');
  await page.click('#btn-bots');
  await expect(page.locator('#scr-lobby')).toBeVisible();
  await startGame(page);
  await expect(page.locator('#scr-game')).toBeVisible();
}

const bodyBg = (page: Page): Promise<string> => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Farben und Schrift aller Elemente unter sel, als ein Fingerabdruck des Rahmens */
const skin = (page: Page, sel: string): Promise<string> =>
  page.evaluate((s) => {
    const root = document.querySelector(s);
    if (!root) return 'fehlt';
    return [root, ...root.querySelectorAll('*')]
      .map((el) => {
        const cs = getComputedStyle(el);
        return [
          cs.color,
          cs.backgroundColor,
          cs.backgroundImage,
          cs.borderTopColor,
          cs.boxShadow,
          cs.fontFamily,
        ].join();
      })
      .join('\n');
  }, sel);

test('Design: Legacy beim Start und nach dem Neuladen am Tisch blitzt nicht in Sticker oder ohne Dekor auf', async ({
  browser,
}) => {
  const errors = new Errors();
  const ctx = await desktop(browser);
  await seed(ctx, { 'schnautz:design': '"legacy"' });
  // Hält jeden Moment fest, in dem der Tisch sichtbar ist, bis Legacy fertig geladen dasteht
  await ctx.addInitScript(() => {
    const seen: { look?: string; ready: boolean; bg: string; after: string }[] = [];
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    // Beim Init-Skript gibt es noch kein html, beobachtet wird deshalb document
    const mo = new MutationObserver(() => {
      const html = document.documentElement;
      const g = document.getElementById('scr-game');
      if (!g || g.hidden || !document.body?.classList.contains('ingame')) return;
      if (getComputedStyle(g).visibility === 'hidden') return;
      const ready = html.classList.contains('look-ready');
      const body = getComputedStyle(document.body);
      seen.push({
        look: html.dataset.look,
        ready,
        bg: body.backgroundColor,
        after: getComputedStyle(document.body, '::after').content,
      });
      if (ready) mo.disconnect();
    });
    mo.observe(document, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class', 'data-look'] });
  });
  const page = errors.watch(await ctx.newPage(), 'host');
  const seen = () => page.evaluate(() => (window as unknown as { __seen: unknown[] }).__seen);
  const legacyOnly = [expect.objectContaining({ look: 'legacy', ready: true, bg: FELT, after: '""' })];

  await botTable(page);
  await expect(page.locator('html')).toHaveAttribute('data-look', 'legacy');
  expect(await seen()).toEqual(legacyOnly);

  // Neuladen am Tisch: autoresume führt ohne Tippen zurück, das Stück lädt dabei neu
  await page.reload();
  await expect(page.locator('#scr-game')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\blook-ready\b/);
  await expect.poll(seen).toEqual(legacyOnly);
  expect(errors.list).toEqual([]);
});

test('Design: Tisch in Legacy, Menü und Fenster bleiben Sticker, zurück zu Sticker ohne Neuladen', async ({
  browser,
}) => {
  const errors = new Errors();
  const ctx = await desktop(browser);
  await seed(ctx, {});
  const page = errors.watch(await ctx.newPage(), 'host');
  const html = page.locator('html');
  await botTable(page);
  await expect(html).toHaveAttribute('data-look', 'sticker');
  const stickerBg = await bodyBg(page);
  expect(stickerBg).not.toBe(FELT);

  const frame = async (): Promise<string[]> => {
    await page.click('#btn-menu');
    await expect(page.locator('#menu')).toBeVisible();
    const menu = await skin(page, '#menu');
    await page.click('#menu [data-act=menurules]');
    await expect(page.locator('#modal .paper')).toBeVisible();
    const rules = await skin(page, '#modal .paper');
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal .paper')).toHaveCount(0);
    return [menu, rules];
  };
  const stickerFrame = await frame();

  await page.click('#btn-menu');
  await page.click('#menu-design');
  await page.locator('#modal [role=radio][data-dsg=look][data-v=legacy]').click();
  await expect(html).toHaveClass(/\blook-ready\b/);
  await expect.poll(() => bodyBg(page)).toBe(FELT);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal .paper')).toHaveCount(0);
  expect(await frame()).toEqual(stickerFrame);

  // Zurück: Das Stück bleibt geladen, wirkt aber nicht mehr
  await page.click('#btn-menu');
  await page.click('#menu-design');
  await page.locator('#modal [role=radio][data-dsg=look][data-v=sticker]').click();
  await expect(html).toHaveAttribute('data-look', 'sticker');
  expect(await bodyBg(page)).toBe(stickerBg);
  expect(await page.evaluate(() => getComputedStyle(document.body, '::after').content)).toBe('none');
  expect(
    await page.evaluate(() => [...document.styleSheets].some((s) => /\/legacy-[\w-]+\.css$/.test(s.href ?? ''))),
  ).toBe(true);
  await page.keyboard.press('Escape');
  expect(await frame()).toEqual(stickerFrame);
  expect(errors.list).toEqual([]);
});

test('Design: alle vier Kombinationen aus Design und Kartendeck stehen am Tisch', async ({ browser }) => {
  const errors = new Errors();
  const ctx = await desktop(browser);
  await seed(ctx, {});
  const page = errors.watch(await ctx.newPage(), 'host');
  const html = page.locator('html');
  await botTable(page);
  const face = (): Promise<string> =>
    page
      .locator('#scr-game .card[data-r]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundImage);
  const faces: Record<string, string> = {};
  for (const look of ['sticker', 'legacy'] as const) {
    for (const deck of ['vinyl', 'classic'] as const) {
      await page.evaluate(
        ([l, d]) => {
          localStorage.setItem('schnautz:design', JSON.stringify(l));
          localStorage.setItem('schnautz:deck', JSON.stringify(d));
        },
        [look, deck],
      );
      await page.reload();
      await expect(page.locator('#scr-game')).toBeVisible();
      await expect(html).toHaveAttribute('data-look', look);
      await expect(html).toHaveAttribute('data-deck', deck);
      if (look === 'legacy') await expect(html).toHaveClass(/\blook-ready\b/);
      await expect(page.locator('#scr-game .card[data-r]').first()).toBeVisible();
      expect((await bodyBg(page)) === FELT, `${look}/${deck} Grund`).toBe(look === 'legacy');
      expect.soft(await fitFindings(page), `${look}/${deck}`).toEqual([]);
      faces[`${look}/${deck}`] = await face();
    }
  }
  // Das Deck zeichnet die Karten in beiden Looks anders
  expect(faces['sticker/vinyl']).not.toBe(faces['sticker/classic']);
  expect(faces['legacy/vinyl']).not.toBe(faces['legacy/classic']);
  expect(errors.list).toEqual([]);
});

test('Design: kaputter, alter oder gesperrter Speicher ergibt den Standard', async ({ browser }) => {
  const check = async (store: Store, look: string, deck: string, label: string): Promise<void> => {
    const errors = new Errors();
    const ctx = await desktop(browser);
    await seed(ctx, store);
    const page = errors.watch(await ctx.newPage(), label);
    await page.goto(START);
    await expect(page.locator('html'), label).toHaveAttribute('data-look', look);
    await expect(page.locator('html'), label).toHaveAttribute('data-deck', deck);
    expect(errors.list).toEqual([]);
    await ctx.close();
  };
  await check({ 'schnautz:design': 'legacy', 'schnautz:deck': '"Klassisch"' }, 'sticker', 'vinyl', 'ohne JSON');
  await check({ 'schnautz:design': '{"x":1}', 'schnautz:deck': '7' }, 'sticker', 'vinyl', 'Objekt');
  await check({ 'schnautz:design': '"Legacy"', 'schnautz:theme': '"dunkel"' }, 'sticker', 'vinyl', 'Großschreibung');
  // Migration: Unter schnautz:look stand bis Runde 6 meist nur der alte Standard, er gilt nicht mehr
  await check({ 'schnautz:look': '"legacy"' }, 'sticker', 'vinyl', 'alter Schlüssel');
  await check({ 'schnautz:prefs': '{"look":"legacy","deck":"classic","calm":"on"}' }, 'sticker', 'vinyl', 'im Objekt');
  await check({ 'schnautz:look': '"sticker"', 'schnautz:design': '"legacy"' }, 'legacy', 'vinyl', 'neue Wahl');
  await check({ 'schnautz:design': '"legacy"', 'schnautz:deck': '"classic"' }, 'legacy', 'classic', 'gültig');

  // Gesperrter Speicher: Lesen wirft, die Seite lädt trotzdem und die Wahl gilt für die Sitzung
  const errors = new Errors();
  const ctx = await desktop(browser);
  await ctx.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('gesperrt', 'SecurityError');
    };
  });
  const page = errors.watch(await ctx.newPage(), 'gesperrt');
  const html = page.locator('html');
  await page.goto(START);
  await expect(html).toHaveAttribute('data-look', 'sticker');
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', 'Tahna');
  await page.click('#btn-bots');
  await expect(page.locator('#scr-lobby')).toBeVisible();
  await page.click('#btn-menu');
  await page.click('#menu-design');
  await page.locator('#modal [role=radio][data-dsg=look][data-v=legacy]').click();
  await expect(html).toHaveAttribute('data-look', 'legacy');
  await expect(html).toHaveClass(/\blook-ready\b/);
  expect(errors.list).toEqual([]);
});

test('Design: lädt das Legacy-Stück nicht, bleibt Sticker gewählt und ein Toast sagt es', async ({ browser }) => {
  const ctx = await desktop(browser);
  await seed(ctx, {});
  // Wie nach einer Veröffentlichung oder ohne Netz: das nachgeladene Stück kommt nicht an
  await ctx.route(/\/assets\/legacy-[^/]*\.(?:css|js)$/, (r) => r.abort());
  const page = await ctx.newPage();
  const html = page.locator('html');
  await botTable(page);
  await page.click('#btn-menu');
  await page.click('#menu-design');
  const radio = (v: string) => page.locator(`#modal [role=radio][data-dsg=look][data-v=${v}]`);
  await radio('legacy').click();
  await expect(page.locator('#toasts .toast')).toContainText('Legacy will gerade nicht laden');
  await expect(radio('sticker')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('legacy')).toHaveAttribute('aria-checked', 'false');
  await expect(html).toHaveAttribute('data-look', 'sticker');
  expect(await page.evaluate(() => localStorage.getItem('schnautz:design'))).not.toBe('"legacy"');
});
