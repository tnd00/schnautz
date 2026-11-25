/*
 * Gemeinsame Bausteine für die Mess-Skripte in tests/design. Sie laufen ohne Testrunner gegen einen Dev-Server und
 * einen lokalen PeerServer und messen, ob am Bildschirm etwas scrollt oder abgeschnitten wird. Aufrufe stehen in
 * README.md im selben Ordner.
 *
 * Einstellungen per Argument oder Umgebung (Argument gewinnt):
 *   --app=URL   APP        Seite, sonst http://127.0.0.1:<port>/
 *   --port=N    PORT       Port des Dev-Servers, Standard 5173
 *   --peer=N    PEER_PORT  Port des PeerServers, Standard 9000
 *   --out=DIR   OUT        Ausgabeordner für JSON und Aufnahmen, Standard im Temp-Ordner des Systems
 *   --serve     SERVE=1    Dev-Server und PeerServer selbst starten und am Ende beenden
 *   --reduce    REDUCE=1   „Bewegung reduzieren“ einschalten
 *   --headed    HEADED=1   Browser sichtbar
 *               PW_CHROME  eigenes Chrome statt des Chromiums von Playwright
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Wert eines Arguments `--name=wert`, sonst der Standard. */
export const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
/** Schalter `--name` oder Umgebungsvariable. */
export const flag = (name, env) => process.argv.includes(`--${name}`) || (!!env && !!process.env[env]);

export const PORT = Number(arg('port', process.env.PORT ?? 5173));
export const PEER_PORT = Number(arg('peer', process.env.PEER_PORT ?? 9000));
export const APP = arg('app', process.env.APP ?? `http://127.0.0.1:${PORT}/`);
export const START = `${APP}?peerhost=127.0.0.1&peerport=${PEER_PORT}&noice=1`;
export const OUT = resolve(arg('out', process.env.OUT ?? join(tmpdir(), 'schnautz-design')));
const REDUCE = flag('reduce', 'REDUCE');

if (!relative(REPO, OUT).startsWith('..')) console.warn(`Achtung: Ausgabe ${OUT} liegt im Repo`);

/** Messreihe aus Plan 1.4, dazu die älteren Handygrößen aus der Memory. */
export const SIZES = {
  phone: ['390x844', '390x740', '412x760', '375x780', '375x548', '360x640'],
  phoneAll: ['390x844', '390x740', '390x700', '390x664', '412x760', '375x780', '375x600', '375x548', '360x640'],
  desktop: ['1280x860', '1280x720', '1024x768'],
};

/** `all`, `phone`, `phoneAll`, `desktop` oder eine Liste wie `390x844,1280x720`. */
export function sizeList(s) {
  if (s === 'all') return [...SIZES.phone, ...SIZES.desktop];
  return SIZES[s] ?? s.split(',');
}

export const parseSize = (s) => {
  const [width, height] = s.split('x').map(Number);
  return { width, height };
};
/** Bis 960 px gilt die Handy-Aufteilung am Tisch. */
export const isPhoneSize = (s) => parseSize(s).width <= 960;

/** Härtefall: 16 Zeichen lange Namen */
export const LONG_GUEST = 'Bartholomäus-Kim';

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function poll(fn, { timeout = 20_000, every = 150, what = 'Bedingung' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const r = await fn();
    if (r) return r;
    if (Date.now() - t0 > timeout) throw new Error(`Zeitgrenze: ${what}`);
    await sleep(every);
  }
}

const portOpen = (port) =>
  new Promise((ok) => {
    const s = connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      ok(true);
    });
    s.once('error', () => ok(false));
  });

/**
 * Dev-Server und PeerServer auf den eingestellten Ports starten, wenn `--serve` gesetzt ist. Gibt eine Funktion
 * zurück, die beide wieder beendet. Ohne `--serve` müssen beide schon laufen.
 */
export async function serve() {
  if (!flag('serve', 'SERVE')) return async () => undefined;
  const procs = [
    spawn('node', ['tests/e2e/peer-server.js'], {
      cwd: REPO,
      env: { ...process.env, PEER_PORT: String(PEER_PORT) },
      stdio: 'ignore',
      detached: true,
    }),
    spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: REPO,
      stdio: 'ignore',
      detached: true,
    }),
  ];
  const stop = async () => {
    for (const p of procs) {
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {
        // schon beendet
      }
    }
  };
  try {
    await poll(async () => (await portOpen(PEER_PORT)) && (await portOpen(PORT)), {
      timeout: 30_000,
      every: 250,
      what: `Server auf ${PORT} und ${PEER_PORT}`,
    });
  } catch (e) {
    await stop();
    throw e;
  }
  return stop;
}

export async function launch() {
  return chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    headless: !flag('headed', 'HEADED'),
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'],
  });
}

/** Kontext passend zur Größe: bis 960 px wie ein Handy (Touch, isMobile), sonst wie ein PC. Dev-Menü frei. */
export async function context(browser, size) {
  const phone = isPhoneSize(size);
  const ctx = await browser.newContext({
    viewport: parseSize(size),
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: REDUCE ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(() => localStorage.setItem('schnautz:dev', 'true'));
  return ctx;
}

/** Fehler der Seite sammeln. */
export function watchErrors(page, label, list) {
  page.on('pageerror', (e) => list.push(`[${label}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(`[${label}] console: ${m.text()}`);
  });
  page.on('dialog', (d) => {
    list.push(`[${label}] Dialog: ${d.message()}`);
    void d.dismiss();
  });
  return page;
}

export const view = (page) =>
  page.evaluate(() => {
    const v = window.__schnautz?.App.view;
    return v ? JSON.parse(JSON.stringify(v)) : null;
  });

export async function lobbyTab(page, tab) {
  if (await page.locator('#lobby-tabs').isVisible()) await page.click(`[data-act=ltab][data-t=${tab}]`);
  await sleep(120);
}

/** Aktion beim Gastgeber für einen Platz (sonst für sich selbst), wie sie über das Netz käme. */
export async function hostAct(page, pid, a) {
  return page.evaluate(
    ([p, x]) => {
      const s = window.__schnautz;
      const e = s.act(s.H.st, p ?? s.App.me, x);
      if (!e) s.hostCommit();
      return e ? String(e) : null;
    },
    [pid, a],
  );
}

/** Tisch aufmachen wie hostTable in tests/e2e/helpers.ts, Zeitlimit aus. */
export async function hostTable(page, name = 'Tahna', { clockOff = true } = {}) {
  await page.goto(START);
  if (await page.locator('.playbtn').isVisible()) await page.click('.playbtn');
  await page.fill('#name', name);
  await page.click('#btn-host');
  await page.locator('#scr-lobby').waitFor({ state: 'visible' });
  const code = await page.evaluate(() => window.__schnautz?.App.code ?? '');
  if (clockOff) await setRules(page, { turnSecs: 0 });
  return code;
}

/** Regeln direkt beim Gastgeber setzen, ohne den Bogen Einstellungen. */
export async function setRules(page, rules) {
  const e = await hostAct(page, null, { type: 'rules', rules });
  if (e) throw new Error(`Regeln: ${e}`);
  await sleep(150);
}

export async function chooseGame(page, game) {
  const e = await hostAct(page, null, { type: 'game', game });
  if (e) throw new Error(`Spiel ${game}: ${e}`);
  await poll(async () => (await view(page))?.game === game, { what: `Spiel ${game}` });
}

/** n Plätze einstellen und mit KIs füllen, ohne sich auf das Auffüllen freier Plätze zu verlassen. */
export async function fillSeats(page, n) {
  await setRules(page, { seats: n });
  for (let i = 0; i < 20 && ((await view(page))?.players.length ?? 0) < n; i++) {
    const e = await hostAct(page, null, { type: 'addbot' });
    if (e) throw new Error(`KI dazu: ${e}`);
  }
  await poll(async () => (await view(page))?.players.length === n, { what: `${n} Plätze` });
}

/** Härtefall: alle KIs bekommen 16 Zeichen lange Namen (nur zum Messen, direkt im Spielstand). */
export async function longNames(page) {
  await page.evaluate(() => {
    const s = window.__schnautz;
    let k = 0;
    for (const p of s.H.st.players) if (p.bot) p.name = `Wolfgang-Amadeu${k++}`.slice(0, 16);
    s.H.st.n++;
    s.hostCommit();
  });
  await sleep(150);
}

export async function startGame(page) {
  const e = await hostAct(page, null, { type: 'start' });
  if (e) throw new Error(`Start: ${e}`);
  await poll(async () => (await view(page))?.phase !== 'lobby', { what: 'Start' });
}

/** Gast tritt per Einladungslink bei. */
export async function joinTable(page, code, name = 'Lena') {
  await page.goto(`${START}#${code}`);
  await page.fill('#name', name);
  await page.click('#btn-join');
  await page.locator('#scr-lobby, #scr-game').first().waitFor({ state: 'visible' });
}

/**
 * Zeitraffer aus dem Dev-Menü (src/dev/menu.ts), etwa sh-any, dk-any, cb-win, sz-win, sz-round oder cb-round. Sucht
 * höchstens 9 Sekunden, deshalb bis zu drei Versuche, bis die Phase passt.
 */
export async function devJump(page, id, phases = ['end', 'over'], watch = page) {
  for (let k = 0; k < 3; k++) {
    await page.click('#btn-menu');
    await page.click('#menu-dev');
    await page.locator(`#modal [data-act=dev][data-dev=${id}]`).click();
    const ok = await poll(async () => phases.includes((await view(watch))?.phase ?? ''), {
      timeout: 15_000,
      what: id,
    }).catch(() => false);
    if (ok) return;
  }
  throw new Error(`Zeitraffer ${id} fand keine passende Partie`);
}

/** Ergebnisblatt abwarten, die Zeremonie notfalls mit einem Tipp überspringen. */
export async function waitResult(page, timeout = 45_000) {
  const t0 = Date.now();
  let tapped = false;
  for (;;) {
    if (
      await page
        .locator('#overlay .result')
        .isVisible()
        .catch(() => false)
    ) {
      await sleep(700);
      return true;
    }
    if (!tapped && Date.now() - t0 > 12_000) {
      await page.mouse.click(10, 10);
      tapped = true;
    }
    if (Date.now() - t0 > timeout) return false;
    await sleep(250);
  }
}

/**
 * Was am Bildschirm zählt, in einem Rutsch gemessen. `doc`: Seite höher oder breiter als das Fenster (bei body
 * overflow hidden heißt das abgeschnitten). `boxes`: Kanten wichtiger Elemente. `inner`: Bereiche, die in sich
 * scrollen oder überlaufen. `panes`: Stufe der Lobby-Bereiche. `tableBottom`: tiefstes sichtbares Element im Tisch.
 */
export async function measure(page, extra = []) {
  return page.evaluate((extraSel) => {
    const H = window.innerHeight;
    const W = window.innerWidth;
    const se = document.scrollingElement;
    const name = (el) =>
      el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        h: Math.round(r.height),
        w: Math.round(r.width),
        inView: r.top >= -1 && r.bottom <= H + 1 && r.left >= -1 && r.right <= W + 1,
      };
    };
    const sels = [
      '.top',
      '#lobby-tabs',
      '.lpane.on',
      '.lfoot',
      '.lgo-start',
      '.lnext',
      '#me',
      '#me .actions',
      '#emotes',
      '#status',
      '#modal .paper',
      '#overlay .result',
      '#overlay .result .rfoot',
      ...extraSel,
    ];
    const boxes = {};
    for (const s of sels) boxes[s] = box(s);
    const inner = [];
    document
      .querySelectorAll('.lpane, .seats, .lgames, .lgc, #overlay .paper, #modal .paper, .side, #opps')
      .forEach((el) => {
        if (!el.getClientRects().length) return;
        const over = el.scrollHeight - el.clientHeight;
        if (over > 1)
          inner.push({ el: name(el), over, scrolls: ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) });
      });
    const panes = [...document.querySelectorAll('#scr-lobby .lpane')]
      .filter((p) => p.getClientRects().length)
      .map((p) => ({
        pane: p.dataset.pane,
        level: Math.max(0, ...[...p.classList].filter((c) => /^f\d$/.test(c)).map((c) => Number(c.slice(1)))),
        fscroll: p.classList.contains('fscroll'),
        hidden: p.scrollHeight - p.clientHeight,
      }));
    let tableBottom = null;
    const table = document.querySelector('#table');
    if (document.querySelector('#scr-game')?.getClientRects().length && table) {
      tableBottom = { bottom: 0, who: '' };
      table.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') return;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > tableBottom.bottom)
          tableBottom = { bottom: Math.round(r.bottom), who: name(el) };
      });
    }
    return {
      w: W,
      h: H,
      docH: se.scrollHeight,
      docW: se.scrollWidth,
      vScroll: se.scrollHeight > H + 2,
      hScroll: se.scrollWidth > W + 2,
      boxes,
      inner,
      panes,
      tableBottom,
      tableScale: table?.style.transform || '',
    };
  }, extra);
}

/** Ergebnisblatt: Überlauf, sichtbare Zeilen über der angehefteten Fußleiste, eigene Zeile und Verlierer. */
export async function sheetInfo(page) {
  return page.evaluate(() => {
    const p = document.querySelector('#overlay .paper.result');
    if (!p) return null;
    const pr = p.getBoundingClientRect();
    const fr = p.querySelector('.rfoot')?.getBoundingClientRect();
    const bottom = fr ? Math.min(pr.bottom, fr.top) : pr.bottom;
    const vis = (el) => (el ? el.getBoundingClientRect().bottom <= bottom + 1 : null);
    const rows = [...p.querySelectorAll('.row')];
    return {
      over: p.scrollHeight - p.clientHeight,
      rows: `${rows.filter(vis).length}/${rows.length}`,
      me: vis(p.querySelector(`.row[data-pid="${window.__schnautz?.App.me}"]`)),
      loser: vis(p.querySelector('.row.lose')),
      paperBottom: Math.round(pr.bottom),
    };
  });
}

/**
 * Kurzurteil: `ok`, wenn nichts scrollt, nichts unter der Startleiste liegt, die Schlüsselelemente ganz im Bild sind
 * und am Tisch nichts unter den Rand ragt. Fehlt ein Schlüsselelement, ist das ein Befund.
 */
export function verdict(m, keys, { table = true, sheet = null } = {}) {
  const bad = [];
  if (m.vScroll) bad.push(`Seite ${m.docH}>${m.h}`);
  if (m.hScroll) bad.push(`quer ${m.docW}>${m.w}`);
  for (const k of keys) {
    const b = m.boxes[k];
    if (!b) bad.push(`${k} fehlt`);
    else if (!b.inView) bad.push(`${k} ${b.top} bis ${b.bottom}`);
  }
  for (const p of m.panes) {
    if (p.fscroll) bad.push(`${p.pane} fscroll`);
    else if (p.hidden > 1) bad.push(`${p.pane} ${p.hidden}px unter der Startleiste`);
  }
  if (table && m.tableBottom && m.tableBottom.bottom > m.h + 1)
    bad.push(`Tisch bis ${m.tableBottom.bottom} (${m.tableBottom.who})`);
  if (sheet) {
    if (sheet.over > 1) bad.push(`Blatt scrollt ${sheet.over}px`);
    if (sheet.me === false) bad.push('eigene Zeile verdeckt');
    if (sheet.loser === false) bad.push('Verlierer verdeckt');
  }
  return bad.length ? bad.join(', ') : 'ok';
}

/** Datei im Ausgabeordner schreiben (Ordner wird angelegt). Gibt den Pfad zurück. */
export function save(name, data) {
  const file = join(OUT, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return file;
}

/** Aufnahme im Ausgabeordner unter shots/, nur mit `--shots`. */
export async function shot(page, name) {
  if (!flag('shots')) return;
  mkdirSync(join(OUT, 'shots'), { recursive: true });
  await page.screenshot({ path: join(OUT, 'shots', `${name}.png`) });
}
