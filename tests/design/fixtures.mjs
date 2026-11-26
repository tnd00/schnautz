/*
 * Feste Spielstände für den Bildvergleich (tests/visual/table.visual.ts). Das Skript spielt am Dev-Server echte Tische
 * bis zu einem Zustand und speichert dann, was der Gastgeber in localStorage['schnautz:host'] ablegen würde (`code`,
 * `me`, `name`, `st`, `keys`). Der Bildvergleich lädt diesen Eintrag später und tippt „Fortsetzen“.
 *
 *   node tests/design/fixtures.mjs --serve --port=5311 --peer=9311 [--games=shithead,durak,cabo,schnautz]
 *     [--only=sh-turn-4,dk-over-4] [--dir=tests/design/fixtures]
 *
 * Gespielt wird ohne Zeittakt: Die KIs stehen (`BOTS.hold`), das Skript lässt im Gastgeber für jeden Platz die KI
 * entscheiden (auch für Gastgeber und Gast, mit ihrem eigenen Wissen) und führt den Zug sofort aus, wie der
 * Zeitraffer in src/dev/spool.ts. Der Zufall beim Mischen ist dabei egal, denn gespeichert wird das Ergebnis.
 * Die Dateien liegen im Repo und ändern sich nur, wenn jemand dieses Skript neu laufen lässt.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  REPO,
  arg,
  chooseGame,
  context,
  fillSeats,
  hostTable,
  joinTable,
  launch,
  longNames,
  poll,
  serve,
  sleep,
  startGame,
  view,
  watchErrors,
} from './lib.mjs';

export const FIXTURE_DIR = join(REPO, 'tests/design/fixtures');
export const SHORT = { shithead: 'sh', durak: 'dk', cabo: 'cb', schnautz: 'sz' };
/** Härtefall: Gastgeber mit 16 Zeichen (wie result.mjs --long) */
export const LONG_HOST = 'Tahna-Kristoffer';

/**
 * Katalog der Stände. `goal` ist der Zustand, `min` die Zahl der Züge, die vorher mindestens laufen (damit Stapel und
 * Verlauf nicht leer sind), `guest` setzt einen echten Gast „Lena“ an den Tisch, `long` gibt allen 16 Zeichen.
 * `screen` sagt dem Bildvergleich, worauf er nach dem Laden wartet.
 */
export function catalog(game) {
  const s = SHORT[game];
  const list = [
    { id: `${s}-lobby-4`, goal: 'lobby', seats: 4, screen: 'lobby' },
    { id: `${s}-turn-4`, goal: 'turn', seats: 4, min: 6, screen: 'game' },
    { id: `${s}-wait-4`, goal: 'wait', seats: 4, min: 6, screen: 'game' },
    { id: `${s}-guest-4`, goal: 'guest', seats: 4, min: 6, screen: 'game', guest: true },
    { id: `${s}-turn-8`, goal: 'turn', seats: 8, min: 10, screen: 'game', long: true },
    { id: `${s}-over-4`, goal: 'over', seats: 4, screen: 'result' },
  ];
  if (game === 'shithead') list.splice(1, 0, { id: 'sh-swap-4', goal: 'swap', seats: 4, screen: 'game' });
  if (game === 'cabo' || game === 'schnautz')
    list.splice(list.length - 1, 0, { id: `${s}-round-4`, goal: 'round', seats: 4, screen: 'result' });
  return list;
}

/**
 * Im Gastgeber spielen, bis `goal` erreicht ist. Läuft komplett in der Seite, ohne Pausen, und schickt erst am Ende
 * eine Ansicht an alle (`hostCommit`).
 */
function playUntil(page, goal, min, max = 6000) {
  return page.evaluate(
    ([goal, min, max]) => {
      const s = window.__schnautz;
      const st = s.H.st;
      const me = s.App.me;
      const guest = st.players.find((p) => !p.bot && p.id !== me)?.id ?? null;
      const COSMETIC = new Set(['chat', 'emote', 'toss', 'sound']);
      const on = (id) =>
        st.game === 'durak' ? st.dk?.att === id || st.dk?.def === id : st.players[st.turn]?.id === id;
      const locked = () => st.game === 'shithead' && !!st.sh?.win?.lock;
      const ok = () => {
        switch (goal) {
          case 'swap':
            return st.phase === 'swap';
          case 'turn':
            return st.phase === 'play' && on(me) && !locked();
          case 'wait':
            return st.phase === 'play' && !on(me) && (!guest || !on(guest)) && !locked();
          case 'guest':
            return st.phase === 'play' && !!guest && on(guest) && !on(me) && !locked();
          case 'round':
            return st.phase === 'end';
          case 'over':
            return st.phase === 'over';
          default:
            return false;
        }
      };
      let n = 0;
      for (let i = 0; i < max; i++) {
        if (n >= min && ok()) {
          s.hostCommit();
          return { n, phase: st.phase, ok: true };
        }
        let moved = false;
        if (locked()) moved = !s.act(st, st.host, { type: 'shunlock', id: st.sh.win.id });
        else
          for (const p of st.players) {
            const a = s.botDecide(s.viewFor(st, p.id, true), undefined, 'normal');
            if (!a || COSMETIC.has(a.type)) continue;
            if (!s.act(st, p.id, a)) {
              moved = true;
              break;
            }
          }
        if (!moved) break;
        // Mitgezählt werden nur Züge im Spiel, nicht Tauschrunde, Ansehen oder Wählen
        if (st.phase === 'play') n++;
      }
      s.hostCommit();
      return { n, phase: st.phase, ok: false };
    },
    [goal, min, max],
  );
}

/** Was der Gastgeber speichern würde, ohne `ts` und `tab` (setzt der Bildvergleich beim Laden). */
const savedHost = (page) =>
  page.evaluate(() => {
    const s = window.__schnautz;
    return JSON.parse(JSON.stringify({ code: s.App.code, me: s.App.me, name: s.App.name, st: s.H.st, keys: s.H.keys }));
  });

async function make(browser, game, fx) {
  const ctx = await context(browser, '1280x860');
  const errors = [];
  let gctx = null;
  try {
    const host = watchErrors(await ctx.newPage(), 'host', errors);
    const code = await hostTable(host, fx.long ? LONG_HOST : 'Tahna');
    await chooseGame(host, game);
    await fillSeats(host, fx.seats);
    if (fx.long) await longNames(host);
    let guest = null;
    if (fx.guest) {
      gctx = await context(browser, '390x844');
      const gp = watchErrors(await gctx.newPage(), 'gast', errors);
      await joinTable(gp, code, 'Lena');
      await poll(async () => (await view(host))?.players.filter((p) => !p.bot).length === 2 && !!(await view(gp)), {
        timeout: 45_000,
        what: 'Gast sitzt',
      });
      guest = await gp.evaluate(() => {
        const g = JSON.parse(localStorage.getItem('schnautz:guest') ?? 'null');
        return g && { pid: g.pid, key: g.key, name: g.name };
      });
      if (!guest) throw new Error('Gast hat nichts gespeichert');
    }
    await host.evaluate(() => {
      window.__schnautz.BOTS.hold = true;
    });
    if (fx.goal !== 'lobby') {
      await startGame(host);
      const r = await playUntil(host, fx.goal, fx.min ?? 0);
      if (!r.ok) throw new Error(`Ziel ${fx.goal} nicht erreicht (${r.n} Züge, Phase ${r.phase})`);
      console.log(`${fx.id.padEnd(12)} ${r.n} Züge, Phase ${r.phase}`);
    } else console.log(`${fx.id.padEnd(12)} Lobby`);
    await sleep(300);
    const data = {
      meta: { id: fx.id, game, goal: fx.goal, seats: fx.seats, long: !!fx.long, screen: fx.screen },
      host: await savedHost(host),
      guest,
    };
    if (errors.length) console.log(`  Fehler der Seite: ${errors.join(' | ')}`);
    return data;
  } finally {
    await ctx.close();
    if (gctx) await gctx.close();
  }
}

/** Direkt aufgerufen: Stände erzeugen. Als Modul importiert: nur Katalog und Hilfen. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const games = arg('games', 'shithead,durak,cabo,schnautz').split(',');
  const only = arg('only', '')
    .split(',')
    .filter((x) => x);
  const dir = resolve(arg('dir', FIXTURE_DIR));
  mkdirSync(dir, { recursive: true });
  const stop = await serve();
  const browser = await launch();
  let bad = 0;
  try {
    for (const game of games)
      for (const fx of catalog(game)) {
        if (only.length && !only.includes(fx.id)) continue;
        try {
          const data = await make(browser, game, fx);
          writeFileSync(join(dir, `${fx.id}.json`), `${JSON.stringify(data)}\n`);
        } catch (e) {
          bad++;
          console.log(`${fx.id}: FEHLER ${e.message}`);
        }
      }
  } finally {
    await browser.close();
    await stop();
  }
  // Wie npm run format, damit die CI die neuen Stände nicht anmeckert
  spawnSync('npx', ['prettier', '--write', join(dir, '*.json')], { cwd: REPO, stdio: 'ignore' });
  console.log(bad ? `${bad} Stände fehlen` : `fertig, Stände in ${dir}`);
  process.exitCode = bad ? 1 : 0;
}
