/*
 * Sweep über Spiele, Rollen, Zustände und Größen, mit Urteil pro Messung, JSON und Aufnahmen.
 *
 *   node tests/design/sweep.mjs [--games=shithead,durak,cabo,schnautz] [--roles=host,guest]
 *     [--states=lobby,swap,turn,modal,round,over] [--sizes=all|phone|desktop|390x844,...] [--seats=8] [--long]
 *     [--shots] [--out=DIR] [--port=5173] [--peer=9000] [--serve]
 *
 * Pro Spiel, Rolle und Gerät (Handy oder PC) entsteht ein Tisch. Gemessen wird beim Gastgeber oder beim Gast, die
 * Zustände kommen der Reihe nach, pro Zustand alle Größen per setViewportSize. Handy und PC laufen in getrennten
 * Kontexten, weil isMobile und hasTouch sich nicht umschalten lassen. Ausgangscode 1, wenn es einen Befund gibt.
 */
import {
  LONG_GUEST,
  arg,
  chooseGame,
  context,
  devJump,
  fillSeats,
  flag,
  hostAct,
  hostTable,
  isPhoneSize,
  joinTable,
  launch,
  lobbyTab,
  longNames,
  measure,
  parseSize,
  poll,
  save,
  serve,
  sheetInfo,
  shot,
  sizeList,
  sleep,
  startGame,
  verdict,
  view,
  waitResult,
  watchErrors,
} from './lib.mjs';

const games = arg('games', 'shithead,durak,cabo,schnautz').split(',');
const roles = arg('roles', 'host').split(',');
const states = arg('states', 'lobby,swap,turn,modal,round,over').split(',');
const sizes = sizeList(arg('sizes', 'all'));
const seats = Number(arg('seats', '8'));
const long = flag('long');

const ROUND = { cabo: 'cb-round', schnautz: 'sz-round' };
const OVER = { shithead: 'sh-any', durak: 'dk-any', cabo: 'cb-win', schnautz: 'sz-win' };

/** Warten, bis die gemessene Seite selbst am Zug ist. Die KIs spielen von allein, das Zeitlimit ist aus. */
async function waitMyMove(page, host) {
  return poll(
    async () => {
      const v = await view(page);
      if (!v || v.phase !== 'play') {
        // Schnautz: Der Geber wählt zuerst und behält sein Blatt, Tauschrunde und Ansehen schließt der Gastgeber
        if (v?.phase === 'choose' && (await page.locator('[data-act=keep]').isVisible()))
          await page.click('[data-act=keep]');
        if (v?.phase === 'swap' || v?.phase === 'peek') await hostAct(host, null, { type: 'force' });
        return false;
      }
      return page.evaluate(() => {
        const s = window.__schnautz;
        const w = s.App.view;
        if (s.SEQ.busy) return false;
        if (w.game === 'durak') return w.dk?.att === w.me || w.dk?.def === w.me;
        return w.players[w.turn]?.id === w.me;
      });
    },
    { timeout: 30_000, every: 300, what: 'eigener Zug' },
  ).catch(() => {
    console.log('  (nicht am Zug, gemessen wird der laufende Tisch)');
    return false;
  });
}

const rows = [];
const errors = [];

async function record(page, meta, keys, opts = {}) {
  const m = await measure(page);
  const sheet = opts.sheet ? await sheetInfo(page) : null;
  const v = verdict(m, keys, { table: !opts.sheet && meta.state !== 'modal', sheet });
  rows.push({ ...meta, verdict: v, sheet, ...m });
  const info = sheet ? ` Zeilen ${sheet.rows}` : m.tableBottom ? ` Tisch bis ${m.tableBottom.bottom}` : '';
  console.log(
    `${meta.game.padEnd(8)} ${meta.role.padEnd(5)} ${meta.state.padEnd(6)} ${(meta.tab ?? '').padEnd(5)} ` +
      `${meta.size.padEnd(9)} Seite ${m.docH}/${m.h}${info} => ${v}`,
  );
  await shot(page, `${meta.game}-${meta.role}-${meta.state}${meta.tab ? `-${meta.tab}` : ''}-${meta.size}`);
}

async function run(browser, game, role, group) {
  const hctx = await context(browser, role === 'host' ? group[0] : '1280x860');
  let gctx = null;
  const host = watchErrors(await hctx.newPage(), 'host', errors);
  try {
    const code = await hostTable(host, 'Tahna');
    await chooseGame(host, game);
    // Ein Gast übernimmt beim Beitreten einen KI-Platz, also erst alle Plätze füllen
    await fillSeats(host, seats);
    if (long) await longNames(host);
    let page = host;
    if (role === 'guest') {
      gctx = await context(browser, group[0]);
      page = watchErrors(await gctx.newPage(), 'gast', errors);
      await joinTable(page, code, long ? LONG_GUEST : 'Lena');
      await poll(async () => (await view(host))?.players.filter((p) => !p.bot).length === 2 && !!(await view(page)), {
        timeout: 45_000,
        what: 'Gast sitzt',
      });
    }
    const meta = (state, size, tab) => ({ game, role, state, size, seats, long, tab });
    const each = async (fn) => {
      for (const size of group) {
        await page.setViewportSize(parseSize(size));
        await sleep(450);
        await fn(size);
      }
    };
    if (states.includes('lobby'))
      await each(async (size) => {
        for (const tab of isPhoneSize(size) ? ['table', 'game'] : ['']) {
          if (tab) await lobbyTab(page, tab);
          // Den Übergang von der Startseite abwarten. Fehlt die Startleiste danach noch, meldet verdict es
          await page
            .locator('#scr-lobby .lfoot')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => undefined);
          await sleep(250);
          await record(page, meta('lobby', size, tab), ['.lfoot']);
        }
      });
    await startGame(host);
    await sleep(1200);
    if (game === 'shithead' && states.includes('swap')) {
      await poll(async () => (await view(page))?.phase === 'swap', { what: 'Tauschrunde' });
      await each((size) => record(page, meta('swap', size), ['#me']));
    }
    if (states.includes('turn') || states.includes('modal')) {
      await waitMyMove(page, host);
      await sleep(800);
    }
    if (states.includes('turn')) await each((size) => record(page, meta('turn', size), ['#me']));
    if (states.includes('modal')) {
      await page.click('#btn-rules');
      await sleep(500);
      await each((size) => record(page, meta('modal', size), ['#modal .paper']));
      await page.keyboard.press('Escape');
      await page
        .locator('#modal [data-act=closemodal]')
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
    }
    if (states.includes('round') && ROUND[game]) {
      await devJump(host, ROUND[game], ['end', 'over'], page);
      await waitResult(page);
      await each((size) => record(page, meta('round', size), [], { sheet: true }));
      if ((await view(host))?.phase === 'end') await hostAct(host, null, { type: 'force' });
      await sleep(1500);
    }
    if (states.includes('over')) {
      await devJump(host, OVER[game], ['over'], page);
      await waitResult(page);
      await each((size) => record(page, meta('over', size), [], { sheet: true }));
    }
  } catch (e) {
    console.log(`${game} ${role}: FEHLER ${e.message}`);
    rows.push({ game, role, verdict: `FEHLER ${e.message}` });
    await shot(host, `${game}-${role}-FEHLER`);
  } finally {
    await hctx.close();
    if (gctx) await gctx.close();
  }
}

const stop = await serve();
const browser = await launch();
try {
  for (const game of games)
    for (const role of roles)
      for (const group of [sizes.filter(isPhoneSize), sizes.filter((s) => !isPhoneSize(s))])
        if (group.length) await run(browser, game, role, group);
} finally {
  await browser.close();
  await stop();
}
const file = save('sweep.json', { rows, errors });
const bad = rows.filter((r) => r.verdict !== 'ok');
console.log(
  `\n${rows.length} Messungen, ${bad.length} mit Befund, ${errors.length} Fehler der Seite. Ergebnis: ${file}`,
);
errors.forEach((e) => console.log(`  ${e}`));
process.exitCode = bad.length || errors.length ? 1 : 0;
