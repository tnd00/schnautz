/*
 * Rückkehr an den Tisch: per Einladungslink auf den eigenen Platz (Lobby und laufende Partie), Neuladen ohne Tippen
 * ein zweiter Gastgeber-Tab, der den Tisch erst nach Rückfrage übernimmt, und die Neulade-Pflicht für alte Seiten.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  closeAll,
  desktop,
  Errors,
  hostTable,
  joinTable,
  menuConfirm,
  myId,
  phone,
  playerCount,
  START,
  startGame,
  view,
} from './helpers';

test.afterEach(closeAll);

const seatOnline = async (host: Page, id: string): Promise<boolean | undefined> =>
  (await view(host))?.players.find((p) => p.id === id)?.online;

test('Rückkehr per Link landet auf dem eigenen Platz, in der Lobby und mitten in der Partie', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guestCtx = await phone(browser);
  const guest = errors.watch(await guestCtx.newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');
  await expect.poll(() => playerCount(host)).toBe(2);
  const lena = await myId(guest);

  await test.step('neuer Tab mit gleichem Namen übernimmt den eigenen Platz, der alte Tab sagt es', async () => {
    const tab = errors.watch(await guestCtx.newPage(), 'gast2');
    await joinTable(tab, code, 'Lena');
    expect(await myId(tab)).toBe(lena);
    await expect(guest.locator('#start-err')).toContainText('anderen Tab');
    expect(await playerCount(host)).toBe(2);
    // Ein anderer Name im selben Browser bleibt ein eigener Platz
    const tom = errors.watch(await guestCtx.newPage(), 'tom');
    await joinTable(tom, code, 'Tom');
    await expect.poll(() => playerCount(host)).toBe(3);
    expect(await myId(tom)).not.toBe(lena);
    await menuConfirm(tom, '#menu-leave');
    await expect.poll(() => playerCount(host)).toBe(2);
    await tom.close();
    await tab.close();
    // Der verdrängte erste Tab soll später nicht dazwischenfunken
    await guest.close();
  });

  await test.step('neuer Browser mit gleichem Namen bekommt den Platz, sobald er offline ist', async () => {
    await expect.poll(() => seatOnline(host, lena), { timeout: 30_000 }).toBe(false);
    const other = errors.watch(await (await phone(browser)).newPage(), 'gast3');
    await joinTable(other, code, 'lena');
    expect(await myId(other)).toBe(lena);
    await expect.poll(() => seatOnline(host, lena)).toBe(true);
    expect((await view(host))?.players.filter((p) => p.name.startsWith('Lena'))).toHaveLength(1);
    await other.close();
  });

  await test.step('mitten in der Partie: Tab zu, Link noch einmal, gleicher Platz', async () => {
    await expect.poll(() => seatOnline(host, lena), { timeout: 30_000 }).toBe(false);
    const back = errors.watch(await guestCtx.newPage(), 'gast4');
    await joinTable(back, code, 'Lena');
    expect(await myId(back)).toBe(lena);
    await startGame(host);
    await expect(back.locator('#scr-game')).toBeVisible();
    const n = (await view(host))?.players.length;
    // Der alte Tab ist noch offen und online: Ohne KI-Platz käme ein Fremder hier nicht mehr an den Tisch
    const again = errors.watch(await guestCtx.newPage(), 'gast5');
    await again.goto(`${START}#${code}`);
    await again.fill('#name', 'Lena');
    await again.click('#btn-join');
    await expect(again.locator('#scr-game')).toBeVisible();
    expect(await myId(again)).toBe(lena);
    await expect(back.locator('#start-err')).toContainText('anderen Tab');
    expect((await view(host))?.players.length).toBe(n);
    expect((await view(host))?.players.find((p) => p.id === lena)?.bot).toBeFalsy();
  });

  expect(errors.list).toEqual([]);
});

test('Gastgeber lädt neu und ist ohne Tippen zurück, ein zweiter Tab holt den Tisch nur nach Rückfrage', async ({
  browser,
}) => {
  const errors = new Errors();
  const hostCtx = await desktop(browser);
  const host = errors.watch(await hostCtx.newPage(), 'host');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');
  await expect.poll(() => playerCount(host)).toBe(2);

  await test.step('Neuladen führt von selbst zurück an den Tisch', async () => {
    await host.reload();
    await expect(host.locator('#scr-lobby')).toBeVisible();
    await expect(host.locator('.toast', { hasText: 'Zurück an deinem Tisch' })).toBeVisible();
    expect(await host.evaluate(() => window.__schnautz?.App.code)).toBe(code);
    await expect.poll(async () => (await view(host))?.players.every((p) => p.online), { timeout: 40_000 }).toBe(true);
  });

  const tab = errors.watch(await hostCtx.newPage(), 'host2');
  await test.step('ein neuer Tab fragt, statt den Tisch einfach zu nehmen', async () => {
    await tab.goto(START);
    const card = tab.locator('#resume .resume-host');
    await expect(card).toContainText('in einem anderen Tab offen');
    await expect(card.locator('[data-act=resumehost]')).toHaveText('Hierher holen');
    // Der alte Tab spielt unberührt weiter
    await expect(host.locator('#scr-lobby')).toBeVisible();
  });

  await test.step('Hierher holen: Der alte Tab gibt ab, die Gäste kommen im neuen an', async () => {
    const n0 = (await view(host))?.n ?? 0;
    await tab.click('#resume [data-act=resumehost]');
    await expect(host.locator('#start-err')).toHaveText('Der Tisch läuft jetzt im anderen Tab.');
    await expect(tab.locator('#scr-lobby')).toBeVisible({ timeout: 30_000 });
    expect(await tab.evaluate(() => window.__schnautz?.App.code)).toBe(code);
    await expect.poll(async () => (await view(tab))?.players.every((p) => p.online), { timeout: 40_000 }).toBe(true);
    expect((await view(tab))?.n ?? 0).toBeGreaterThanOrEqual(n0);
    await expect.poll(async () => (await view(guest))?.n, { timeout: 20_000 }).toBe((await view(tab))?.n);
    // Der alte Tab zeigt jetzt die Rückfrage für den Rückweg
    await expect(host.locator('#resume .resume-host')).toContainText('in einem anderen Tab offen');
  });

  await test.step('neuer Tisch im alten Tab, während der Tisch im anderen läuft: erst Rückfrage', async () => {
    await host.fill('#name', 'Tahna');
    await host.click('#btn-host');
    await expect(host.locator('#modal')).toContainText('läuft in einem anderen Tab');
    await host.click('#modal [data-act=closemodal]');
    await expect(host.locator('#scr-start')).toBeVisible();
    await expect(tab.locator('#scr-lobby')).toBeVisible();
  });

  await test.step('bestätigt: Der Tisch im anderen Tab geht für alle zu, hier geht ein neuer auf', async () => {
    await host.click('#btn-host');
    await host.click('#cfm-ok');
    await expect(tab.locator('#start-err')).toContainText('neuen Tisch aufgemacht');
    await expect(guest.locator('#start-err')).toBeVisible();
    await expect(host.locator('#scr-lobby')).toBeVisible({ timeout: 30_000 });
    const fresh = await host.evaluate(() => window.__schnautz?.App.code);
    expect(fresh).not.toBe(code);
    expect(await playerCount(host)).toBe(1);
  });

  expect(errors.list).toEqual([]);
});

test('Gast mit altem Build lädt nach der Abweisung von selbst neu und landet am Tisch', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await guest.goto(`${START}#${code}`);
  // Alter Build: nur über den Testzugang, nach dem Neuladen ist er weg. Der Merker zeigt, ob neu geladen wurde
  await guest.evaluate(() => {
    const s = window.__schnautz;
    if (!s) throw new Error('kein Testzugang');
    s.G.fakeV = '2.0.0';
    (window as unknown as { oldPage?: boolean }).oldPage = true;
  });
  await guest.fill('#name', 'Lena');
  await guest.click('#btn-join');
  await expect(guest.locator('#start-err')).toContainText('Lade die Seite neu');
  await expect(guest.locator('#updbar')).toContainText('lädt gleich von selbst neu');
  await expect(guest.locator('#scr-lobby')).toBeVisible({ timeout: 30_000 });
  expect(await guest.evaluate(() => (window as unknown as { oldPage?: boolean }).oldPage)).toBeUndefined();
  expect(await guest.evaluate(() => window.__schnautz?.App.code)).toBe(code);
  await expect.poll(() => playerCount(host)).toBe(2);
  expect(errors.list).toEqual([]);
});
