/*
 * Gegen die KI am Handy: Von der Startseite in eine Lobby mit drei KIs, die gleich bei Spiel und Regeln aufgeht.
 * Spiel wählen, starten, der Tisch steht.
 * Normaler Tisch: Freie Plätze bleiben in der Lobby frei, der Start füllt sie mit KI.
 */
import { expect, test } from '@playwright/test';
import { chooseGame, closeAll, Errors, mustView, phone, START, startGame, view, waitForPhase } from './helpers';

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

test('Neuer Tisch: freie Plätze bleiben bis zum Start frei, dann spielt die KI sie', async ({ browser }) => {
  const errors = new Errors();
  const page = errors.watch(await (await phone(browser)).newPage(), 'host');
  await page.goto(START);
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', 'Tahna');
  await page.click('#btn-host');
  await expect(page.locator('#scr-lobby')).toBeVisible();

  // Auffüllen ist an, in der Lobby sitzt trotzdem nur der Gastgeber. Jeder freie Platz sagt, dass beim Start die KI
  // kommt, der KI-Knopf bleibt
  const v0 = await mustView(page);
  expect(v0.rules.fill).toBe(true);
  expect(v0.players).toHaveLength(1);
  await expect(page.locator('#seats .lseat.empty')).toHaveCount(3);
  await expect(page.locator('#seats .lseat.empty .freek')).toHaveText(Array(3).fill('KI beim Start'));
  await expect(page.locator('#seats [data-act=addbot]')).toHaveCount(3);
  await expect(page.locator('.lfill .rt')).toHaveText('Freie Plätze beim Start mit KI füllen');
  await expect(page.locator('[data-rule=fill]')).toBeChecked();

  await chooseGame(page, 'shithead');
  // Allein sitzen sperrt den Start nicht, der Knopf sagt, wer spielt
  const start = page.locator('[data-act=start]');
  await expect(start).toContainText('Shithead starten');
  await expect(start).toContainText('zu viert, 3 KI');
  await expect(page.locator('#lline')).toHaveText('Die 3 freien Plätze spielt die KI.');
  await startGame(page);

  await expect(page.locator('#scr-game')).toBeVisible();
  await waitForPhase(page, ['swap']);
  const v = await mustView(page);
  expect(v.players).toHaveLength(4);
  expect(v.players[0].id).toBe(v.host);
  expect(v.players.filter((p) => p.bot)).toHaveLength(3);
  expect(errors.list).toEqual([]);
});
