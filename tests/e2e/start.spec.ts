/*
 * Gegen die KI am Handy: Von der Startseite in eine Lobby mit drei KIs, die gleich bei Spiel und Regeln aufgeht.
 * Spiel wählen, starten, der Tisch steht.
 */
import { expect, test } from '@playwright/test';
import { closeAll, Errors, mustView, phone, START, view, waitForPhase } from './helpers';

test.afterEach(closeAll);

test('Gegen die KI: Lobby mit drei KIs, Spielwahl am Handy, Durak startet', async ({ browser }) => {
  const errors = new Errors();
  const page = errors.watch(await (await phone(browser)).newPage(), 'host');
  await page.goto(START);
  // Am Handy liegen Name und Knöpfe im Bogen hinter „Tisch aufmachen“
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', 'Tahna');
  await page.click('#btn-bots');
  await expect(page.locator('#scr-lobby')).toBeVisible();

  // Drei KIs sitzen schon, freie Plätze füllt die KI
  await expect.poll(async () => (await view(page))?.players.filter((p) => p.bot).length).toBe(3);
  expect((await mustView(page)).rules.fill).toBe(true);

  // Einmal gleich im Reiter Spiel und Regeln, der Startknopf steht dort
  await expect(page.locator('#ltab-game')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#lpane-game')).toBeVisible();
  await expect(page.locator('#lpane-table')).toBeHidden();
  await expect(page.locator('[data-act=lnext]')).toBeHidden();

  await page.click('[data-act=game][data-g=durak]');
  await expect.poll(async () => (await view(page))?.game).toBe('durak');
  await expect(page.locator('#scr-lobby .lgc.g-durak')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-act=start]')).toContainText('Durak starten');
  await page.click('[data-act=start]');

  await expect(page.locator('#scr-game')).toBeVisible();
  await waitForPhase(page, ['play'], 20_000);
  const v = await mustView(page);
  expect(v.game).toBe('durak');
  expect(v.players).toHaveLength(4);
  expect(errors.list).toEqual([]);
});
