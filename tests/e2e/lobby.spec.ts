/*
 * Lobby: Wer offline sitzt, bekommt beim Gastgeber dasselbe × wie eine KI. Und mit „Bewegung reduzieren“ rückt die
 * Handy-Lobby nach Reiterwechsel und Größenwechsel richtig zusammen.
 */
import { expect, test, type Page } from '@playwright/test';
import { chooseGame, closeAll, desktop, Errors, hostTable, joinTable, lobbyTab, mustView, view } from './helpers';

test.afterEach(closeAll);

test('× entfernt in der Lobby einen Menschen, der offline sitzt', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const code = await hostTable(host, 'Tahna');
  const gctx = await desktop(browser);
  const guest = await gctx.newPage();
  await joinTable(guest, code, 'Lena');
  await expect
    .poll(async () => (await view(host))?.players.map((p) => `${p.name}:${p.online}`))
    .toEqual(['Tahna:true', 'Lena:true']);

  // Solange Lena da ist, gibt es kein ×, beim Gastgeber selbst nie
  const lena = host.locator('#seats .lseat', { hasText: 'Lena' });
  await expect(lena).toBeVisible();
  await expect(lena.locator('[data-act=rmbot]')).toHaveCount(0);
  await expect(host.locator('#seats .lseat.is-me [data-act=rmbot]')).toHaveCount(0);

  // Lena schließt den Browser, ihr Platz steht offline da und bekommt das ×. Der Gastgeber schließt die Verbindung
  // gleich mit, sonst merkt er es erst über den Herzschlag nach gut 16 Sekunden
  await gctx.close();
  await host.evaluate(() => {
    const w = window.__schnautz!;
    const id = w.H.st!.players.find((p) => p.name === 'Lena')!.id;
    w.H.conns.get(id)?.close();
  });
  await expect.poll(async () => (await view(host))?.players.find((p) => p.name === 'Lena')?.online).toBe(false);
  await expect(lena).toHaveClass(/\boff\b/);
  const x = lena.locator('[data-act=rmbot]');
  await expect(x).toHaveAttribute('aria-label', 'Lena entfernen');
  const box = await x.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(28);

  await x.click();
  await expect.poll(async () => (await view(host))?.players.map((p) => p.name)).toEqual(['Tahna']);
  await expect(host.locator('#seats .lseat', { hasText: 'Lena' })).toHaveCount(0);
  expect((await mustView(host)).phase).toBe('lobby');
  expect(errors.list).toEqual([]);
});

/** Läuft ein Lobby-Bereich über (Inhalt unter der Startleiste) oder musste er in den Notbehelf fscroll? */
const paneTrouble = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#scr-lobby .lpane')]
      .filter((p) => p.getClientRects().length)
      .flatMap((p) => {
        const out: string[] = [];
        if (p.classList.contains('fscroll')) out.push(`${p.dataset.pane} fscroll`);
        if (p.scrollHeight > p.clientHeight + 1)
          out.push(`${p.dataset.pane} ${p.scrollHeight - p.clientHeight}px über`);
        return out;
      }),
  );

test('Bewegung reduzieren: Handy-Lobby passt nach Reiterwechsel und Größenwechsel', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const errors = new Errors();
  const host = errors.watch(await ctx.newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseGame(host, 'shithead');
  // Acht Plätze, sieben davon KI: die vollste Lobby
  await host.evaluate(() => {
    const w = window.__schnautz!;
    const st = w.H.st!;
    w.act(st, w.App.me, { type: 'rules', rules: { seats: 8 } });
    while (st.players.length < 8 && !w.act(st, w.App.me, { type: 'addbot' }));
    w.hostCommit();
  });
  await expect.poll(async () => (await view(host))?.players.length).toBe(8);

  // Zweimal hin und her, der zweite Besuch eines Reiters zeigte früher die Stufe vom Besuch davor
  for (const tab of ['game', 'table', 'game'] as const) {
    await lobbyTab(host, tab);
    expect(await paneTrouble(host), `${tab} bei 390x844`).toEqual([]);
  }
  for (const size of [
    { width: 390, height: 721 },
    { width: 375, height: 548 },
    { width: 390, height: 780 },
  ]) {
    await host.setViewportSize(size);
    await expect
      .poll(() => paneTrouble(host), { message: `game nach Wechsel auf ${size.width}x${size.height}` })
      .toEqual([]);
    // Nicht nur irgendwann richtig: auch nach einem weiteren Reiterwechsel sofort
    await lobbyTab(host, 'table');
    await lobbyTab(host, 'game');
    expect(await paneTrouble(host), `game bei ${size.width}x${size.height}`).toEqual([]);
  }
  expect(errors.list).toEqual([]);
});
