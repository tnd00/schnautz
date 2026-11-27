/*
 * Sweep über Spiele, Rollen, Zustände und Größen, mit Urteil pro Messung, JSON und Aufnahmen.
 *
 *   node tests/design/sweep.mjs [--games=shithead,durak,cabo,schnautz] [--roles=host,guest]
 *     [--states=lobby,swap,turn,menu,modal,round,over] [--sizes=all|phone|desktop|390x844,...] [--seats=8] [--long]
 *     [--reign] [--offline]
 *     [--look=sticker,legacy] [--theme=light,dark] [--shots] [--out=DIR] [--port=5173] [--peer=9000] [--serve]
 *
 * Pro Spiel, Rolle und Gerät (Handy oder PC) entsteht ein Tisch. Gemessen wird beim Gastgeber oder beim Gast, die
 * Zustände kommen der Reihe nach, pro Zustand alle Größen per setViewportSize. Handy und PC laufen in getrennten
 * Kontexten, weil isMobile und hasTouch sich nicht umschalten lassen. Ausgangscode 1, wenn es einen Befund gibt.
 * Mit `--look` oder `--theme` läuft alles je Paar aus Look und Thema, die Ausgabe heißt dann etwa
 * `sweep-legacy-dark.json` und die Aufnahmen enden auf `-legacy-dark`. Ohne beides bleibt alles wie bisher.
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
  menuInfo,
  parseSize,
  poll,
  save,
  serve,
  sheetInfo,
  shot,
  sizeList,
  sleep,
  startGame,
  variants,
  verdict,
  view,
  waitResult,
  watchErrors,
} from './lib.mjs';

const games = arg('games', 'shithead,durak,cabo,schnautz').split(',');
const roles = arg('roles', 'host').split(',');
const states = arg('states', 'lobby,swap,turn,menu,modal,round,over').split(',');
const sizes = sizeList(arg('sizes', 'all'));
const seats = Number(arg('seats', '8'));
const long = flag('long');
/** Härtefall wie die Fixture sh-reign-4: Krone und Verlierer-Zeichen an zwei KI-Plätzen */
const reign = flag('reign');
/** Härtefall: eine KI offline */
const offline = flag('offline');

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
  const m = await measure(page, opts.menu ? ['#menu'] : []);
  const sheet = opts.sheet ? await sheetInfo(page) : null;
  const menu = opts.menu ? await menuInfo(page) : undefined;
  const v = verdict(m, keys, { table: !opts.sheet && meta.state !== 'modal', sheet, menu });
  rows.push({ ...meta, verdict: v, sheet, menu, ...m });
  const info = sheet
    ? ` Zeilen ${sheet.rows}`
    : menu
      ? ` Menü ${menu.top} bis ${menu.bottom}, ${menu.items} Einträge`
      : m.tableBottom
        ? ` Tisch bis ${m.tableBottom.bottom}`
        : '';
  const vt = meta.variant ? ` ${meta.variant}` : '';
  console.log(
    `${meta.game.padEnd(8)} ${meta.role.padEnd(5)} ${meta.state.padEnd(6)} ${(meta.tab ?? '').padEnd(5)} ` +
      `${meta.size.padEnd(9)}${vt} Seite ${m.docH}/${m.h}${info} => ${v}`,
  );
  await shot(
    page,
    `${meta.game}-${meta.role}-${meta.state}${meta.tab ? `-${meta.tab}` : ''}-${meta.size}${meta.variant ? `-${meta.variant}` : ''}`,
  );
}

async function run(browser, game, role, group, vari) {
  const look = { look: vari.look, theme: vari.theme };
  const hctx = await context(browser, role === 'host' ? group[0] : '1280x860', look);
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
      gctx = await context(browser, group[0], look);
      page = watchErrors(await gctx.newPage(), 'gast', errors);
      await joinTable(page, code, long ? LONG_GUEST : 'Lena');
      await poll(async () => (await view(host))?.players.filter((p) => !p.bot).length === 2 && !!(await view(page)), {
        timeout: 45_000,
        what: 'Gast sitzt',
      });
    }
    const meta = (state, size, tab) => ({
      game,
      role,
      state,
      size,
      seats,
      long,
      tab,
      ...(vari.tag ? { variant: vari.tag, look: vari.look, theme: vari.theme } : {}),
    });
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
    if (reign)
      await host.evaluate((g) => {
        const s = window.__schnautz;
        const [win, lose] = s.H.st.players.filter((p) => p.bot);
        s.H.st.reigns = { ...(s.H.st.reigns ?? {}), [g]: { win: win.id, lose: lose.id, game: g } };
        lose.shc = 2;
        lose.dkc = 2;
        s.H.st.n++;
        s.hostCommit();
      }, game);
    // Härtefall offline: die erste KI gilt als getrennt (Zeichen am Namen, M9)
    if (offline)
      await host.evaluate(() => {
        const s = window.__schnautz;
        s.H.st.players.filter((p) => p.bot)[0].online = false;
        s.H.st.n++;
        s.hostCommit();
      });
    await sleep(1200);
    if (game === 'shithead' && states.includes('swap')) {
      await poll(async () => (await view(page))?.phase === 'swap', { what: 'Tauschrunde' });
      await each((size) => record(page, meta('swap', size), ['#me']));
    }
    if (states.includes('turn') || states.includes('menu') || states.includes('modal')) {
      await waitMyMove(page, host);
      await sleep(800);
    }
    if (states.includes('turn')) await each((size) => record(page, meta('turn', size), ['#me']));
    if (states.includes('menu')) {
      // Menü ⋯ am Tisch offen: Der Bogen samt allen Einträgen muss ganz ins Bild, ohne in sich zu scrollen
      await page.click('#btn-menu');
      await sleep(400);
      await each((size) => record(page, meta('menu', size), ['#menu'], { menu: true }));
      await page.keyboard.press('Escape');
      await sleep(200);
    }
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
    console.log(`${game} ${role}${vari.tag ? ` ${vari.tag}` : ''}: FEHLER ${e.message}`);
    rows.push({ game, role, ...(vari.tag ? { variant: vari.tag } : {}), verdict: `FEHLER ${e.message}` });
    await shot(host, `${game}-${role}-FEHLER${vari.tag ? `-${vari.tag}` : ''}`);
  } finally {
    await hctx.close();
    if (gctx) await gctx.close();
  }
}

const stop = await serve();
const browser = await launch();
let bad = 0;
let errs = 0;
try {
  for (const vari of variants()) {
    const from = rows.length;
    const e0 = errors.length;
    for (const game of games)
      for (const role of roles)
        for (const group of [sizes.filter(isPhoneSize), sizes.filter((s) => !isPhoneSize(s))])
          if (group.length) await run(browser, game, role, group, vari);
    // Je Look und Thema eine eigene Datei, ohne beides heißt sie wie bisher sweep.json
    const mine = rows.slice(from);
    const errsHere = errors.slice(e0);
    const file = save(vari.tag ? `sweep-${vari.tag}.json` : 'sweep.json', { rows: mine, errors: errsHere });
    const badHere = mine.filter((r) => r.verdict !== 'ok').length;
    bad += badHere;
    errs += errsHere.length;
    console.log(
      `\n${vari.tag ? `${vari.tag}: ` : ''}${mine.length} Messungen, ${badHere} mit Befund, ` +
        `${errsHere.length} Fehler der Seite. Ergebnis: ${file}`,
    );
    errsHere.forEach((e) => console.log(`  ${e}`));
  }
} finally {
  await browser.close();
  await stop();
}
process.exitCode = bad || errs ? 1 : 0;
