/*
 * Werfen und Tröten mit zwei echten Browsern: Reiter im Reaktionsfenster, Ziel wählen, Zeichen am Ziel,
 * Sperre gegen Dauerfeuer, Soundboard bei beiden und kein Nachspielen nach dem Neuverbinden.
 */
import { expect, test, type Page } from '@playwright/test';
import { desktop, Errors, hostTable, joinTable, myId, phone, seqBusy, view } from './helpers';

const logKinds = async (p: Page, k: string): Promise<number> =>
  ((await view(p))?.log ?? []).filter((e) => e.k === k).length;
const sbSeen = (p: Page): Promise<number> => p.evaluate(() => window.__schnautz?.App.sbSeen ?? -1);

test('Werfen und Soundboard zwischen Host und Gast', async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');
  await host.click('[data-act=game][data-g=shithead]');
  await expect.poll(async () => (await view(guest))?.game).toBe('shithead');
  // Mit laufender Uhr: Würfe und Klänge dürfen trotzdem nichts neu zeichnen
  await host.evaluate(() => {
    const w = window.__schnautz!;
    w.act(w.H.st!, w.App.me, { type: 'rules', rules: { turnSecs: 30 } });
    w.hostCommit();
  });
  await expect.poll(async () => (await view(guest))?.rules.turnSecs).toBe(30);
  await host.click('[data-act=start]');
  await expect(guest.locator('#scr-game')).toBeVisible();
  const hostId = await myId(host);
  const guestId = await myId(guest);

  await test.step('Gast wirft eine Tomate über das Reaktionsfenster', async () => {
    await guest.click('#emofab');
    await guest.click('[data-act=etab][data-t=toss]');
    await guest.click('[data-act=tossitem][data-item=tomato]');
    await expect(guest.locator('#emotes .chip')).toHaveCount(1);
    await guest.click(`#emotes [data-act=toss][data-to="${hostId}"]`);
    // Nach dem Wurf ist die Auswahl „… auf wen?“ sofort zu
    await expect(guest.locator('#emotes .epanel')).toHaveCount(0);
    await expect.poll(() => logKinds(host, 'toss')).toBe(1);
    await expect(guest.locator(`.opp[data-pid="${hostId}"] .tossmark.tomato`)).toBeVisible();
    await expect(host.locator('.swhead .tossmark.tomato, .mehead .tossmark.tomato')).toBeVisible();
    await expect(host.locator('#fly .fieldlbl', { hasText: 'Lena wirft eine Tomate auf dich' })).toBeVisible();
    // Drei gehen schnell hintereinander, danach sind die Knöpfe kurz gesperrt
    for (let i = 0; i < 2; i++) {
      await guest.click('#emofab');
      await guest.click('[data-act=tossitem][data-item=egg]');
      await guest.click(`#emotes [data-act=toss][data-to="${hostId}"]`);
    }
    await expect.poll(() => logKinds(host, 'toss')).toBe(3);
    await guest.click('#emofab');
    await expect(guest.locator('[data-act=tossitem][data-item=egg]')).toBeDisabled();
    await guest.click('#emofab');
    // Nach Ablauf ist das Zeichen wieder weg
    await expect(guest.locator('.tossmark')).toHaveCount(0, { timeout: 6000 });
  });

  await test.step('Host wirft per Tipp auf die Kachel, die Auswahl am Gast bleibt erhalten', async () => {
    await host.click('[data-act=shready]');
    await guest.click('[data-act=shready]');
    await expect.poll(async () => (await view(guest))?.phase).toBe('play');
    await expect.poll(() => seqBusy(guest)).toBe(false);
    const before = await guest.evaluate(() => document.querySelectorAll('#me .card').length);
    expect(before).toBeGreaterThan(0);
    await guest.evaluate(() => document.querySelector('#me .card')?.setAttribute('data-keep', '1'));
    await host.click(`.opp[data-pid="${guestId}"]`);
    await expect(host.locator('#tosspick')).toBeVisible();
    await host.click('#tosspick [data-item=crown]');
    await expect(host.locator('#tosspick')).toHaveCount(0);
    await expect(guest.locator('.tossmark.crown')).toBeVisible();
    await expect(guest.locator('#fly .fieldlbl', { hasText: 'Tahna krönt dich' })).toBeVisible();
    // Kein volles Neuzeichnen: Der markierte Knoten steht noch
    expect(await guest.evaluate(() => !!document.querySelector('#me .card[data-keep="1"]'))).toBe(true);
  });

  await test.step('Soundboard: beide sehen den Klang, der Knopf ist kurz gesperrt', async () => {
    const seenH = await sbSeen(host);
    const seenG = await sbSeen(guest);
    await guest.click('#emofab');
    await guest.click('[data-act=etab][data-t=snd]');
    await guest.click('#emotes [data-act=sb][data-s=horn]');
    await expect.poll(() => logKinds(host, 'sound')).toBe(1);
    await expect.poll(() => sbSeen(host)).toBe(seenH + 1);
    await expect.poll(() => sbSeen(guest)).toBe(seenG + 1);
    // Ein einzelner Sound sperrt noch nicht, erst der dritte schnelle
    await expect(guest.locator('body')).not.toHaveClass(/sbcool/);
    // Am Desktop: drei schnell hintereinander, der vierte Klick wartet auf die Pause
    await host.click('[data-act=etab][data-t=snd]');
    for (let i = 0; i < 4; i++) await host.click('#emotes [data-act=sb][data-s=clap]');
    await expect.poll(() => logKinds(host, 'sound')).toBe(4);
    await host.waitForTimeout(800);
    expect(await logKinds(host, 'sound')).toBe(4);
    await expect(host.locator('#emotes [data-act=sb][data-s=clap]')).toHaveAttribute('aria-disabled', 'true');
    await expect(host.locator('body')).toHaveClass(/sbcool/);
  });

  await test.step('Was während eines Verbindungsabbruchs getrötet wurde, kommt nicht nach', async () => {
    const seen = await sbSeen(guest);
    await guest.evaluate(() => window.__schnautz?.G.conn?.close());
    // Der Host trötet, solange der Gast weg ist
    await host.evaluate(() => {
      const w = window.__schnautz!;
      w.act(w.H.st!, w.App.me, { type: 'sound', s: 'sad' });
      w.hostCommit();
    });
    const n = (await view(host))?.n;
    await expect.poll(async () => (await view(guest))?.n, { timeout: 30_000 }).toBe(n);
    await guest.waitForTimeout(500);
    expect(await sbSeen(guest)).toBe(seen);
  });

  expect(errors.list).toEqual([]);
});
