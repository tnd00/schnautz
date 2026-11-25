/*
 * Schnautz am PC: Schiebt die Vorschau im Knopf „Tauschen“ die Reaktionsleiste aus dem Bild? Gemessen wird vor und
 * nach der Wahl einer Hand- und einer Tischkarte, ohne Größenwechsel dazwischen.
 *
 *   node tests/design/szpreview.mjs [--sizes=1280x860,1280x720,1024x768] [--seats=4,8] [--shots] [--out=DIR]
 *     [--port=5173] [--peer=9000] [--serve]
 */
import {
  arg,
  chooseGame,
  context,
  fillSeats,
  hostTable,
  launch,
  measure,
  poll,
  save,
  serve,
  shot,
  sizeList,
  sleep,
  startGame,
  verdict,
  view,
  watchErrors,
} from './lib.mjs';

const sizes = sizeList(arg('sizes', 'desktop'));
const seatList = arg('seats', '4,8').split(',').map(Number);
const EXTRA = ['#me .actions [data-act=swap]'];

const myTurn = (page) =>
  poll(
    async () => {
      const v = await view(page);
      if (v?.phase === 'choose' && (await page.locator('[data-act=keep]').isVisible())) {
        await page.click('[data-act=keep]');
        return false;
      }
      return v?.phase === 'play' && v.players[v.turn]?.id === v.me;
    },
    { timeout: 60_000, every: 250, what: 'eigener Zug' },
  );

const rows = [];
const errors = [];
const stop = await serve();
const browser = await launch();
try {
  for (const n of seatList) {
    for (const size of sizes) {
      const ctx = await context(browser, size);
      const page = watchErrors(await ctx.newPage(), 'host', errors);
      try {
        await hostTable(page, 'Tahna');
        await chooseGame(page, 'schnautz');
        await fillSeats(page, n);
        await startGame(page);
        await myTurn(page);
        await sleep(1500);
        const before = await measure(page, EXTRA);
        await page.click('#me [data-act=hand][data-i="0"]');
        await page.click('#center [data-act=mid][data-i="0"]');
        await sleep(500);
        const after = await measure(page, EXTRA);
        const label = (await page.locator('#me [data-act=swap]').innerText()).replace(/\s+/g, ' ');
        const keys = ['#me', '#emotes'];
        const r = { size, seats: n, label, before: verdict(before, keys), after: verdict(after, keys), m: after };
        rows.push({ ...r, verdict: r.after });
        console.log(`${size} ${n} Plätze, Knopf „${label}“, vorher ${r.before}, nachher ${r.after}`);
        await shot(page, `szpreview-${size}-${n}`);
      } catch (e) {
        console.log(`${size} ${n}: FEHLER ${e.message}`);
        rows.push({ size, seats: n, verdict: `FEHLER ${e.message}` });
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await stop();
}
const file = save('szpreview.json', { rows, errors });
const bad = rows.filter((r) => r.verdict !== 'ok');
console.log(`\n${rows.length} Messungen, ${bad.length} mit Befund. Ergebnis: ${file}`);
process.exitCode = bad.length || errors.length ? 1 : 0;
