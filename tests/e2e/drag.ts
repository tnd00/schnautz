/*
 * Gemeinsame E2E-Hilfen fürs Ziehen (Plan 2.8 Runde 5, ziehen.md 7). In Chromium mit Touch (phone() aus helpers.ts)
 * zieht ein echter Finger über CDP Input.dispatchTouchEvent, damit touch-action und Pointer Events wirklich mitspielen,
 * am Desktop die Maus. `drag` wählt selbst, `mouseDrag` erzwingt die Maus.
 *
 * WebKit-Projekt (nur mit PW_WEBKIT=1, playwright.config.ts, devices['iPhone 13']): Es läuft nur Dateien mit „drag“
 * im Namen und Tests mit dem Tag @drag. Playwright liefert dort auf dem Mac Mauskoordinaten falsch (auch auf leerer
 * Seite, mousedown bei -772, 1260 statt 396, 148) und kann keine Touch-Bewegung. Deshalb gehen in WebKit Tipps über
 * Locator.tap und Ziehen über synthetische Zeigerereignisse (dispatchEvent am Element unter dem Punkt). Das prüft
 * Motor, Adapter, Layout und Stil in WebKit, nicht die echte Eingabe samt touch-action (bleibt für Hand am Gerät).
 * Gastgeber und Start laufen über `dragTable` ohne Mausklick. Markieren:
 *   test('Cabo: Schnappen per Ziehen', { tag: DRAG_TAG }, async ({ browser }) => { … });
 * Solche Tests laufen dann in Chromium und WebKit, sie brauchen nur eine Seite (Gastgeber mit KIs,
 * `browser.newContext()` nimmt das Gerät des Projekts). Einzeln: `PW_WEBKIT=1 npx playwright test --project=webkit`.
 *
 * Muster „Tippen direkt nach einem Zug“ (verlorene Tipps nach einem Wisch, ziehen.md 2):
 *   await drag(page, card, target);
 *   await tapAfterDrag(page, otherCard);
 *   await expect(otherCard).toHaveClass(/\bsel\b/);
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { GameKind } from '../../src/game/types';
import { hostTable, playerCount, START, startGame } from './helpers';

/** Tag für Tests, die auch im WebKit-Projekt laufen */
export const DRAG_TAG = '@drag';
/** So lange verschluckt der Motor nach einem Ziehen Zeiger-Klicks am Tisch (GUARD_MS in src/ui/table/drag-motor.ts) */
export const GUARD_MS = 400;
/** Geist, Etikett und Zielzustände, wie der Motor sie setzt */
export const GHOST = '#fly .tb-ghost';
export const GHOST_LABEL = '#fly .tb-ghost-lbl';
export const DROP_OK = '#table .tb-drop-ok';
export const DROP_HOT = '#table .tb-drop-hot';
export const DROP_NO = '#table .tb-drop-no';

export interface Point {
  x: number;
  y: number;
}

export interface DragOpts {
  /** Zwischenschritte der Bewegung, Standard 12 */
  steps?: number;
  /** Stelle in der Zielbox als Anteil, Standard Mitte { x: 0.5, y: 0.5 } */
  at?: Point;
  /** So lange ruhig über dem Ziel halten, bevor losgelassen wird (Cabo: Karussell dreht nach 600 ms am Rand) */
  hold?: number;
}

/** Ein angehobener Zeiger, noch nicht losgelassen: Etikett, Ringe oder fitFindings mitten im Zug prüfen */
export interface Held {
  move(to: Locator | Point, o?: DragOpts): Promise<void>;
  release(): Promise<void>;
}

/** Finger über CDP, Maus oder in WebKit synthetische Zeigerereignisse */
type Kind = 'touch' | 'mouse' | 'synth';

export const isWebKit = (page: Page): boolean => page.context().browser()?.browserType().name() === 'webkit';

/** WebKit immer synthetisch, sonst Finger nur in Chromium mit Touch-Kontext oder Maus */
async function kindOf(page: Page, want?: 'touch' | 'mouse'): Promise<Kind> {
  if (isWebKit(page)) return 'synth';
  if (want) return want;
  return (await page.evaluate(() => navigator.maxTouchPoints > 0)) ? 'touch' : 'mouse';
}

async function pointOf(t: Locator | Point, at: Point = { x: 0.5, y: 0.5 }): Promise<Point> {
  if (!('boundingBox' in t)) return t;
  const b = await t.boundingBox();
  if (!b) throw new Error('Quelle oder Ziel nicht sichtbar');
  return { x: b.x + b.width * at.x, y: b.y + b.height * at.y };
}

/** Hebt die Quelle an und fährt aufs Ziel, ohne loszulassen */
export async function grab(
  page: Page,
  from: Locator | Point,
  to: Locator | Point,
  o: DragOpts & { kind?: 'touch' | 'mouse' } = {},
): Promise<Held> {
  const kind = await kindOf(page, o.kind);
  let p = await pointOf(from);
  const steps = (o.steps ?? 12) || 1;
  if (kind === 'synth') {
    const send = (type: string, q: Point) =>
      page.evaluate(
        ({ type, q }) => {
          const el = document.elementFromPoint(q.x, q.y) ?? document.body;
          const ev = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true };
          el.dispatchEvent(
            new PointerEvent(type, { ...ev, button: type === 'pointermove' ? -1 : 0, clientX: q.x, clientY: q.y }),
          );
        },
        { type, q },
      );
    await send('pointerdown', p);
    const held: Held = {
      async move(t, mo = {}) {
        const q = await pointOf(t, mo.at);
        const n = (mo.steps ?? steps) || 1;
        for (let i = 1; i <= n; i++) {
          await send('pointermove', { x: p.x + ((q.x - p.x) * i) / n, y: p.y + ((q.y - p.y) * i) / n });
          await page.waitForTimeout(16);
        }
        p = q;
      },
      release: () => send('pointerup', p),
    };
    await held.move(to, o);
    return held;
  }
  if (kind === 'mouse') {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const held: Held = {
      async move(t, mo = {}) {
        const q = await pointOf(t, mo.at);
        await page.mouse.move(q.x, q.y, { steps: (mo.steps ?? steps) || 1 });
        p = q;
      },
      release: () => page.mouse.up(),
    };
    await held.move(to, o);
    return held;
  }
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', q?: Point) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q.x, y: q.y, id: 1 }] : [] });
  await touch('touchStart', p);
  const held: Held = {
    async move(t, mo = {}) {
      const q = await pointOf(t, mo.at);
      const n = (mo.steps ?? steps) || 1;
      for (let i = 1; i <= n; i++) {
        await touch('touchMove', { x: p.x + ((q.x - p.x) * i) / n, y: p.y + ((q.y - p.y) * i) / n });
        // Ein Frame pro Schritt, damit der Motor wie am Handy pro Frame misst
        await page.waitForTimeout(16);
      }
      p = q;
    },
    async release() {
      try {
        await touch('touchEnd');
      } finally {
        await cdp.detach().catch(() => undefined);
      }
    },
  };
  await held.move(to, o);
  return held;
}

/** Ziehen und loslassen, Finger, Maus oder synthetisch je nach Browser und Kontext */
export async function drag(
  page: Page,
  from: Locator | Point,
  to: Locator | Point,
  o: DragOpts & { kind?: 'touch' | 'mouse' } = {},
): Promise<void> {
  const h = await grab(page, from, to, o);
  if (o.hold) await page.waitForTimeout(o.hold);
  await h.release();
}

/** Ziehen mit der Maus, in WebKit synthetisch */
export const mouseDrag = (page: Page, from: Locator | Point, to: Locator | Point, o: DragOpts = {}): Promise<void> =>
  drag(page, from, to, { ...o, kind: 'mouse' });

/**
 * Ein Tipp mit demselben Zeiger wie beim Ziehen: Finger über CDP, Mausklick oder in WebKit Locator.tap. `at` ist die
 * Stelle ab der linken oberen Ecke wie `position` bei Playwright, sonst die Mitte.
 */
export async function tap(page: Page, target: Locator, at?: Point): Promise<void> {
  const kind = await kindOf(page);
  // Ausgegraute Karten tragen aria-disabled, Playwright hielte sie für gesperrt, antippen nennt aber ihren Grund
  if (kind === 'synth') return target.tap({ force: true, ...(at ? { position: at } : {}) });
  const b = await target.boundingBox();
  if (!b) throw new Error('Ziel nicht sichtbar');
  const p = at ? { x: b.x + at.x, y: b.y + at.y } : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (kind === 'mouse') return page.mouse.click(p.x, p.y);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

/**
 * „Tippen direkt nach einem Zug“: Am Tisch wartet es den Klick-Wächter ab, außerhalb (Menü, Verlauf am PC) tippt es
 * sofort, denn dort schluckt der Wächter nichts.
 */
export async function tapAfterDrag(page: Page, target: Locator): Promise<void> {
  if (await target.evaluate((el) => !!el.closest('#table'))) await page.waitForTimeout(GUARD_MS + 50);
  await tap(page, target);
}

/** Der Motor ist geladen und Ziehen für das Spiel an (html.tb-drag), erst dann zieht ein Test */
export async function dragReady(page: Page, on = true): Promise<void> {
  const html = expect(page.locator('html'));
  await (on ? html : html.not).toHaveClass(/\btb-drag\b/, { timeout: 15_000 });
}

/**
 * Zug durch: kein Geist mehr in #fly, keine Sperre nach dem Zug und keine Karte mehr im Flug (eine fliegende Karte ist
 * bis zur Landung unsichtbar und nicht greifbar)
 */
export async function dragIdle(page: Page): Promise<void> {
  await expect(page.locator(GHOST)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.__schnautz?.App.busy)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__schnautz?.App.flying ?? 0)).toBe(0);
}

export interface TableOpts {
  /** So viele KIs kommen dazu */
  bots: number;
  /** KIs stehen (BOTS.hold), der Test zieht für sie */
  hold?: boolean;
  /** Flotte KIs (BOTS.quick) */
  quick?: boolean;
  /** Weitere Regeln, Uhr und Auffüllen sind immer aus */
  rules?: Record<string, unknown>;
}

/**
 * Gastgeber „Tahna“ mit KIs am Tisch von `game`, ohne Uhr und Auffüllen, Partie gestartet. Einstellungen und KIs
 * direkt über die Spiellogik des Gastgebers. In Chromium wie hostTable und startGame, in WebKit nur mit Tippen.
 */
export async function dragTable(page: Page, game: GameKind, o: TableOpts): Promise<void> {
  const wk = isWebKit(page);
  if (wk) {
    await page.goto(START);
    if (await page.locator('.playbtn').isVisible()) await page.tap('.playbtn');
    await page.fill('#name', 'Tahna');
    await page.tap('#btn-host');
    await expect(page.locator('#scr-lobby')).toBeVisible();
  } else await hostTable(page, 'Tahna');
  await page.evaluate(
    ({ game, o }) => {
      const s = window.__schnautz;
      const st = s?.H.st;
      if (!s || !st) throw new Error('kein Gastgeber');
      if (o.hold) s.BOTS.hold = true;
      if (o.quick) s.BOTS.quick = true;
      const acts = [
        { type: 'game', game },
        { type: 'rules', rules: { turnSecs: 0, fill: false, ...o.rules } },
        ...Array.from({ length: o.bots }, () => ({ type: 'addbot' })),
      ];
      for (const a of acts) {
        const e = s.act(st, s.App.me, a as Parameters<typeof s.act>[2]);
        if (e) throw new Error(JSON.stringify(e));
      }
      s.hostCommit();
    },
    { game, o },
  );
  await expect.poll(() => playerCount(page)).toBe(o.bots + 1);
  if (!wk) return startGame(page);
  if (await page.locator('#lobby-tabs').isVisible()) await page.tap('[data-act=ltab][data-t=table]');
  const next = page.locator('[data-act=lnext]');
  if (await next.isVisible()) await next.tap();
  await page.tap('[data-act=start]');
}

/**
 * Schalter „Karten ziehen“ wie in „Bedienung“ setzen (prefs.drag in localStorage). Der Motor liest ihn bei jedem
 * Anheben, html.tb-drag folgt beim nächsten Zeichnen. Für den Test des Schalters selbst den Bogen benutzen.
 */
export async function setDragPref(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v) => {
    const k = 'schnautz:prefs';
    let p: Record<string, unknown> = {};
    try {
      p = (JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, unknown>) ?? {};
    } catch {
      // kaputter Eintrag, dann frisch
    }
    localStorage.setItem(k, JSON.stringify({ ...p, drag: v }));
  }, on);
}
