/*
 * Ergebnisblätter der vier Spiele bei Partieende und Rundenende, gemessen auf mehreren Größen, beim Gastgeber und
 * bei einem Gast. Der Weg dorthin ist der Zeitraffer aus dem Dev-Menü (src/dev/menu.ts), wie ihn ein Mensch antippen
 * würde.
 *
 *   node tests/design/result.mjs [--games=shithead,durak,cabo,schnautz] [--states=over,overwin,overlose,round]
 *     [--seats=8] [--sizes=360x640,375x548,390x844] [--roles=host,guest] [--ready|--guest-ready] [--hard] [--long]
 *     [--shots] [--out=DIR] [--port=5173] [--peer=9000] [--serve]
 *
 * `--ready`: danach meldet sich der Gastgeber bereit, der Gast noch nicht. Gemessen wird der Gastgeber mit Wartetext
 * und „Nicht warten“ (`host-ready`), das ist die vollste Fußzeile. Dazu zwei nachgestellte Lagen, bei denen nur die
 * Ansicht der gemessenen Seite geändert wird: Fünf Leute fehlen noch (`host-crowd`, vier KIs gelten dafür als
 * Menschen) und der Gast ist bereit, der Gastgeber nicht (`guest-fake`). `--guest-ready` statt `--ready`: echt
 * gemeldet hat sich nur der Gast (`guest-ready`), zusammen geht es nicht, sonst beginnt die nächste Runde.
 * Gekürzter Wartetext ist ein Befund, auch wenn er erst mit einer späteren Zahl des Countdowns kippen würde.
 * `--hard`: Härtefälle im Spielstand des Gastgebers nachstellen, die der Zufall selten trifft (Shithead und Durak
 * mit 12 Restkarten und drei Tipps, Cabo daneben mit 6 Karten beim Rufer). Mit `--long` heißt auch der Gastgeber
 * 16 Zeichen lang.
 *
 * Schnautz und Cabo starten die nächste Runde nach 10 Sekunden. Was danach noch fehlt, steht als „nicht gemessen“
 * in der Liste. Mit `--ready` deshalb je Größe ein Lauf (`--sizes=360x640`, dann `--sizes=375x548` und so weiter).
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

/** Härtefall: auch der Gastgeber mit 16 Zeichen */
const LONG_HOST = 'Tahna-Kristoffer';

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
    // Breiteste Kernzahlen: Zähler früherer Partien, Shithead auch beim Ersten mit Krone
    if (g === 'shithead' && r.ranking?.length) {
      r.ranking.forEach((id) => {
        const p = st.players.find((x) => x.id === id);
        if (p) p.shc = 2;
      });
      what += ', 2× Shithead an allen';
    }
    // Durak: Krone mit „zuerst fertig“, daneben ein geteilter Platz 1 („gleichzeitig fertig“), der Rest mit Zähler
    if (g === 'durak' && r.ranking?.length > 2) {
      r.ranking.forEach((id, i) => {
        const p = st.players.find((x) => x.id === id);
        if (!p) return;
        if (i === 1) p.place = 1;
        if (i >= 2) p.dkc = 2;
      });
      st.winner = r.ranking[0];
      what += ', geteilter Platz 1, 2× Durak';
    }
    // Schnautz: jede Art Zeile einmal, mit dem breitesten Handwert (30,5) und dem Gast in der engsten Zeile
    if (g === 'schnautz' && r.changes) {
      const drei = (x) => ['H', 'S', 'C'].map((s) => s + x);
      const guest = st.players.find((p) => !p.bot && p.id !== st.host);
      const host = st.players.find((p) => p.id === st.host);
      const bots = st.players.filter((p) => p.bot);
      if (st.phase === 'end' && guest && bots.length >= 6) {
        st.rules.lives = 6;
        for (const p of st.players) {
          r.hands[p.id] = drei(['K', 'D', 'B', '10', '9', '8', '7', 'A'][st.players.indexOf(p) % 8]);
          r.vals[p.id] = { v: 20, kind: 'normal', suit: null };
          p.out = false;
          p.lives = 6;
        }
        const [k, l1, sw, out, best, knock] = bots;
        r.changes = {
          [k.id]: { n: 1, to: 'life' },
          [l1.id]: { n: 1, to: 'life' },
          [guest.id]: { n: 1, to: 'life' },
          [sw.id]: { n: 1, to: 'swim' },
          [out.id]: { n: 1, to: 'out' },
        };
        sw.lives = 0;
        out.lives = 0;
        r.losers = [k.id, l1.id, guest.id, sw.id, out.id];
        r.vals[best.id] = { v: 30.5, kind: 'drei', suit: null };
        r.reason = 'knock';
        r.by = null;
        r.knocker = knock.id;
        what = `Rundenende mit 💔 🛟 🫧 👑, ${host?.name ?? 'Gastgeber'} mit 6 Leben, geklopft`;
      }
      if (st.phase === 'over' && guest) {
        const down = [guest, ...bots].filter((p) => p.id !== st.winner).slice(0, 2);
        r.changes = Object.fromEntries(down.map((p) => [p.id, { n: 1, to: 'out' }]));
        down.forEach((p, i) => (r.hands[p.id] = drei(['K', 'D'][i])));
        let round = 21;
        for (const p of st.players) {
          if (p.id === st.winner) continue;
          p.out = true;
          p.outRound = down.includes(p) ? 21 : --round;
        }
        what = 'Partieende, zuletzt untergegangen mit 30,5, Runden zweistellig';
      }
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

/** Wartetext in der Knopfreihe: Text, Breite und ob er gekürzt ist, dazu ob die Knopfreihe umbricht. */
async function waitInfo(page) {
  return page.evaluate(() => {
    // Wie `overflows` in src/ui/render/result.ts mit Bruchteilen: `scrollWidth` ist gerundet und gleicht
    // `clientWidth` oft auch dann, wenn schon Auslassungspunkte stehen
    const overBy = (e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getBoundingClientRect().width - e.getBoundingClientRect().width;
    };
    const el = document.querySelector('#overlay .paper.result .foot.rbtns .waittxt');
    if (!el) return null;
    // Umbruch heißt: ein Kind beginnt unter dem ersten. Die Höhe der Reihe taugt nicht, sie hat oben Innenabstand
    const tops = [...el.parentElement.children].map((c) => c.getBoundingClientRect());
    // Der Countdown zählt weiter herunter: Mit welchen noch kommenden Zahlen liefe die sichtbare Fassung über?
    const cd = [...el.children].find((f) => !f.hidden)?.querySelector('.nextcd');
    const now = cd?.textContent ?? '';
    const cdCut = [];
    for (let k = Math.max(10, Number(now) || 0); cd && k >= 0; k--) {
      cd.textContent = String(k);
      if (overBy(el) > 0.01) cdCut.push(k);
    }
    if (cd) cd.textContent = now;
    return {
      // Sichtbare Fassung, die übrigen sind hidden (fitWait in src/ui/render/result.ts)
      text: el.innerText,
      forms: el.children.length,
      cw: el.clientWidth,
      sw: el.scrollWidth,
      // Streng: schon ein Bruchteil zu viel zeigt Auslassungspunkte
      cut: overBy(el) > 0.01,
      wraps: tops.some((r) => r.top >= tops[0].bottom - 1),
      cdCut,
    };
  });
}

/**
 * Zeilen des Blatts: gekürzte Namen (mit Bruchteilen gemessen), knappste Luft neben einem Namen, welche Stufe fitRows
 * gewählt hat (kurz, klein, darunter), Zeilen ohne sichtbare Kernzahl und sichtbare ⏳ gegen die, auf die gewartet wird.
 */
async function rowInfo(page) {
  return page.evaluate(() => {
    const overBy = (e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getBoundingClientRect().width - e.getBoundingClientRect().width;
    };
    const s = window.__schnautz;
    const v = s?.App.view;
    const me = v?.players.find((p) => p.id === s.App.me);
    const sheet = document.querySelector('#overlay .paper.result');
    const rows = [...sheet.querySelectorAll('.row.rr')];
    const nm = (row) => row.querySelector(':scope > .rnm');
    const cutNames = rows
      .filter((row) => overBy(nm(row)) > 0.01)
      .map((row) => `${nm(row).innerText.trim()} (${overBy(nm(row)).toFixed(1)} px)`);
    const nameRoom = Math.min(...rows.map((row) => Math.floor(-overBy(nm(row)))));
    const isShort = (row) => row.querySelector(':scope > .rcore > .cf + .cf:not([hidden])') != null;
    const fit = {
      kurz: rows.filter(isShort).length,
      klein: rows.filter((r) => r.classList.contains('snug')).length,
      darunter: rows.filter((r) => r.classList.contains('under')).length,
    };
    // Ohne sichtbare Kernzahl, Deckel und Zeichen zählen mit, sie haben keinen Text
    const empty = rows
      .filter((row) => (row.querySelector(':scope > .rcore')?.getBoundingClientRect().width ?? 0) < 1)
      .map((row) => nm(row).innerText.trim());
    const marks = [...sheet.querySelectorAll('.rwait')].filter((w) => !w.hidden && w.getClientRects().length).length;
    const waits = me?.ready
      ? v.players.filter((p) => p.online && !p.ready && !p.bot && p.id !== me.id && (v.phase === 'over' || !p.out))
          .length
      : 0;
    // Höhe aller Zeilen zusammen, zum Vergleich vor und nach dem Bereitmelden
    const rowsH = Math.round(sheet.querySelector('.rows').getBoundingClientRect().height);
    return { cutNames, nameRoom, fit, empty, marks, waits, rowsH };
  });
}

/**
 * Nur die Ansicht der gemessenen Seite ändern und neu zeichnen, wie sie der Gastgeber in dieser Lage schicken würde:
 * `meReady` meldet mich bereit, `extra` KIs gelten als Menschen, die noch nicht bereit sind. Die nächste echte Ansicht
 * überschreibt das wieder, deshalb vor jeder Größe neu. Gibt zurück, auf wie viele das Blatt dann wartet.
 */
async function fakeWait(page, { meReady = false, extra = 0 } = {}) {
  return page.evaluate(
    ([ready, more]) => {
      const s = window.__schnautz;
      const v = JSON.parse(JSON.stringify(s.App.view));
      const me = v.players.find((p) => p.id === s.App.me);
      if (!me) return -1;
      if (ready) me.ready = true;
      // Die Ansicht kann schon von der letzten Größe nachgestellt sein: nur so viele dazu, bis es `more` sind
      let k = v.players.filter((p) => p.fake).length;
      for (const p of v.players) {
        if (p.id === me.id) continue;
        if (!p.bot) p.ready = false;
        else if (k < more && (v.phase === 'over' || !p.out)) {
          p.bot = false;
          p.online = true;
          p.ready = false;
          p.fake = true;
          k++;
        }
      }
      s.applyView(v);
      return v.players.filter((p) => p.online && !p.ready && !p.bot && p.id !== me.id && (v.phase === 'over' || !p.out))
        .length;
    },
    [meReady, extra],
  );
}

/** Alle Größen auf einer Seite messen, solange die Phase noch stimmt. `prep` läuft vor jeder Messung. */
async function measureAll(page, role, tag, phase, prep = null) {
  for (const size of sizes) {
    await page.setViewportSize(parseSize(size));
    await sleep(500);
    const v = await view(page);
    if (v?.phase !== phase) {
      console.log(`${tag} ${role} ${size}: Phase schon ${v?.phase}, nicht gemessen`);
      rows.push({ ...meta, role, size, verdict: `nicht gemessen (Phase ${v?.phase})` });
      continue;
    }
    const waits = prep ? await prep() : null;
    if (prep) await sleep(150);
    const m = await sheetInfo(page);
    if (!m) {
      rows.push({ ...meta, role, size, verdict: 'kein Ergebnisblatt' });
      continue;
    }
    const w = await waitInfo(page);
    const ri = await rowInfo(page);
    const { cutNames } = ri;
    const bad = [
      m.over > 1 && `scrollt ${m.over}px`,
      m.paperBottom > parseSize(size).height + 1 && `Blatt endet bei ${m.paperBottom}`,
      m.me === false && 'eigene Zeile verdeckt',
      m.loser === false && 'Verlierer verdeckt',
      w?.cut && `Wartetext gekürzt (${w.sw}>${w.cw}) „${w.text}“`,
      w?.cdCut.length && `Wartetext kippt bei ${w.cdCut.join(', ')} s`,
      w?.wraps && 'Knopfreihe bricht um',
      prep && !w && 'kein Wartetext',
      cutNames.length && `Namen gekürzt: ${cutNames.join(' / ')}`,
      ri.marks !== ri.waits && `⏳ an ${ri.marks} Zeilen, gewartet wird auf ${ri.waits}`,
    ].filter(Boolean);
    rows.push({ ...meta, role, size, waits, wait: w, ...ri, verdict: bad.join(', ') || 'ok', ...m });
    const wt = w ? ` „${w.text}“ ${w.sw}/${w.cw}` : '';
    const fit = Object.entries(ri.fit)
      .filter(([, n]) => n)
      .map(([k, n]) => `${k} ${n}`)
      .join(' ');
    const extra = `${fit ? ` [${fit}]` : ''}${ri.empty.length ? ` leer: ${ri.empty.join(' / ')}` : ''}${ri.marks ? ` ⏳${ri.marks}` : ''}`;
    console.log(
      `${tag} ${role.padEnd(11)} ${size.padEnd(8)} Zeilen ${m.rows} h${ri.rowsH}${wt}${extra} => ${bad.join(', ') || 'ok'}`,
    );
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
        const code = await hostTable(pages.host, flag('long') ? LONG_HOST : 'Tahna');
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
        if (flag('guest-ready') && pages.guest) {
          // Echt: der Gast meldet sich bereit, der Gastgeber nicht
          await pages.guest.click('#overlay [data-act=ready]');
          await sleep(400);
          await measureAll(pages.guest, 'guest-ready', tag, phase);
        } else if (flag('ready') && pages.guest) {
          // Gastgeber bereit, der Gast noch nicht: Wartetext und „Nicht warten“ in der Fußzeile
          await pages.host.click('#overlay [data-act=ready]');
          await sleep(400);
          await measureAll(pages.host, 'host-ready', tag, phase);
          // Nachgestellt: fünf fehlen noch, die Kurzform mit Zahl
          await measureAll(pages.host, 'host-crowd', tag, phase, () => fakeWait(pages.host, { extra: 4 }));
          // Nachgestellt: der Gast ist bereit, der Gastgeber noch nicht
          await measureAll(pages.guest, 'guest-fake', tag, phase, () => fakeWait(pages.guest, { meReady: true }));
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
