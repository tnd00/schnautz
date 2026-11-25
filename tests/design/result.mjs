/*
 * Ergebnisblätter der vier Spiele bei Partieende und Rundenende, gemessen auf mehreren Größen, beim Gastgeber und
 * bei einem Gast. Der Weg dorthin ist der Zeitraffer aus dem Dev-Menü (src/dev/menu.ts), wie ihn ein Mensch antippen
 * würde.
 *
 *   node tests/design/result.mjs [--games=shithead,durak,cabo,schnautz] [--states=over,overwin,overlose,round]
 *     [--seats=8] [--sizes=360x640,375x548,390x844] [--roles=host,guest] [--ready] [--hard] [--long] [--shots]
 *     [--out=DIR] [--port=5173] [--peer=9000] [--serve]
 *
 * `--ready`: danach meldet sich der Gastgeber bereit, der Gast noch nicht. Gemessen wird der Gastgeber mit Wartetext
 * und „Nicht warten“, das ist die vollste Fußzeile. `--hard`: Härtefälle im Spielstand des Gastgebers nachstellen,
 * die der Zufall selten trifft (Shithead und Durak mit 12 Restkarten und drei Tipps, Cabo daneben mit 6 Karten
 * beim Rufer).
 */
import {
  arg,
  chooseGame,
  context,
  devJump,
  fillSeats,
  flag,
  hostTable,
  joinTable,
  launch,
  LONG_GUEST,
  longNames,
  parseSize,
  poll,
  save,
  serve,
  sheetInfo,
  shot,
  sizeList,
  sleep,
  startGame,
  view,
  waitResult,
  watchErrors,
} from './lib.mjs';

const games = arg('games', 'shithead,durak,cabo,schnautz').split(',');
const states = arg('states', 'over').split(',');
const seats = Number(arg('seats', '8'));
const sizes = sizeList(arg('sizes', '360x640,375x548,390x844'));
const roles = arg('roles', 'host').split(',');

/** Welcher Sprung zu welchem Zustand führt. Ein Rundenende gibt es nur bei Schnautz und Cabo. */
const JUMP = {
  over: { shithead: 'sh-any', durak: 'dk-any', cabo: 'cb-lose', schnautz: 'sz-lose' },
  overwin: { shithead: 'sh-win', durak: 'dk-win', cabo: 'cb-win', schnautz: 'sz-win' },
  overlose: { shithead: 'sh-lose' },
  round: { cabo: 'cb-round', schnautz: 'sz-round' },
};

/** Härtefall im Spielstand des Gastgebers, danach eine neue Ansicht an alle. Gibt zurück, was geändert wurde. */
async function hardCase(page, game) {
  return page.evaluate((g) => {
    const s = window.__schnautz;
    const st = s.H.st;
    const r = st.result;
    if (!r) return '';
    const deck = ['C', 'S', 'H', 'D'].flatMap((x) => ['2', '5', '7', '9', 'B', 'K'].map((y) => x + y));
    let what = '';
    if (g === 'shithead' && r.shithead && st.sh?.P[r.shithead]) {
      const P = st.sh.P[r.shithead];
      P.hand = deck.slice(0, 12);
      P.up = [];
      P.down = [];
      what = 'Shithead mit 12 Karten';
    }
    if (g === 'durak' && r.durak && st.dk?.P[r.durak]) {
      st.dk.P[r.durak] = deck.slice(0, 12);
      what = 'Durak mit 12 Karten';
    }
    // Längste Tippzeile: drei KIs mit langen Namen richtig, der Gastgeber auch, der Gast daneben
    const loser = g === 'shithead' ? r.shithead : g === 'durak' ? r.durak : null;
    if (loser) {
      const bots = st.players.filter((p) => p.bot && p.id !== loser).slice(0, 3);
      const humans = st.players.filter((p) => !p.bot && p.id !== loser);
      r.bets = [
        ...bots.map((p) => ({ p: p.id, on: loser, q: 2, ok: true })),
        ...humans.map((p) => ({ p: p.id, on: p.id === st.host ? loser : bots[0]?.id, q: 2, ok: p.id === st.host })),
      ];
      what += ', Tipps mit eigenem';
    }
    if (g === 'cabo' && st.phase === 'end') {
      const c = Object.keys(r.sums).find((id) => st.players.find((p) => p.id === id)?.bot);
      if (c) {
        r.kami = null;
        r.caller = c;
        r.ok = false;
        r.hands[c] = deck.slice(0, 6);
        r.scores[c] = r.sums[c] + 10;
        what = 'Cabo daneben mit 6 Karten';
      }
    }
    if (!what) return '';
    st.n++;
    s.hostCommit();
    return what;
  }, game);
}

/** Alle Größen auf einer Seite messen, solange die Phase noch stimmt. */
async function measureAll(page, role, tag, phase) {
  for (const size of sizes) {
    await page.setViewportSize(parseSize(size));
    await sleep(500);
    const v = await view(page);
    if (v?.phase !== phase) {
      console.log(`${tag} ${role} ${size}: Phase schon ${v?.phase}, nicht gemessen`);
      rows.push({ ...meta, role, size, verdict: `nicht gemessen (Phase ${v?.phase})` });
      continue;
    }
    const m = await sheetInfo(page);
    if (!m) {
      rows.push({ ...meta, role, size, verdict: 'kein Ergebnisblatt' });
      continue;
    }
    const bad = [
      m.over > 1 && `scrollt ${m.over}px`,
      m.paperBottom > parseSize(size).height + 1 && `Blatt endet bei ${m.paperBottom}`,
      m.me === false && 'eigene Zeile verdeckt',
      m.loser === false && 'Verlierer verdeckt',
    ].filter(Boolean);
    rows.push({ ...meta, role, size, verdict: bad.join(', ') || 'ok', ...m });
    console.log(`${tag} ${role.padEnd(10)} ${size.padEnd(8)} Zeilen ${m.rows} => ${bad.join(', ') || 'ok'}`);
    await shot(page, `result-${meta.game}-${meta.state}${meta.hard ? '-hard' : ''}-${role}-${size}`);
  }
}

const rows = [];
const errors = [];
let meta = {};
const stop = await serve();
const browser = await launch();
try {
  for (const game of games) {
    for (const state of states) {
      const id = JUMP[state]?.[game];
      if (!id) continue;
      const ctxs = [];
      const pages = {};
      try {
        const hctx = await context(browser, sizes[0]);
        ctxs.push(hctx);
        pages.host = watchErrors(await hctx.newPage(), 'host', errors);
        const code = await hostTable(pages.host, 'Tahna');
        await chooseGame(pages.host, game);
        await fillSeats(pages.host, seats);
        if (flag('long')) await longNames(pages.host);
        if (roles.includes('guest')) {
          const gctx = await context(browser, sizes[0]);
          ctxs.push(gctx);
          pages.guest = watchErrors(await gctx.newPage(), 'gast', errors);
          await joinTable(pages.guest, code, flag('long') ? LONG_GUEST : 'Lena');
          await poll(async () => (await view(pages.host))?.players.filter((p) => !p.bot).length === 2, {
            what: 'Gast am Tisch',
          });
        }
        await startGame(pages.host);
        await sleep(1500);
        const phases = state === 'round' ? ['end'] : ['over'];
        await devJump(pages.host, id, phases);
        const phase = (await view(pages.host))?.phase;
        const hard = flag('hard') ? await hardCase(pages.host, game) : '';
        meta = { game, state, seats, hard };
        const tag = `${game.padEnd(8)} ${state.padEnd(8)}${hard ? ` (${hard})` : ''}`;
        for (const role of roles) {
          const page = pages[role];
          if (!page) continue;
          if (!(await waitResult(page))) throw new Error(`kein Ergebnisblatt (${role})`);
          await measureAll(page, role, tag, phase);
        }
        if (flag('ready') && pages.guest) {
          // Gastgeber bereit, der Gast noch nicht: Wartetext und „Nicht warten“ in der Fußzeile
          await pages.host.click('#overlay [data-act=ready]');
          await sleep(400);
          await measureAll(pages.host, 'host-ready', tag, phase);
        }
      } catch (e) {
        console.log(`${game} ${state}: FEHLER ${e.message}`);
        rows.push({ game, state, verdict: `FEHLER ${e.message}` });
        if (pages.host) await shot(pages.host, `result-${game}-${state}-FEHLER`);
      }
      for (const c of ctxs) await c.close();
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
