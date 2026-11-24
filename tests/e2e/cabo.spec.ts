/*
 * Cabo im Browser: allein gegen KIs bis zum Ende, zwei echte Browser gegeneinander (fremde Karten bleiben geheim)
 * und ein voller Tisch am Handy. Geklickt wird über die Oberfläche wie ein Mensch.
 */
import { expect, test, type Page } from '@playwright/test';
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

/** Knopf antippen wie ein Mensch: kurz nach einem Wechsel der Knopfzeile zählt ein Tipp nicht (src/ui/cabo/input.ts). */
async function button(page: Page, act: string): Promise<boolean> {
  const b = page.locator(`#me [data-act=${act}]:not([disabled])`);
  if (!(await b.count())) return false;
  await page.waitForTimeout(450);
  await b.first().click({ timeout: 5000 });
  return true;
}

/**
 * Ein Zug über die Oberfläche. Zu Beginn zwei Karten ansehen, am Zug vom Stapel ziehen und gegen die erste Karte
 * tauschen. Mit `cabo` ruft man in seinem zweiten Zug einer Runde Cabo, damit Runden schnell enden.
 */
async function cbMove(page: Page, v: View, me: string, cabo: boolean): Promise<boolean> {
  const C = v.cb;
  const row = C?.P[me];
  if (!C || !row?.length) return false;
  try {
    if (v.phase === 'peek') {
      if (v.players.find((p) => p.id === me)?.ready) return false;
      for (const s of row.slice(0, 2)) {
        const el = page.locator(`#me .cbslot[data-sid="${s.id}"]`);
        if (!(await el.evaluate((x) => x.classList.contains('sel')))) await el.click({ timeout: 5000 });
      }
      return true;
    }
    if (v.phase !== 'play' || v.players[v.turn]?.id !== me) return false;
    if (C.power) return await button(page, 'cbskip');
    if (C.hold) {
      const first = page.locator(`#me .cbslot[data-sid="${row[0].id}"]`);
      if (!(await first.evaluate((x) => x.classList.contains('sel')))) await first.click({ timeout: 5000 });
      return await button(page, 'cbswap');
    }
    const mineSoFar = v.log.filter((e) => e.k === 'cbdraw' && e.p === me && e.n > lastDeal(v)).length;
    if (cabo && !C.cabo && mineSoFar >= 1) return await button(page, 'cbcabo');
    // Stapel in der Mitte antippen, das geht ohne Knopfsperre
    if (C.deck > 0) {
      await page.click('#center .cbdeck[data-act=cbdeck]', { timeout: 5000 });
      return true;
    }
    return await button(page, 'cbpile');
  } catch {
    // Ein Zug von jemand anderem kam dazwischen: im nächsten Durchgang neu
    return false;
  }
}

/** Nummer des Logeintrags, mit dem die laufende Runde begann. */
function lastDeal(v: View): number {
  for (let i = v.log.length - 1; i >= 0; i--) if (v.log[i].k === 'cbdeal') return v.log[i].n;
  return 0;
}

/** Spielt über die Oberfläche, bis die Partie vorbei ist. */
async function playToEnd(pages: Page[], check?: (p: Page, v: View, me: string) => Promise<void>): Promise<void> {
  const ids = await Promise.all(pages.map((p) => myId(p)));
  for (let k = 0; k < 3000; k++) {
    let over = true;
    for (let i = 0; i < pages.length; i++) {
      const v = await mustView(pages[i]);
      if (v.phase !== 'over') over = false;
      if (check) await check(pages[i], v, ids[i]);
      if (await cbMove(pages[i], v, ids[i], i === 0)) await pages[i].waitForTimeout(250);
    }
    if (over) return;
    await pages[0].waitForTimeout(150);
  }
  throw new Error('Cabo ist nicht zu Ende gegangen');
}

const noScroll = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2);

/** Cabo wählen, kurze Partie bis 50. */
async function chooseCabo(host: Page, short = true): Promise<void> {
  if (await host.locator('#lobby-tabs').isVisible()) await host.click('[data-act=ltab][data-t=game]');
  await host.click('[data-act=game][data-g=cabo]');
  if (short) {
    await host.click('[data-act=cbtarget][data-v="50"]');
    await expect.poll(async () => (await view(host))?.rules.cb?.target).toBe(50);
  }
  if (await host.locator('#lobby-tabs').isVisible()) await host.click('[data-act=ltab][data-t=table]');
}

test('Cabo gegen drei KIs bis zum Ende', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host);
  for (let i = 0; i < 3; i++) await host.click('[data-act=addbot]');
  await expect.poll(() => playerCount(host)).toBe(4);
  await host.click('[data-act=start]');
  await waitForPhase(host, ['peek'], 20_000);
  // Vier verdeckte Karten, nichts davon ist zu sehen
  const me = await myId(host);
  const v0 = await mustView(host);
  expect(v0.cb?.P[me]).toHaveLength(4);
  expect(v0.cb?.P[me].every((s) => !s.c)).toBe(true);
  // Zwei Karten ansehen: Sie blitzen nur bei mir kurz auf
  await cbMove(host, v0, me, true);
  await expect(host.locator('#me .cbslot.seen')).toHaveCount(2);
  await expect(host.locator('#me .cbslot.seen')).toHaveCount(0, { timeout: 6000 });
  await playToEnd([host]);
  await waitForPhase(host, ['over'], 30_000);
  await expect(host.locator('#overlay .result h2')).toContainText(/Cabo-König|Unentschieden/, { timeout: 30_000 });
  const end = await mustView(host);
  expect(Object.values(end.cb?.P ?? {}).every((row) => row.every((s) => !!s.c))).toBe(true);
  expect(errors.list).toEqual([]);
});

test('zwei Browser spielen Cabo, fremde Karten bleiben geheim', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const code = await hostTable(host, 'Tahna');
  await chooseCabo(host);
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  await joinTable(guest, code, 'Lena');
  await expect.poll(() => playerCount(host)).toBe(2);
  await host.click('[data-act=start]');
  await waitForPhase(guest, ['peek'], 20_000);
  let checked = 0;
  await playToEnd([host, guest], async (p, v, me) => {
    if (p !== guest || !v.cb || (v.phase !== 'play' && v.phase !== 'peek')) return;
    const C = v.cb;
    // Verdeckte Karten sind für den Gast nur Plätze ohne Wert, auch die eigenen
    Object.values(C.P).forEach((row) => row.forEach((s) => expect(!!s.c).toBe(!!s.up)));
    expect(typeof C.deck).toBe('number');
    // Was der Host vom Stapel zieht, sieht der Gast nicht. Wissen bekommen nur KIs
    if (C.hold && C.hold.by !== me && C.hold.from === 'deck') expect(C.hold.c).toBeUndefined();
    expect(C.know).toBeUndefined();
    C.reveal?.items.forEach((x) => expect(typeof x.c).toBe('string'));
    if (checked++ % 10 === 0) expect(await noScroll(guest)).toBe(true);
  });
  await waitForPhase(guest, ['over'], 30_000);
  await expect(guest.locator('#overlay .result h2')).toContainText(/Cabo-König|Unentschieden/, { timeout: 30_000 });
  expect(errors.list).toEqual([]);
});

test('Cabo zu acht passt am Handy ohne Scrollen auf den Bildschirm', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await phone(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host, false);
  // Schnappen an, dann steht ein dritter Knopf am Platz
  await host.click('[data-act=ltab][data-t=game]');
  await host.locator('[data-cbrule=snap]').check();
  await expect.poll(async () => (await view(host))?.rules.cb?.snap).toBe(true);
  await host.click('[data-act=ltab][data-t=table]');
  for (let i = 0; i < 20 && (await playerCount(host)) < 8; i++) {
    const add = host.locator('[data-act=addbot]');
    if (await add.count()) await add.first().click();
    else await host.click('[data-act=seats][data-d="1"]');
    await host.waitForTimeout(100);
  }
  await expect.poll(() => playerCount(host), { timeout: 10_000 }).toBe(8);
  await host.click('[data-act=start]');
  await waitForPhase(host, ['peek'], 20_000);
  expect((await mustView(host)).cb?.decks).toBe(2);
  await host.waitForTimeout(1500);
  expect(await noScroll(host)).toBe(true);
  const me = await myId(host);
  // Ein paar Züge später, auch mit gezogener Karte in der Hand
  let held = false;
  for (let k = 0; k < 200 && !held; k++) {
    const v = await mustView(host);
    if (v.phase === 'play' && v.cb?.hold?.by === me) {
      held = true;
      break;
    }
    if (v.phase === 'play' && v.players[v.turn]?.id === me && !v.cb?.hold && !v.cb?.power) {
      await host.click('#center .cbdeck[data-act=cbdeck]');
    } else await cbMove(host, v, me, false);
    await host.waitForTimeout(300);
  }
  expect(held).toBe(true);
  expect(await noScroll(host)).toBe(true);
  expect(errors.list).toEqual([]);
});

test('Spionieren und Blindtausch gehen auch im Karussell mit der Maus', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host, false);
  // Ab vier Plätzen braucht es mehr Stühle, dann verschwindet der Knopf für die nächste KI kurz
  for (let i = 0; i < 20 && (await playerCount(host)) < 7; i++) {
    const add = host.locator('[data-act=addbot]');
    if (await add.count()) await add.first().click();
    else await host.click('[data-act=seats][data-d="1"]');
    await host.waitForTimeout(100);
  }
  await expect.poll(() => playerCount(host)).toBe(7);
  await host.click('[data-act=start]');
  await waitForPhase(host, ['peek'], 20_000);
  const me = await myId(host);
  // KIs anhalten, alle sehen an, dann bin ich mit einer abgelegten 9 dran
  const power = async (kind: 'spy' | 'swap', c: string) =>
    host.evaluate(
      ({ me, kind, c }) => {
        const S = window.__schnautz!;
        S.BOTS.hold = true;
        const st = S.H.st!;
        st.players.forEach((p) => {
          if (!p.ready && st.phase === 'peek')
            S.act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) });
        });
        st.turn = st.players.findIndex((p) => p.id === me);
        st.cb!.t += 1;
        st.cb!.hold = null;
        st.cb!.power = { by: me, kind, c };
        st.cb!.pile.push(c);
        S.hostCommit();
      },
      { me, kind, c },
    );
  await power('spy', 'H9');
  await expect(host.locator('#opps.car')).toHaveCount(1);
  await expect(host.locator('#announce .ann')).toHaveCount(0, { timeout: 20_000 });
  // Eine Karte der mittleren Kachel anklicken
  const mid = host.locator('#opps .opp[data-slot="0"] .cbslot[data-act=cbo]').first();
  await mid.click();
  await expect.poll(async () => (await view(host))?.cb?.power ?? null).toBeNull();
  await expect(host.locator('#tosspick:not([hidden])')).toHaveCount(0);
  // Die angesehene Karte bleibt im Bild, obwohl schon die nächste Person dran ist
  await expect(host.locator('#opps .cbslot.seen')).toHaveCount(1);
  // Blindtausch: eigene und fremde Karte wählen, dann tauschen
  await power('swap', 'HB');
  await expect(host.locator('#announce .ann')).toHaveCount(0, { timeout: 20_000 });
  await host.locator('#me .cbslot[data-act=cbm]').first().click();
  await host.locator('#opps .opp[data-slot="0"] .cbslot[data-act=cbo]').first().click();
  await host.waitForTimeout(450);
  await host.click('#me [data-act=cbblind]:not([disabled])');
  await expect.poll(async () => (await view(host))?.log.some((e) => e.k === 'cbblind' && e.p === me)).toBe(true);
  expect(errors.list).toEqual([]);
});
