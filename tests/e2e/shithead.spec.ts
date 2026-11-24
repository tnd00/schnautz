/*
 * Shithead mit zwei echten Browsern bis zum Ende: Tauschrunde, normale Züge, Aufnehmen, blinde Karten,
 * 4er bei neuen Stapeln und Bomben. Die Züge wählt der Test mit derselben Spiellogik, die das Spiel nutzt.
 */
import { expect, test, type Page } from '@playwright/test';
import { rankOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { shAlways, shCanBomb, shCanPlay, shCanThrow } from '../../src/game/shithead';
import type { View } from '../../src/game/types';
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
  seqBusy,
  view,
  waitForChange,
  waitForPhase,
} from './helpers';

test.afterEach(closeAll);

/** Schnelle Aktion außerhalb der Reihe: 4er einwerfen oder Bombe legen. */
async function quickMove(page: Page): Promise<'shthrow' | 'shbomb' | null> {
  const v = await view(page);
  if (!v || v.phase !== 'play' || (await seqBusy(page))) return null;
  const me = await myId(page);
  const q = v.sh?.win ? (shCanThrow(v, me) ? 'shthrow' : null) : shCanBomb(v, me) ? 'shbomb' : null;
  if (!q) return null;
  const btn = page.locator(`[data-act=${q}]`);
  if (!(await btn.count())) return null;
  await btn.first().click();
  return q;
}

/** Ein regulärer Zug über die Oberfläche, wenn man dran ist. Nimmt meist die niedrigste passende Karte. */
async function myMove(page: Page, v: View, me: string): Promise<boolean> {
  const S = v.sh;
  if (!S || v.phase !== 'play' || S.win?.lock || v.players[v.turn].id !== me) return false;
  const P = S.P[me];
  const hand = Array.isArray(P.hand) ? P.hand : [];
  if (!hand.length && !P.up.length) {
    await page.click('.shme .card[data-act=shd] >> nth=0', { position: { x: 10, y: 20 } });
    return true;
  }
  const src = hand.length ? 'hand' : 'up';
  const arr = hand.length ? hand : P.up;
  const ok = arr
    .map((c, i) => ({ i, r: rankOf(c) }))
    .filter((x) => shCanPlay(v, x.r))
    .sort((a, b) => (shAlways(v, a.r) ? 50 : 0) + SH_ORD[a.r] - ((shAlways(v, b.r) ? 50 : 0) + SH_ORD[b.r]));
  if (!ok.length) {
    await page.click('[data-act=shpickup]');
    return true;
  }
  // Oft die niedrigste Karte, sonst eine zufällige. Stur die niedrigste führt im Endspiel zu endlosem Pingpong
  const pick = Math.random() < 0.6 ? ok[0] : ok[Math.floor(Math.random() * ok.length)];
  // Kommt zwischen Ansicht und Klick ein neuer Zug, gibt es die Karte kurz nicht: dann im nächsten Durchgang neu
  try {
    await page.click(`.shme [data-act=${src === 'hand' ? 'shh' : 'shu'}][data-i="${pick.i}"]`, {
      position: { x: 8, y: 18 },
      timeout: 5000,
    });
    await page.click('[data-act=shplay]', { timeout: 5000 });
  } catch {
    return false;
  }
  return true;
}

test('zwei Browser spielen Shithead bis zum Ende', async ({ browser }) => {
  // Zwei einfache Testspieler brauchen manchmal lange, bis einer verliert
  test.setTimeout(15 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');

  await test.step('Spiel und Regeln wählen', async () => {
    await host.click('[data-act=game][data-g=shithead]');
    await expect.poll(async () => (await view(guest))?.game).toBe('shithead');
    // 8 aussetzen ist vorausgewählt
    expect((await mustView(guest)).rules.sh.eight).toBe(true);
    await host.click('[data-shrule=eight]');
    await expect.poll(async () => (await view(guest))?.rules.sh.eight).toBe(false);
    await host.click('[data-shrule=eight]');
    await expect.poll(async () => (await view(guest))?.rules.sh.eight).toBe(true);
    await host.click('[data-act=start]');
    await expect(guest.locator('#scr-game')).toBeVisible();
  });

  await test.step('Tauschrunde', async () => {
    const me = await myId(guest);
    const before = (await mustView(guest)).sh?.P[me].up.join();
    await guest.click('.shme .shhand .card >> nth=2');
    await guest.click('.shme .upc .card >> nth=0');
    await expect.poll(async () => (await view(guest))?.sh?.P[me].up.join()).not.toBe(before);
    await guest.click('[data-act=shready]');
    await host.click('[data-act=shready]');
    await waitForPhase(host, ['play']);
  });

  const pages = [host, guest];
  const ids = [await myId(host), await myId(guest)];
  const quick = { shthrow: 0, shbomb: 0 };
  await test.step('spielen bis einer Shithead ist', async () => {
    for (let i = 0; i < 3000; i++) {
      const v = await mustView(host);
      if (v.phase === 'over') break;
      let moved = false;
      for (const p of pages) {
        const q = await quickMove(p);
        if (q) {
          quick[q]++;
          moved = true;
          break;
        }
      }
      if (moved) {
        await host.waitForTimeout(300);
        continue;
      }
      for (let k = 0; k < pages.length; k++) {
        const p = pages[k];
        if (await seqBusy(p)) continue;
        const pv = await view(p);
        if (pv && (await myMove(p, pv, ids[k]))) {
          await waitForChange(host, v.n);
          moved = true;
          break;
        }
      }
      if (!moved) await host.waitForTimeout(200);
    }
    const end = await mustView(host);
    expect(end.phase).toBe('over');
    expect(end.sh?.shithead).toBeTruthy();
    console.log('Schnelle Aktionen', quick);
  });

  await test.step('Ergebnis, neue Partie und zurück zu Schnautz', async () => {
    await guest.click('[data-act=peek]');
    await guest.click('[data-act=unpeek]');
    await expect(guest.locator('#overlay .paper')).toBeVisible();
    await host.click('#overlay [data-act=ready]');
    await guest.click('#overlay [data-act=ready]');
    await waitForPhase(host, ['swap']);
    await menuConfirm(host, '#menu-lobby');
    await expect(host.locator('#scr-lobby')).toBeVisible();
    await host.click('[data-act=game][data-g=schnautz]');
    await host.click('[data-act=start]');
    await waitForPhase(guest, ['choose', 'play']);
    expect((await mustView(guest)).game).toBe('schnautz');
  });

  expect(errors.list).toEqual([]);
});
