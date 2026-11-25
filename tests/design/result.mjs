/*
 * Ergebnisblätter der vier Spiele bei Partieende und Rundenende, gemessen auf mehreren Größen. Der Weg dorthin ist
 * der Zeitraffer aus dem Dev-Menü (src/dev/menu.ts), wie ihn ein Mensch antippen würde.
 *
 *   node tests/design/result.mjs [--games=shithead,durak,cabo,schnautz] [--states=over,overwin,round] [--seats=8]
 *     [--sizes=360x640,375x548,390x844] [--long] [--shots] [--out=DIR] [--port=5173] [--peer=9000] [--serve]
 */
import {
  arg,
  chooseGame,
  context,
  devJump,
  fillSeats,
  flag,
  hostTable,
  launch,
  longNames,
  parseSize,
  save,
  serve,
  sheetInfo,
  shot,
  sizeList,
  sleep,
  startGame,
  waitResult,
  watchErrors,
} from './lib.mjs';

const games = arg('games', 'shithead,durak,cabo,schnautz').split(',');
const states = arg('states', 'over').split(',');
const seats = Number(arg('seats', '8'));
const sizes = sizeList(arg('sizes', '360x640,375x548,390x844'));

/** Welcher Sprung zu welchem Zustand führt. Ein Rundenende gibt es nur bei Schnautz und Cabo. */
const JUMP = {
  over: { shithead: 'sh-any', durak: 'dk-any', cabo: 'cb-lose', schnautz: 'sz-lose' },
  overwin: { shithead: 'sh-win', durak: 'dk-win', cabo: 'cb-win', schnautz: 'sz-win' },
  round: { cabo: 'cb-round', schnautz: 'sz-round' },
};

const rows = [];
const errors = [];
const stop = await serve();
const browser = await launch();
try {
  for (const game of games) {
    for (const state of states) {
      const id = JUMP[state]?.[game];
      if (!id) continue;
      const ctx = await context(browser, sizes[0]);
      const page = watchErrors(await ctx.newPage(), 'host', errors);
      try {
        await hostTable(page, 'Tahna');
        await chooseGame(page, game);
        await fillSeats(page, seats);
        if (flag('long')) await longNames(page);
        await startGame(page);
        await sleep(1500);
        await devJump(page, id, state === 'round' ? ['end', 'over'] : ['over']);
        if (!(await waitResult(page))) throw new Error('kein Ergebnisblatt');
        for (const size of sizes) {
          await page.setViewportSize(parseSize(size));
          await sleep(500);
          const m = await sheetInfo(page);
          const bad = [
            m.over > 1 && `scrollt ${m.over}px`,
            m.me === false && 'eigene Zeile verdeckt',
            m.loser === false && 'Verlierer verdeckt',
          ].filter(Boolean);
          rows.push({ game, state, seats, size, verdict: bad.join(', ') || 'ok', ...m });
          console.log(
            `${game.padEnd(8)} ${state.padEnd(7)} ${size.padEnd(8)} Zeilen ${m.rows} sichtbar => ${bad.join(', ') || 'ok'}`,
          );
          await shot(page, `result-${game}-${state}-${size}`);
        }
      } catch (e) {
        console.log(`${game} ${state}: FEHLER ${e.message}`);
        rows.push({ game, state, verdict: `FEHLER ${e.message}` });
        await shot(page, `result-${game}-${state}-FEHLER`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await stop();
}
const file = save('result.json', { rows, errors });
const bad = rows.filter((r) => r.verdict !== 'ok');
console.log(
  `\n${rows.length} Messungen, ${bad.length} mit Befund, ${errors.length} Fehler der Seite. Ergebnis: ${file}`,
);
process.exitCode = bad.length || errors.length ? 1 : 0;
