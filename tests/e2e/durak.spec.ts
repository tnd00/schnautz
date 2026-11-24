/*
 * Durak im Browser: allein gegen KIs bis zum Ende, zwei echte Browser gegeneinander und ein voller Tisch am Handy.
 * Die Züge wählt der Test mit derselben Spiellogik, die das Spiel nutzt, geklickt wird über die Oberfläche.
 */
import { expect, test, type Page } from '@playwright/test';
import { dkBeats, rankOf, suitOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { dkTrump, dkWaiting } from '../../src/game/durak';
import type { View } from '../../src/game/types';
import {
  closeAll,
  desktop,
  Errors,
  hostTable,
  joinTable,
  mustView,
  myId,
  phone,
  playerCount,
  view,
  waitForPhase,
} from './helpers';

test.afterEach(closeAll);

/** Billigste Karte, die `a` schlägt: erst ohne Trumpf, dann der kleinste Trumpf. */
function cheapest(hand: string[], a: string, ts: string): number {
  let best = -1;
  let bv = 999;
  hand.forEach((c, i) => {
    if (!dkBeats(c, a, ts as 'H')) return;
    const cv = (suitOf(c) === ts ? 100 : 0) + SH_ORD[rankOf(c)];
    if (cv < bv) {
      bv = cv;
      best = i;
    }
  });
  return best;
}

/** Knopf antippen wie ein Mensch: kurz nach einem Wechsel der Knopfzeile zählt ein Tipp nicht (src/ui/durak/input.ts). */
async function button(page: Page, act: string): Promise<boolean> {
  const b = page.locator(`[data-act=${act}]:not([disabled])`);
  if (!(await b.count())) return false;
  await page.waitForTimeout(450);
  await b.first().click({ timeout: 5000 });
  return true;
}

/** Ein Zug über die Oberfläche, wenn die Partie auf mich wartet. true heißt: geklickt. */
async function dkMove(page: Page, v: View, me: string): Promise<boolean> {
  const D = v.dk;
  if (!D || v.phase !== 'play' || !dkWaiting(v).includes(me)) return false;
  const hand = D.P[me];
  if (!Array.isArray(hand) || !hand.length) return false;
  try {
    if (!D.table.length) {
      // Nur wählen, wenn die Karte noch nicht gewählt ist, ein zweiter Tipp hebt die Auswahl wieder auf
      const card = page.locator('#me [data-act=dkh][data-i="0"]');
      if (!(await card.evaluate((el) => el.classList.contains('sel')))) await card.click({ timeout: 5000 });
      return await button(page, 'dkgo');
    }
    if (me === D.def) {
      const ts = dkTrump(D);
      for (let i = 0; i < D.table.length; i++) {
        const p = D.table[i];
        if (p.d) continue;
        const j = cheapest(hand, p.a, ts);
        if (j < 0) break;
        // Erst den Angriff wählen, dann die Karte: das schlägt sofort
        await page.click(`#center .dkpair[data-i="${i}"]`, { timeout: 5000 });
        await page.click(`#me [data-act=dkh][data-i="${j}"]`, { timeout: 5000 });
        return true;
      }
      return await button(page, 'dktake');
    }
    return await button(page, 'dkpass');
  } catch {
    // Ein Zug von jemand anderem kam dazwischen: im nächsten Durchgang neu
    return false;
  }
}

/** Spielt über die Oberfläche, bis die Partie vorbei ist. */
async function playToEnd(pages: Page[], check?: (p: Page, v: View, me: string) => Promise<void>): Promise<void> {
  const ids = await Promise.all(pages.map((p) => myId(p)));
  for (let k = 0; k < 2000; k++) {
    let over = true;
    for (let i = 0; i < pages.length; i++) {
      const v = await mustView(pages[i]);
      if (v.phase !== 'over') over = false;
      if (check) await check(pages[i], v, ids[i]);
      if (await dkMove(pages[i], v, ids[i])) await pages[i].waitForTimeout(220);
    }
    if (over) return;
    await pages[0].waitForTimeout(120);
  }
  throw new Error('Durak ist nicht zu Ende gegangen');
}

const noScroll = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2);

test('Durak gegen zwei KIs bis zum Ende', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await host.click('[data-act=game][data-g=durak]');
  await host.click('[data-act=addbot]');
  await host.click('[data-act=addbot]');
  await expect.poll(() => playerCount(host)).toBe(3);
  await host.click('[data-act=start]');
  await waitForPhase(host, ['play'], 20_000);
  const v0 = await mustView(host);
  expect(v0.dk?.size).toBe(36);
  // Trumpf liegt sichtbar unter dem Stapel
  await expect(host.locator('#center .dktrump .card')).toBeVisible();
  await playToEnd([host]);
  await waitForPhase(host, ['over'], 20_000);
  await expect(host.locator('#overlay .result h2')).toContainText(/Durak|Unentschieden/, { timeout: 20_000 });
  expect(errors.list).toEqual([]);
});

test('zwei Browser spielen Durak, fremde Karten bleiben geheim', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const code = await hostTable(host, 'Tahna');
  await host.click('[data-act=game][data-g=durak]');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  await joinTable(guest, code, 'Lena');
  await expect.poll(() => playerCount(host)).toBe(2);
  await host.click('[data-act=start]');
  await waitForPhase(guest, ['play'], 20_000);
  let checked = 0;
  await playToEnd([host, guest], async (p, v, me) => {
    if (p !== guest || v.phase !== 'play' || !v.dk) return;
    // Die Hand des Hosts ist für den Gast nur eine Zahl, der Stapel auch
    Object.entries(v.dk.P).forEach(([id, h]) => {
      if (id !== me) expect(typeof h).toBe('number');
    });
    expect(typeof v.dk.deck).toBe('number');
    if (checked++ % 10 === 0) expect(await noScroll(guest)).toBe(true);
  });
  await waitForPhase(guest, ['over'], 20_000);
  await expect(guest.locator('#overlay .result h2')).toContainText(/Durak|Unentschieden/, { timeout: 20_000 });
  // Am Ende liegen alle Karten offen
  const end = await view(guest);
  Object.values(end?.dk?.P ?? {}).forEach((h) => expect(Array.isArray(h)).toBe(true));
  expect(errors.list).toEqual([]);
});

test('Durak zu acht passt am Handy ohne Scrollen auf den Bildschirm', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await phone(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  // Am Handy liegt die Spielwahl im zweiten Reiter
  await host.click('[data-act=ltab][data-t=game]');
  await host.click('[data-act=game][data-g=durak]');
  await host.click('[data-act=ltab][data-t=table]');
  for (let i = 0; i < 20 && (await playerCount(host)) < 8; i++) {
    const add = host.locator('[data-act=addbot]');
    if (await add.count()) await add.first().click();
    else await host.click('[data-act=seats][data-d="1"]');
    await host.waitForTimeout(100);
  }
  await expect.poll(() => playerCount(host), { timeout: 10_000 }).toBe(8);
  await host.click('[data-act=start]');
  await waitForPhase(host, ['play'], 20_000);
  expect((await mustView(host)).dk?.size).toBe(52);
  await host.waitForTimeout(1500);
  expect(await noScroll(host)).toBe(true);
  // Ein paar Angriffe später, mit Karten auf dem Tisch
  for (let k = 0; k < 40; k++) {
    const v = await mustView(host);
    if ((v.dk?.table.length ?? 0) >= 2) break;
    await dkMove(host, v, await myId(host));
    await host.waitForTimeout(300);
  }
  expect(await noScroll(host)).toBe(true);
  expect(errors.list).toEqual([]);
});
