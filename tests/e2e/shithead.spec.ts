/*
 * Shithead mit zwei echten Browsern bis zum Ende: Tauschrunde, normale Züge, Aufnehmen, blinde Karten,
 * 4er bei neuen Stapeln und Bomben. Die Züge wählt der Test mit derselben Spiellogik, die das Spiel nutzt.
 */
import { expect, test, type Page } from '@playwright/test';
import { rankOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { shAlways, shCanBomb, shCanPlay, shCanThrow, shWhyNot } from '../../src/game/shithead';
import { ctxOfView, rejectText } from '../../src/content/texts/reject';
import type { View } from '../../src/game/types';
import {
  closeAll,
  desktop,
  Errors,
  fillWithBots,
  hostTable,
  joinTable,
  menuConfirm,
  mustView,
  myId,
  phone,
  seqBusy,
  view,
  startGame,
  waitForChange,
  waitForPhase,
  withSettings,
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
    await withSettings(host, 'shithead', async (sheet) => {
      await sheet.locator('[data-shrule=eight]').click();
      await expect.poll(async () => (await view(guest))?.rules.sh.eight).toBe(false);
      await sheet.locator('[data-shrule=eight]').click();
      await expect.poll(async () => (await view(guest))?.rules.sh.eight).toBe(true);
    });
    await startGame(host);
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

test('nur noch KIs: Vorspulen spielt die Partie zügig und ganz normal zu Ende', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await host.click('[data-act=game][data-g=shithead]');
  await expect.poll(async () => (await view(host))?.game).toBe('shithead');
  // Ausdrücklich drei KIs dazu, ohne sich auf das Auffüllen freier Plätze zu verlassen
  await fillWithBots(host, 4);
  await startGame(host);
  await waitForPhase(host, ['swap']);
  await host.click('[data-act=shready]');
  await waitForPhase(host, ['play']);
  // Damit der Gastgeber sicher als Erster fertig ist: Er behält nur eine 2 oder 10, die immer geht. Stapel und
  // alle übrigen Karten liegen danach bei den verbrannten, die Kartenzahl bleibt stimmig
  await host.evaluate(() => {
    const s = window.__schnautz;
    const S = s?.H.st?.sh;
    if (!s || !S) throw new Error('kein Shithead');
    const P = S.P[s.App.me];
    const pool = [...S.deck.splice(0), ...P.hand.splice(0), ...P.up.splice(0), ...P.down.splice(0)];
    const i = pool.findIndex((c) => /^.(2|10)(:|$)/.test(c));
    if (i < 0) throw new Error('keine 2 oder 10');
    P.hand.push(...pool.splice(i, 1));
    S.burned.push(...pool);
    s.H.st!.n++;
    s.hostCommit();
  });

  /** Gastgeber zieht mit der Spiellogik, bis er fertig ist. Endet die Partie vorher, die nächste. */
  const hostMove = (): Promise<string> =>
    host.evaluate(() => {
      const s = window.__schnautz;
      const st = s?.H.st;
      if (!s || !st) return 'wait';
      const me = s.App.me;
      if (st.phase === 'over') return 'over';
      if (st.phase === 'swap') {
        if (!st.players.find((p) => p.id === me)?.ready) s.act(st, me, { type: 'shready' });
        s.hostCommit();
        return 'wait';
      }
      if (st.phase !== 'play' || s.SEQ.busy) return 'wait';
      if (st.sh?.finished.includes(me)) return 'done';
      const a = s.botDecide(s.viewFor(st, me, true));
      if (!a || s.act(st, me, a)) return 'wait';
      s.hostCommit();
      return 'moved';
    });

  await test.step('der Gastgeber spielt, bis er fertig ist', async () => {
    for (let i = 0; i < 4000; i++) {
      const r = await hostMove();
      if (r === 'done') break;
      if (r === 'over') {
        await host.click('#overlay [data-act=ready]');
        await waitForPhase(host, ['swap', 'play']);
        continue;
      }
      await host.waitForTimeout(r === 'moved' ? 150 : 250);
    }
    const v = await mustView(host);
    expect(v.phase).toBe('play');
    expect(v.sh?.finished).toContain(await myId(host));
  });

  const me = await myId(host);
  const gamesBefore = await host.evaluate(
    (id) => window.__schnautz?.H.st?.players.find((p) => p.id === id)?.stats?.shithead?.games ?? 0,
    me,
  );

  await test.step('Neue Partie fragt nach, Abbrechen lässt die Partie weiterlaufen', async () => {
    const restart = host.locator('.status [data-act=restart]');
    await expect(restart).toBeVisible();
    await restart.click();
    await expect(host.locator('#modal h2')).toContainText('Partie ohne Shithead beenden?');
    await host.click('#modal [data-act=closemodal]');
    await expect(host.locator('#modal .sheet')).toHaveCount(0);
    expect((await mustView(host)).phase).toBe('play');
  });

  await test.step('Vorspulen bis zum Ende', async () => {
    const t0 = Date.now();
    await host.click('.status [data-act=ffwd]');
    await expect(host.locator('.status .botsonly', { hasText: 'Die KIs spielen es aus.' })).toBeVisible();
    await expect.poll(() => host.evaluate(() => window.__schnautz?.BOTS.fast ?? null)).not.toBeNull();
    await waitForPhase(host, ['over'], 120_000);
    console.log('Vorspulen bis zum Ende', Math.round((Date.now() - t0) / 1000), 's');
    const log = await host.evaluate(() => window.__schnautz?.H.st?.log ?? []);
    const ffwd = log.filter((e) => e.k === 'ffwd');
    expect(ffwd).toHaveLength(1);
    const end = log.findIndex((e) => e.k === 'shend');
    expect(end).toBeGreaterThan(0);
    expect(log[end - 1].k).toBe('shdone');
    expect(log.some((e) => e.k === 'abort')).toBe(false);
    expect(await host.evaluate(() => window.__schnautz?.BOTS.fast ?? null)).toBeNull();
  });

  await test.step('Zeremonie, Ergebnis und Bilanz wie immer', async () => {
    await expect(host.locator('#overlay .paper')).toBeVisible({ timeout: 30_000 });
    const gamesAfter = await host.evaluate(
      (id) => window.__schnautz?.H.st?.players.find((p) => p.id === id)?.stats?.shithead?.games ?? 0,
      me,
    );
    expect(gamesAfter).toBe(gamesBefore + 1);
    expect((await mustView(host)).sh?.shithead).toBeTruthy();
  });

  expect(errors.list).toEqual([]);
});

test('Gast: ein abgelehnter Zug nennt den Grund am Tisch statt als Toast', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guest = errors.watch(await (await phone(browser)).newPage(), 'gast');
  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');
  await host.click('[data-act=game][data-g=shithead]');
  await expect.poll(async () => (await view(guest))?.game).toBe('shithead');
  await startGame(host);
  await waitForPhase(guest, ['swap']);
  await guest.click('[data-act=shready]');
  await host.click('[data-act=shready]');
  await waitForPhase(guest, ['play']);
  // Erst wenn die 4er-Sperre vorbei ist, steht der Grund fest: nicht dran oder erst Hand und offene Karten
  await expect.poll(async () => (await view(guest))?.sh?.win?.lock ?? false).toBe(false);
  const v = await mustView(guest);
  const me = await myId(guest);
  const why = shWhyNot(v, me, { src: 'down', i: 0 });
  expect(why?.e === 'any.notYourTurn' || why?.e === 'sh.blindLast').toBe(true);
  // Ein Zug, den die Oberfläche gar nicht anbietet, geht direkt an den Gastgeber
  await guest.evaluate(() => {
    void window.__schnautz?.G.conn?.send({ t: 'act', a: { type: 'shblind', i: 0 } });
  });
  await expect(guest.locator('#fly .nopelbl')).toHaveText(rejectText(why, ctxOfView(v)));
  await expect(guest.locator('#toasts .toast')).toHaveCount(0);
  expect((await mustView(guest)).n).toBe(v.n);
  expect(errors.list).toEqual([]);
});

test('ausgegraute Karte antippen: Grund am Tisch, die Auswahl bleibt leer', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await host.click('[data-act=game][data-g=shithead]');
  await expect.poll(async () => (await view(host))?.game).toBe('shithead');
  await fillWithBots(host, 3);
  await startGame(host);
  await waitForPhase(host, ['swap']);
  await host.click('[data-act=shready]');
  await waitForPhase(host, ['play']);
  // Gastgeber am Zug, oben eine hohe Karte, auf der Hand eine niedrigere (passt nicht) und eine 10.
  // Die Karten sucht der Test hier mit rankOf aus, im Browser werden sie nur umgelegt
  const pool = await host.evaluate(() => {
    const s = window.__schnautz;
    const S = s?.H.st?.sh;
    if (!s || !S) throw new Error('kein Shithead');
    return [...S.deck, ...S.pile, ...S.P[s.App.me].hand];
  });
  const take = (ok: (r: string) => boolean): string => {
    const c = pool.find((x) => ok(rankOf(x)));
    if (!c) throw new Error('keine passende Karte');
    pool.splice(pool.indexOf(c), 1);
    return c;
  };
  const free = take((r) => r === '10');
  const top = take((r) => ['A', 'K', 'D', 'B'].includes(r));
  const low = take((r) => ['4', '5', '6', '8', '9'].includes(r));
  await host.evaluate(
    ({ rest, top, low, free }) => {
      const s = window.__schnautz;
      const st = s?.H.st;
      const S = st?.sh;
      if (!s || !st || !S) throw new Error('kein Shithead');
      S.deck.splice(0, S.deck.length, ...rest);
      S.pile.splice(0, S.pile.length, top);
      S.P[s.App.me].hand.splice(0, S.P[s.App.me].hand.length, low, free);
      S.win = null;
      st.turn = st.players.findIndex((p) => p.id === s.App.me);
      st.n++;
      s.hostCommit();
    },
    { rest: pool, top, low, free },
  );
  // Vor jedem Tipp auf Shithead-Karten: Ein laufender Ablauf zeigt noch den alten Stand
  await expect.poll(() => seqBusy(host)).toBe(false);
  const v = await mustView(host);
  const me = await myId(host);
  const hand = v.sh?.P[me].hand as string[];
  const i5 = hand.findIndex((c) => !shCanPlay(v, rankOf(c)));
  const card = host.locator(`.shme .shhand [data-act=shh][data-i="${i5}"]`);
  await expect(card).toHaveClass(/\bdim\b/);
  await card.click({ position: { x: 8, y: 18 } });
  await expect(host.locator('#fly .nopelbl')).toHaveText('Die Karte passt nicht auf den Stapel.');
  await expect(host.locator('.shme .shhand .card.sel')).toHaveCount(0);
  await expect(host.locator('#toasts .toast')).toHaveCount(0);
  // Die passende Karte lässt sich wie immer wählen und legen
  await host.click(`.shme .shhand [data-act=shh][data-i="${1 - i5}"]`, { position: { x: 8, y: 18 } });
  await expect(host.locator('.shme .shhand .card.sel')).toHaveCount(1);
  // Die 10 verbrennt zwei Karten im Ablauf: Unter zehn Karten ist das ein Hinweis, keine große Ansage
  await host.click('[data-act=shplay]');
  await expect.poll(() => seqBusy(host)).toBe(true);
  await expect(host.locator('#fly .fieldlbl, .floatlbl').filter({ hasText: /verbrenn(st|t) den Stapel/ })).toHaveCount(
    1,
  );
  await expect(host.locator('#announce')).not.toContainText('Verbrannt');
  expect(errors.list).toEqual([]);
});
