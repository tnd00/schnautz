/*
 * Nichts scrollt und nichts wird abgeschnitten: Lobby, Tauschrunde und Tisch bei den Handygrößen der Messreihe und
 * am PC. Ein Tisch pro Spiel, der Gastgeber sitzt am PC und misst die PC-Größen, der Gast am Handy misst die
 * Handygrößen. Die Größe wechselt per setViewportSize (wie beim Drehen oder wenn die Adressleiste einklappt), so
 * deckt jeder Test beide Rollen ab und baut nur einen Tisch. Alle Prüfungen sind weich (expect.soft), ein roter Lauf
 * listet also jede Größe mit ihrem Befund.
 *
 * PW_LOOK und PW_THEME (etwa `PW_LOOK=legacy PW_THEME=dark npm run test:fit`) legen `schnautz:look` und
 * `schnautz:theme` vor dem ersten Laden in den Speicher, wie es `LS.set` täte. Ohne beide bleibt der Speicher leer
 * und die Seite nimmt ihren Standard.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  chooseGame,
  closeAll,
  devJump,
  Errors,
  fillWithBots,
  fitFindings,
  hostTable,
  joinTable,
  lobbyTab,
  sheetFindings,
  unlockDev,
  view,
  waitForPhase,
} from './helpers';

test.afterEach(closeAll);
// Die Tests teilen keinen Zustand. Mit --workers=4 laufen sie gleichzeitig (playwright.config.ts hat fullyParallel: false)
test.describe.configure({ mode: 'parallel' });

const PHONE = ['390x844', '390x740', '412x760', '375x780', '375x548', '360x640'];
const PC = ['1280x860', '1280x720', '1024x768'];
/** Ergebnisblatt: die kurzen Handys reichen, am PC das niedrigste Fenster */
const SHEET_PHONE = ['390x844', '375x548', '360x640'];
const SHEET_PC = ['1280x720'];
const GAMES = ['shithead', 'durak', 'cabo', 'schnautz'] as const;

const LOOK = process.env.PW_LOOK || null;
const THEME = process.env.PW_THEME || null;
// Look und Thema stehen im Titel, damit Läufe nebeneinander im Bericht unterscheidbar bleiben
const tag = [LOOK, THEME].filter(Boolean).join(' ');
const named = (title: string) => (tag ? `${title} [${tag}]` : title);

/** Look und Thema vor dem ersten Laden setzen (nur mit PW_LOOK oder PW_THEME). */
async function setLook(ctx: BrowserContext): Promise<void> {
  if (!LOOK && !THEME) return;
  await ctx.addInitScript(
    ([l, t]) => {
      if (l) localStorage.setItem('schnautz:look', JSON.stringify(l));
      if (t) localStorage.setItem('schnautz:theme', JSON.stringify(t));
    },
    [LOOK, THEME],
  );
}

const size = (s: string) => {
  const [width, height] = s.split('x').map(Number);
  return { width, height };
};

async function phoneCtx(browser: Browser, reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  const ctx = await browser.newContext({
    viewport: size(PHONE[0]),
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion,
  });
  await unlockDev(ctx);
  await setLook(ctx);
  return ctx;
}

async function pcCtx(browser: Browser) {
  const ctx = await browser.newContext({ viewport: size(PC[0]) });
  await unlockDev(ctx);
  await setLook(ctx);
  return ctx;
}

/** Größe wechseln, dann einen Moment warten, bis die Seite neu eingepasst hat. */
async function resize(page: Page, s: string): Promise<void> {
  await page.setViewportSize(size(s));
  await page.waitForTimeout(350);
}

async function check(page: Page, where: string, keys: string[]): Promise<void> {
  // Unter Last braucht das Einpassen nach dem Größenwechsel manchmal länger als 350 ms (Seite noch in der alten Höhe)
  try {
    await expect.poll(() => fitFindings(page, keys), { timeout: 3000 }).toEqual([]);
  } catch {
    // Bleibt der Befund, meldet ihn die weiche Prüfung darunter mit Ort
  }
  expect.soft(await fitFindings(page, keys), where).toEqual([]);
}

/**
 * Menü ⋯ offen: Der Bogen liegt ganz im Bild, scrollt nicht in sich und schneidet keinen Eintrag ab (mit
 * freigeschaltetem Dev-Menü ist das der längste Fall). Dazu alles aus fitFindings.
 */
async function menuFindings(page: Page): Promise<string[]> {
  const own = await page.evaluate(() => {
    const m = document.querySelector<HTMLElement>('#menu');
    if (!m || m.hidden || !m.getClientRects().length) return ['Menü zu'];
    const H = window.innerHeight;
    const W = window.innerWidth;
    const r = m.getBoundingClientRect();
    const out: string[] = [];
    if (m.scrollHeight > m.clientHeight + 1) out.push(`Menü ${m.scrollHeight - m.clientHeight} px abgeschnitten`);
    m.querySelectorAll<HTMLElement>('.mi').forEach((b) => {
      if (!b.getClientRects().length) return;
      const q = b.getBoundingClientRect();
      if (q.top < r.top - 1 || q.bottom > r.bottom + 1 || q.top < -1 || q.bottom > H + 1 || q.right > W + 1)
        out.push(`Eintrag ${b.dataset.act ?? b.id} bei ${Math.round(q.top)} bis ${Math.round(q.bottom)}`);
    });
    return out;
  });
  return [...own, ...(await fitFindings(page, ['#menu']))];
}

async function checkMenu(page: Page, where: string): Promise<void> {
  try {
    await expect.poll(() => menuFindings(page), { timeout: 3000 }).toEqual([]);
  } catch {
    // Bleibt der Befund, meldet ihn die weiche Prüfung darunter mit Ort
  }
  expect.soft(await menuFindings(page), where).toEqual([]);
}

/** Menü ⋯ öffnen, alle Größen messen, wieder schließen. */
async function menuSizes(page: Page, sizes: string[], label: string): Promise<void> {
  await page.click('#btn-menu');
  await expect(page.locator('#menu')).toBeVisible();
  for (const s of sizes) {
    await resize(page, s);
    await checkMenu(page, `Menü ${label} ${s}`);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
}

/** Gastgeber: Zug für einen Platz wie die KI, damit der Tisch nicht auf den Menschen am PC wartet. */
async function botMoveFor(host: Page, pid: string): Promise<void> {
  await host.evaluate((id) => {
    const s = window.__schnautz;
    if (!s?.H.st) return;
    const a = s.botDecide(s.viewFor(s.H.st, id, true), undefined, 'normal');
    if (!a || ['chat', 'emote', 'toss', 'sound'].includes(a.type)) return;
    if (!s.act(s.H.st, id, a)) s.hostCommit();
  }, pid);
}

/**
 * Warten, bis der Gast selbst etwas tun muss. Die KI spielt dabei für den Gastgeber mit. Nach 25 Sekunden wird
 * trotzdem gemessen, dann steht ein Hinweis am Test.
 */
async function guestsMove(host: Page, guest: Page): Promise<boolean> {
  const hostId = await host.evaluate(() => window.__schnautz?.App.me ?? '');
  const t0 = Date.now();
  while (Date.now() - t0 < 25_000) {
    const v = await view(guest);
    if (v?.phase === 'swap' || v?.phase === 'peek') {
      await host.evaluate(() => {
        const s = window.__schnautz;
        if (s?.H.st && !s.act(s.H.st, s.App.me, { type: 'force' })) s.hostCommit();
      });
    } else if (v?.phase === 'play' || v?.phase === 'choose') {
      for (const p of [guest, host]) {
        const keep = p.locator('[data-act=keep]');
        if (await keep.isVisible()) await keep.click();
      }
      const mine = await guest.evaluate(() => {
        const s = window.__schnautz;
        const w = s?.App.view;
        if (!w || w.phase !== 'play' || s.SEQ.busy) return false;
        if (w.game === 'durak') return w.dk?.att === w.me || w.dk?.def === w.me;
        return w.players[w.turn]?.id === w.me;
      });
      if (mine) return true;
      await botMoveFor(host, hostId);
    }
    await guest.waitForTimeout(250);
  }
  return false;
}

/** Zeremonie abwarten, notfalls antippen. */
async function waitSheet(page: Page): Promise<void> {
  const sheet = page.locator('#overlay .paper.result');
  await expect(sheet)
    .toBeVisible({ timeout: 15_000 })
    .catch(async () => {
      await page.mouse.click(5, 5);
      await expect(sheet).toBeVisible({ timeout: 20_000 });
    });
  await page.waitForTimeout(600);
}

/** Tisch zu acht: Gastgeber am PC, Gast am Handy übernimmt einen KI-Platz, danach Start. */
async function tableOfEight(browser: Browser, errors: Errors, game: (typeof GAMES)[number]) {
  const host = errors.watch(await (await pcCtx(browser)).newPage(), 'host');
  const code = await hostTable(host, 'Tahna');
  await chooseGame(host, game);
  await fillWithBots(host, 8);
  const guest = errors.watch(await (await phoneCtx(browser)).newPage(), 'gast');
  await joinTable(guest, code, 'Lena');
  // Der Gast übernimmt einen KI-Platz, es bleiben acht
  await expect.poll(async () => (await view(host))?.players.filter((p) => !p.bot).length).toBe(2);
  expect((await view(host))?.players).toHaveLength(8);
  await host.click('[data-act=start]');
  return { host, guest };
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test(
    named(`Lobby zu acht passt am Handy, auch nach Reiterwechsel und Größenwechsel (${motion})`),
    async ({ browser }) => {
      const errors = new Errors();
      const host = errors.watch(await (await phoneCtx(browser, motion)).newPage(), 'host');
      await hostTable(host, 'Tahna');
      await chooseGame(host, 'shithead');
      await fillWithBots(host, 8);
      for (const s of PHONE) {
        await resize(host, s);
        // Zweimal hin und her: Der zweite Besuch eines Reiters zeigt, ob fitLobby nach dem Wechsel richtig einpasst
        for (const tab of ['table', 'game', 'table', 'game'] as const) {
          await lobbyTab(host, tab);
          await host.waitForTimeout(200);
          await check(host, `${s} ${tab}`, ['.lfoot', tab === 'table' ? '.lnext' : '.lgo-start']);
        }
      }
      expect(errors.list).toEqual([]);
    },
  );
}

test(named('Lobby zu acht am PC: Partie starten liegt im Bild'), async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await pcCtx(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await fillWithBots(host, 8);
  for (const s of PC) {
    await resize(host, s);
    await check(host, s, ['.lfoot', '.lgo-start']);
  }
  expect(errors.list).toEqual([]);
});

for (const game of GAMES) {
  test(
    named(`${game} zu acht: Tauschrunde, Tisch und Menü passen, Gast am Handy und Gastgeber am PC`),
    async ({ browser }) => {
      test.setTimeout(3 * 60_000);
      const errors = new Errors();
      const { host, guest } = await tableOfEight(browser, errors, game);

      if (game === 'shithead') {
        await waitForPhase(guest, ['swap']);
        await guest.waitForTimeout(1500);
        for (const s of PHONE) {
          await resize(guest, s);
          await check(guest, `Tauschrunde ${s}`, ['#me']);
        }
        for (const s of PC) {
          await resize(host, s);
          await check(host, `Tauschrunde PC ${s}`, ['#me', '#emotes']);
        }
      }

      if (!(await guestsMove(host, guest)))
        test
          .info()
          .annotations.push({ type: 'Hinweis', description: 'Gast war nicht am Zug, gemessen am laufenden Tisch' });
      for (const s of PHONE) {
        await resize(guest, s);
        await check(guest, `Tisch ${s}`, ['.top', '#me']);
      }
      for (const s of PC) {
        await resize(host, s);
        await check(host, `Tisch PC ${s}`, ['.top', '#me', '#emotes']);
      }
      // Menü ⋯ am Tisch: der Gast am Handy, der Gastgeber mit den meisten Einträgen am PC und in Handybreite
      await menuSizes(guest, PHONE, 'Gast');
      await menuSizes(host, [...PC, '375x548', '360x640'], 'Gastgeber');
      expect(errors.list).toEqual([]);
    },
  );
}

/** Welcher Zeitraffer zum Ergebnisblatt führt. Bei Schnautz zeigt nur das Rundenende alle acht Zeilen. */
const SHEET_JUMP = { shithead: 'sh-any', durak: 'dk-any', cabo: 'cb-win', schnautz: 'sz-round' } as const;

for (const game of GAMES) {
  // Alle vier Spiele zeichnen das gemeinsame Blatt (src/ui/render/result.ts): bis acht Leute scrollt am Handy nichts,
  // auch nicht nach dem Bereitmelden, wenn der Wartetext in der Knopfreihe steht
  test(named(`${game} zu acht: Ergebnisblatt zeigt eigene Zeile und Verlierer`), async ({ browser }) => {
    test.setTimeout(3 * 60_000);
    const errors = new Errors();
    const { host, guest } = await tableOfEight(browser, errors, game);
    await devJump(host, SHEET_JUMP[game]);
    await waitSheet(guest);
    for (const s of SHEET_PHONE) {
      await resize(guest, s);
      expect.soft(await sheetFindings(guest, true), `Ergebnis ${s}`).toEqual([]);
    }
    await waitSheet(host);
    for (const s of SHEET_PC) {
      await resize(host, s);
      expect.soft(await sheetFindings(host, true), `Ergebnis PC ${s}`).toEqual([]);
    }
    // Der Gast meldet sich bereit, der Gastgeber noch nicht: Wartetext statt Knopf. Beim Rundenende läuft der
    // Countdown, deshalb nur messen, solange das Blatt noch steht
    const ready = guest.locator('#overlay .paper.result [data-act=ready]').first();
    if (await ready.isVisible()) {
      await ready.click();
      await expect(guest.locator('#overlay .waittxt')).toBeVisible();
    } else test.info().annotations.push({ type: 'Hinweis', description: 'Blatt schon weg, bereit nicht gemessen' });
    for (const s of SHEET_PHONE) {
      if (!(await guest.locator('#overlay .paper.result').isVisible())) break;
      await resize(guest, s);
      expect.soft(await sheetFindings(guest, true), `Ergebnis bereit ${s}`).toEqual([]);
    }
    expect(errors.list).toEqual([]);
  });
}

test(named('Schnautz am PC: Vorschau beim Tauschen schiebt die Reaktionsleiste nicht weg'), async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await pcCtx(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseGame(host, 'schnautz');
  await fillWithBots(host, 4);
  await host.click('[data-act=start]');
  await expect
    .poll(
      async () => {
        const keep = host.locator('[data-act=keep]');
        if (await keep.isVisible()) await keep.click();
        const v = await view(host);
        return v?.phase === 'play' && v.players[v.turn]?.id === v.me;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await host.waitForTimeout(1200);
  // Erst die Größe, dann wählen: Ein Größenwechsel passt neu ein und würde den Fehler verdecken
  for (const s of PC) {
    await resize(host, s);
    await host.click('#me [data-act=hand][data-i="0"]');
    await host.click('#center [data-act=mid][data-i="0"]');
    await expect(host.locator('#me [data-act=swap]')).toBeEnabled();
    await host.waitForTimeout(300);
    await check(host, `Tauschen gewählt ${s}`, ['#me', '#emotes']);
    // Wieder abwählen für die nächste Größe
    await host.click('#me [data-act=hand][data-i="0"]');
    await host.click('#center [data-act=mid][data-i="0"]');
  }
  expect(errors.list).toEqual([]);
});
