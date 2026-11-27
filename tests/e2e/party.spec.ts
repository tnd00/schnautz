/*
 * Werfen und Tröten mit zwei echten Browsern: Reiter im Reaktionsfenster, Ziel wählen, Zeichen am Ziel,
 * Sperre gegen Dauerfeuer, Soundboard bei beiden und kein Nachspielen nach dem Neuverbinden.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  closeAll,
  desktop,
  Errors,
  fillWithBots,
  hostTable,
  joinTable,
  myId,
  phone,
  seqBusy,
  START,
  view,
} from './helpers';

test.afterEach(closeAll);

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

  await test.step('Menü am Handy liegt über dem eigenen Platz, X und Escape schließen es', async () => {
    await guest.click('#emofab');
    await expect(guest.locator('#emofab')).toHaveAttribute('aria-expanded', 'true');
    // Form B2: deckt den Platz, das X steht an der Stelle des Chat-Knopfs (nach dem Einblenden gemessen)
    const gap = () =>
      guest.evaluate(() => {
        const a = document.querySelector('.seat')!.getBoundingClientRect();
        const b = document.querySelector('#emotes')!.getBoundingClientRect();
        return Math.round(Math.abs(a.top - b.top) + Math.abs(a.bottom - b.bottom));
      });
    await expect.poll(gap).toBeLessThan(2);
    await expect(guest.locator('#logfab')).toBeHidden();
    await guest.click('#emotes .emox');
    await expect(guest.locator('#emotes')).toBeHidden();
    await expect(guest.locator('#logfab')).toBeVisible();
    // Tastatur: Der Reiter behält den Fokus, Escape schließt und gibt ihn an den Smiley zurück
    await guest.click('#emofab');
    await guest.focus('#emotes [data-act=etab][data-t=snd]');
    await guest.keyboard.press('Enter');
    await expect(guest.locator('#emotes [data-act=etab][data-t=snd]')).toBeFocused();
    await guest.keyboard.press('Escape');
    await expect(guest.locator('#emotes')).toBeHidden();
    await expect(guest.locator('#emofab')).toBeFocused();
    await expect(guest.locator('#emofab')).toHaveAttribute('aria-expanded', 'false');
  });

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
    // Die Reihe steht direkt unter der angetippten Kachel samt Pille (nach dem Einblenden gemessen), die Nachbarn
    // bleiben frei und an der Kachel überdeckt sie nichts
    const off = () =>
      host.evaluate((id) => {
        const p = document.querySelector('#tosspick')!.getBoundingClientRect();
        const t = document.querySelector(`.opp[data-pid="${id}"]`)!;
        let b = t.getBoundingClientRect().bottom;
        for (const c of t.querySelectorAll('*:not(.tossmark)')) b = Math.max(b, c.getBoundingClientRect().bottom);
        return Math.round(Math.abs(p.top - b - 6));
      }, guestId);
    await expect.poll(off).toBeLessThan(2);
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
    // Das Menü schließt nach dem Senden von selbst
    await expect(guest.locator('#emotes')).toBeHidden();
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

test('Übernahme am Tisch: kleine Meldung für alle, „samt Karten“ nur für den, der übernimmt', async ({ browser }) => {
  test.setTimeout(2 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  await hostTable(host, 'Tahna');
  const code = await host.evaluate(() => window.__schnautz?.App.code ?? '');
  await host.click('[data-act=game][data-g=shithead]');
  await fillWithBots(host, 3);
  await host.click('[data-act=start]');
  await expect(host.locator('#scr-game')).toBeVisible();
  // Der Hinweis steht nur kurz: alles mitschreiben, was am Tisch des Gastgebers erscheint
  await host.evaluate(() => {
    const w = window as unknown as { __fly: string[] };
    w.__fly = [];
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes)
          if (n instanceof HTMLElement && n.matches('.fieldlbl')) w.__fly.push(n.textContent ?? '');
    }).observe(document.querySelector('#fly')!, { childList: true });
  });
  // Lena kommt mitten in der Partie und übernimmt einen KI-Platz samt Karten
  // (ohne joinTable, dessen first() mitten in der Partie die versteckte Lobby findet)
  await guest.goto(`${START}#${code}`);
  await guest.fill('#name', 'Lena');
  await guest.click('#btn-join');
  await expect(guest.locator('#scr-game')).toBeVisible();
  const took = (await view(host))?.log.find((e) => e.k === 'takeover');
  const from = took && took.k === 'takeover' ? took.from : '';
  expect(from).not.toBe('');
  const seen = () => host.evaluate(() => (window as unknown as { __fly: string[] }).__fly);
  await expect.poll(seen).toContainEqual(expect.stringContaining(`Lena setzt sich an ${from}`));
  expect((await seen()).some((t) => t.includes('samt Karten'))).toBe(false);
  await expect(guest.locator('#fly .fieldlbl', { hasText: 'Du übernimmst' })).toContainText('Platz samt Karten.');
  // Neu laden zeigt die eigene Übernahme nicht noch einmal
  await guest.reload();
  await expect(guest.locator('#scr-game')).toBeVisible();
  await guest.waitForTimeout(1200);
  await expect(guest.locator('#fly .fieldlbl', { hasText: 'Du übernimmst' })).toHaveCount(0);
  expect(errors.list).toEqual([]);
});
