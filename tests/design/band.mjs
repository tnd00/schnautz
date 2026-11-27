#!/usr/bin/env node
/*
 * Lage der Meldungen am Tisch (src/ui/band.ts, src/ui/feedback.ts) mit echten Effektwegen und allen echten Sprüchen
 * aus dem Topf, 8 Plätze, Gegner „Lena“ und Namen mit 16 Zeichen, als Gastgeber und als Gast.
 *
 *   node tests/design/band.mjs --serve [--games=shithead,durak,cabo,schnautz] [--roles=host,guest]
 *     [--sizes=360x640,375x548,390x844,1280x860]
 *     [--checks=swap,pair,big,reason,spy,emoturn,still,under,emo,playfor,seat]
 *     [--shots] [--look=sticker|legacy] [--theme=light|dark] [--out=DIR]
 *
 * Prüfungen (je Zeile ein Urteil, Befunde stehen in band.json):
 *   swap    Shithead-Tauschrunde: große Meldung und Hinweis über dem eigenen Platz, nie über Karten oder Gegnern
 *   pair    am eigenen Zug Hinweis und Spruch zusammen, sichtbar und nicht abgeschnitten (Durak: Aufnehmen und
 *           Nehmen anderer, Shithead: Aufnehmen ab 6 Karten), jeder Spruch des Topfs mit „Lena“ und langem Namen
 *   big     am eigenen Zug große Meldungen des Spiels (Durak: Weiterschieben an dich, Bito anderer und eigener),
 *           Titel und Unterzeile vollständig, nichts über Stapel, Regelzeile, Gegnern oder eigenem Platz
 *   reason  während eine große Meldung steht: Grund über den echten Weg (ausgegraute Karte, Knopf ohne Auswahl,
 *           sonst showReject) und Automatisches („Zeit um“) liegen oben und decken die Hauptzeile der Statuszeile
 *           nicht, bei Shithead auch nicht die Unterzeile. Dazu der Grund allein. Bleibt neben Grund und
 *           Automatischem nicht einmal der ganze Titel der großen Meldung oder schnitte sie eine Zeile der
 *           Statuszeile an, schließt sie („ok, große geschlossen“).
 *           Weicht Automatisches dem Grund, muss es danach erscheinen („ok, gewichen und nachgeholt“)
 *   spy     Cabo beim Spionieren: Tipp auf eine eigene Karte, der Grund deckt weder Haupt- noch Unterzeile
 *   still   große Meldung im Band, dann Zugwechsel: sie blendet sich nicht noch einmal ein (Durak: Passen oder Aufnehmen)
 *   under   nicht am Zug steht eine kleine Meldung an der Stapelkante, dann kommt eine große (Shithead: Bombe außer der
 *           Reihe mit dem längsten Spruch, „wirft 4er rein“ und danach vier voll): Die kleine schneidet die große
 *           nicht, sie blendet aus („ok, kleine ausgeblendet“)
 *   emoturn am eigenen Zug mit offenem Reaktionsfenster (Handy): nie über Gegnern oder Fenster, der Stapel darf weichen,
 *           seine Regelzeile wird dann ganz oder gar nicht gedeckt
 *   emo     nicht am Zug, Reaktionsfenster offen: Meldungen nie über den Gegnern oder dem Fenster
 *   playfor nur Gastgeber, nicht am Zug, jemand am Zug ist offline: „Für … spielen“ steht in der Statuszeile, große und
 *           kleine Meldung decken den Knopf nicht (mit und ohne Reaktionsfenster)
 *   seat    Rundenende (Schnautz, Cabo) und Partieende mit offenem Ergebnisblatt: Sitzmeldung als Toast zu sehen, je Größe
 * Jede Messung prüft dazu, dass am Handy nichts scrollt. `still` läuft je Größe am Ende des eigenen Zugs. Schneidet
 * die Bühne die Hauptzeile der Statuszeile an oder mindestens ein Drittel der Unterzeile, ist das ein Befund (src/ui/
 * band.ts, cutsStatus, was kleine Meldungen vom Rest der Zeile decken, zählt mit, eine Lücke mitten in der Zeile
 * nicht), ein kleinerer Anschnitt der Unterzeile steht als Vermerk in der Zusammenfassung.
 *
 * Läuft gegen den Dev-Server (`--serve` oder `--port`) und lädt die Module über /src. Gegen einen Build geht es nur,
 * wenn der Build sie als `window.__probe` mitbringt (siehe README.md).
 */
import {
  arg,
  chooseGame,
  context,
  devJump,
  fillSeats,
  hostTable,
  isPhoneSize,
  joinTable,
  launch,
  LONG_GUEST,
  LOOKS,
  THEMES,
  measure,
  parseSize,
  poll,
  save,
  serve,
  shot,
  sizeList,
  sleep,
  startGame,
  view,
  waitResult,
  watchErrors,
} from './lib.mjs';

const games = arg('games', 'shithead,durak,cabo,schnautz').split(',');
const roles = arg('roles', 'host,guest').split(',');
const sizes = sizeList(arg('sizes', '360x640,375x548,390x844,1280x860'));
const checks = arg('checks', 'swap,pair,big,reason,spy,emoturn,still,under,emo,playfor,seat').split(',');
const LONG = 'Wolfgang-Amadeu0';
/** Ein Look und ein Thema je Lauf (--look, --theme aus lib.mjs), ohne Angabe der Standard der Seite */
const LOOK = { look: LOOKS[0], theme: THEMES[0] };
const OVER = { shithead: 'sh-any', durak: 'dk-any', cabo: 'cb-win', schnautz: 'sz-win' };
const ROUND = { cabo: 'cb-round', schnautz: 'sz-round' };

const rows = [];
const errors = [];
const log = (...a) => console.log(...a);

/** Module der Seite: im Build über window.__probe, sonst vom Dev-Server. Dazu die Messung einer Meldung. */
function initPage() {
  window.__bandMods = async () => {
    if (window.__probe) return window.__probe;
    const imp = (p) => import(/* @vite-ignore */ p);
    const [feedback, helpers, taunts, seat, effects, tauntUi, sh, dk, cb, sz] = await Promise.all(
      [
        '/src/ui/feedback.ts',
        '/src/ui/helpers.ts',
        '/src/content/taunts.ts',
        '/src/content/texts/seat.ts',
        '/src/ui/effects.ts',
        '/src/ui/taunts.ts',
        '/src/ui/shithead/effects.ts',
        '/src/ui/durak/effects.ts',
        '/src/ui/cabo/effects.ts',
        '/src/ui/schnautz/effects.ts',
      ].map(imp),
    );
    return {
      feedback,
      helpers,
      taunts,
      seat,
      effects,
      tauntUi,
      fx: { shithead: sh, durak: dk, cabo: cb, schnautz: sz },
    };
  };
  /** Sichtbar, nicht verdeckt, nicht abgeschnitten, nichts aus `obst` überdeckt? */
  window.__bandInspect = (el, obst) => {
    const nm = (e) =>
      e.tagName.toLowerCase() +
      (e.id ? `#${e.id}` : '') +
      (typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).join('.')}` : '');
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' ? r : null;
    };
    if (!el) return { missing: true };
    const r = vis(el);
    const text = (el.textContent || '').trim();
    if (!r) return { name: nm(el), text, hidden: true };
    const hits = [];
    for (const sel of obst)
      for (const o of document.querySelectorAll(sel)) {
        if (o === el || el.contains(o) || o.contains(el)) continue;
        const q = vis(o);
        if (!q) continue;
        const x = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const y = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (x > 1 && y > 1) {
          hits.push(`${sel} ${Math.round(y)}px`);
          break;
        }
      }
    // Liegt etwas davor? pointer-events kurz an, damit elementFromPoint die Meldung überhaupt sieht
    const pe = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    el.style.pointerEvents = pe;
    const covered = top && top !== el && !el.contains(top) ? nm(top) : null;
    // Abgeschnitten heißt: der Inhalt ist größer als ein Kasten, der ihn kappt (overflow oder line-clamp). Zwei
    // Pixel Spiel für Unterlängen kursiver Schrift
    const clip = [];
    for (const e of [el, ...el.querySelectorAll('*')]) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || !e.clientHeight || !e.clientWidth) continue;
      const cuts = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.webkitLineClamp !== 'none';
      if (cuts && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2))
        clip.push(`${nm(e)} ${e.scrollWidth}x${e.scrollHeight}>${e.clientWidth}x${e.clientHeight}`);
    }
    const drop = [...el.classList].filter((c) => c.startsWith('d-'));
    const R = (x) => Math.round(x);
    // Wie weit die Meldung auf den Rand des eigenen Platzes reicht (erlaubt bis 8 px, nie auf seinen Inhalt)
    const me = document.querySelector('#me')?.getBoundingClientRect();
    const meEdge = me && r.bottom > me.top && r.top < me.top ? R(r.bottom - me.top) : 0;
    // Zeilen der Statuszeile und Regelzeilen am Stapel, die nur zum Teil bedeckt sind (mehr als die Unterlängen,
    // weniger als die ganze Zeile)
    // Was ein offenes Reaktionsfenster verdeckt, zählt nicht zur Zeile
    const em = document.body.classList.contains('emoopen') ? vis(document.querySelector('#emotes')) : null;
    // Andere Meldungen liegen mit über der Zeile: Was sie vom Rest decken, zählt mit (Lücken bis 3 px dazwischen auch)
    const others = [...document.querySelectorAll('#fly .mid:not(.out), #announce .ann:not(.out)')]
      .filter((o) => o !== el && !el.contains(o) && !o.contains(el))
      .map(vis)
      .filter(Boolean);
    const coveredIn = (b, bt, bb) => {
      const spans = [r, ...others]
        .filter((q) => Math.min(q.right, b.right) - Math.max(q.left, b.left) > 2)
        .map((q) => [Math.max(q.top, bt), Math.min(q.bottom, bb)])
        .filter(([t, u]) => u > t)
        .sort((p, q) => p[0] - q[0]);
      const parts = [];
      for (const [t, u] of spans) {
        const cur = parts[parts.length - 1];
        if (cur && t <= cur[1] + 3) cur[1] = Math.max(cur[1], u);
        else parts.push([t, u]);
      }
      // Eine Lücke mitten in der Zeile (Schrift schaut zwischen zwei Meldungen hervor) gilt als ungedeckt. Bis 3 px
      // zählen als gedeckt (src/ui/band.ts rechnet mit 2 px, Rundungen der Messung kommen dazu)
      return parts.length > 1 ? 0 : parts.reduce((n, [t, u]) => n + u - t, 0);
    };
    const part = [];
    for (const sel of ['#status .main', '#status .sub', '#center .cnt'])
      for (const q of document.querySelectorAll(sel)) {
        const b = vis(q);
        if (!b) continue;
        const bt = b.top;
        const bb = em && em.top > bt && em.top < b.bottom ? em.top : b.bottom;
        const y = Math.min(r.bottom, bb) - Math.max(r.top, bt);
        const x = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        // Von der Unterzeile dürfen ihre Unterlängen frei bleiben (4 px, src/ui/band.ts, DESC)
        const left = sel === '#status .sub' ? 4 : 3;
        if (x > 2 && y > 3 && coveredIn(b, bt, bb) < bb - bt - left)
          part.push(`${sel} ${Math.round(y)}/${Math.round(bb - bt)}px`);
      }
    // Kanten der Umgebung (oben, unten) zum Nachrechnen in band.json
    const geo = {};
    for (const q of [
      '#opps',
      '#center',
      '#center .cnt',
      '#status .main',
      '#status .sub',
      '#status .quick',
      '#emotes',
      '#me',
    ])
      for (const [k, e] of [...document.querySelectorAll(q)].entries()) {
        const b = vis(e);
        if (b) geo[k ? `${q} ${k}` : q] = [R(b.top), R(b.bottom)];
      }
    return {
      name: nm(el),
      text: text.slice(0, 120),
      rect: [R(r.left), R(r.top), R(r.right), R(r.bottom)],
      geo,
      part,
      hits,
      covered,
      clip,
      drop,
      meEdge,
      // Knöpfe statt der Unterzeile (4er, Bombe): Ihnen weicht notfalls der Stapel (src/ui/band.ts, stageRoom)
      quick: !!document.querySelector('#status .quick') && !!vis(document.querySelector('#status .quick')),
    };
  };
}

/** Gemessene Seite am eigenen Zug? Ablauf, Tauschrunde und Ansehen schließt der Gastgeber. */
async function waitMyMove(page, host) {
  return poll(
    async () => {
      const v = await view(page);
      if (!v) return false;
      if (v.phase === 'swap' || v.phase === 'peek') {
        await host.evaluate(() => {
          const s = window.__schnautz;
          if (!s.act(s.H.st, s.App.me, { type: 'force' })) s.hostCommit();
        });
        return false;
      }
      // Schnautz: Wer gibt, wählt zuerst. Ist das ein Mensch (Gastgeber oder Gast), behält er sein Blatt
      if (v.phase === 'choose') {
        for (const p of new Set([page, host]))
          if (await p.locator('[data-act=keep]').isVisible()) await p.click('[data-act=keep]');
        return false;
      }
      const mine = await page.evaluate(async () => {
        const s = window.__schnautz;
        if (s.SEQ.busy) return false;
        return (await window.__bandMods()).helpers.myMoveNow(s.App.view);
      });
      // Misst der Gast, ist der Gastgeber ein Mensch ohne KI: Sein Zug kommt wie von einer KI
      if (!mine && page !== host) {
        const hid = await host.evaluate(async () => {
          const s = window.__schnautz;
          return !s.SEQ.busy && (await window.__bandMods()).helpers.myMoveNow(s.App.view) ? s.App.me : null;
        });
        if (hid) await passTurn(host, hid);
      }
      return mine;
    },
    { timeout: 60_000, every: 300, what: 'eigener Zug' },
  ).catch((e) => {
    log(`  (nicht am Zug: ${e.message})`);
    return false;
  });
}

/** Meldungen wegräumen, damit jede Prüfung für sich steht. */
async function clear(page) {
  await page.evaluate(async () => {
    const { feedback } = await window.__bandMods();
    feedback.resetAnnouncements();
    document.querySelectorAll('#fly .mid, #toasts .toast').forEach((x) => x.remove());
  });
  await sleep(120);
}

/** Echten Effektweg eines Spiels mit diesen Logeinträgen laufen lassen. `prevDk` ergänzt den Stand davor (Durak). */
async function fx(page, game, entries, prevDk = null) {
  await page.evaluate(
    async ([game, entries, prevDk]) => {
      const s = window.__schnautz;
      const M = await window.__bandMods();
      const v = s.App.view;
      const me = s.App.me;
      const ids = { ME: me, ...window.__ids };
      const fresh = entries.map((e, i) => {
        const x = { n: e.n ?? 90000 + i * 3, ...e };
        for (const k of ['p', 'to']) if (ids[x[k]]) x[k] = ids[x[k]];
        if (x.p) x.name = v.players.find((p) => p.id === x.p)?.name;
        return x;
      });
      const prev = prevDk ? { ...v, dk: { ...v.dk, ...prevDk } } : v;
      const c = { prev, v, fresh, me, seqd: false };
      M.feedback.beginBatch(fresh);
      for (const e of fresh) M.fx[game][`${game}Effect`](c, e);
    },
    [game, entries, prevDk],
  );
}

/**
 * Hindernisse am eigenen Zug: Stapel samt Regelzeile, Gegner, Inhalt des eigenen Platzes und seine runden Knöpfe. Den
 * Rand des eigenen Platzes dürfen kleine Meldungen bis 8 px decken (src/ui/band.ts, dip), das prüft `judge`.
 */
const TURN_OBST = [
  '#center',
  '#center .cnt',
  '#center *',
  '#opps .opp',
  '#me .mehead',
  '#me .swhead',
  '#me .card',
  '#me .actions',
  '#emofab',
  '#logfab',
  '#status .quick',
];
/** So weit darf eine kleine Meldung höchstens auf den Rand des eigenen Platzes */
const ME_EDGE = 8;

function judge(o, { need = [], edge = true } = {}) {
  if (!o || o.missing) return 'fehlt';
  if (o.hidden) return 'unsichtbar';
  const bad = [];
  if (o.covered) bad.push(`verdeckt von ${o.covered}`);
  // Stehen Knöpfe in der Statuszeile, darf jede Meldung über den Stapel (src/ui/band.ts, give)
  const yielded = o.quick ? (o.hits ?? []).filter((h) => h.startsWith('#center')) : [];
  const hits = (o.hits ?? []).filter((h) => !yielded.includes(h));
  if (hits.length) bad.push(`über ${hits.join(', ')}`);
  if (o.clip?.length) bad.push(`abgeschnitten ${o.clip.join(', ')}`);
  // Kleine Meldungen am Zug höchstens 8 px auf den Rand. In der Tauschrunde dürfen Meldungen auf den Kopf am Platz
  // (`edge: false`), dort zählen nur Karten, Knöpfe und Gegner
  if (edge && /\.(nopelbl|fieldlbl)\b/.test(o.name ?? '') && o.meEdge > ME_EDGE)
    bad.push(`${o.meEdge}px auf dem eigenen Platz`);
  const cut = partSplit(o).bad;
  if (cut) bad.push(cut);
  for (const t of need) if (!o.text.includes(t)) bad.push(`ohne „${t.slice(0, 30)}“`);
  return bad.length ? bad.join('; ') : yielded.length ? 'ok, Stapel weicht den Knöpfen' : 'ok';
}

/**
 * Deckt die Bühne (große Meldung, Hinweis mit Spruch) eine Zeile der Statuszeile nur zum Teil? Die Hauptzeile ist
 * immer ein Befund, die Unterzeile ab einem Drittel ihrer Höhe (src/ui/band.ts, cutsStatus). Ein kleinerer Anschnitt
 * der Unterzeile steht unter „Vermerke“ in der Zusammenfassung.
 */
function partSplit(o) {
  const stage = /\.(ann|tauntlbl)\b/.test(o?.name ?? '');
  const bad = [];
  const note = [];
  for (const p of stage ? (o?.part ?? []).filter((x) => x.startsWith('#status')) : []) {
    const m = /(\d+)\/(\d+)px$/.exec(p);
    const [y, len] = m ? [Number(m[1]), Number(m[2])] : [1, 1];
    (p.startsWith('#status .main') || y >= len / 3 ? bad : note).push(p);
  }
  const say = (x) => (x.length ? `schneidet ${x.join(', ')} an` : '');
  return { bad: say(bad), note: say(note) };
}
const partNote = (o) => partSplit(o).note;

async function record(page, meta, o, extra = {}) {
  const m = await measure(page);
  const scroll = isPhoneSize(meta.size) && (m.vScroll || m.hScroll) ? `scrollt ${m.docH}/${m.h}` : '';
  const j = extra.verdict ?? judge(o, extra);
  // Ein „ok, …“ nach Regel wird zum Befund, sobald die Seite scrollt
  const v = scroll ? [j.startsWith('ok') ? '' : j, scroll].filter(Boolean).join('; ') : j;
  const note = extra.note ?? partNote(o);
  rows.push({ ...meta, verdict: v, o, ...(note ? { note } : {}), ...extra.data });
  log(
    `${meta.game.padEnd(8)} ${meta.role.padEnd(5)} ${meta.size.padEnd(9)} ${meta.check.padEnd(22)} => ${v}` +
      (note ? `  [${note}]` : ''),
  );
  return v;
}

async function inspect(page, sel, obst) {
  return page.evaluate(([sel, obst]) => window.__bandInspect(document.querySelector(sel), obst), [sel, obst]);
}

/** Hinweis und Spruch am eigenen Zug, jeder Spruch des Topfs einmal. */
async function checkPair(page, meta, game) {
  const cases = {
    durak: [
      ['dkBigPickupOther', (n) => ({ k: 'dkpickup', p: 'OPP', cnt: 7, n })],
      ['dkTakeOther', (n) => ({ k: 'dktake', p: 'OPP', n }), 3],
    ],
    shithead: [['pickupOther', (n) => ({ k: 'shpickup', p: 'OPP', cnt: 7, n })]],
  }[game];
  if (!cases) return;
  for (const [cat, make, step = 1] of cases)
    for (const who of ['LENA', 'LONG']) {
      // Lognummern, die jeden Spruch des Topfs genau einmal treffen
      const ns = await page.evaluate(
        async ([cat, step, who]) => {
          const M = await window.__bandMods();
          const v = window.__schnautz.App.view;
          const name = v.players.find((p) => p.id === window.__ids[who])?.name;
          const want = M.taunts.TAUNT_SCREEN[cat].length;
          const seen = new Map();
          for (let n = 90000; seen.size < want && n < 99999; n += step) {
            const t = M.tauntUi.taunt(cat, { name, n: 7 }, n);
            if (!seen.has(t)) seen.set(t, n);
          }
          return [...seen.values()];
        },
        [cat, step, who],
      );
      let ok = 0;
      let yields = 0;
      const bad = [];
      const notes = [];
      for (const [k, n] of ns.entries()) {
        await clear(page);
        await page.evaluate((who) => (window.__ids.OPP = window.__ids[who]), who);
        await fx(page, game, [make(n)]);
        await sleep(450);
        const o = await inspect(page, '#fly .tauntlbl:not(.out)', TURN_OBST);
        const hint = await page.evaluate(
          () => document.querySelector('#fly .tauntlbl:not(.out) .hint')?.textContent ?? '',
        );
        const j = judge(o);
        const v = j.startsWith('ok') && /nimmt/.test(hint) ? j : `${j}${/nimmt/.test(hint) ? '' : '; ohne Hinweis'}`;
        if (v.startsWith('ok')) ok++;
        else bad.push({ n, v, text: o?.text });
        if (v !== 'ok' && v.startsWith('ok')) yields++;
        if (partNote(o)) notes.push(partNote(o));
        if (k === 0) await shot(page, `band-${meta.game}-${meta.role}-pair-${cat}-${who}-${meta.size}`);
      }
      await record(page, { ...meta, check: `pair ${cat} ${who}` }, null, {
        verdict: bad.length
          ? `${ok}/${ns.length} gut, ${bad[0].v}`
          : yields
            ? `ok, Stapel weicht den Knöpfen (${yields}/${ns.length})`
            : 'ok',
        note: notes.length ? `${notes.length}/${ns.length} ${notes[0]}` : '',
        data: { ok, of: ns.length, bad },
      });
    }
}

/** Große Meldungen des Spiels am eigenen Zug: vollständig und nirgends darüber. */
const BIGS = {
  durak: [
    ['transfer', [{ k: 'dktransfer', p: 'LONG', to: 'ME', cards: ['H6'] }], null, ['schiebt weiter an dich!']],
    ['bito', [{ k: 'dkbito', p: 'LONG', cnt: 12 }], { limit: 6 }, ['wehrt alles ab.', 'Bito-Stapel']],
    ['bito-mine', [{ k: 'dkbito', p: 'ME', cnt: 12 }], { limit: 6 }, ['Du wehrst alles ab.', 'Bito-Stapel']],
  ],
  shithead: [['bombe', [{ k: 'shburn', p: 'LONG', four: true, cut: false }], null, ['Bombe']]],
  cabo: [['cabo', [{ k: 'cbcabo', p: 'LONG' }], null, ['Cabo']]],
  schnautz: [['knock', [{ k: 'knock', p: 'LONG' }], null, ['klopft']]],
};

async function checkBig(page, meta, game) {
  for (const [name, entries, prevDk, need] of BIGS[game]) {
    await clear(page);
    await fx(page, game, entries, prevDk);
    await sleep(500);
    const o = await inspect(page, '#announce .ann:not(.out)', TURN_OBST);
    // Durak (Weiterschieben an dich, Bito): nichts darf wegfallen. Sonst ist Weglassen ganzer Teile erlaubt
    const dropped = o?.drop?.length && game === 'durak' ? `Teile weg: ${o.drop.join(' ')}` : '';
    const j = judge(o, { need });
    const v = [j.startsWith('ok') ? '' : j, dropped].filter(Boolean).join('; ') || j;
    await record(page, { ...meta, check: `big ${name}${o?.drop?.length ? ` (ohne ${o.drop.join(' ')})` : ''}` }, o, {
      verdict: v,
    });
    await shot(page, `band-${meta.game}-${meta.role}-big-${name}-${meta.size}`);
  }
}

/** Grund über den echten Weg: ausgegraute Karte oder Knopf ohne Auswahl, sonst showReject mit einem Code des Spiels. */
async function reason(page, game) {
  const tapped = await page.evaluate(async (game) => {
    const q = {
      shithead: '.shme .shhand [data-act=shh].dim',
      durak: '#me [data-act=dkh]:not(.pick)',
      schnautz: '#me [data-act=swap]',
      cabo: '#me .cbrow.mine [data-act]',
    }[game];
    const el = document.querySelector(q);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1 }));
    return true;
  }, game);
  await sleep(250);
  if (tapped && (await page.locator('#fly .nopelbl').count())) return 'Tipp';
  await page.evaluate(async (game) => {
    const { feedback } = await window.__bandMods();
    const r = {
      shithead: [{ e: 'sh.noFit' }, 'shplay'],
      durak: [{ e: 'dk.noBeat' }, 'dkh'],
      cabo: [{ e: 'cb.drawFirst' }, 'cbswap'],
      schnautz: [{ e: 'any.pickCard' }, 'swap'],
    }[game];
    feedback.showReject(r[0], r[1]);
  }, game);
  await sleep(150);
  return 'showReject';
}

async function checkReason(page, meta, game) {
  const keepSub = game === 'shithead';
  const pillObst = [...TURN_OBST, '#status .main', ...(keepSub ? ['#status .sub'] : [])];
  // Grund allein
  await clear(page);
  const via0 = await reason(page, game);
  await sleep(250);
  const o0 = await inspect(page, '#fly .nopelbl:not(.out)', pillObst);
  await record(page, { ...meta, check: `reason ${via0}` }, o0);
  await shot(page, `band-${meta.game}-${meta.role}-reason-${meta.size}`);
  // Automatisches und Grund, jeweils während eine große Meldung steht, dann beide zusammen
  const [, entries, prevDk] = BIGS[game][0];
  const autoObst = [...TURN_OBST, '#status .main'];
  /** Liegen kleine und große Meldung übereinander? */
  const overlap = (o, big) => {
    if (!o?.rect || !big?.rect) return '';
    const y = Math.min(o.rect[3], big.rect[3]) - Math.max(o.rect[1], big.rect[1]);
    const x = Math.min(o.rect[2], big.rect[2]) - Math.max(o.rect[0], big.rect[0]);
    return y > 2 && x > 2 ? `deckt große Meldung ${y}px` : '';
  };
  const withBig = async (label, run, sel, obst, need) => {
    await clear(page);
    await fx(page, game, entries, prevDk);
    await sleep(350);
    // Geplantes Ende der großen Meldung: Fehlt sie vorher, hat die kleine sie nach der Regel geschlossen
    await page.evaluate(async () => (window.__annEnd = (await window.__bandMods()).feedback.ANN.curEnd));
    const via = await run();
    await sleep(300);
    const big = await inspect(page, '#announce .ann:not(.out)', []);
    const closed =
      !!big?.missing && (await page.evaluate(() => Date.now() < window.__annEnd - 50 || window.__annEnd === 0));
    const o = await inspect(page, sel, obst);
    // Bleibt die große stehen, schneidet sie keine Zeile der Statuszeile an (sonst muss sie schließen)
    const bigCut = big?.missing ? '' : partSplit(big).bad;
    const bigNote = big?.missing
      ? closed
        ? ''
        : 'große Meldung schon weg'
      : big?.clip?.length
        ? `große abgeschnitten ${big.clip[0]}`
        : bigCut
          ? `große ${bigCut}`
          : '';
    const v =
      [judge(o, { need }), overlap(o, big), bigNote].filter((x) => x && x !== 'ok').join('; ') ||
      (closed ? 'ok, große geschlossen' : 'ok');
    await record(page, { ...meta, check: `${label}${via ? ` ${via}` : ''}` }, o, { verdict: v, data: { big, closed } });
    return { o, big };
  };
  const autoMsg = () =>
    page.evaluate(async () => {
      const { feedback, seat } = await window.__bandMods();
      const v = window.__schnautz.App.view;
      const name = v.players.find((p) => p.id === window.__ids.LONG)?.name;
      feedback.emit({ level: 'small', sound: true }, { text: seat.SEAT.timeout(name), delay: 0 });
      return '';
    });
  await withBig('auto+big', autoMsg, '#fly .fieldlbl:not(.out)', autoObst, ['Zeit um']);
  await shot(page, `band-${meta.game}-${meta.role}-auto-big-${meta.size}`);
  await withBig('reason+big', () => reason(page, game), '#fly .nopelbl:not(.out)', pillObst, []);
  await shot(page, `band-${meta.game}-${meta.role}-reason-big-${meta.size}`);
  // Beide zusammen: Der Grund steht unten, Automatisches darüber oder es weicht, wenn es die Hauptzeile decken würde.
  // Bliebe von der großen Meldung nicht einmal der ganze Titel, schließt sie
  const t = await withBig(
    'reason+auto+big',
    async () => {
      await autoMsg();
      await sleep(100);
      return reason(page, game);
    },
    '#fly .nopelbl:not(.out)',
    pillObst,
    [],
  );
  const live = '#fly .fieldlbl:not(.out)';
  let auto = await inspect(page, live, autoObst);
  await shot(page, `band-${meta.game}-${meta.role}-reason-auto-big-${meta.size}`);
  if (auto.missing) {
    // Gewichen: Es muss kommen, sobald der Grund weg ist (src/ui/feedback.ts, park), sonst ist es ein Befund
    const back = await poll(() => page.evaluate((q) => !!document.querySelector(q), live), {
      timeout: 4500,
      every: 100,
      what: 'Automatisches nachgeholt',
    }).catch(() => false);
    await sleep(250);
    auto = back ? await inspect(page, live, autoObst) : auto;
    if (back) await shot(page, `band-${meta.game}-${meta.role}-reason-auto-big-later-${meta.size}`);
    const j = back ? judge(auto, { need: ['Zeit um'] }) : 'gewichen und nicht nachgeholt';
    await record(page, { ...meta, check: 'reason+auto+big: auto' }, auto, {
      verdict: j === 'ok' ? 'ok, gewichen und nachgeholt' : j,
    });
    return;
  }
  await record(page, { ...meta, check: 'reason+auto+big: auto' }, auto, {
    verdict: [judge(auto), overlap(auto, t.big)].filter((x) => x && x !== 'ok').join('; ') || 'ok',
  });
}

/** Cabo beim Spionieren: Tipp auf eine eigene Karte, der Grund deckt weder Haupt- noch Unterzeile der Statuszeile. */
async function checkSpy(page, host, meta) {
  await clear(page);
  const power = (on) =>
    host.evaluate(
      ([pid, on]) => {
        const s = window.__schnautz;
        const st = s.H.st;
        if (on) {
          st.cb.hold = null;
          st.cb.power = { by: pid, kind: 'spy', c: 'H9' };
          st.cb.pile.push('H9');
        } else if (st.cb.power) {
          st.cb.power = null;
          st.cb.pile.pop();
        }
        st.n++;
        s.hostCommit();
      },
      [meta.pid, on],
    );
  await power(true);
  const ok = await poll(() => page.evaluate(() => window.__schnautz.App.view?.cb?.power?.kind === 'spy'), {
    timeout: 8000,
    what: 'Spionieren',
  }).catch(() => false);
  await sleep(600);
  if (ok) await page.locator('#me .cbslot[data-act=cbm]').first().click({ force: true }); // trägt ab 4b aria-disabled mit Grund
  await sleep(300);
  const o = await inspect(page, '#fly .nopelbl:not(.out)', [...TURN_OBST, '#status .main', '#status .sub']);
  await record(page, { ...meta, check: 'spy reason' }, o, { verdict: ok ? undefined : 'nicht beim Spionieren' });
  await shot(page, `band-cabo-${meta.role}-spy-${meta.size}`);
  await power(false);
  await sleep(500);
}

/** Zug an die nächste Person: der Gastgeber zieht für den gemessenen Platz wie eine KI. */
async function passTurn(host, pid) {
  return host.evaluate((pid) => {
    const s = window.__schnautz;
    const v = s.viewFor(s.H.st, pid);
    const a = s.botDecide(v);
    if (!a) return 'keine Aktion';
    const e = s.act(s.H.st, pid, a);
    if (!e) s.hostCommit();
    return e ? String(e) : null;
  }, pid);
}

/**
 * Durak: den eigenen Zug eindeutig beenden. Wer angreift, passt (sonst greift er erst an und passt danach), wer
 * verteidigt, nimmt auf. Sonst bliebe man nach dem eigenen Angriff weiter dran.
 */
async function endTurnDk(host, pid) {
  return host.evaluate((pid) => {
    const s = window.__schnautz;
    for (const type of ['dkpass', 'dktake']) {
      if (!s.act(s.H.st, pid, { type })) {
        s.hostCommit();
        return null;
      }
    }
    const a = s.botDecide(s.viewFor(s.H.st, pid));
    if (!a) return 'keine Aktion';
    const e = s.act(s.H.st, pid, a);
    if (!e) s.hostCommit();
    return e ? String(e) : null;
  }, pid);
}

async function checkStill(page, host, meta) {
  await clear(page);
  await page.evaluate(async () => {
    const w = window;
    w.__anim = [];
    // Nur einmal anmelden: still läuft je Größe, sonst zählte jede Einblendung mehrfach
    if (!w.__animOn) {
      w.__animOn = true;
      document
        .querySelector('#announce')
        .addEventListener('animationstart', (e) => w.__anim.push(e.animationName), true);
    }
    const { feedback } = await window.__bandMods();
    feedback.beginBatch([]);
    feedback.emit(
      { level: 'big', beat: true },
      { text: 'Testansage', title: `${'Wolfgang-Amadeu0'} ist fertig!`, sub: 'Platz 1.', tone: 'gold', ms: 6000 },
    );
  });
  await sleep(500);
  const before = await page.evaluate(() => document.querySelector('#announce')?.className);
  // Ein Zug kann aus mehreren Aktionen bestehen (Cabo: ziehen, dann ablegen oder tauschen)
  const mine = () =>
    page.evaluate(async () => (await window.__bandMods()).helpers.myMoveNow(window.__schnautz.App.view));
  let err = null;
  for (let k = 0; k < 6 && (!err || err === 'keine Aktion') && (await mine()); k++) {
    // Im 4er-Fenster wartet die Person am Zug erst (keine Aktion), dann geht es weiter
    err = meta.game === 'durak' ? await endTurnDk(host, meta.pid) : await passTurn(host, meta.pid);
    await sleep(err === 'keine Aktion' ? 900 : 600);
  }
  const moved = await poll(async () => !(await mine()), { timeout: 8000, what: 'Zug weiter' }).catch(() => false);
  if (moved && err === 'keine Aktion') err = null;
  await sleep(900);
  const after = await page.evaluate(() => ({
    cls: document.querySelector('#announce')?.className,
    anim: window.__anim,
  }));
  const again = after.anim.filter((a) => a !== 'annOut').length > 1;
  // Bleibt die Meldung nach dem Zugwechsel im Band (zu wenig Spielfläche), gibt es nichts zu prüfen
  await record(page, { ...meta, check: 'still' }, null, {
    verdict: err
      ? `kein Zugwechsel (${err})`
      : before === after.cls
        ? 'info, Lage gleich geblieben'
        : again
          ? `neu eingeblendet ${after.anim.join(',')}`
          : 'ok',
    data: { before, after },
  });
}

/** Tauschrunde (Shithead): Band über dem eigenen Platz, große Meldung darf den Kopf am Platz decken, nie Karten. */
async function checkSwap(page, meta) {
  await clear(page);
  await page.evaluate(async () => {
    const { feedback } = await window.__bandMods();
    feedback.beginBatch([]);
    feedback.emit(
      { level: 'big', beat: true },
      {
        text: 'Revanche!',
        icon: '⚔️',
        tone: 'red',
        title: 'Wolfgang-Amadeu0 will Revanche!',
        sub: 'Wolfgang-Amadeu0 fordert dich erneut heraus.<span class="tt">Zeig, dass es kein Glück war.</span>',
        ms: 4000,
      },
    );
    feedback.emit({ level: 'small', sound: true }, { text: 'Lena ist gegangen, die KI spielt weiter.', delay: 0 });
  });
  await sleep(500);
  const obst = ['#opps .opp', '#me .card', '#me .actions', '#emofab', '#logfab'];
  const o = await inspect(page, '#announce .ann:not(.out)', obst);
  await record(page, { ...meta, check: `swap big${o?.drop?.length ? ` (ohne ${o.drop.join(' ')})` : ''}` }, o);
  const p = await inspect(page, '#fly .fieldlbl:not(.out)', obst);
  await record(page, { ...meta, check: 'swap pill' }, p, { edge: false, data: { meEdge: p?.meEdge } });
  await shot(page, `band-${meta.game}-${meta.role}-swap-${meta.size}`);
  await clear(page);
}

/**
 * Nicht am Zug: Eine kleine Meldung steht schon an der Stapelkante, dann kommt eine große. Bei Shithead eine Bombe
 * außer der Reihe mit dem längsten Spruch des Topfs und dem Namen mit 16 Zeichen (die Meldung rückt dann über die
 * Statuszeile, src/ui/feedback.ts, placeInField) und „wirft 4er rein“, danach macht jemand die vier voll. In den
 * anderen Spielen ein Hinweis und danach die große Meldung des Spiels. Die kleine darf die große nicht schneiden, sie
 * blendet aus (src/ui/band.ts, yieldToBig, „ok, kleine ausgeblendet“). Dieselbe Reihenfolge wie im Shithead-Ablauf, nicht
 * wie im Effektweg ohne Ablauf (dort kommt die große zuerst).
 */
async function checkUnder(page, meta, game) {
  // Spruch mit den meisten Zeichen samt langem Namen: Lognummer dafür (wie checkPair)
  const longest = (cat) =>
    page.evaluate(async (cat) => {
      const M = await window.__bandMods();
      const v = window.__schnautz.App.view;
      const name = v.players.find((p) => p.id === window.__ids.LONG)?.name;
      let best = [90000, ''];
      for (let n = 90000; n < 90400; n++) {
        const t = M.tauntUi.taunt(cat, { name }, n);
        if (t.length > best[1].length) best = [n, t];
      }
      return best[0];
    }, cat);
  const cases =
    game === 'shithead'
      ? [
          [
            'bombe',
            [{ k: 'shbomb', p: 'LONG', cards: ['H9'], src: 'hand', out: true }],
            [{ k: 'shburn', p: 'LONG', four: true, cut: true, n: await longest('bombOther') }],
            ['Bombe', 'wirft eine Bombe ein'],
          ],
          [
            '4er',
            [{ k: 'shthrow', p: 'LENA', cards: ['H4'] }],
            [{ k: 'shburn', p: 'LONG', four: true, cut: false, n: await longest('fourOther') }],
            ['Bombe', 'wirft 4er rein'],
          ],
        ]
      : [['hinweis', null, ...BIGS[game][0].slice(1, 2), [BIGS[game][0][3][0], 'tauscht eine Karte']]];
  for (const [name, small, big, [bigNeed, smallNeed]] of cases) {
    await clear(page);
    if (small) await fx(page, game, small);
    else
      await page.evaluate(async () => {
        const { feedback } = await window.__bandMods();
        feedback.beginBatch([]);
        feedback.emit({ level: 'small' }, { pid: window.__ids.LENA, text: 'tauscht eine Karte', delay: 0 });
      });
    await sleep(400);
    const pill = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('#fly .mid:not(.out)')].find((o) => o.textContent.includes(t));
      return el ? { band: el.classList.contains('band'), mode: el.dataset.mode } : null;
    }, smallNeed);
    if (!pill) {
      rows.push({ ...meta, check: `under ${name}`, verdict: 'info, keine kleine Meldung zu sehen' });
      continue;
    }
    await fx(page, game, big, BIGS[game][0][2]);
    // Blendet die kleine aus? Kurz nach dem Erscheinen der großen nachsehen, ausgeblendet ist sie nach 0,32 s weg
    await sleep(150);
    const hid = await page.evaluate(
      (t) => !![...document.querySelectorAll('#fly .mid.out')].find((o) => o.textContent.includes(t)),
      smallNeed,
    );
    // Die große springt 0,45 s auf, dann steht sie. Schneidet eine sichtbare kleine sie dann noch?
    await sleep(350);
    const res = await page.evaluate((t) => {
      const a = document.querySelector('#announce .ann:not(.out)');
      if (!a) return { missing: true };
      const el = [...document.querySelectorAll('#fly .mid:not(.out)')].find((o) => o.textContent.includes(t));
      const r = a.getBoundingClientRect();
      const q = el?.getBoundingClientRect();
      const y = q ? Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) : 0;
      const x = q ? Math.min(r.right, q.right) - Math.max(r.left, q.left) : 0;
      return { layer: document.querySelector('#announce')?.className ?? '', cut: x > 1 && y > 1 ? Math.round(y) : 0 };
    }, smallNeed);
    const o = await inspect(page, '#announce .ann:not(.out)', ['#fly .mid:not(.out)', '#opps .opp', '#me .card']);
    const j = res.missing ? 'große fehlt' : judge(o, { need: [bigNeed], edge: false });
    const bad = [j.startsWith('ok') ? '' : j, res.cut ? `kleine schneidet große ${res.cut}px` : '']
      .filter(Boolean)
      .join('; ');
    await record(
      page,
      { ...meta, check: `under ${name} (${pill.band ? 'Band' : 'Spielfläche'} ${res.layer ?? ''})` },
      o,
      {
        verdict: bad || (hid ? 'ok, kleine ausgeblendet' : 'ok'),
        data: { pill, res, hid },
      },
    );
    await shot(page, `band-${meta.game}-${meta.role}-under-${name}-${meta.size}`);
  }
  await clear(page);
}

/** Nicht am Zug, Reaktionsfenster offen: nie über Gegnern oder Fenster. */
async function checkEmo(page, meta, tag = 'emo') {
  await clear(page);
  // Am PC gibt es kein Reaktionsfenster, nur die Leiste unter dem Tisch
  const fab = page.locator('#emofab');
  const open = await fab.isVisible();
  if (open && !(await page.evaluate(() => document.body.classList.contains('emoopen')))) await fab.click();
  await sleep(400);
  await page.evaluate(async () => {
    const { feedback } = await window.__bandMods();
    feedback.beginBatch([]);
    feedback.emit(
      { level: 'big', beat: true },
      {
        text: 'Runde 2',
        icon: '🃏',
        tone: 'gold',
        sub: 'Sieh dir zwei deiner Karten an und merk sie dir gut.',
        ms: 4000,
      },
    );
    // Geplantes Ende der großen Meldung: Fehlt sie vorher, hat „Zeit um“ sie nach der Regel geschlossen
    window.__annEnd = feedback.ANN.curEnd;
    feedback.emit(
      { level: 'small', sound: true },
      { text: '⏰ Zeit um, die KI spielt einmal für Wolfgang-Amadeu0.', delay: 0 },
    );
  });
  await sleep(500);
  const obst = ['#opps .opp', '#emotes', '#me .card'];
  const cls = await page.evaluate(() => document.querySelector('#announce')?.className ?? '');
  const o = await inspect(page, '#announce .ann:not(.out)', obst);
  const closed = !!o?.missing && (await page.evaluate(() => Date.now() < window.__annEnd - 50));
  await record(page, { ...meta, check: `${tag} big (${cls || 'ohne Lage'})` }, o, {
    verdict: closed ? 'ok, große geschlossen' : cls ? undefined : 'Ansage ohne Spielfläche und Band (Rückfall oben)',
  });
  // Am eigenen Zug bleibt auch die Hauptzeile der Statuszeile frei
  const p = await inspect(page, '#fly .fieldlbl:not(.out)', tag === 'emoturn' ? [...obst, '#status .main'] : obst);
  // Muss sie über den Stapel, deckt sie die Regelzeile dort ganz oder gar nicht
  const cut = (p?.part ?? []).filter((x) => x.startsWith('#center'));
  const pj = judge(p);
  await record(page, { ...meta, check: `${tag} pill` }, p, {
    verdict: cut.length ? [pj === 'ok' ? '' : pj, `schneidet ${cut.join(', ')} an`].filter(Boolean).join('; ') : pj,
  });
  await shot(page, `band-${meta.game}-${meta.role}-${tag}-${meta.size}`);
  if (open) await fab.click({ timeout: 3000 }).catch(() => undefined);
  await sleep(200);
}

/**
 * Gastgeber, nicht am Zug: Alle KIs werden kurz zu Menschen ohne Verbindung, dann wartet die Partie auf jemanden,
 * der offline ist, und in der Statuszeile steht „Für … spielen“. Große und kleine Meldung decken den Knopf nicht, mit
 * und ohne Reaktionsfenster (am Handy steht die Meldung mit offenem Fenster im Band).
 */
async function checkPlayFor(page, meta) {
  await clear(page);
  const saved = await page.evaluate(() => {
    const s = window.__schnautz;
    const was = s.H.st.players.map((p) => [p.id, p.bot, p.online]);
    for (const p of s.H.st.players)
      if (p.bot) {
        p.bot = false;
        p.online = false;
      }
    s.H.st.n++;
    s.hostCommit();
    return was;
  });
  try {
    const shown = await poll(() => page.evaluate(() => !!document.querySelector('#status .quick [data-act=skip]')), {
      timeout: 6000,
      what: 'Für … spielen',
    }).catch(() => false);
    if (!shown) {
      // Etwa bei Durak, wenn die Partie auch auf mich wartet: Dann bleibt meine Zeile stehen, nichts zu prüfen
      rows.push({ ...meta, check: 'playfor', verdict: 'info, kein „Für … spielen“ in der Statuszeile' });
      return;
    }
    const fab = page.locator('#emofab');
    for (const emo of [false, true]) {
      if (emo && !(await fab.isVisible())) continue;
      await clear(page);
      if (emo) await fab.click();
      await sleep(400);
      await page.evaluate(async () => {
        const { feedback } = await window.__bandMods();
        feedback.beginBatch([]);
        feedback.emit(
          { level: 'big', beat: true },
          { text: 'Bito!', icon: '🛡️', tone: 'sea', title: 'Bito!', sub: 'Lena wehrt alles ab.', ms: 4000 },
        );
        feedback.emit(
          { level: 'small', sound: true },
          { text: '⏰ Zeit um, die KI spielt einmal für Lena.', delay: 0 },
        );
      });
      await sleep(500);
      const obst = ['#opps .opp', '#emotes', '#me .card', '#status .quick'];
      const cls = await page.evaluate(() => document.querySelector('#announce')?.className ?? '');
      const tag = `playfor${emo ? ' emo' : ''}`;
      const o = await inspect(page, '#announce .ann:not(.out)', obst);
      await record(page, { ...meta, check: `${tag} big (${cls || 'ohne Lage'})` }, o);
      // Wartet die kleine auf das Ende der großen (Band), dann danach messen
      const live = '#fly .fieldlbl:not(.out)';
      await poll(() => page.evaluate((q) => !!document.querySelector(q), live), {
        timeout: 5000,
        what: 'Hinweis',
      }).catch(() => false);
      const p = await inspect(page, live, obst);
      await record(page, { ...meta, check: `${tag} pill` }, p);
      await shot(page, `band-${meta.game}-${meta.role}-${tag.replace(' ', '-')}-${meta.size}`);
      if (emo) await fab.click({ timeout: 3000 }).catch(() => undefined);
      await sleep(200);
    }
  } finally {
    await page.evaluate((was) => {
      const s = window.__schnautz;
      for (const [id, bot, online] of was) {
        const p = s.H.st.players.find((x) => x.id === id);
        if (p) Object.assign(p, { bot, online });
      }
      s.H.st.n++;
      s.hostCommit();
    }, saved);
    await clear(page);
  }
}

/** Rundenende und Partieende mit offenem Ergebnisblatt: Sitzmeldung als Toast, je Größe. */
async function checkSeat(page, host, meta, game, group) {
  // Rundenende (Schnautz und Cabo), dann Partieende: Jemand geht, während das Ergebnisblatt offen ist
  const steps = [...(ROUND[game] ? [[ROUND[game], 'end']] : []), [OVER[game], 'over']];
  for (const [jump, phase] of steps) {
    await devJump(host, jump, [phase], page);
    await waitResult(page);
    // Am Rundenende bleiben 10 Sekunden, bis die nächste Runde von selbst beginnt
    for (const size of group) {
      await page.setViewportSize(parseSize(size));
      await sleep(250);
      if ((await view(page))?.phase !== phase) {
        rows.push({ ...meta, size, check: `seat ${phase}`, verdict: 'info, Blatt schon zu' });
        continue;
      }
      await page.evaluate(async () => {
        document.querySelectorAll('#toasts .toast').forEach((x) => x.remove());
        const M = await window.__bandMods();
        const s = window.__schnautz;
        const v = s.App.view;
        const opp = v.players.find((p) => p.id !== s.App.me && p.bot) ?? v.players.find((p) => p.id !== s.App.me);
        const e = { k: 'tobot', p: opp.id, name: opp.name, n: (v.log.at(-1)?.n ?? 0) + 1 };
        M.effects.effects(v, { ...v, log: [...v.log, e] });
      });
      await sleep(400);
      const o = await inspect(page, '#toasts .toast', []);
      await record(page, { ...meta, size, check: `seat ${phase}` }, o, { need: ['ist gegangen'] });
      await shot(page, `band-${meta.game}-${meta.role}-seat-${phase}-${size}`);
    }
    // Nach dem Rundenende startet die nächste Runde von selbst (10 Sekunden), erst dann ist das Menü frei
    if (phase === 'end')
      await poll(async () => (await view(host))?.phase !== 'end' && !(await host.locator('#overlay .modal').count()), {
        timeout: 30_000,
        what: 'nächste Runde',
      });
  }
}

async function run(browser, game, role, group) {
  const hctx = await context(browser, role === 'host' ? group[0] : '1280x860', LOOK);
  await hctx.addInitScript(initPage);
  let gctx = null;
  const host = watchErrors(await hctx.newPage(), 'host', errors);
  try {
    const code = await hostTable(host, 'Tahna');
    await chooseGame(host, game);
    await fillSeats(host, 8);
    let page = host;
    if (role === 'guest') {
      gctx = await context(browser, group[0], LOOK);
      await gctx.addInitScript(initPage);
      page = watchErrors(await gctx.newPage(), 'gast', errors);
      await joinTable(page, code, LONG_GUEST);
      await poll(async () => (await view(host))?.players.filter((p) => !p.bot).length === 2 && !!(await view(page)), {
        timeout: 45_000,
        what: 'Gast sitzt',
      });
    }
    // KIs mit 16 Zeichen, eine davon heißt Lena
    const ids = await host.evaluate((LONG) => {
      const s = window.__schnautz;
      let k = 0;
      const bots = s.H.st.players.filter((p) => p.bot);
      for (const p of bots) p.name = `${LONG.slice(0, 15)}${k++}`.slice(0, 16);
      bots[1].name = 'Lena';
      s.H.st.n++;
      s.hostCommit();
      return { LONG: bots[0].id, LENA: bots[1].id };
    }, LONG);
    await page.evaluate((ids) => (window.__ids = { ...ids, OPP: ids.LONG }), ids);
    // Nach dem Anhalten fragt niemand die KIs wieder: hostCommit stößt sie an (botTick)
    const hold = (on) =>
      host.evaluate((on) => {
        const s = window.__schnautz;
        s.BOTS.hold = on;
        if (!on) s.hostCommit();
      }, on);
    await host.evaluate(() => (window.__schnautz.BOTS.quick = true));
    await startGame(host);
    await sleep(1500);
    if (game === 'shithead' && checks.includes('swap') && (await view(page))?.phase === 'swap')
      for (const size of group) {
        await page.setViewportSize(parseSize(size));
        await sleep(400);
        await checkSwap(page, { game, role, size });
      }
    const pid = await page.evaluate(() => window.__schnautz.App.me);
    const myMove = () =>
      page.evaluate(async () => (await window.__bandMods()).helpers.myMoveNow(window.__schnautz.App.view));
    for (const size of group) {
      await page.setViewportSize(parseSize(size));
      await sleep(400);
      const meta = { game, role, size, pid };
      // Am eigenen Zug die KIs anhalten, sonst legen sie bei Durak nach und der Zug wechselt mitten in der Prüfung
      let turn = false;
      // Eine schon geplante KI-Aktion kommt nach dem Anhalten noch, deshalb danach erneut fragen
      for (let k = 0; k < 10 && !turn; k++) {
        await hold(false);
        if (!(await waitMyMove(page, host))) break;
        await hold(true);
        await sleep(1500);
        turn = await myMove();
      }
      if (!turn) {
        const v = await view(page);
        const why = `${v?.phase ?? 'ohne Ansicht'}, Runde ${v?.round ?? '?'}`;
        log(`${game} ${role} ${size}: nicht am Zug (${why})`);
        rows.push({ ...meta, check: 'turn', verdict: `nicht am Zug (${why})` });
        await shot(page, `band-${game}-${role}-noturn-${size}`);
        continue;
      }
      await sleep(300);
      if (checks.includes('pair')) await checkPair(page, meta, game);
      if (checks.includes('big')) await checkBig(page, meta, game);
      if (checks.includes('reason')) await checkReason(page, meta, game);
      if (checks.includes('spy') && game === 'cabo') await checkSpy(page, host, meta);
      // Am eigenen Zug mit offenem Reaktionsfenster darf das Band über den Stapel, nie über Gegner oder Fenster
      if (checks.includes('emoturn') && isPhoneSize(size)) await checkEmo(page, meta, 'emoturn');
      await clear(page);
      // Zuletzt, denn es beendet den eigenen Zug (bei Durak eindeutig durch Passen oder Aufnehmen)
      if (checks.includes('still')) await checkStill(page, host, meta);
      await clear(page);
    }
    await hold(false);
    if (checks.includes('emo') || checks.includes('under') || (checks.includes('playfor') && role === 'host')) {
      // Nicht am Zug: notfalls den eigenen Zug abgeben, dann die KIs anhalten
      await hold(true);
      for (let k = 0; k < 6 && (await myMove()); k++) {
        await passTurn(host, pid);
        await sleep(400);
      }
      // Eine schon geplante KI-Aktion kommt trotz Anhalten noch, ihre Meldung soll nicht mitten in eine Prüfung fallen
      await sleep(2000);
      for (const size of group) {
        await page.setViewportSize(parseSize(size));
        await sleep(400);
        const meta = { game, role, size, pid };
        if (await myMove()) rows.push({ ...meta, check: 'emo', verdict: 'noch am Zug' });
        else {
          if (checks.includes('under')) await checkUnder(page, meta, game);
          if (checks.includes('emo')) await checkEmo(page, meta);
          if (checks.includes('playfor') && role === 'host') await checkPlayFor(page, meta);
        }
      }
      await hold(false);
    }
    if (checks.includes('seat')) await checkSeat(page, host, { game, role, pid }, game, group);
  } catch (e) {
    log(`${game} ${role}: Fehler ${e.message}`);
    errors.push(`${game} ${role}: ${e.message}`);
  } finally {
    await hctx.close();
    if (gctx) await gctx.close();
  }
}

const stop = await serve();
const browser = await launch();
try {
  const phone = sizes.filter(isPhoneSize);
  const desk = sizes.filter((s) => !isPhoneSize(s));
  for (const game of games)
    for (const role of roles)
      for (const group of [phone, desk].filter((g) => g.length)) await run(browser, game, role, group);
} finally {
  await browser.close();
  await stop();
}
save('band.json', { rows, errors });
// „ok, große geschlossen“, „ok, gewichen und nachgeholt“ und „ok, Stapel weicht …“ folgen der Regel in
// src/ui/band.ts und zählen nicht als Befund, „info, …“ heißt: nichts zu prüfen. Vermerke (Unterzeile unter einem
// Drittel angeschnitten) stehen getrennt
const bad = rows.filter((r) => !r.verdict.startsWith('ok') && !r.verdict.startsWith('info'));
const infos = rows.filter((r) => r.verdict.startsWith('info'));
const closed = rows.filter((r) => r.verdict.startsWith('ok, ')).length;
const notes = rows.filter((r) => r.note);
log(
  `\n${rows.length} Messungen, ${bad.length} mit Befund, ${closed} nach Regel geschlossen oder gewichen, ` +
    `${notes.length} mit Vermerk, ${infos.length} ohne Prüfung` +
    (errors.length ? `, ${errors.length} Fehler` : ''),
);
for (const r of bad) log(`  ${r.game} ${r.role} ${r.size} ${r.check}: ${r.verdict}`);
for (const r of infos) log(`  ${r.game} ${r.role} ${r.size} ${r.check}: ${r.verdict}`);
if (notes.length) log('Vermerke:');
for (const r of notes) log(`  ${r.game} ${r.role} ${r.size} ${r.check}: ${r.note}`);
if (errors.length) log(errors.slice(0, 10).join('\n'));
process.exit(bad.length || errors.length ? 1 : 0);
