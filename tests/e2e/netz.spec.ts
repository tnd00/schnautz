/*
 * Suche nach dem Tisch: Ein falscher Code endet nach fester Frist, die Rückkehr an den eigenen Tisch wartet lange
 * genug, damit der Gastgeber neu laden kann.
 */
import { expect, test, type Page } from '@playwright/test';
import { closeAll, desktop, Errors, hostTable, joinTable, START } from './helpers';

test.afterEach(closeAll);

/** Auf der Startseite mit Code beitreten und die Zeit bis zur Fehlermeldung messen. */
async function joinWrongCode(page: Page, code: string): Promise<number> {
  // Am Handy liegen Name und Code im Bogen hinter „Tisch aufmachen“
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', 'Lena');
  await page.fill('#joincode', code);
  const t0 = Date.now();
  await page.click('#btn-join');
  await expect(page.locator('#start-err')).toContainText(`Kein Tisch mit dem Code ${code} gefunden`, {
    timeout: 15_000,
  });
  return Date.now() - t0;
}

test('falscher Code endet in unter 10 Sekunden', async ({ browser }) => {
  const errors = new Errors();
  const page = errors.watch(await (await desktop(browser)).newPage(), 'gast');
  await page.goto(START);
  // Gültige Zeichen, am lokalen Server ist dieser Code frei
  const code = 'ZZZZZ';

  await test.step('erster Versuch', async () => {
    const ms = await joinWrongCode(page, code);
    expect(ms).toBeLessThan(10_000);
    await expect(page.locator('#scr-start')).toBeVisible();
    // Kein WLAN-Rat, denn der Server hat klar gesagt, dass es den Tisch nicht gibt
    await expect(page.locator('#start-err')).not.toContainText('WLAN');
  });

  await test.step('zweiter Versuch im selben Tab zählt nicht als Rückkehr', async () => {
    const ms = await joinWrongCode(page, code);
    expect(ms).toBeLessThan(10_000);
    expect(await page.evaluate(() => window.__schnautz?.G.resume)).toBe(false);
  });

  expect(errors.list).toEqual([]);
});

test('Gastgeber weg beim Fortsetzen meldet sich nicht vorschnell', async ({ browser }) => {
  test.setTimeout(2 * 60_000);
  const errors = new Errors();
  const hostCtx = await desktop(browser);
  const guestCtx = await desktop(browser);
  const host = errors.watch(await hostCtx.newPage(), 'host');
  const first = errors.watch(await guestCtx.newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await joinTable(first, code, 'Lena');
  await expect(first.locator('#scr-lobby')).toBeVisible();

  let guest = first;
  let t0 = 0;
  await test.step('Gastgeber schließt den Tab, der Gast will zurück an den Tisch', async () => {
    await host.close();
    await first.close();
    // Neuer Tab im selben Browser: Der gespeicherte Platz bietet „Zurück an den Tisch“ an
    guest = errors.watch(await guestCtx.newPage(), 'gast');
    await guest.goto(START);
    t0 = Date.now();
    await guest.click('[data-act=resumeguest]');
    await expect(guest.locator('#scr-wait')).toBeVisible();
    expect(await guest.evaluate(() => window.__schnautz?.G.resume)).toBe(true);
  });

  await test.step('nach mehr als der Frist eines frischen Beitritts wartet der Gast weiter', async () => {
    await expect(guest.locator('#wait-sub')).toContainText('Vielleicht lädt der Gastgeber gerade neu');
    // Jede halbe Sekunde nachsehen, damit auch ein kurzer Rauswurf auffällt
    while (Date.now() - t0 < 18_000) {
      expect(await guest.locator('#scr-wait').isVisible()).toBe(true);
      await guest.waitForTimeout(500);
    }
    await expect(guest.locator('#start-err')).toBeHidden();
    // Kein WLAN-Rat, solange der Server sagt, dass der Tisch gerade nicht da ist
    await expect(guest.locator('#wait-sub')).not.toContainText('WLAN');
  });

  await test.step('der Gastgeber kommt zurück, der Gast findet von selbst wieder an den Tisch', async () => {
    const back = errors.watch(await hostCtx.newPage(), 'host');
    await back.goto(START);
    await back.click('[data-act=resumehost]');
    await expect(back.locator('#scr-lobby')).toBeVisible();
    await expect(guest.locator('#scr-lobby')).toBeVisible();
  });

  expect(errors.list).toEqual([]);
});
