/*
 * Lobby ohne Scrollen: Handy (beide Reiter, je zweimal besucht) und PC, als Gastgeber oder Gast, mit n Plätzen.
 *
 *   node tests/design/lobby.mjs [--sizes=task|phone|desktop|390x740,...] [--game=shithead] [--seats=8]
 *     [--role=host|guest] [--long] [--devs] [--fresh] [--shots] [--out=DIR] [--port=5173] [--peer=9000] [--serve]
 *
 * --fresh lädt pro Größe neu statt die Fenstergröße zu ändern, --devs stellt drei abweichende Regeln ein (längste
 * Zeile in der Spielkarte), --long gibt allen 16 Zeichen lange Namen.
 */
import {
  LONG_GUEST,
  SIZES,
  arg,
  chooseGame,
  context,
  fillSeats,
  flag,
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
  setRules,
  shot,
  sizeList,
  sleep,
  verdict,
  view,
  watchErrors,
} from './lib.mjs';

/** Höhen rund um den alten Fehler bei 721 bis 830 px, dazu die kurzen Handys */
const TASK = [390, 412].flatMap((w) => [721, 740, 760, 780, 800, 830, 844].map((h) => `${w}x${h}`));
const sizeArg = arg('sizes', 'task');
const sizes = sizeArg === 'task' ? [...TASK, '375x548', '360x640', ...SIZES.desktop] : sizeList(sizeArg);
const game = arg('game', 'shithead');
const seats = Number(arg('seats', '8'));
const role = arg('role', 'host');
const fresh = flag('fresh');
const long = flag('long');

const rows = [];
const errors = [];
const stop = await serve();
const browser = await launch();
try {
  for (const list of [sizes.filter(isPhoneSize), sizes.filter((s) => !isPhoneSize(s))]) {
    if (!list.length) continue;
    const ctxs = [];
    let page = null;
    const setup = async (size) => {
      await Promise.all(ctxs.splice(0).map((c) => c.close()));
      const hctx = await context(browser, size);
      ctxs.push(hctx);
      const host = watchErrors(await hctx.newPage(), 'host', errors);
      // Standardregeln wie im echten Leben, also mit Zeitlimit
      const code = await hostTable(host, 'Tahna', { clockOff: false });
      await chooseGame(host, game);
      if (flag('devs')) await setRules(host, { turnSecs: 0, sh: { seven: false, cut: false }, dk: { transfer: true } });
      await fillSeats(host, seats);
      if (long) await longNames(host);
      page = host;
      if (role === 'guest') {
        const gctx = await context(browser, size);
        ctxs.push(gctx);
        page = watchErrors(await gctx.newPage(), 'gast', errors);
        await joinTable(page, code, long ? LONG_GUEST : 'Lena');
        await poll(async () => (await view(host))?.players.filter((p) => !p.bot).length === 2, {
          timeout: 45_000,
          what: 'Gast sitzt',
        });
      }
      await lobbyTab(page, 'table');
      await sleep(400);
    };
    for (let i = 0; i < list.length; i++) {
      const size = list[i];
      if (i === 0 || fresh) await setup(size);
      else {
        await page.setViewportSize(parseSize(size));
        await sleep(350);
      }
      // Der zweite Besuch eines Reiters zeigt, ob die Lobby nach dem Wechsel richtig einpasst
      const tabs = isPhoneSize(size) ? ['table', 'game', 'table2', 'game2'] : ['both'];
      for (const visit of tabs) {
        const tab = visit.replace('2', '');
        if (tab !== 'both') await lobbyTab(page, tab);
        await sleep(250);
        const m = await measure(page);
        // Gäste haben keinen Startknopf, bei ihnen zählt nur die Startleiste
        const keys = role === 'guest' ? ['.lfoot'] : ['.lfoot', tab === 'table' ? '.lnext' : '.lgo-start'];
        const r = {
          size,
          tab: visit,
          mode: fresh ? 'fresh' : 'resize',
          role,
          game,
          seats,
          long,
          verdict: verdict(m, keys),
          ...m,
        };
        rows.push(r);
        const lf = m.boxes['.lfoot'];
        console.log(
          `${size.padEnd(9)} ${visit.padEnd(6)} Seite ${String(m.docH).padStart(4)}/${m.h} ` +
            `Startleiste ${lf ? `${lf.top}-${lf.bottom}` : '-'} ` +
            `Stufe ${m.panes.map((p) => `${p.pane}:f${p.level}${p.fscroll ? '+fscroll' : ''}`).join(' ')} => ${r.verdict}`,
        );
        await shot(page, `lobby-${role}-${game}-${size}-${visit}`);
      }
    }
    await Promise.all(ctxs.map((c) => c.close()));
  }
} finally {
  await browser.close();
  await stop();
}
const file = save('lobby.json', { rows, errors });
const bad = rows.filter((r) => r.verdict !== 'ok');
console.log(
  `\n${rows.length} Messungen, ${bad.length} mit Befund, ${errors.length} Fehler der Seite. Ergebnis: ${file}`,
);
process.exitCode = bad.length || errors.length ? 1 : 0;
