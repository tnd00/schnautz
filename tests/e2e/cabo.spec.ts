/*
 * Cabo im Browser: allein gegen KIs bis zum Ende, zwei echte Browser gegeneinander (fremde Karten bleiben geheim,
 * dazu axe am PC und am Handy) und ein voller Tisch am Handy. Geklickt wird über die Oberfläche wie ein Mensch.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { View } from '../../src/game/types';
import { axeCheck } from './axe';
import {
  DRAG_TAG,
  DROP_OK,
  GHOST,
  GHOST_LABEL,
  drag,
  dragIdle,
  dragReady,
  dragTable,
  grab,
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
  withSettings,
} from './helpers';

test.afterEach(closeAll);

/**
 * Knöpfe und Karten, die gerade gehen. Gesperrte bleiben antippbar und nennen nur ihren Grund (aria-disabled), ein
 * gezielter Tipp darauf braucht in Playwright `force`.
 */
const LIVE = ':not([disabled]):not([aria-disabled=true])';

/** Regeln, die axe hier auslässt. Leer: Es gilt WCAG 2.2 AA vollständig. */
const AXE_OFF: string[] = [];

/** Warten, bis Meldungen weg und endliche Animationen fertig sind, damit axe einen ruhigen Tisch sieht. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('#announce .ann')).toHaveCount(0, { timeout: 20_000 });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Knopf antippen wie ein Mensch: kurz nach einem Wechsel der Knopfzeile zählt ein Tipp nicht (src/ui/cabo/input.ts). */
async function button(page: Page, act: string): Promise<boolean> {
  const b = page.locator(`#me [data-act=${act}]${LIVE}`);
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

/** Cabo wählen, kurze Partie bis 50. Danach ist am Handy der Reiter Tisch offen. */
async function chooseCabo(host: Page, short = true): Promise<void> {
  await chooseGame(host, 'cabo');
  if (short)
    await withSettings(host, 'cabo', async (sheet) => {
      await sheet.locator('[data-act=cbtarget][data-v="50"]').click();
      await expect.poll(async () => (await view(host))?.rules.cb?.target).toBe(50);
    });
  await lobbyTab(host, 'table');
}

test('Cabo gegen drei KIs bis zum Ende', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  // Testmodus: KIs ziehen flott, die echte Taktung prüfen die Partien zwischen zwei Browsern
  await quickBots(host);
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
  let told = false;
  let dragged = false;
  // Geprüfte Lagen für axe, etwa „eigener Zug 1280x860“: beide Seiten je einmal dran und einmal wartend
  const axed = new Set<string>();
  const hostId = await myId(host);
  const guestId = await myId(guest);
  await playToEnd([host, guest], async (p, v, me) => {
    // Ohne KIs steht der Tisch, bis jemand zieht: Eine Seite ist dran, die andere wartet. Vor dem Zug der Person am
    // Zug, deshalb bei beiden Seiten
    if (axed.size < 4 && v.phase === 'play' && v.cb && !v.cb.hold && !v.cb.power) {
      const turn = v.players[v.turn]?.id;
      for (const [pg, id, size] of [
        [host, hostId, '1280x860'],
        [guest, guestId, '390x844'],
      ] as const) {
        const where = `${id === turn ? 'eigener Zug' : 'Warten'} ${size}`;
        if (axed.has(where)) continue;
        axed.add(where);
        await settle(pg);
        await axeCheck(pg, { include: '#scr-game', exclude: '#fly', disable: AXE_OFF, where: `Cabo ${where}` });
      }
    }
    if (p !== guest || !v.cb || (v.phase !== 'play' && v.phase !== 'peek')) return;
    const C = v.cb;
    // Verdeckte Karten sind für den Gast nur Plätze ohne Wert, auch die eigenen
    Object.values(C.P).forEach((row) => row.forEach((s) => expect(!!s.c).toBe(!!s.up)));
    expect(typeof C.deck).toBe('number');
    // Was der Host vom Stapel zieht, sieht der Gast nicht. Wissen bekommen nur KIs
    if (C.hold && C.hold.by !== me && C.hold.from === 'deck') expect(C.hold.c).toBeUndefined();
    expect(C.know).toBeUndefined();
    C.reveal?.items.forEach((x) => expect(typeof x.c).toBe('string'));
    if (checked++ % 10 === 0) expect(await fitFindings(guest, ['#me'])).toEqual([]);
    // Einmal beim Gast: Stapel per Finger auf „gezogen“. Der Geist liegt, bis die Antwort des Gastgebers da ist
    if (!dragged && v.phase === 'play' && v.players[v.turn]?.id === me && !C.hold && !C.power && C.deck > 0) {
      await dragReady(guest);
      await dragIdle(guest);
      await drag(guest, guest.locator(DECK).last(), guest.locator(HOLD_DROP));
      await expect.poll(async () => (await mustView(guest)).cb?.hold?.by).toBe(me);
      await expect(guest.locator(GHOST)).toHaveCount(0);
      dragged = true;
      return;
    }
    // Einmal beim Gast: eigene Karte antippen, während der Gastgeber dran ist. Ohne KIs steht der Tisch dabei still,
    // der Gastgeber zieht erst im nächsten Durchgang. Der Grund steht am Tisch und es geht kein Zug raus
    if (told || v.phase !== 'play' || v.players[v.turn]?.id === me || !C.P[me]?.length) return;
    const hv = await mustView(host);
    if (hv.phase !== 'play' || hv.cb?.t !== C.t || hv.players[hv.turn]?.id === me) return;
    await expect(guest.locator('#announce .ann')).toHaveCount(0, { timeout: 20_000 });
    // Gesperrt mit Grund (aria-disabled): Playwright tippt nur mit force, ein Mensch kann es immer
    await guest.locator('#me .cbslot[data-act=cbm][aria-disabled=true]').first().click({ force: true });
    await expect(guest.locator('#fly .nopelbl')).toContainText('Du bist gerade nicht dran.');
    expect((await mustView(host)).cb?.t).toBe(C.t);
    told = true;
  });
  expect(told, 'Gast hat eine eigene Karte angetippt, während der Gastgeber dran war').toBe(true);
  expect(dragged, 'Gast hat per Finger vom Stapel gezogen').toBe(true);
  expect([...axed].sort(), 'axe hat eigenen Zug und Warten an PC und Handy geprüft').toHaveLength(4);
  await waitForPhase(guest, ['over'], 30_000);
  for (const [pg, size] of [
    [host, '1280x860'],
    [guest, '390x844'],
  ] as const) {
    await expect(pg.locator('#overlay .result h2')).toContainText(/Cabo-König|Unentschieden/, { timeout: 30_000 });
    await settle(pg);
    await axeCheck(pg, { include: '#overlay', disable: AXE_OFF, where: `Cabo Ergebnisblatt ${size}` });
  }
  expect(errors.list).toEqual([]);
});

test('Cabo zu acht passt am Handy ohne Scrollen auf den Bildschirm', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await phone(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host, false);
  // Schnappen an, dann steht ein dritter Knopf am Platz
  await withSettings(host, 'cabo', async (sheet) => {
    await sheet.locator('[data-cbrule=snap]').check();
    await expect.poll(async () => (await view(host))?.rules.cb?.snap).toBe(true);
  });
  await lobbyTab(host, 'table');
  for (let i = 0; i < 20 && (await playerCount(host)) < 8; i++) {
    const add = host.locator('[data-act=addbot]');
    if (await add.count()) await add.first().click();
    else await host.click('[data-act=seats][data-d="1"]');
    await host.waitForTimeout(100);
  }
  await expect.poll(() => playerCount(host), { timeout: 10_000 }).toBe(8);
  await startGame(host);
  await waitForPhase(host, ['peek'], 20_000);
  expect((await mustView(host)).cb?.decks).toBe(2);
  await host.waitForTimeout(1500);
  expect(await fitFindings(host, ['#me'])).toEqual([]);
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
  expect(await fitFindings(host, ['#me'])).toEqual([]);
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
  await host.click(`#me [data-act=cbblind]${LIVE}`);
  await expect.poll(async () => (await view(host))?.log.some((e) => e.k === 'cbblind' && e.p === me)).toBe(true);
  expect(errors.list).toEqual([]);
});

/** Zustand beim Gastgeber setzen: KIs anhalten, alle haben angesehen, ich bin dran mit der Karte `c` vom Stapel. */
async function holdCard(host: Page, me: string, c: string): Promise<void> {
  await host.evaluate(
    ({ me, c }) => {
      const S = window.__schnautz!;
      S.BOTS.hold = true;
      const st = S.H.st!;
      st.players.forEach((p) => {
        if (!p.ready && st.phase === 'peek')
          S.act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) });
      });
      st.turn = st.players.findIndex((p) => p.id === me);
      st.cb!.t += 1;
      st.cb!.power = null;
      st.cb!.hold = { by: me, c, from: 'deck' };
      S.hostCommit();
    },
    { me, c },
  );
}

test('Am Handy: gezogene Dame mit Knöpfen in einer Zeile, ausgegraute Knöpfe und Karten nennen ihren Grund', async ({
  browser,
}) => {
  const errors = new Errors();
  const host = errors.watch(await (await phone(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host, false);
  for (let i = 0; i < 3; i++) await host.click('[data-act=addbot]');
  await expect.poll(() => playerCount(host)).toBe(4);
  await startGame(host);
  await waitForPhase(host, ['peek'], 20_000);
  const me = await myId(host);
  await holdCard(host, me, 'SD');
  await expect(host.locator('#announce .ann')).toHaveCount(0, { timeout: 20_000 });
  await expect(host.locator('#me [data-act=cbdiscard]')).toContainText('Ablegen');
  for (const size of [
    { width: 360, height: 640 },
    { width: 375, height: 548 },
    { width: 390, height: 844 },
  ]) {
    await host.setViewportSize(size);
    await host.waitForTimeout(300);
    const m = await host.evaluate(() => {
      const btns = [...document.querySelectorAll<HTMLElement>('#me .actions .btn')];
      // Jeder Knopf einzeilig: sichtbare Beschriftung nicht höher als eine Zeile
      const lines = btns.map((b) => {
        const lbl =
          [...b.querySelectorAll<HTMLElement>('.blong, .bshort, .cbres > :not([aria-hidden])')].find(
            (x) => x.offsetParent,
          ) ?? b;
        const r = document.createRange();
        r.selectNodeContents(lbl);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        return tops.size;
      });
      const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
      const cnt = document.querySelector('#center .cbhold .cnt')?.getBoundingClientRect();
      const deck = document.querySelector('#center .cbdeck')?.getBoundingClientRect();
      const pile = document.querySelector('#center .cbpile')?.getBoundingClientRect();
      return {
        lines,
        rows: tops.size,
        label: document.querySelector('#center .cbhold .cnt')?.textContent ?? '',
        inside: !!cnt && !!deck && !!pile && cnt.left >= deck.right - 1 && cnt.right <= pile.left + 1,
      };
    });
    expect.soft(m.rows, `Knöpfe in einer Reihe ${size.width}`).toBe(1);
    expect.soft(Math.max(...m.lines), `Knöpfe einzeilig ${size.width}`).toBe(1);
    expect.soft(m.inside, `Etikett „${m.label}“ in der Spalte ${size.width}`).toBe(true);
  }
  expect(await fitFindings(host, ['#me'])).toEqual([]);
  // Nichts gewählt: „Eintauschen“ ist ausgegraut, nennt aber den Grund und schickt nichts
  const t0 = (await mustView(host)).cb?.t;
  await host.waitForTimeout(450);
  // force: Playwright hält aria-disabled für nicht klickbar, ein Mensch kann trotzdem tippen
  await host.locator('#me [data-act=cbswap][aria-disabled=true]').click({ force: true });
  await expect(host.locator('#fly .nopelbl')).toContainText('Wähle die Karten, die du tauschen willst.');
  await expect(host.locator('#me [data-act=cbswap]')).toHaveClass(/shake/);
  expect((await mustView(host)).cb?.hold?.by).toBe(me);
  expect((await mustView(host)).cb?.t).toBe(t0);
  // Spionieren: Eine eigene Karte nennt den Grund und wackelt selbst, nicht der ganze Platz. Es geht kein Zug raus
  const t1 = await host.evaluate(() => {
    const S = window.__schnautz!;
    const st = S.H.st!;
    st.cb!.hold = null;
    st.cb!.t += 1;
    st.cb!.power = { by: S.App.me, kind: 'spy', c: 'H9' };
    st.cb!.pile.push('H9');
    S.hostCommit();
    return st.cb!.t;
  });
  // Spionieren: fremde Karten werden Ziele
  await expect(host.locator('#opps .opp.aimable')).not.toHaveCount(0);
  await host.waitForTimeout(450);
  const own = host.locator('#me .cbslot[data-act=cbm][aria-disabled=true]').first();
  await own.click({ force: true });
  await expect(host.locator('#fly .nopelbl').last()).toContainText('Wähle eine Karte von jemand anderem.');
  await expect(own).toHaveClass(/shake/);
  await expect(host.locator('#me')).not.toHaveClass(/shake/);
  expect((await mustView(host)).cb?.power?.kind).toBe('spy');
  expect((await mustView(host)).cb?.t).toBe(t1);
  // Fremder Zug: die eigene Karte nennt, dass jemand anderes dran ist
  await host.evaluate((me) => {
    const S = window.__schnautz!;
    const st = S.H.st!;
    st.cb!.hold = null;
    st.cb!.power = null;
    st.turn = st.players.findIndex((p) => p.id !== me);
    st.cb!.t += 1;
    S.hostCommit();
  }, me);
  await expect(host.locator('#opps .opp.turn')).toHaveCount(1);
  await host.locator('#me .cbslot[data-act=cbm][aria-disabled=true]').first().click({ force: true });
  await expect(host.locator('#fly .nopelbl')).toContainText('nicht dran');
  expect(errors.list).toEqual([]);
});

/**
 * Zustand beim Gastgeber für die Fälle mit Ziehen: KIs halten, alle haben angesehen, Schnappen an, `who` ist dran und
 * hat nichts gezogen. `fn` darf danach noch am Zustand drehen (läuft im Browser, als Text übergeben).
 */
async function setCb(host: Page, who: 'me' | 'other', fn = ''): Promise<void> {
  await host.evaluate(
    ({ who, fn }) => {
      const S = window.__schnautz!;
      S.BOTS.hold = true;
      const st = S.H.st!;
      st.players.forEach((p) => {
        if (!p.ready && st.phase === 'peek')
          S.act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) });
      });
      st.rules.cb!.snap = true;
      st.turn = st.players.findIndex((p) => (who === 'me' ? p.id === S.App.me : p.id !== S.App.me));
      st.cb!.t += 1;
      st.cb!.hold = null;
      st.cb!.power = null;
      if (fn) new Function('st', 'me', fn)(st, S.App.me);
      S.hostCommit();
    },
    { who, fn },
  );
  await dragIdle(host);
}

/** Eigene Plätze und die Logeinträge ab `n` beim Gastgeber */
const myRow = async (host: Page): Promise<{ id: number; c?: string; up?: boolean }[]> =>
  host.evaluate(() => window.__schnautz!.App.view!.cb!.P[window.__schnautz!.App.me]);
const logSince = async (host: Page, n: number): Promise<View['log']> =>
  host.evaluate((n) => window.__schnautz!.App.view!.log.filter((e) => e.n > n), n);
/** Erster eigener Logeintrag der Art `k` ab `n`, als flaches Objekt */
const ownLog = async (host: Page, n: number, k: string, me: string): Promise<Record<string, unknown> | undefined> =>
  (await logSince(host, n)).find((e) => e.k === k && e.p === me) as Record<string, unknown> | undefined;
const lastN = async (host: Page): Promise<number> =>
  host.evaluate(() => Math.max(0, ...window.__schnautz!.App.view!.log.map((e) => e.n)));

/** Handy mit echtem Finger in Chromium, im WebKit-Projekt das iPhone des Projekts mit synthetischen Zeigern */
async function dragPhone(browser: Browser): Promise<Page> {
  const webkit = test.info().project.name === 'webkit';
  return (await (webkit ? browser.newContext() : phone(browser))).newPage();
}

const SLOT = (id: number) => `#me .cbslot[data-sid="${id}"]`;
const DECK = '#center .cbdeck [data-drag=deck]';
const HOLD_DROP = '#center [data-drop=hold]';
const PILE_DROP = '#center [data-drop=pile]';

test(
  'Cabo ziehen am Handy: Stapel, Ablegen, Ablage auf Platz, Schnappen, Eintauschen',
  { tag: DRAG_TAG },
  async ({ browser }) => {
    test.setTimeout(3 * 60_000);
    const errors = new Errors();
    const host = errors.watch(await dragPhone(browser), 'host');
    await dragTable(host, 'cabo', { bots: 3 });
    await waitForPhase(host, ['peek'], 20_000);
    const me = await myId(host);
    await setCb(host, 'me');
    await dragReady(host);

    // Stapel auf „gezogen“: Etikett vor dem Loslassen, nur „gezogen“ leuchtet
    let held = await grab(host, host.locator(DECK).last(), host.locator(HOLD_DROP));
    await expect(host.locator(GHOST_LABEL)).toHaveText('Ziehen');
    await expect(host.locator(DROP_OK)).toHaveCount(1);
    await held.release();
    await expect.poll(async () => (await mustView(host)).cb?.hold?.by).toBe(me);
    await dragIdle(host);

    // Tippen direkt nach dem Zug wird angenommen: der Platz ist gewählt
    const row = await myRow(host);
    await tapAfterDrag(host, host.locator(SLOT(row[0].id)));
    await expect(host.locator(SLOT(row[0].id))).toHaveClass(/\bsel\b/);
    // Enter auf einer Karte geht weiter über den Tipp-Weg
    await host.locator(SLOT(row[1].id)).focus();
    await host.keyboard.press('Enter');
    await expect(host.locator(SLOT(row[1].id))).toHaveClass(/\bsel\b/);
    // Gewählte ziehen alle mit, das Etikett warnt vor ungleichen
    held = await grab(host, host.locator(SLOT(row[0].id)), host.locator(HOLD_DROP));
    await expect(host.locator(GHOST_LABEL)).toHaveText('2 eintauschen · nur gleiche');
    await expect(host.locator(`${GHOST} .tb-ghost-n`)).toHaveText('×2');
    // Mitten im Zug bleibt der Tisch, wie er ist
    expect(await fitFindings(host, ['#me', '#center'])).toEqual([]);
    expect(await host.evaluate(() => scrollY)).toBe(0);
    let n = await lastN(host);
    await held.release();
    await expect.poll(async () => (await ownLog(host, n, 'cbswap', me))?.ids).toEqual([row[0].id, row[1].id]);

    // Gezogene Karte auf einen gewählten Platz tauscht alle gewählten (ziehen.md 4.1)
    await setCb(host, 'me');
    await drag(host, host.locator(DECK).last(), host.locator(HOLD_DROP));
    await expect.poll(async () => (await mustView(host)).cb?.hold?.by).toBe(me);
    await dragIdle(host);
    const rs = await myRow(host);
    await tapAfterDrag(host, host.locator(SLOT(rs[1].id)));
    await tap(host, host.locator(SLOT(rs[2].id)));
    await expect(host.locator('#me .cbslot.sel')).toHaveCount(2);
    n = await lastN(host);
    held = await grab(host, host.locator('#center [data-drag=hold]'), host.locator(SLOT(rs[2].id)));
    await expect(host.locator(GHOST_LABEL)).toHaveText(/^2 eintauschen/);
    await held.release();
    await expect
      .poll(async () => ((await ownLog(host, n, 'cbswap', me))?.ids as number[] | undefined)?.slice().sort())
      .toEqual([rs[1].id, rs[2].id].sort());
    await dragIdle(host);

    // Gezogene Karte (ohne Fähigkeit) auf die Ablage: Ablegen
    await setCb(
      host,
      'me',
      `st.cb.deck.push('H5'); st.cb.deck = st.cb.deck.filter((c, i, a) => c !== 'H5' || i === a.length - 1)`,
    );
    await drag(host, host.locator(DECK).last(), host.locator(HOLD_DROP));
    await expect.poll(async () => (await mustView(host)).cb?.hold?.c).toBe('H5');
    await dragIdle(host);
    n = await lastN(host);
    held = await grab(host, host.locator('#center [data-drag=hold]'), host.locator(PILE_DROP));
    await expect(host.locator(GHOST_LABEL)).toHaveText('Ablegen');
    await held.release();
    await expect.poll(async () => (await logSince(host, n)).some((e) => e.k === 'cbdiscard' && e.p === me)).toBe(true);

    // Ablage direkt auf einen eigenen Platz: nehmen und tauschen in einem Zug
    await setCb(host, 'me');
    const r2 = await myRow(host);
    const top = (await mustView(host)).cb!.pile.at(-1);
    n = await lastN(host);
    held = await grab(host, host.locator(PILE_DROP), host.locator(SLOT(r2[2].id)));
    await expect(host.locator(GHOST_LABEL)).toHaveText('Nehmen und tauschen');
    await held.release();
    await expect.poll(async () => (await logSince(host, n)).map((e) => e.k)).toEqual(['cbdraw', 'cbswap']);
    expect((await myRow(host)).find((s) => s.id === r2[2].id)).toMatchObject({ c: top, up: true });
    await dragIdle(host);

    // Schnappen außer der Reihe: richtig fliegt die Karte raus, nur die Ablage leuchtet und fängt nur unter dem Finger
    await setCb(
      host,
      'other',
      // Zwei gleiche aus dem Stapel (ohne Könige, rot und schwarz zählen anders): eine oben auf die Ablage, eine auf
      // meinen ersten Platz
      'const D = st.cb.deck; const rk = (c) => c.split(":")[0].slice(1);' +
        ' const a = D.find((c) => rk(c) !== "K" && D.some((d) => d !== c && rk(d) === rk(c)));' +
        ' const b = D.find((d) => d !== a && rk(d) === rk(a)); st.cb.deck = D.filter((c) => c !== a && c !== b);' +
        ' const r = st.cb.P[me]; st.cb.deck.push(r[0].c); r[0].c = a; delete r[0].up; st.cb.pile.push(b);',
    );
    const r3 = await myRow(host);
    n = await lastN(host);
    held = await grab(host, host.locator(SLOT(r3[0].id)), host.locator(PILE_DROP));
    await expect(host.locator(GHOST_LABEL)).toHaveText('⚡ Schnappen');
    await expect(host.locator(DROP_OK)).toHaveCount(1);
    await held.release();
    await expect.poll(async () => (await ownLog(host, n, 'cbsnap', me))?.ok).toBe(true);
    expect(await myRow(host)).toHaveLength(r3.length - 1);
    await dragIdle(host);
    // Falsch geschnappt: offen plus Strafkarte
    const r4 = await myRow(host);
    const topNow = (await mustView(host)).cb!.pile.at(-1)!;
    const wrong = await host.evaluate(
      ({ me, t }) => {
        const C = window.__schnautz!.H.st!.cb!;
        const val = (c: string) => c.replace(/:2$/, '').slice(1);
        return C.P[me].find((s) => val(s.c) !== val(t))?.id ?? -1;
      },
      { me, t: topNow },
    );
    n = await lastN(host);
    await drag(host, host.locator(SLOT(wrong)), host.locator(PILE_DROP));
    await expect.poll(async () => (await ownLog(host, n, 'cbsnap', me))?.ok).toBe(false);
    expect(await myRow(host)).toHaveLength(r4.length + 1);
    await dragIdle(host);

    // Loslassen neben jedem Ziel: nichts geht raus, die Karte fliegt zurück
    n = await lastN(host);
    const r5 = await myRow(host);
    await drag(host, host.locator(SLOT(r5[0].id)), { x: 20, y: 300 });
    await dragIdle(host);
    expect(await logSince(host, n)).toEqual([]);

    // Schalter aus: kein Geist, Tippen geht wie vorher
    await setDragPref(host, false);
    await setCb(host, 'me');
    await dragReady(host, false);
    await drag(host, host.locator(DECK).last(), host.locator(HOLD_DROP));
    await expect(host.locator(GHOST)).toHaveCount(0);
    expect((await mustView(host)).cb?.hold).toBeNull();
    await tap(host, host.locator('#center .cbdeck[data-act=cbdeck]'));
    await expect.poll(async () => (await mustView(host)).cb?.hold?.by).toBe(me);
    expect(errors.list).toEqual([]);
  },
);

test('Cabo ziehen: Geist dreht sich nach der Einblendung auf den Rücken', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await phone(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host, false);
  await host.click('[data-act=addbot]');
  await expect.poll(() => playerCount(host)).toBe(2);
  await startGame(host);
  await waitForPhase(host, ['peek'], 20_000);
  // Ich darf mir eine eigene Karte ansehen, danach ist die andere Person dran und Schnappen geht
  await setCb(host, 'me', `st.cb.power = { by: me, kind: 'peek', c: 'H7' }; st.cb.pile.push('H7')`);
  await dragReady(host);
  const id = (await myRow(host))[3].id;
  await host.locator(SLOT(id)).click();
  await expect(host.locator(`${SLOT(id)}.seen`)).toHaveCount(1);
  const held = await grab(host, host.locator(SLOT(id)), { x: 200, y: 420 });
  await expect(host.locator(`${GHOST} .card:not(.back)`)).toHaveCount(1);
  // Länger festhalten zeigt die Karte nicht länger
  await expect(host.locator(`${GHOST} .card.back`)).toHaveCount(1, { timeout: 5000 });
  await expect(host.locator(`${SLOT(id)}.seen`)).toHaveCount(0);
  await held.release();
  await dragIdle(host);
  expect(errors.list).toEqual([]);
});

test('Cabo ziehen: Blindtausch ins Karussell, Halten am Rand dreht weiter, Wischen geht weiter', async ({
  browser,
}) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await chooseCabo(host, false);
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
  await setCb(host, 'me', `st.cb.power = { by: me, kind: 'swap', c: 'HB' }; st.cb.pile.push('HB')`);
  await expect(host.locator('#opps.car')).toHaveCount(1);
  await dragReady(host);
  const pidAt = (s: number) => host.locator(`#opps .opp[data-slot="${s}"]`).getAttribute('data-pid');
  const mid0 = await pidAt(0);
  const id = (await myRow(host))[0].id;
  const box = (await host.locator('#opps').boundingBox())!;
  // Halten im rechten Drittel: das Karussell dreht um einen Platz
  const held = await grab(host, host.locator(SLOT(id)), { x: box.x + box.width - 30, y: box.y + box.height / 2 });
  await expect.poll(() => pidAt(0), { timeout: 3000 }).not.toBe(mid0);
  const target = await pidAt(0);
  await host.waitForTimeout(500);
  await held.move(host.locator(`#opps .opp[data-pid="${target}"] .cbslot`).first());
  await expect(host.locator(GHOST_LABEL)).toContainText('🔀 mit');
  const n = await lastN(host);
  await held.release();
  await expect.poll(async () => (await ownLog(host, n, 'cbblind', me))?.to).toBe(target);
  await dragIdle(host);
  // Wischen im Karussell bleibt unberührt
  const t0 = await host
    .locator('#opps .opp')
    .first()
    .evaluate((b) => b.style.transform);
  await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await host.mouse.down();
  await host.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 8 });
  const t1 = await host
    .locator('#opps .opp')
    .first()
    .evaluate((b) => b.style.transform);
  await host.mouse.up();
  expect(t1).not.toBe(t0);
  await expect(host.locator(GHOST)).toHaveCount(0);
  expect(errors.list).toEqual([]);
});
