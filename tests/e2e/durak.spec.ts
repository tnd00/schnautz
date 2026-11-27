/*
 * Durak im Browser: allein gegen KIs bis zum Ende, zwei echte Browser gegeneinander und ein voller Tisch am Handy.
 * Die Züge wählt der Test mit derselben Spiellogik, die das Spiel nutzt, geklickt wird über die Oberfläche.
 */
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { dkBeats, rankOf, suitOf } from '../../src/game/cards';
import { SH_ORD } from '../../src/game/constants';
import { dkNextTarget, dkTrump, dkWaiting } from '../../src/game/durak';
import type { Card, View } from '../../src/game/types';
import { axeCheck } from './axe';
import {
  DRAG_TAG,
  dragIdle,
  dragReady,
  dragTable as hostDrag,
  GHOST,
  GHOST_LABEL,
  grab,
  GUARD_MS,
  mouseDrag,
  setDragPref,
  tap,
  tapAfterDrag,
} from './drag';
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
          tag: document.querySelector('#me .mehead .tag')?.textContent ?? '',
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
      // Die Rolle steht als Etikett am eigenen Platz
      expect(passed.tag).toBe('gepasst ✓');
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
    // Der Knopf heißt Passen, gedrückt Gepasst ✓, das Etikett am Platz gepasst ✓
    const labels = await p.locator('[data-act=dkpass]').allTextContents();
    labels.forEach((t) => expect(['Passen', 'Gepasst ✓']).toContain(t.trim()));
    passBtn += labels.length;
    const tags = await p.locator('.tag.done').allTextContents();
    tags.forEach((t) => expect(t.trim()).toBe('gepasst ✓'));
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

/*
 * Ziehen (ziehen.md 4.2 und 7): Gastgeber mit zwei KIs, die KIs stehen (BOTS.hold), der Test legt Hände und Tisch fest
 * und lässt die KIs selbst ziehen. Am Handy zieht in Chromium ein echter Finger über CDP, in WebKit gehen die
 * Zeigerereignisse synthetisch (tests/e2e/drag.ts).
 */

/** Gastgeber mit zwei stehenden KIs am Durak-Tisch. Ohne Gerät: Handy in Chromium, das Gerät des Projekts in WebKit. */
async function dragTable(browser: Browser, info: TestInfo, ctx?: 'desktop'): Promise<{ page: Page; errors: Errors }> {
  const errors = new Errors();
  const wk = info.project.name === 'webkit';
  const c = ctx === 'desktop' ? await desktop(browser) : wk ? await browser.newContext() : await phone(browser);
  const page = errors.watch(await c.newPage(), 'host');
  await hostDrag(page, 'durak', { bots: 2, hold: true });
  await waitForPhase(page, ['play'], 20_000);
  return { page, errors };
}

interface Rig {
  att: number;
  def: number;
  hands: Card[][];
  table?: { a: Card; d?: Card; by: number }[];
  transfer?: boolean;
}

/** Tisch fest legen, Plätze als Index in v.players (0 bin ich), Trumpf Herz */
async function rig(page: Page, o: Rig): Promise<string[]> {
  return page.evaluate((o) => {
    const s = window.__schnautz;
    const st = s?.H.st;
    const D = st?.dk;
    if (!s || !st || !D) throw new Error('keine Partie');
    const ids = [s.App.me, ...st.players.map((p) => p.id).filter((id) => id !== s.App.me)];
    st.rules.dk = { ...st.rules.dk, transfer: !!o.transfer };
    D.trump = 'H6';
    D.P = Object.fromEntries(ids.map((id, i) => [id, o.hands[i] ?? []]));
    Object.assign(D, {
      att: ids[o.att],
      def: ids[o.def],
      table: (o.table ?? []).map((p) => ({ a: p.a, by: ids[p.by], ...(p.d ? { d: p.d } : {}) })),
      take: false,
      done: [],
      finished: [],
      limit: Math.min(6, o.hands[o.def].length),
    });
    s.App.ds = { idx: [], pair: null };
    s.hostCommit();
    return ids;
  }, o);
}

/** Eine KI zieht über die Spiellogik des Gastgebers */
async function botAct(page: Page, id: string, a: unknown): Promise<void> {
  await page.evaluate(
    ([id, a]) => {
      const s = window.__schnautz;
      if (!s?.H.st) throw new Error('kein Gastgeber');
      const e = s.act(s.H.st, id as string, a as Parameters<typeof s.act>[2]);
      if (e) throw new Error(JSON.stringify(e));
      s.hostCommit();
    },
    [id, a] as const,
  );
}

const hand = (page: Page, c: Card) => page.locator(`#me [data-act=dkh][data-fk="hand:${c}"]`);
const pairAt = (page: Page, i: number) => page.locator(`#center .dkpair[data-i="${i}"]`);
const tableOf = async (page: Page) => (await mustView(page)).dk?.table ?? [];
const logN = async (page: Page) => (await mustView(page)).log.reduce((m, e) => Math.max(m, e.n), 0);

test(
  'Durak: Angreifen und Nachlegen per Ziehen, Tippen und Enter bleiben',
  { tag: DRAG_TAG },
  async ({ browser }, info) => {
    const { page, errors } = await dragTable(browser, info);
    const ids = await rig(page, {
      att: 0,
      def: 1,
      hands: [
        ['C7', 'D7', 'S8', 'H8', 'DK', 'C9'],
        ['C8', 'D8', 'SA', 'CA', 'DA', 'HK'],
        ['S9', 'SB', 'SD'],
      ],
    });
    await dragReady(page);
    // Bündel: beide Siebener antippen, dann einen davon ziehen, der andere kommt mit
    await tap(page, hand(page, 'C7'));
    await tap(page, hand(page, 'D7'));
    await expect(page.locator('#me .dkhand .card.sel')).toHaveCount(2);
    const table = page.locator('#center .dktable');
    const held = await grab(page, hand(page, 'D7'), table);
    await expect(page.locator(GHOST_LABEL)).toHaveText('Angreifen ×2');
    await expect(page.locator(`${GHOST} .tb-ghost-n`)).toHaveText('×2');
    await expect(page.locator('#center .dktable.tb-drop-hot')).toHaveCount(1);
    expect(await fitFindings(page, ['#me'])).toEqual([]);
    await held.release();
    // Tippen direkt nach dem Zug außerhalb des Tischs (Menü) wird sofort angenommen, der Klick-Wächter gilt nur am Tisch
    await tapAfterDrag(page, page.locator('#btn-menu'));
    await expect(page.locator('#menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    await dragIdle(page);
    await expect.poll(async () => (await tableOf(page)).map((p) => p.a).sort()).toEqual(['C7', 'D7']);
    // Die KI schlägt beides, jetzt darf ich Achten nachlegen
    await botAct(page, ids[1], { type: 'dkdefend', a: 0, i: 0, ac: 'C7', c: 'C8' });
    await botAct(page, ids[1], { type: 'dkdefend', a: 1, i: 0, ac: 'D7', c: 'D8' });
    await expect(pairAt(page, 1).locator('.dkd')).toHaveCount(1);
    // Falscher Wert ist ausgegraut: lässt sich nicht anheben, nichts geht raus, der Tipp nennt den Grund
    const n0 = await logN(page);
    const miss = await grab(page, hand(page, 'DK'), table);
    await expect(page.locator(GHOST)).toHaveCount(0);
    await miss.release();
    expect(await logN(page)).toBe(n0);
    await tap(page, hand(page, 'DK'));
    await expect(page.locator('#fly .nopelbl')).toHaveText(
      'Nachlegen geht nur mit Werten, die schon auf dem Tisch liegen.',
    );
    await expect(hand(page, 'DK')).not.toHaveClass(/\bsel\b/);
    // Eine andere Karte ziehen nimmt nur sie mit, mit der Maus
    await tap(page, hand(page, 'H8'));
    await expect(hand(page, 'H8')).toHaveClass(/\bsel\b/);
    await mouseDrag(page, hand(page, 'S8'), table);
    await dragIdle(page);
    await expect.poll(async () => (await tableOf(page)).map((p) => p.a)).toEqual(['C7', 'D7', 'S8']);
    await expect(hand(page, 'H8')).toBeVisible();
    // Tippen direkt nach einem Zug am Tisch wird angenommen
    await tapAfterDrag(page, hand(page, 'H8'));
    await expect(hand(page, 'H8')).toHaveClass(/\bsel\b/);
    // Enter auf einer Karte schaltet wie ein Tipp
    await hand(page, 'H8').focus();
    await page.keyboard.press('Enter');
    await expect(hand(page, 'H8')).not.toHaveClass(/\bsel\b/);
    expect(errors.list).toEqual([]);
  },
);

test(
  'Durak: Schlagen auf einen Angriff, freie Fläche und Schiebefeld',
  { tag: DRAG_TAG },
  async ({ browser }, info) => {
    const { page, errors } = await dragTable(browser, info);
    await rig(page, {
      att: 1,
      def: 0,
      hands: [
        ['C9', 'H9', 'DK', 'S7'],
        ['SA', 'CA', 'DA'],
        ['S9', 'SB', 'SD', 'S10'],
      ],
      table: [
        { a: 'C6', by: 1 },
        { a: 'D6', by: 1 },
      ],
    });
    await dragReady(page);
    // Karo König schlägt Kreuz Sechs nicht: zurück mit Grund, nichts geschickt
    const n0 = await logN(page);
    const held = await grab(page, hand(page, 'DK'), pairAt(page, 0));
    await expect(page.locator(GHOST_LABEL)).toHaveText('Die Karte schlägt das nicht.');
    await held.release();
    await dragIdle(page);
    expect(await logN(page)).toBe(n0);
    // Kreuz Neun auf Kreuz Sechs
    const beat = await grab(page, hand(page, 'C9'), pairAt(page, 0));
    await expect(page.locator(GHOST_LABEL)).toContainText('schlagen');
    await beat.release();
    await dragIdle(page);
    await expect.poll(async () => (await tableOf(page))[0]?.d).toBe('C9');
    // Herz Neun auf die freie Fläche (über dem geschlagenen Paar): Es ist nur noch ein Angriff offen
    await mouseDrag(page, hand(page, 'H9'), pairAt(page, 0));
    await dragIdle(page);
    await expect.poll(async () => (await tableOf(page))[1]?.d).toBe('H9');
    // Weiterschieben: Das Feld erscheint erst beim Ziehen einer passenden Karte und verschwindet danach
    await rig(page, {
      att: 2,
      def: 0,
      hands: [
        ['S6', 'C9', 'DK'],
        ['SA', 'CA', 'DA'],
        ['S9', 'SB', 'SD', 'S10'],
      ],
      table: [{ a: 'C6', by: 2 }],
      transfer: true,
    });
    await dragReady(page);
    const field = page.locator('#center .dkxfer');
    const v = await mustView(page);
    const to = dkNextTarget(v, v.me);
    const next = v.players.find((p) => p.id === to)?.name ?? '';
    const shove = await grab(page, hand(page, 'S6'), page.locator('#center .dktable'));
    await expect(field).toBeVisible();
    await expect(field).toContainText(next);
    expect(await fitFindings(page, ['#me'])).toEqual([]);
    await shove.move(field);
    await expect(page.locator(GHOST_LABEL)).toHaveText(`Schieben → ${next}`);
    await shove.release();
    await dragIdle(page);
    await expect.poll(async () => (await mustView(page)).dk?.def).toBe(to);
    await expect(field).toHaveCount(0);
    expect(errors.list).toEqual([]);
  },
);

test('Durak: Schiebefeld am PC und Schalter „Karten ziehen“ aus', async ({ browser }, info) => {
  const { page, errors } = await dragTable(browser, info, 'desktop');
  const hands: Card[][] = [
    ['S6', 'C9', 'DK'],
    ['SA', 'CA', 'DA'],
    ['S9', 'SB', 'SD', 'S10'],
  ];
  await rig(page, { att: 2, def: 0, hands, table: [{ a: 'C6', by: 2 }], transfer: true });
  await dragReady(page);
  const v = await mustView(page);
  const to = dkNextTarget(v, v.me);
  // Mit verkleinertem Tisch (fitDesktop) liegt das Feld neben dem Angriff und nimmt den Abwurf an
  const field = page.locator('#center .dkxfer');
  const held = await grab(page, hand(page, 'S6'), page.locator('#center .dktable'), { kind: 'mouse' });
  await expect(field).toBeVisible();
  const [f, p] = await Promise.all([field.boundingBox(), pairAt(page, 0).boundingBox()]);
  expect(f && p && f.x >= p.x + p.width).toBe(true);
  expect(await fitFindings(page, ['#me'])).toEqual([]);
  await held.move(field);
  await held.release();
  await dragIdle(page);
  await expect.poll(async () => (await mustView(page)).dk?.def).toBe(to);
  // Schalter aus: kein Geist, kein Zug, Tippen geht wie vorher
  await setDragPref(page, false);
  await rig(page, { att: 0, def: 1, hands: [['C7', 'D7', 'S8'], hands[1], hands[2]] });
  await dragReady(page, false);
  const n0 = await logN(page);
  await mouseDrag(page, hand(page, 'C7'), page.locator('#center .dktable'));
  await expect(page.locator(GHOST)).toHaveCount(0);
  expect(await logN(page)).toBe(n0);
  // Der Klick-Wächter nach dem Schieben eben gilt noch, ein Mensch braucht länger als dieser Test
  await page.waitForTimeout(GUARD_MS + 50);
  await hand(page, 'C7').click();
  await expect(hand(page, 'C7')).toHaveClass(/\bsel\b/);
  // Kurz nach einem Wechsel der Knopfzeile zählt ein Tipp nicht (barGuard)
  await page.waitForTimeout(450);
  await page.click('[data-act=dkgo]');
  await expect.poll(async () => (await tableOf(page)).map((p) => p.a)).toEqual(['C7']);
  expect(errors.list).toEqual([]);
});
