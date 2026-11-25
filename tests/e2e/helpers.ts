import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { GameKind, View } from '../../src/game/types';

/** Startseite mit lokalem PeerServer und ohne STUN (siehe playwright.config.ts, Port per PEER_PORT). */
export const START = `./?peerhost=127.0.0.1&peerport=${process.env.PEER_PORT ?? 9000}&noice=1`;

/** Sammelt Fehler aus allen Seiten eines Tests, damit der Test am Ende darauf prüfen kann. */
export class Errors {
  readonly list: string[] = [];

  watch(page: Page, label: string): Page {
    page.on('pageerror', (e) => this.list.push(`[${label}] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.list.push(`[${label}] console: ${m.text()}`);
    });
    page.on('dialog', (d) => {
      this.list.push(`[${label}] Dialog: ${d.message()}`);
      void d.dismiss();
    });
    return page;
  }
}

/**
 * Nach jedem Test alle Fenster schließen. Sonst spielen die Partien früherer Tests im selben Browser weiter und
 * bremsen die späteren aus. In jeder Spec-Datei: test.afterEach(closeAll).
 */
export async function closeAll({ browser }: { browser: Browser }): Promise<void> {
  await Promise.all(browser.contexts().map((c) => c.close().catch(() => undefined)));
}

export async function desktop(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 1280, height: 860 } });
}

export async function phone(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
}

/** Die Ansicht, die die Seite gerade anzeigt (Kopie als JSON). */
export async function view(page: Page): Promise<View | null> {
  return page.evaluate(() => {
    const v = window.__schnautz?.App.view;
    return v ? (JSON.parse(JSON.stringify(v)) as View) : null;
  });
}

export async function mustView(page: Page): Promise<View> {
  const v = await view(page);
  if (!v) throw new Error('Keine Ansicht vorhanden');
  return v;
}

export const myId = (page: Page): Promise<string> => page.evaluate(() => window.__schnautz?.App.me ?? '');

/** Läuft gerade eine Shithead-Sequenz? Dann zeigt die Oberfläche noch den alten Stand. */
export const seqBusy = (page: Page): Promise<boolean> => page.evaluate(() => !!window.__schnautz?.SEQ.busy);

/**
 * Testmodus für lange Partien: Die KIs des Gastgebers ziehen in der Vorspul-Taktung (BOTS.quick in src/net/bots.ts),
 * Abläufe und 4er-Sperre bleiben normal. Eine Partie mit echter Taktung behält die Suite trotzdem.
 */
export async function quickBots(host: Page): Promise<void> {
  await host.evaluate(() => {
    if (window.__schnautz) window.__schnautz.BOTS.quick = true;
  });
}

/** Wartet, bis sich der Zustand beim Host geändert hat (Zähler n im Verlauf). */
export async function waitForChange(page: Page, n0: number, timeout = 20_000): Promise<void> {
  await expect.poll(async () => (await view(page))?.n, { timeout }).not.toBe(n0);
}

export async function waitForPhase(page: Page, phases: string[], timeout = 20_000): Promise<void> {
  await expect
    .poll(async () => phases.includes((await view(page))?.phase ?? ''), {
      timeout,
      message: `Phase ${phases.join('/')}`,
    })
    .toBe(true);
}

/** Lobby am Handy: Reiter öffnen. Am PC stehen Tisch sowie Spiel und Regeln nebeneinander, dann passiert nichts. */
export async function lobbyTab(page: Page, tab: 'table' | 'game'): Promise<void> {
  if (await page.locator('#lobby-tabs').isVisible()) await page.click(`[data-act=ltab][data-t=${tab}]`);
}

/** Spiel wählen, am Handy im Reiter Spiel und Regeln. */
export async function chooseGame(page: Page, game: GameKind): Promise<void> {
  await lobbyTab(page, 'game');
  await page.click(`[data-act=game][data-g=${game}]`);
  await expect.poll(async () => (await view(page))?.game).toBe(game);
}

/**
 * Regeln, Leben, Zielpunkte und Zeit stehen im Bogen Einstellungen einer Spielkarte: öffnen, fn darin ausführen,
 * wieder schließen. Beim Gastgeber wählt das Öffnen das Spiel gleich mit.
 */
export async function withSettings(page: Page, game: GameKind, fn: (sheet: Locator) => Promise<void>): Promise<void> {
  await lobbyTab(page, 'game');
  await page.click(`[data-act=gsettings][data-g=${game}]`);
  const sheet = page.locator(`#modal .gset[data-g=${game}]`);
  await expect(sheet).toBeVisible();
  await fn(sheet);
  await sheet.locator('[data-act=closemodal]').click();
  await expect(page.locator('#modal .gset')).toHaveCount(0);
}

/** Partie starten. Am Handy führt im Reiter Tisch erst „Weiter zum Spiel“ zu Spiel und Regeln, dort steht der Start. */
export async function startGame(page: Page): Promise<void> {
  const next = page.locator('[data-act=lnext]');
  if (await next.isVisible()) await next.click();
  await page.click('[data-act=start]');
}

/** Tisch eröffnen und den Code zurückgeben. Danach ist der Reiter Tisch offen und kein Fenster mehr. */
export async function hostTable(page: Page, name: string): Promise<string> {
  await page.goto(START);
  // Am Handy liegen Name und Knöpfe im Bogen hinter „Tisch aufmachen“
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', name);
  await page.click('#btn-host');
  await expect(page.locator('#scr-lobby')).toBeVisible();
  const code = await page.evaluate(() => window.__schnautz?.App.code ?? '');
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  // Ohne Zeitlimit: Die Tests warten manchmal länger, als ein Zug dauern darf
  await withSettings(page, (await mustView(page)).game, async (sheet) => {
    await sheet.locator('[data-range=turnSecs]').evaluate((el: HTMLInputElement) => {
      el.value = '0';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__schnautz?.App.view?.rules.turnSecs)).toBe(0);
  });
  // Ohne Auffüllen beim Start: Die Tests spielen mit genau den Leuten und KIs, die sie selbst an den Tisch holen.
  // Den Ablauf mit Auffüllen prüft tests/e2e/start.spec.ts
  await page.evaluate(() => {
    const s = window.__schnautz;
    if (!s?.H.st) throw new Error('kein Gastgeber');
    const e = s.act(s.H.st, s.App.me, { type: 'rules', rules: { fill: false } });
    if (e) throw new Error(String(e));
    s.hostCommit();
  });
  await expect.poll(() => page.evaluate(() => window.__schnautz?.App.view?.rules.fill)).toBe(false);
  await lobbyTab(page, 'table');
  return code;
}

/** Mit Code über den Einladungslink beitreten. */
export async function joinTable(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`${START}#${code}`);
  await page.fill('#name', name);
  await page.click('#btn-join');
  await expect(page.locator('#scr-lobby, #scr-game').first()).toBeVisible();
}

export async function playerCount(page: Page): Promise<number> {
  return (await view(page))?.players.length ?? 0;
}

/** Menüeintrag wählen und die Rückfrage bestätigen. */
export async function menuConfirm(page: Page, item: '#menu-leave' | '#menu-lobby'): Promise<void> {
  await page.click('#btn-menu');
  await page.click(item);
  await page.click('#cfm-ok');
}

/**
 * Was am Bildschirm nicht passt, als Liste (leer heißt alles gut). Nur das Scrollen der Seite zu prüfen reicht nicht,
 * denn Lobby und Tisch am Handy haben `body { overflow: hidden }`: Zu viel Inhalt wird dort abgeschnitten oder rutscht
 * unter die Startleiste, statt zu scrollen. Geprüft werden deshalb auch
 * - jedes Element aus `keys`, es muss ganz im Bild liegen (fehlt es, ist das ein Befund),
 * - die Lobby-Bereiche, kein Inhalt unter der Startleiste und kein Notbehelf `fscroll`,
 * - am Tisch das tiefste sichtbare Element in `#table`, es endet über dem unteren Rand.
 */
export async function fitFindings(page: Page, keys: string[] = []): Promise<string[]> {
  return page.evaluate((sel) => {
    const H = window.innerHeight;
    const W = window.innerWidth;
    const se = document.scrollingElement ?? document.documentElement;
    const shown = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0;
    const name = (el: Element) =>
      el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
    const out: string[] = [];
    if (se.scrollHeight > H + 2) out.push(`Seite ${se.scrollHeight} > ${H}`);
    if (se.scrollWidth > W + 2) out.push(`quer ${se.scrollWidth} > ${W}`);
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!shown(el)) {
        out.push(`${s} fehlt`);
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.bottom > H + 1 || r.top < -1) out.push(`${s} liegt bei ${Math.round(r.top)} bis ${Math.round(r.bottom)}`);
    }
    document.querySelectorAll<HTMLElement>('#scr-lobby .lpane').forEach((p) => {
      if (!shown(p)) return;
      if (p.classList.contains('fscroll')) out.push(`Lobby ${p.dataset.pane} scrollt im Notbehelf`);
      else if (p.scrollHeight > p.clientHeight + 1)
        out.push(`Lobby ${p.dataset.pane}: ${p.scrollHeight - p.clientHeight} px unter der Startleiste`);
    });
    const table = document.querySelector('#table');
    if (shown(document.querySelector('#scr-game')) && shown(table)) {
      let max = 0;
      let who = '';
      table.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') return;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > max) {
          max = r.bottom;
          who = name(el);
        }
      });
      if (max > H + 1) out.push(`Tisch reicht bis ${Math.round(max)} (${who})`);
    }
    return out;
  }, keys);
}

/**
 * Kurzform für bestehende Tests: passt alles ins Bild? In der Lobby muss die Startleiste ganz zu sehen sein, am Tisch
 * der eigene Platz. Strenger als der alte Einzeiler `scrollHeight <= innerHeight + 2`, der Abgeschnittenes übersah.
 */
export async function noScroll(page: Page): Promise<boolean> {
  const keys = await page.evaluate(() =>
    document.querySelector('#scr-lobby')?.getClientRects().length
      ? ['.lfoot']
      : document.querySelector('#scr-game')?.getClientRects().length
        ? ['#me']
        : [],
  );
  return (await fitFindings(page, keys)).length === 0;
}

/**
 * Ergebnisblatt: Blatt im Bild, eigene Zeile und Verlierer über der angehefteten Fußleiste sichtbar.
 * `strict` verlangt zusätzlich, dass das Blatt in sich gar nicht scrollt.
 */
export async function sheetFindings(page: Page, strict = false): Promise<string[]> {
  return page.evaluate((all) => {
    const p = document.querySelector<HTMLElement>('#overlay .paper.result');
    if (!p) return ['kein Ergebnisblatt'];
    const out: string[] = [];
    const pr = p.getBoundingClientRect();
    const fr = p.querySelector('.rfoot')?.getBoundingClientRect();
    const bottom = fr ? Math.min(pr.bottom, fr.top) : pr.bottom;
    if (pr.bottom > window.innerHeight + 1) out.push(`Blatt endet bei ${Math.round(pr.bottom)}`);
    const me = window.__schnautz?.App.me ?? '';
    const vis = (el: Element | null) => !el || el.getBoundingClientRect().bottom <= bottom + 1;
    if (!vis(p.querySelector(`.row[data-pid="${me}"]`))) out.push('eigene Zeile verdeckt');
    if (!vis(p.querySelector('.row.lose'))) out.push('Verlierer verdeckt');
    if (all && p.scrollHeight > p.clientHeight + 1) out.push(`Blatt scrollt ${p.scrollHeight - p.clientHeight} px`);
    return out;
  }, strict);
}

/** Dev-Menü freischalten (vor dem ersten goto), damit der Zeitraffer erreichbar ist. */
export async function unlockDev(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => localStorage.setItem('schnautz:dev', 'true'));
}

/**
 * Zeitraffer aus dem Dev-Menü (`src/dev/menu.ts`), etwa sh-any, dk-any, cb-win, sz-win, sz-round oder cb-round.
 * Er sucht höchstens 9 Sekunden und meldet sonst „Keine passende Partie gefunden“, deshalb bis zu drei Versuche.
 */
export async function devJump(host: Page, id: string, phases = ['end', 'over']): Promise<void> {
  for (let k = 0; k < 3; k++) {
    await host.click('#btn-menu');
    await host.click('#menu-dev');
    await host.locator(`#modal [data-act=dev][data-dev=${id}]`).click();
    const ok = await expect
      .poll(async () => phases.includes((await view(host))?.phase ?? ''), { timeout: 15_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (ok) return;
  }
  throw new Error(`Zeitraffer ${id} fand keine passende Partie`);
}

/**
 * Tisch auf n Plätze stellen und mit KIs füllen, direkt über act() beim Gastgeber (spart die Klicks). Verlässt sich
 * nicht darauf, dass freie Plätze von selbst eine KI bekommen.
 */
export async function fillWithBots(host: Page, n: number): Promise<void> {
  await host.evaluate((want) => {
    const s = window.__schnautz;
    if (!s?.H.st) throw new Error('kein Gastgeber');
    const st = s.H.st;
    const e = s.act(st, s.App.me, { type: 'rules', rules: { seats: want } });
    if (e) throw new Error(String(e));
    for (let i = 0; i < 20 && st.players.length < want; i++) {
      const err = s.act(st, s.App.me, { type: 'addbot' });
      if (err) throw new Error(String(err));
    }
    s.hostCommit();
  }, n);
  await expect.poll(async () => (await view(host))?.players.length).toBe(n);
}
