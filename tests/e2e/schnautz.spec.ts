/*
 * Schnautz mit zwei echten Browsern: Lobby, zweiter Tab, Regeln, Chat, Runden über die Oberfläche,
 * Neuladen von Gast und Host, Verlassen und Wiederkommen.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  closeAll,
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
  startGame,
  view,
  waitForChange,
  waitForPhase,
  withSettings,
} from './helpers';

test.afterEach(closeAll);

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

  await test.step('zweiter Tab im selben Browser mit gleichem Namen übernimmt den eigenen Platz', async () => {
    const lena = await myId(guest);
    const tab = errors.watch(await guestCtx.newPage(), 'gast2');
    await joinTable(tab, code, 'Lena');
    expect(await myId(tab)).toBe(lena);
    await expect(guest.locator('#start-err')).toContainText('anderen Tab');
    expect(await playerCount(host)).toBe(2);
    // Ein anderer Name im selben Browser bleibt ein eigener Platz
    const tom = errors.watch(await guestCtx.newPage(), 'gast3');
    await joinTable(tom, code, 'Tom');
    await expect.poll(() => playerCount(host)).toBe(3);
    await menuConfirm(tom, '#menu-leave');
    await expect.poll(() => playerCount(host)).toBe(2);
    await tom.close();
    // Der erste Tab holt sich den Platz mit seinen eigenen IDs zurück
    await tab.close();
    await guest.click('#btn-join');
    await expect(guest.locator('#scr-lobby')).toBeVisible();
    expect(await myId(guest)).toBe(lena);
    expect(await playerCount(host)).toBe(2);
  });

  await test.step('Regeln des Hosts kommen beim Gast an', async () => {
    await withSettings(host, 'schnautz', async (sheet) => {
      await sheet.locator('[data-act=lives][data-d="1"]').click();
      await expect.poll(async () => (await view(guest))?.rules.lives).toBe(4);
      await sheet.locator('[data-act=lives][data-d="-1"]').click();
      await sheet.locator('[data-act=lives][data-d="-1"]').click();
      await expect.poll(async () => (await view(guest))?.rules.lives).toBe(2);
    });
  });

  await startGame(host);
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

  await test.step('zu früh geklopft: Klopfen ist ausgegraut, bleibt antippbar und nennt den Grund am Tisch', async () => {
    // Bis zum ersten eigenen Zug dieser Runde, dann klopfen beide zu früh, erst wer dran ist, nach einem Tausch der andere
    for (let i = 0; i < 4 && (await mustView(host)).phase !== 'play'; i++) await step(host, byId, 'swap');
    for (let k = 0; k < 2; k++) {
      const v = await mustView(host);
      if (v.phase !== 'play' || v.knocker || v.turns >= v.players.filter((x) => !x.out).length) break;
      const p = byId.get(v.players[v.turn].id);
      if (!p) throw new Error('Spieler unbekannt');
      if (k === 0) {
        // Wer nicht dran ist und eine Karte antippt, erfährt warum, statt dass nichts passiert
        const other = byId.get(ids.find((id) => id !== v.players[v.turn].id) ?? '');
        if (!other) throw new Error('Spieler unbekannt');
        // Seit 2.8 tragen die Karten dann aria-disabled mit Grund, force wie beim Klopfen unten
        await expect(other.locator('#me [data-act=hand][data-i="0"]')).toHaveAttribute('aria-disabled', 'true');
        await other.click('#me [data-act=hand][data-i="0"]', { force: true });
        await expect(other.locator('#fly .nopelbl')).toHaveText('Du bist gerade nicht dran.');
        // Tauschen ohne Auswahl ist ausgegraut und nennt beim Tipp den Grund
        const swap = p.locator('#me [data-act=swap]');
        await expect(swap).toHaveAttribute('aria-disabled', 'true');
        await swap.click({ force: true });
        await expect(p.locator('#fly .nopelbl')).toHaveText('Wähle zuerst eine Karte.');
        expect((await mustView(host)).turn).toBe(v.turn);
      }
      const knock = p.locator('#me [data-act=knock]');
      await expect(knock).toHaveAttribute('aria-disabled', 'true');
      // force: Playwright hält aria-disabled für nicht klickbar, ein Mensch kann trotzdem tippen
      await knock.click({ force: true });
      await expect(p.locator('#fly .nopelbl')).toHaveText('Klopfen geht erst, wenn jeder einmal dran war.');
      // Abgelehnt heißt: nichts geändert, dieselbe Person ist noch dran
      expect((await mustView(host)).turn).toBe(v.turn);
      await step(host, byId, 'swap');
    }
  });

  await test.step('eine Runde bis zum Ergebnis', async () => {
    for (let i = 0; i < 40; i++) {
      const v = await mustView(host);
      if (v.phase === 'end' || v.phase === 'over') break;
      await step(host, byId, v.turns >= 3 ? 'knock' : i % 3 === 2 ? 'pass' : 'swap');
    }
    await waitForPhase(host, ['end', 'over']);
  });

  await test.step('Gast lädt neu und sitzt ohne Tippen wieder auf seinem Platz', async () => {
    await guest.reload();
    await expect(guest.locator('#scr-game')).toBeVisible();
    expect(await myId(guest)).toBe(ids[1]);
  });

  await test.step('Host lädt neu und ist ohne Tippen wieder am Tisch', async () => {
    await host.reload();
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
    // Punkt oben: ein Fenster mit Tischcode, Link und Verbindung
    await host.click('#netchip');
    await expect(host.locator('#modal .netinfo .icodev')).toHaveText(code);
    await host.keyboard.press('Escape');
    await host.click('[data-act=unpeek]');
  });

  await test.step('Gast verlässt die laufende Partie, die KI spielt weiter, dann kommt der Gast zurück', async () => {
    await bothReady(host, guest, ['choose', 'play']);
    const seat = await myId(guest);
    const isBot = async () => (await view(host))?.players.find((p) => p.id === seat)?.bot ?? false;
    await menuConfirm(guest, '#menu-leave');
    await expect.poll(isBot).toBe(true);
    expect((await mustView(host)).phase).not.toBe('over');
    // Am Handy liegen Name und Code im Bogen hinter „Tisch aufmachen“
    if (await guest.locator('.playbtn').isVisible()) await guest.click('.playbtn');
    await guest.fill('#name', 'Lena');
    await guest.fill('#joincode', code);
    await guest.click('#btn-join');
    await expect(guest.locator('#scr-game')).toBeVisible();
    await expect.poll(isBot).toBe(false);
    expect(await myId(guest)).toBe(seat);
  });

  await test.step('zurück in die Lobby, dann löst der Host den Tisch auf', async () => {
    if (await host.locator('[data-act=peek]').count()) await host.click('[data-act=peek]');
    await menuConfirm(host, '#menu-lobby');
    await expect(host.locator('#scr-lobby')).toBeVisible();
    await expect(guest.locator('#scr-lobby')).toBeVisible();
    await menuConfirm(host, '#menu-leave');
    await expect(guest.locator('#start-err')).toBeVisible();
    // Nach dem aufgelösten Tisch ist keine Einladung mehr offen, Code-Feld und Tisch aufmachen sind wieder da
    await expect(guest.locator('body')).not.toHaveClass(/invited/);
    await expect(guest.locator('#joincode')).toBeVisible();
  });

  expect(errors.list).toEqual([]);
});

test('Startseite ohne Namen weist freundlich darauf hin', async ({ page }) => {
  await page.goto(START);
  await page.click('#btn-host');
  await expect(page.locator('.toast').first()).toContainText('heißt');
  await expect(page.locator('#scr-start')).toBeVisible();
});
