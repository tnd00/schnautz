/*
 * Durak im Browser: allein gegen KIs bis zum Ende, zwei echte Browser gegeneinander und ein voller Tisch am Handy.
 * Die Züge wählt der Test mit derselben Spiellogik, die das Spiel nutzt, geklickt wird über die Oberfläche.
 */
import { expect, test, type Page } from '@playwright/test';
import { dkBeats, rankOf, suitOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { dkTrump, dkWaiting } from '../../src/game/durak';
import type { View } from '../../src/game/types';
import { axeCheck } from './axe';
import {
  quickBots,
  fitFindings,
  chooseGame,
  closeAll,
  desktop,
  Errors,
  hostTable,
  joinTable,
  lobbyTab,
  mustView,
  myId,
  phone,
  playerCount,
  startGame,
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

/** Knöpfe, die gerade gehen. Gesperrte bleiben antippbar und nennen nur ihren Grund (aria-disabled, seit 2.8). */
const LIVE = ':not([disabled]):not([aria-disabled=true])';

/** Vor axe: alle endlichen Animationen durch, Einblenden täuscht sonst schwachen Kontrast vor */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** axe am Tisch für jede Seite, beschriftet mit eigenem Zug oder Warten und der Größe */
async function axeTable(pages: Page[], ids: string[], sizes: string[]): Promise<void> {
  for (const [k, p] of pages.entries()) {
    await settle(p);
    const turn = dkWaiting(await mustView(p)).includes(ids[k]);
    await axeCheck(p, {
      include: '#scr-game',
      exclude: '#fly',
      where: `Durak ${turn ? 'eigener Zug' : 'Warten'} ${sizes[k]}`,
    });
  }
}

/** Knopf antippen wie ein Mensch: kurz nach einem Wechsel der Knopfzeile zählt ein Tipp nicht (barGuard). */
async function button(page: Page, act: string): Promise<boolean> {
  const b = page.locator(`[data-act=${act}]${LIVE}`);
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

test('Durak gegen zwei KIs bis zum Ende', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  // Testmodus: KIs ziehen flott, die echte Taktung prüfen die Partien zwischen zwei Browsern
  await quickBots(host);
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
  // Der Ablagestapel heißt Bito, ohne Mülleimer
  await expect(host.locator('#center .dkbito')).toContainText('Bito');
  await expect(host.locator('#center .dkbito')).not.toContainText('🗑');
  let passBtn = 0;
  let passedSeen = 0;
  let whySeen = 0;
  let btnSeen = 0;
  let btnCase = 0;
  await playToEnd([host], async (p) => {
    // Wer gepasst hat, kann nichts nachlegen, bis ein neuer Wert liegt oder aufgenommen wird. Ansicht und
    // Oberfläche in einem Zug lesen, sonst kommt ein KI-Zug dazwischen. Die ausgegrauten Karten bleiben
    // antippbar und nennen ihren Grund am Tisch, statt still nichts zu tun
    const passed = await p.evaluate(
      ([tap, live]) => {
        const s = window.__schnautz;
        const D = s?.App.view?.dk;
        if (!s || !D || s.App.view?.phase !== 'play' || !D.table.length || !D.done.includes(s.App.me)) return null;
        const res = {
          pick: document.querySelectorAll('#me .dkhand .pick[data-act=dkh]').length,
          go: document.querySelectorAll(`#me [data-act=dkgo]${live}`).length,
          sub: document.querySelector('#status .sub')?.textContent ?? '',
          why: null as string | null,
        };
        const dim = document.querySelector<HTMLElement>('#me .dkhand .card.dim[data-act=dkh]');
        if (tap && dim && !s.App.busy) {
          dim.click();
          res.why = document.querySelector('#fly .nopelbl')?.textContent ?? '';
        }
        return res;
      },
      [whySeen < 2, LIVE] as const,
    );
    if (passed) {
      passedSeen++;
      expect(passed).toMatchObject({ pick: 0, go: 0 });
      expect(passed.sub).toMatch(/^Du hast gepasst\./);
      expect(passed.sub).not.toContain('trotzdem');
      if (passed.why != null) {
        whySeen++;
        expect(passed.why).toMatch(/^Du hast gepasst\./);
      }
      // Der gesperrte Knopf „Gepasst ✓“ nennt beim Tipp denselben Grund, ohne einen Zug zu schicken
      if (!btnSeen && passed.why == null) {
        btnCase++;
        let why: string | null = null;
        try {
          // force: Playwright hält aria-disabled für nicht klickbar, ein Mensch kann trotzdem tippen
          await p.locator('#me [data-act=dkpass][aria-disabled=true]').click({ force: true, timeout: 1000 });
          why = await p.evaluate(() =>
            document.querySelector('#me [data-act=dkpass].shake')
              ? (document.querySelector('#fly .nopelbl')?.textContent ?? '')
              : null,
          );
        } catch {
          // Die Lage hat sich inzwischen geändert, beim nächsten Passen noch einmal
        }
        if (why != null) {
          btnSeen++;
          expect(why).toMatch(/^Du hast gepasst\./);
        }
      }
    }
    // Der Knopf heißt Passen, gedrückt Gepasst ✓, das Etikett am Platz passt ✓
    const labels = await p.locator('[data-act=dkpass]').allTextContents();
    labels.forEach((t) => expect(['Passen', 'Gepasst ✓']).toContain(t.trim()));
    passBtn += labels.length;
    const tags = await p.locator('.tag.done').allTextContents();
    tags.forEach((t) => expect(t.trim()).toBe('passt ✓'));
  });
  expect(passBtn).toBeGreaterThan(0);
  expect(passedSeen).toBeGreaterThan(0);
  expect(whySeen).toBeGreaterThan(0);
  // Der gesperrte Knopf kommt nur dran, wenn nach den Karten noch einmal gepasst wurde. Das hängt am Zufall
  if (btnCase) expect(btnSeen).toBeGreaterThan(0);
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
  const pages = [host, guest];
  const ids = [await myId(host), await myId(guest)];
  const sizes = ['1280x860', '390x844'];
  // axe am PC und am Handy, einmal am Zug und einmal wartend: vor und nach dem ersten Angriff
  await axeTable(pages, ids, sizes);
  const att = (await mustView(host)).dk?.att;
  const k = ids.indexOf(att ?? '');
  await expect.poll(async () => dkMove(pages[k], await mustView(pages[k]), ids[k])).toBe(true);
  for (const p of pages) await expect.poll(async () => (await mustView(p)).dk?.table.length).toBeGreaterThan(0);
  await axeTable(pages, ids, sizes);
  let checked = 0;
  await playToEnd([host, guest], async (p, v, me) => {
    if (p !== guest || v.phase !== 'play' || !v.dk) return;
    // Die Hand des Hosts ist für den Gast nur eine Zahl, der Stapel auch
    Object.entries(v.dk.P).forEach(([id, h]) => {
      if (id !== me) expect(typeof h).toBe('number');
    });
    expect(typeof v.dk.deck).toBe('number');
    if (checked++ % 10 === 0) expect(await fitFindings(guest, ['#me'])).toEqual([]);
  });
  await waitForPhase(guest, ['over'], 20_000);
  await expect(guest.locator('#overlay .result h2')).toContainText(/Durak|Unentschieden/, { timeout: 20_000 });
  await expect(host.locator('#overlay .result h2')).toContainText(/Durak|Unentschieden/, { timeout: 20_000 });
  for (const [i, p] of pages.entries()) {
    await settle(p);
    await axeCheck(p, { include: '#overlay', where: `Durak Ergebnisblatt ${sizes[i]}` });
  }
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
  await chooseGame(host, 'durak');
  await lobbyTab(host, 'table');
  for (let i = 0; i < 20 && (await playerCount(host)) < 8; i++) {
    const add = host.locator('[data-act=addbot]');
    if (await add.count()) await add.first().click();
    else await host.click('[data-act=seats][data-d="1"]');
    await host.waitForTimeout(100);
  }
  await expect.poll(() => playerCount(host), { timeout: 10_000 }).toBe(8);
  await startGame(host);
  await waitForPhase(host, ['play'], 20_000);
  expect((await mustView(host)).dk?.size).toBe(52);
  await host.waitForTimeout(1500);
  expect(await fitFindings(host, ['#me'])).toEqual([]);
  // Ein paar Angriffe später, mit Karten auf dem Tisch
  for (let k = 0; k < 40; k++) {
    const v = await mustView(host);
    if ((v.dk?.table.length ?? 0) >= 2) break;
    await dkMove(host, v, await myId(host));
    await host.waitForTimeout(300);
  }
  expect(await fitFindings(host, ['#me'])).toEqual([]);
  expect(errors.list).toEqual([]);
});
