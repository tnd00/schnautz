/*
 * Schnautz mit zwei echten Browsern: Lobby, zweiter Tab, Regeln, Chat, Runden über die Oberfläche,
 * Neuladen von Gast und Host, Verlassen und Wiederkommen.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  desktop,
  Errors,
  hostTable,
  joinTable,
  menuConfirm,
  mustView,
  myId,
  phone,
  playerCount,
  START,
  view,
  waitForChange,
  waitForPhase,
} from './helpers';

type Prefer = 'swap' | 'pass' | 'knock';

/** Genau ein Zug über die Oberfläche, ausgeführt von der Person, die dran ist. */
async function step(host: Page, byId: Map<string, Page>, prefer: Prefer): Promise<void> {
  const v = await mustView(host);
  if (v.phase === 'choose') {
    const p = byId.get(v.players[v.dealer].id);
    if (!p) throw new Error('Geber unbekannt');
    await p.click('[data-act=keep]');
  } else if (v.phase === 'play') {
    const p = byId.get(v.players[v.turn].id);
    if (!p) throw new Error('Spieler unbekannt');
    const pv = await mustView(p);
    const active = pv.players.filter((x) => !x.out).length;
    const canKnock = !pv.knocker && pv.turns >= active;
    if (prefer === 'knock' && canKnock) await p.click('[data-act=knock]');
    else if (prefer === 'pass') await p.click('[data-act=pass]');
    else {
      await p.click('#me .hand .card >> nth=0');
      await p.click('#center .middle .card >> nth=1');
      await p.click('[data-act=swap]');
    }
  } else return;
  await waitForChange(host, v.n);
}

/** Beide bestätigen das Rundenergebnis. */
async function bothReady(host: Page, guest: Page, next = ['choose', 'play', 'over']): Promise<void> {
  await host.click('#overlay [data-act=ready]');
  await guest.click('#overlay [data-act=ready]');
  await waitForPhase(host, next);
}

test('zwei Browser spielen Schnautz', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guestCtx = await phone(browser);
  const guest = errors.watch(await guestCtx.newPage(), 'gast');

  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');
  await expect.poll(() => playerCount(host)).toBe(2);

  await test.step('zweiter Tab im selben Browser bekommt einen eigenen Platz', async () => {
    const tab = errors.watch(await guestCtx.newPage(), 'gast2');
    await joinTable(tab, code, 'Lena');
    await expect.poll(() => playerCount(host)).toBe(3);
    await expect(guest.locator('#scr-lobby')).toBeVisible();
    await menuConfirm(tab, '#menu-leave');
    await expect.poll(() => playerCount(host)).toBe(2);
    await tab.close();
  });

  await test.step('Regeln des Hosts kommen beim Gast an', async () => {
    await host.click('[data-act=lives][data-d="1"]');
    await expect.poll(async () => (await view(guest))?.rules.lives).toBe(4);
    await host.click('[data-act=lives][data-d="-1"]');
    await host.click('[data-act=lives][data-d="-1"]');
    await expect.poll(async () => (await view(guest))?.rules.lives).toBe(2);
  });

  await host.click('[data-act=start]');
  await expect(guest.locator('#scr-game')).toBeVisible();
  const ids = [await myId(host), await myId(guest)];
  const byId = new Map([
    [ids[0], host],
    [ids[1], guest],
  ]);

  await test.step('Chat', async () => {
    await host.fill('#chatin', 'Hallo nach Prag!');
    await host.press('#chatin', 'Enter');
    await expect.poll(async () => (await view(guest))?.log.some((e) => e.k === 'chat')).toBe(true);
  });

  await test.step('eine Runde bis zum Ergebnis', async () => {
    for (let i = 0; i < 40; i++) {
      const v = await mustView(host);
      if (v.phase === 'end' || v.phase === 'over') break;
      await step(host, byId, v.turns >= 3 ? 'knock' : i % 3 === 2 ? 'pass' : 'swap');
    }
    await waitForPhase(host, ['end', 'over']);
  });

  await test.step('Gast lädt neu und sitzt wieder auf seinem Platz', async () => {
    await guest.reload();
    await expect(guest.locator('#scr-start')).toBeVisible();
    await guest.click('#btn-join');
    await expect(guest.locator('#scr-game')).toBeVisible();
    expect(await myId(guest)).toBe(ids[1]);
  });

  await test.step('Host lädt neu und setzt den Tisch fort', async () => {
    await host.reload();
    await host.click('[data-act=resumehost]');
    await expect(host.locator('#scr-game')).toBeVisible();
    await expect.poll(async () => (await view(host))?.players.every((p) => p.online), { timeout: 40_000 }).toBe(true);
  });

  await test.step('bis zum Partieende spielen', async () => {
    for (let i = 0; i < 300; i++) {
      const v = await mustView(host);
      if (v.phase === 'over') break;
      if (v.phase === 'end') await bothReady(host, guest);
      else await step(host, byId, v.turns >= 2 ? 'knock' : 'swap');
    }
    expect((await mustView(host)).phase).toBe('over');
    expect((await mustView(host)).winner).toBeTruthy();
  });

  await test.step('Tisch ansehen, Regeln und Verlauf', async () => {
    await guest.click('[data-act=peek]');
    await guest.click('[data-act=unpeek]');
    await expect(guest.locator('#overlay .paper')).toBeVisible();
    await host.click('[data-act=peek]');
    await host.click('#btn-rules');
    await expect(host.locator('#modal .paper')).toBeVisible();
    await host.keyboard.press('Escape');
    await host.click('[data-act=unpeek]');
  });

  await test.step('Gast verlässt die laufende Partie und kommt zurück', async () => {
    await bothReady(host, guest, ['choose', 'play']);
    await menuConfirm(guest, '#menu-leave');
    await waitForPhase(host, ['over']);
    await guest.fill('#name', 'Lena');
    await guest.fill('#joincode', code);
    await guest.click('#btn-join');
    await expect(guest.locator('#scr-game')).toBeVisible();
  });

  await test.step('zurück in die Lobby, dann löst der Host den Tisch auf', async () => {
    await host.click('[data-act=peek]');
    await menuConfirm(host, '#menu-lobby');
    await expect(host.locator('#scr-lobby')).toBeVisible();
    await expect(guest.locator('#scr-lobby')).toBeVisible();
    await menuConfirm(host, '#menu-leave');
    await expect(guest.locator('#start-err')).toBeVisible();
  });

  expect(errors.list).toEqual([]);
});

test('Startseite ohne Namen weist freundlich darauf hin', async ({ page }) => {
  await page.goto(START);
  await page.click('#btn-host');
  await expect(page.locator('.toast').first()).toContainText('heißt');
  await expect(page.locator('#scr-start')).toBeVisible();
});
