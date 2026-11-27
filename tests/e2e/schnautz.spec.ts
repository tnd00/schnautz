/*
 * Schnautz mit zwei echten Browsern: Lobby, zweiter Tab, Regeln, Chat, Runden über die Oberfläche,
 * Neuladen von Gast und Host, Verlassen und Wiederkommen.
 */
import { expect, test, type Page } from '@playwright/test';
import { handValue } from '../../src/game/schnautz';
import type { Card, View } from '../../src/game/types';
import { axeCheck } from './axe';
import {
  DRAG_TAG,
  dragIdle,
  dragReady,
  dragTable,
  DROP_HOT,
  DROP_NO,
  GHOST,
  GHOST_LABEL,
  grab,
  GUARD_MS,
  setDragPref,
  tap,
  tapAfterDrag,
} from './drag';
import {
  closeAll,
  desktop,
  Errors,
  fitFindings,
  hostTable,
  joinTable,
  menuConfirm,
  mustView,
  myId,
  phone,
  playerCount,
  START,
  startGame,
  view,
  waitForChange,
  waitForPhase,
  withSettings,
} from './helpers';

test.afterEach(closeAll);

type Prefer = 'swap' | 'pass' | 'knock';

/** Genau ein Zug über die Oberfläche, ausgeführt von der Person, die dran ist. */
async function step(host: Page, byId: Map<string, Page>, prefer: Prefer): Promise<void> {
  const v = await mustView(host);
  if (v.phase === 'choose') {
    const p = byId.get(v.players[v.dealer].id);
    if (!p) throw new Error('Geber unbekannt');
    await p.click('[data-act=keep]');
  } else if (v.phase === 'play') {
    const p = byId.get(v.players[v.turn].id);
    if (!p) throw new Error('Spieler unbekannt');
    const pv = await mustView(p);
    const active = pv.players.filter((x) => !x.out).length;
    const canKnock = !pv.knocker && pv.turns >= active;
    if (prefer === 'knock' && canKnock) await p.click('[data-act=knock]');
    else if (prefer === 'pass') await p.click('[data-act=pass]');
    else {
      await p.click('#me .hand .card >> nth=0');
      await p.click('#center .middle .card >> nth=1');
      await p.click('[data-act=swap]');
    }
  } else return;
  await waitForChange(host, v.n);
}

const handCard = (p: Page, i: number) => p.locator(`#me [data-act=hand][data-i="${i}"]`);
const midCard = (p: Page, i: number) => p.locator(`#center [data-act=mid][data-i="${i}"]`);

/**
 * Erster Tausch, der die Runde nicht sofort beendet (31 oder Feuer), damit die Partie für die nächsten Schritte
 * weiterläuft. Dazu das Etikett, das der Geist dafür zeigen muss (Wert nach dem Tausch wie die Pille).
 */
function calmSwap(v: View): { h: number; m: number; label: string; give: Card; take: Card } {
  const hand = v.hands[v.me];
  if (!Array.isArray(hand)) throw new Error('keine eigene Hand');
  for (let h = 0; h < 3; h++)
    for (let m = 0; m < 3; m++) {
      const nh = hand.slice();
      nh[h] = v.middle[m];
      const hv = handValue(nh, v.rules);
      if (hv.v < 31)
        return { h, m, label: `Tauschen → ${String(hv.v).replace('.', ',')}`, give: hand[h], take: v.middle[m] };
    }
  throw new Error('jeder Tausch beendet die Runde');
}

/** Hat `me` nach Logeintrag n0 genau diesen Tausch gemacht? */
async function swappedSince(page: Page, me: string, n0: number, s: { give: Card; take: Card }): Promise<boolean> {
  const v = await mustView(page);
  return v.log.some((e) => e.n > n0 && e.k === 'swap' && e.p === me && e.give === s.give && e.take === s.take);
}

/** Regeln, die axe hier auslässt. Leer: Es gilt WCAG 2.2 AA vollständig. */
const AXE_OFF: string[] = [];

/** Vor axe: alle endlichen Animationen durch, Einblenden täuscht sonst schwachen Kontrast vor. */
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

/** Beide bestätigen das Rundenergebnis. */
async function bothReady(host: Page, guest: Page, next = ['choose', 'play', 'over']): Promise<void> {
  await host.click('#overlay [data-act=ready]');
  await guest.click('#overlay [data-act=ready]');
  await waitForPhase(host, next);
}

test('zwei Browser spielen Schnautz', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  const guestCtx = await phone(browser);
  const guest = errors.watch(await guestCtx.newPage(), 'gast');

  const code = await hostTable(host, 'Tahna');
  await joinTable(guest, code, 'Lena');
  await expect.poll(() => playerCount(host)).toBe(2);

  await test.step('zweiter Tab im selben Browser mit gleichem Namen übernimmt den eigenen Platz', async () => {
    const lena = await myId(guest);
    const tab = errors.watch(await guestCtx.newPage(), 'gast2');
    await joinTable(tab, code, 'Lena');
    expect(await myId(tab)).toBe(lena);
    await expect(guest.locator('#start-err')).toContainText('anderen Tab');
    expect(await playerCount(host)).toBe(2);
    // Ein anderer Name im selben Browser bleibt ein eigener Platz
    const tom = errors.watch(await guestCtx.newPage(), 'gast3');
    await joinTable(tom, code, 'Tom');
    await expect.poll(() => playerCount(host)).toBe(3);
    await menuConfirm(tom, '#menu-leave');
    await expect.poll(() => playerCount(host)).toBe(2);
    await tom.close();
    // Der erste Tab holt sich den Platz mit seinen eigenen IDs zurück
    await tab.close();
    await guest.click('#btn-join');
    await expect(guest.locator('#scr-lobby')).toBeVisible();
    expect(await myId(guest)).toBe(lena);
    expect(await playerCount(host)).toBe(2);
  });

  await test.step('Regeln des Hosts kommen beim Gast an', async () => {
    await withSettings(host, 'schnautz', async (sheet) => {
      await sheet.locator('[data-act=lives][data-d="1"]').click();
      await expect.poll(async () => (await view(guest))?.rules.lives).toBe(4);
      await sheet.locator('[data-act=lives][data-d="-1"]').click();
      await sheet.locator('[data-act=lives][data-d="-1"]').click();
      await expect.poll(async () => (await view(guest))?.rules.lives).toBe(2);
    });
  });

  await startGame(host);
  await expect(guest.locator('#scr-game')).toBeVisible();
  const ids = [await myId(host), await myId(guest)];
  const byId = new Map([
    [ids[0], host],
    [ids[1], guest],
  ]);

  await test.step('zu früh geklopft: Klopfen ist ausgegraut, bleibt antippbar und nennt den Grund am Tisch', async () => {
    // Bis zum ersten eigenen Zug dieser Runde, dann klopfen beide zu früh, erst wer dran ist, nach einem Tausch der andere
    for (let i = 0; i < 4 && (await mustView(host)).phase !== 'play'; i++) await step(host, byId, 'swap');
    for (let k = 0; k < 2; k++) {
      const v = await mustView(host);
      if (v.phase !== 'play' || v.knocker || v.turns >= v.players.filter((x) => !x.out).length) break;
      const p = byId.get(v.players[v.turn].id);
      if (!p) throw new Error('Spieler unbekannt');
      if (k === 0) {
        // Wer nicht dran ist und eine Karte antippt, erfährt warum, statt dass nichts passiert
        const other = byId.get(ids.find((id) => id !== v.players[v.turn].id) ?? '');
        if (!other) throw new Error('Spieler unbekannt');
        // Seit 2.8 tragen die Karten dann aria-disabled mit Grund, force wie beim Klopfen unten
        await expect(other.locator('#me [data-act=hand][data-i="0"]')).toHaveAttribute('aria-disabled', 'true');
        await other.click('#me [data-act=hand][data-i="0"]', { force: true });
        await expect(other.locator('#fly .nopelbl')).toHaveText('Du bist gerade nicht dran.');
        // Tauschen ohne Auswahl ist ausgegraut und nennt beim Tipp den Grund
        const swap = p.locator('#me [data-act=swap]');
        await expect(swap).toHaveAttribute('aria-disabled', 'true');
        await swap.click({ force: true });
        await expect(p.locator('#fly .nopelbl')).toHaveText('Wähle zuerst eine Karte.');
        expect((await mustView(host)).turn).toBe(v.turn);
      }
      const knock = p.locator('#me [data-act=knock]');
      await expect(knock).toHaveAttribute('aria-disabled', 'true');
      // force: Playwright hält aria-disabled für nicht klickbar, ein Mensch kann trotzdem tippen
      await knock.click({ force: true });
      await expect(p.locator('#fly .nopelbl')).toHaveText('Klopfen geht erst, wenn jeder einmal dran war.');
      // Abgelehnt heißt: nichts geändert, dieselbe Person ist noch dran
      expect((await mustView(host)).turn).toBe(v.turn);
      await step(host, byId, 'swap');
    }
  });

  // Chat vor axe: Beim Gast steht dann die Zahl ungelesener Nachrichten am Knopf #logfab
  await test.step('Chat', async () => {
    await host.fill('#chatin', 'Hallo nach Prag!');
    await host.press('#chatin', 'Enter');
    await expect.poll(async () => (await view(guest))?.log.some((e) => e.k === 'chat')).toBe(true);
  });

  await test.step('axe am Tisch: eigener Zug und Warten, am PC und am Handy', async () => {
    // Zwei Lagen: Wer eben dran war, wartet danach, so sieht axe beide Seiten je einmal dran und einmal wartend
    for (let round = 0; round < 2; round++) {
      const v = await mustView(host);
      expect(v.phase).toBe('play');
      for (const [k, p] of [host, guest].entries()) {
        await expect.poll(async () => (await mustView(p)).turn).toBe(v.turn);
        await settle(p);
        const where = `Schnautz ${v.players[v.turn].id === ids[k] ? 'eigener Zug' : 'Warten'} ${k ? '390x844' : '1280x860'}`;
        await axeCheck(p, { include: '#scr-game', exclude: '#fly', disable: AXE_OFF, where });
      }
      if (round) break;
      // Schieben wechselt den Zug wie ein Tausch, kann die Runde aber nicht per 31 beenden
      await step(host, byId, 'pass');
      await expect.poll(async () => (await mustView(host)).turn).not.toBe(v.turn);
    }
  });

  // Nach axe, sonst wird der Verlauf am PC zur scrollbaren Fläche
  await test.step('Tauschen per Ziehen: Finger am Handy, Maus am PC, Tippen und Enter gehen weiter', async () => {
    await dragReady(host);
    await dragReady(guest);
    for (let k = 0; k < 2; k++) {
      const v = await mustView(host);
      expect(v.phase).toBe('play');
      const id = v.players[v.turn].id;
      const p = byId.get(id);
      if (!p) throw new Error('Spieler unbekannt');
      const pv = await mustView(p);
      // Auf die eigene Seite passt nichts: gestrichelt, Grund im Etikett, Loslassen daneben bricht still ab
      const miss = await grab(p, handCard(p, 0), handCard(p, 1));
      await expect(p.locator(GHOST)).toHaveCount(1);
      await expect(p.locator(DROP_NO)).toHaveCount(1);
      await expect(p.locator(GHOST_LABEL)).toHaveText('Da passt das nicht hin.');
      await miss.move({ x: 8, y: 8 });
      await miss.release();
      await dragIdle(p);
      expect((await mustView(host)).n).toBe(v.n);
      // Tippen direkt nach dem Ziehen wird angenommen, Enter auf einer Karte auch, die Vorschau in der Pille bleibt
      await tapAfterDrag(p, handCard(p, 1));
      await expect(handCard(p, 1)).toHaveClass(/\bsel\b/);
      await midCard(p, 0).focus();
      await p.keyboard.press('Enter');
      await expect(midCard(p, 0)).toHaveClass(/\bsel\b/);
      await expect(p.locator('#me .pill.pre .to')).toBeVisible();
      // Der Tausch in einer Geste: Handkarte auf Mittelkarte am Handy (Finger), umgekehrt am PC (Maus)
      const s = calmSwap(pv);
      const fromHand = p === guest;
      const held = await grab(
        p,
        fromHand ? handCard(p, s.h) : midCard(p, s.m),
        fromHand ? midCard(p, s.m) : handCard(p, s.h),
      );
      await expect(p.locator(DROP_HOT)).toHaveCount(1);
      await expect(p.locator(GHOST_LABEL)).toHaveText(s.label);
      // Mitten im Zug scrollt nichts und nichts ragt aus dem Bild
      expect(await fitFindings(p, ['#me'])).toEqual([]);
      await held.release();
      await expect.poll(() => swappedSince(host, id, v.n, s)).toBe(true);
      await dragIdle(p);
    }
  });

  await test.step('Schalter „Karten ziehen“ aus: kein Geist, Tippen tauscht wie vorher', async () => {
    // Der Klick-Wächter des Motors schluckt Zeiger-Klicks kurz nach dem letzten Ziehen, auch am Menü
    await guest.waitForTimeout(GUARD_MS + 50);
    await guest.click('#btn-menu');
    await guest.click('#menu-prefs');
    const sw = guest.locator('#modal [data-pref=drag]');
    await expect(sw).toBeChecked();
    await sw.uncheck();
    await guest.click('#modal [data-act=closemodal]');
    // Ist der Gast nicht dran, tauscht der Gastgeber einmal mit Tippen
    const v0 = await mustView(host);
    if (v0.players[v0.turn].id !== ids[1]) {
      const s = calmSwap(v0);
      await host.click(`#me [data-act=hand][data-i="${s.h}"]`);
      await host.click(`#center [data-act=mid][data-i="${s.m}"]`);
      await host.click('[data-act=swap]');
      await waitForChange(host, v0.n);
    }
    await expect.poll(async () => (await mustView(guest)).turn).toBe((await mustView(host)).turn);
    // Zweimal tippen zeichnet neu, danach sind Griff-Zeiger und touch-action weg
    await tap(guest, handCard(guest, 0));
    await expect(handCard(guest, 0)).toHaveClass(/\bsel\b/);
    await tap(guest, handCard(guest, 0));
    await expect(handCard(guest, 0)).not.toHaveClass(/\bsel\b/);
    await dragReady(guest, false);
    const v = await mustView(host);
    expect(v.players[v.turn].id).toBe(ids[1]);
    const held = await grab(guest, handCard(guest, 0), midCard(guest, 1));
    await expect(guest.locator(GHOST)).toHaveCount(0);
    await held.release();
    await guest.waitForTimeout(300);
    expect((await mustView(host)).n).toBe(v.n);
    await expect(guest.locator('#me .hand .sel')).toHaveCount(0);
    const s = calmSwap(await mustView(guest));
    await tap(guest, handCard(guest, s.h));
    await tap(guest, midCard(guest, s.m));
    await guest.click('[data-act=swap]');
    await expect.poll(() => swappedSince(host, ids[1], v.n, s)).toBe(true);
    await setDragPref(guest, true);
  });

  await test.step('eine Runde bis zum Ergebnis', async () => {
    for (let i = 0; i < 40; i++) {
      const v = await mustView(host);
      if (v.phase === 'end' || v.phase === 'over') break;
      await step(host, byId, v.turns >= 3 ? 'knock' : i % 3 === 2 ? 'pass' : 'swap');
    }
    await waitForPhase(host, ['end', 'over']);
    for (const [k, p] of [host, guest].entries()) {
      await expect(p.locator('#overlay .paper')).toBeVisible({ timeout: 30_000 });
      await settle(p);
      const where = `Schnautz Ergebnisblatt ${k ? '390x844' : '1280x860'}`;
      await axeCheck(p, { include: '#overlay', disable: AXE_OFF, where });
    }
  });

  await test.step('Gast lädt neu und sitzt ohne Tippen wieder auf seinem Platz', async () => {
    await guest.reload();
    await expect(guest.locator('#scr-game')).toBeVisible();
    expect(await myId(guest)).toBe(ids[1]);
  });

  await test.step('Host lädt neu und ist ohne Tippen wieder am Tisch', async () => {
    await host.reload();
    await expect(host.locator('#scr-game')).toBeVisible();
    await expect.poll(async () => (await view(host))?.players.every((p) => p.online), { timeout: 40_000 }).toBe(true);
  });

  await test.step('bis zum Partieende spielen', async () => {
    for (let i = 0; i < 300; i++) {
      const v = await mustView(host);
      if (v.phase === 'over') break;
      if (v.phase === 'end') await bothReady(host, guest);
      else await step(host, byId, v.turns >= 2 ? 'knock' : 'swap');
    }
    expect((await mustView(host)).phase).toBe('over');
    expect((await mustView(host)).winner).toBeTruthy();
  });

  await test.step('Tisch ansehen, Regeln und Verlauf', async () => {
    await guest.click('[data-act=peek]');
    await guest.click('[data-act=unpeek]');
    await expect(guest.locator('#overlay .paper')).toBeVisible();
    await host.click('[data-act=peek]');
    await host.click('#btn-rules');
    await expect(host.locator('#modal .paper')).toBeVisible();
    await host.keyboard.press('Escape');
    // Punkt oben: ein Fenster mit Tischcode, Link und Verbindung
    await host.click('#netchip');
    await expect(host.locator('#modal .netinfo .icodev')).toHaveText(code);
    await host.keyboard.press('Escape');
    await host.click('[data-act=unpeek]');
  });

  await test.step('Gast verlässt die laufende Partie, die KI spielt weiter, dann kommt der Gast zurück', async () => {
    await bothReady(host, guest, ['choose', 'play']);
    const seat = await myId(guest);
    const isBot = async () => (await view(host))?.players.find((p) => p.id === seat)?.bot ?? false;
    await menuConfirm(guest, '#menu-leave');
    await expect.poll(isBot).toBe(true);
    expect((await mustView(host)).phase).not.toBe('over');
    // Am Handy liegen Name und Code im Bogen hinter „Tisch aufmachen“
    if (await guest.locator('.playbtn').isVisible()) await guest.click('.playbtn');
    await guest.fill('#name', 'Lena');
    await guest.fill('#joincode', code);
    await guest.click('#btn-join');
    await expect(guest.locator('#scr-game')).toBeVisible();
    await expect.poll(isBot).toBe(false);
    expect(await myId(guest)).toBe(seat);
  });

  await test.step('zurück in die Lobby, dann löst der Host den Tisch auf', async () => {
    if (await host.locator('[data-act=peek]').count()) await host.click('[data-act=peek]');
    await menuConfirm(host, '#menu-lobby');
    await expect(host.locator('#scr-lobby')).toBeVisible();
    await expect(guest.locator('#scr-lobby')).toBeVisible();
    await menuConfirm(host, '#menu-leave');
    await expect(guest.locator('#start-err')).toBeVisible();
    // Nach dem aufgelösten Tisch ist keine Einladung mehr offen, Code-Feld und Tisch aufmachen sind wieder da
    await expect(guest.locator('body')).not.toHaveClass(/invited/);
    await expect(guest.locator('#joincode')).toBeVisible();
  });

  expect(errors.list).toEqual([]);
});

test('Schnautz: Tauschen per Ziehen allein mit KI', { tag: DRAG_TAG }, async ({ browser }) => {
  const errors = new Errors();
  // Chromium nimmt hier den Desktop, WebKit das iPhone 13 des Projekts (playwright.config.ts)
  const page = errors.watch(await (await browser.newContext()).newPage(), 'host');
  await dragTable(page, 'schnautz', { bots: 1, quick: true, rules: { dealerChoice: false } });
  await waitForPhase(page, ['play']);
  await dragReady(page);
  const me = await myId(page);
  await expect
    .poll(async () => (await mustView(page)).players[(await mustView(page)).turn].id, { timeout: 30_000 })
    .toBe(me);
  const v = await mustView(page);
  const s = calmSwap(v);
  const held = await grab(page, handCard(page, s.h), midCard(page, s.m));
  await expect(page.locator(DROP_HOT)).toHaveCount(1);
  await expect(page.locator(GHOST_LABEL)).toHaveText(s.label);
  expect(await fitFindings(page, ['#me'])).toEqual([]);
  await held.release();
  await expect.poll(() => swappedSince(page, me, v.n, s)).toBe(true);
  await dragIdle(page);
  expect(errors.list).toEqual([]);
});

test('Startseite ohne Namen weist freundlich darauf hin', async ({ page }) => {
  await page.goto(START);
  await page.click('#btn-host');
  await expect(page.locator('.toast').first()).toContainText('heißt');
  await expect(page.locator('#scr-start')).toBeVisible();
});
