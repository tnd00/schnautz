/*
 * Stil-Fingerabdruck (Plan 2.8, legacy.md Abschnitt 13.4). Hält für eine feste Liste von Rollen am Tisch den
 * berechneten Stil des ersten sichtbaren Treffers fest: Farben, Verläufe, Ränder, Rundungen, Schatten, Schriftart,
 * Schnitt, Gewicht, Größe und Deckkraft. Je Spiel, Zustand und Größe entsteht ein Eintrag.
 *
 *   node tests/design/look.mjs [--update] [--ref=tests/design/legacy-ref.json] [--games=shithead,durak,cabo,schnautz]
 *     [--states=lobby,swap,turn,menu,modal,msg,wait,round,over] [--sizes=390x844,1280x860] [--seats=4]
 *     [--look=legacy] [--theme=light] [--out=DIR] [--port=5173] [--peer=9000] [--serve] [--shots]
 *
 * Mit `--update` schreibt es die Referenz neu, sonst vergleicht es dagegen und listet jede Abweichung als Befund
 * (Ausgangscode 1). Rollen, die in einem Lauf fehlen (etwa keine Kachel am Zug), werden nicht verglichen, nur
 * vermerkt. Farben werden vorher in Zahlen umgerechnet (`color(srgb …)`, `oklab`, `oklch` wie `rgb`) und mit Toleranz
 * verglichen. `--look` und `--theme` setzen `schnautz:look` und `schnautz:theme` vor dem Laden (je ein Wert).
 *
 * Damit Karten und KIs bei jedem Lauf gleich fallen, ersetzt das Skript `Math.random` durch einen festen Zufall je
 * Spiel. Während der Messung sind Animationen und Übergänge kurz abgeschaltet, gemessen wird also der Ruhezustand.
 * Benennt das Gerüst eine Klasse um, ändert sich nur die Zuordnung Rolle zu Selektor (TABLE, GAME, LOBBY, MENU, MODAL, MSG, SHEET), die Werte müssen gleich bleiben.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  REPO,
  arg,
  chooseGame,
  context,
  devJump,
  fillSeats,
  flag,
  hostAct,
  hostTable,
  isPhoneSize,
  launch,
  lobbyTab,
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
const states = arg('states', 'lobby,swap,turn,menu,modal,msg,wait,round,over').split(',');
const sizes = sizeList(arg('sizes', '390x844,1280x860'));
const seats = Number(arg('seats', '4'));
const look = arg('look', process.env.LOOK ?? '') || null;
const theme = arg('theme', process.env.THEME ?? '') || null;
const REF = arg('ref', join(REPO, 'tests/design/legacy-ref.json'));
const UPDATE = flag('update');

const ROUND = { cabo: 'cb-round', schnautz: 'sz-round' };
const OVER = { shithead: 'sh-any', durak: 'dk-any', cabo: 'cb-win', schnautz: 'sz-win' };

/** Gegnerkachel ohne besonderen Zustand, damit Zufall bei Rollen und Zug nichts ändert. */
const PLAIN_OPP = '#opps .opp:not(.turn):not(.done):not(.out):not(.att):not(.def):not(.called):not(.rwin):not(.rlose)';

/**
 * Rolle zu Selektor. Ein Eintrag ist `selektor`, `[selektor, pseudo]` oder `{ sel, pseudo, size: false }`. Gemessen
 * wird der erste sichtbare Treffer. `size: false` lässt Schriftgröße und Rundung weg, wo das Einpassen sie nach der
 * Zahl der Karten oder die Länge der Namen wählt. Die Selektoren schließen Zustände aus, die der Zufall verteilt (rote Karten, Tonart einer
 * Ergebniszeile, ausgegraute Knöpfe), damit zwei Läufe dieselbe Rolle treffen. `TABLE` gilt in den Zuständen am
 * Tisch (swap, turn, wait), dazu je Spiel `GAME`.
 */
const TABLE = {
  grund: 'body',
  tisch: '#table',
  kopfzeile: '.top',
  kopfknopf: '.top .iconbtn',
  menueknopf: '#btn-menu',
  gegnerkachel: PLAIN_OPP,
  kachelAmZug: '#opps .opp.turn',
  gegnername: '#opps .opp .nm',
  kiZeichen: '#opps .opp .botb',
  eigenerPlatz: '#me',
  eigenerKopf: '#me .mehead',
  eigenerName: '#me .mehead .nm',
  etikett: '#opps .opp .tag:not(.turn):not(.done):not(.def):not(.att):not(.knock):not(.take):not(.cabo):not(.king)',
  etikettAmZug: '.tag.turn',
  etikettFertig: '.tag.done',
  pille: '.pill:not(.hot):not(.pre)',
  pilleHeiss: '.pill.hot',
  statuszeile: '#status',
  statusHaupt: '#status .main',
  statusUnter: '#status .sub',
  mitte: '#center',
  stapel: '#center .pile',
  stapelZahl: '#center .pcount',
  deck: '#center .deck',
  regelzeile: '#center .cap',
  knopfPrimaer: '#table .btn.primary:not([disabled]):not([aria-disabled=true])',
  knopfGhost: '#table .btn.ghost:not([disabled]):not([aria-disabled=true])',
  knopfAus: '#table .btn.ghost[disabled], #table .btn.ghost[aria-disabled=true]',
  kartenruecken: { sel: '#table .card.back', size: false },
  kartenrueckenMuster: { sel: '#table .card.back', pseudo: '::before', size: false },
  reaktionsknopf: '#emofab',
  verlaufsknopf: '#logfab',
  reaktionsleiste: '#emotes',
  zugHinweis: '#turnnote',
};

const GAME = {
  shithead: {
    karte: { sel: '#me .shhand .card:not(.back):not(.red)', size: false },
    karteRot: { sel: '#me .shhand .card.red', size: false },
    karteEcke: { sel: '#me .shhand .card:not(.back):not(.red) .ix', size: false },
    offeneKarten: { sel: '#me .tcards .upc .card:not(.back):not(.red)', size: false },
    tauschPlatz: '.tcards .tslot',
    eigeneHand: '#me .shhand',
    gegnerHand: '#opps .opp .hcount',
    abwurf: '#center .burned',
    flamme: '.flame',
  },
  durak: {
    karte: { sel: '#me .dkhand .card:not(.back):not(.red)', size: false },
    karteRot: { sel: '#me .dkhand .card.red', size: false },
    karteEcke: { sel: '#me .dkhand .card:not(.back):not(.red) .ix', size: false },
    // Wer am Zug ist, verteilt der Zufall, deshalb Angreifer und Verteidiger je mit und ohne Zug getrennt
    kachelAmZug: '#opps .opp.dk.turn:not(.att):not(.def)',
    angreifer: '#opps .opp.dk.att:not(.turn)',
    verteidiger: '#opps .opp.dk.def:not(.turn)',
    angreiferAmZug: '#opps .opp.dk.att.turn',
    verteidigerAmZug: '#opps .opp.dk.def.turn',
    etikettAngriff: '.tag.att',
    etikettAbwehr: '.tag.def',
    trumpf: '#center .dktrump',
    tischfeld: '#center .dktable',
    paar: '#center .dkpair',
    bito: '#center .dkbito',
    gegnerFaecher: '#opps .opp .bighand',
  },
  cabo: {
    eigenerSlot: '#me .cbslot',
    gegnerSlot: '#opps .opp .cbslot',
    cboDeck: '#center .cbdeck',
    cboAblage: '#center .cbpile',
    cboHalten: '#center .cbhold',
    caboKnopf: '#table .btn.wood.cabo',
    cboWert: { sel: '.cbv:not(.zero)', size: false },
    cboWertNull: { sel: '.cbv.zero', size: false },
    gerufen: '#opps .opp.cb.called',
  },
  schnautz: {
    karte: { sel: '#me .hand .card:not(.back):not(.red)', size: false },
    karteRot: { sel: '#me .hand .card.red', size: false },
    karteEcke: { sel: '#me .hand .card:not(.back):not(.red) .ix', size: false },
    mitteKarte: { sel: '#center .middle .card:not(.back):not(.red)', size: false },
    deckel: '.coaster:not(.lost)',
    deckelWeg: '.coaster.lost',
    leben: '.lives',
    mittelkarten: '#center .middle',
    eigeneHand: '#me .hand',
    gegnerKarten: '#opps .opp .ocards',
  },
};

const LOBBY = {
  grund: 'body',
  lobby: '#scr-lobby',
  reiter: '#lobby-tabs',
  reiterKnopf: '#lobby-tabs [data-act=ltab]',
  spielkarte: '.lgc',
  spielkarteGesicht: '.lgc-face',
  spielname: '.lgc .lg-name',
  ueberschrift: '.lh',
  startleiste: '.lfoot',
  weiter: '.lnext',
  start: '.lgo-start',
};

const MENU = {
  menue: '#menu',
  gruppe: '#menu .mgroup + .mgroup',
  eintrag: '#menu .mi:not(.danger)',
  eintragSymbol: ['#menu .mi:not(.danger)', '::before'],
  eintragGefahr: '#menu .mi.danger',
  schalter: '#menu .msw',
  schalterKnopf: ['#menu .msw', '::after'],
};

const MODAL = {
  schleier: '#modal .modal',
  bogen: '#modal .paper',
  titel: '#modal .paper h2',
  schliessen: '#modal [data-act=closemodal]',
  reiter: '#modal .rtab',
  abschnitt: '#modal .rsec',
};

const MSG = {
  meldung: '#announce .ann',
  meldungTitel: '#announce .ann .ann-t',
  meldungUnter: '#announce .ann .ann-s',
  toast: '#toasts .toast',
  hinweis: '#fly .fieldlbl',
};

const SHEET = {
  schleier: '#overlay .modal',
  blatt: '#overlay .paper.result',
  kopf: '#overlay .result .rhead',
  titel: '#overlay .result h2',
  zeile: '#overlay .row.rr:not(.win):not(.lose):not(.swim):not(.mine):not(.key)',
  zeileEigen: '#overlay .row.rr.mine:not(.win):not(.lose):not(.swim):not(.key)',
  kernVerlierer: '#overlay .row.rr.key.lose:not(.mine)',
  kernSieger: '#overlay .row.rr.key.win:not(.mine)',
  verlierer: '#overlay .row.rr.lose:not(.key):not(.mine)',
  sieger: '#overlay .row.rr.win:not(.key):not(.mine)',
  schwimmt: '#overlay .row.rr.swim:not(.key):not(.mine)',
  name: { sel: '#overlay .row.rr .rnm', size: false },
  wert: { sel: '#overlay .row.rr .rval', size: false },
  notiz: '#overlay .result .rnote',
  fuss: '#overlay .rfoot',
  knopfPrimaer: '#overlay .rfoot .btn.primary:not(.rv)',
  revanche: '#overlay .rfoot .btn.primary.rv',
  knopfGhost: '#overlay .rfoot .btn.ghost',
  wartetext: '#overlay .waittxt',
};

function rolesFor(game, state) {
  switch (state) {
    case 'lobby':
      return LOBBY;
    case 'swap':
    case 'turn':
    case 'wait':
      return { ...TABLE, ...GAME[game] };
    case 'menu':
      return MENU;
    case 'modal':
      return MODAL;
    case 'msg':
      return MSG;
    case 'round':
    case 'over':
      return SHEET;
    default:
      throw new Error(`Zustand ${state} unbekannt`);
  }
}

/**
 * Im Browser: berechnete Stile je Rolle. Animationen und Übergänge sind dabei abgeschaltet, ein Hover am PC zählt
 * nicht, weil die Maus vorher an den Rand geht. Randfarben stehen nur da, wo der Rand eine Breite hat, gleiche Werte
 * aller vier Seiten werden zu einem zusammengefasst.
 */
async function fingerprint(page, roles) {
  if (!isPhoneSize(`${page.viewportSize().width}x${page.viewportSize().height}`))
    await page.mouse.move(2, Math.round(page.viewportSize().height / 2));
  return page.evaluate((list) => {
    const freeze = document.createElement('style');
    freeze.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.appendChild(freeze);
    try {
      const sides = ['top', 'right', 'bottom', 'left'];
      const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
      const one = (vals) => (vals.every((v) => v === vals[0]) ? vals[0] : vals.join(' | '));
      const out = {};
      for (const [role, def] of Object.entries(list)) {
        const {
          sel,
          pseudo = null,
          size = true,
        } = typeof def === 'string' ? { sel: def } : Array.isArray(def) ? { sel: def[0], pseudo: def[1] } : def;
        const el = [...document.querySelectorAll(sel)].find((e) => {
          if (!e.getClientRects().length) return false;
          const cs = getComputedStyle(e);
          return cs.visibility !== 'hidden' && cs.display !== 'none';
        });
        if (!el) continue;
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
        const v = {
          color: cs.color,
          'background-color': cs.backgroundColor,
          'background-image': cs.backgroundImage,
          'border-width': one(sides.map((s) => cs.getPropertyValue(`border-${s}-width`))),
          'border-radius': one(corners.map((c) => cs.getPropertyValue(`border-${c}-radius`))),
          'box-shadow': cs.boxShadow,
          'font-family': cs.fontFamily,
          'font-style': cs.fontStyle,
          'font-weight': cs.fontWeight,
          'font-size': cs.fontSize,
          'text-shadow': cs.textShadow,
          opacity: cs.opacity,
        };
        const colors = sides
          .filter((s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0)
          .map((s) => cs.getPropertyValue(`border-${s}-color`));
        if (colors.length) v['border-color'] = one(colors);
        if (!size) {
          delete v['font-size'];
          delete v['border-radius'];
        }
        out[role] = v;
      }
      return out;
    } finally {
      freeze.remove();
    }
  }, roles);
}

/* ---------- Farben in Zahlen und Vergleich mit Toleranz ---------- */

const clamp = (x) => Math.min(255, Math.max(0, Math.round(x * 255)));
const toSrgb = (lin) => (lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055);
function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(toSrgb(c)));
}
const num = (t, pct = 1) => (t.endsWith('%') ? (parseFloat(t) / 100) * pct : parseFloat(t));
const alpha = (t) => (t === undefined ? 1 : num(t));

/** Jede Farbe als `#c(R,G,B,A)` mit Kanälen 0 bis 255 und Deckkraft 0 bis 100. */
export function normColors(s) {
  const mk = (rgb, a) => `#c(${rgb.join(',')},${Math.round(a * 100)})`;
  return s
    .replace(/rgba?\(([^)]*)\)/g, (_, body) => {
      const p = body.split(/[\s,/]+/).filter(Boolean);
      return mk(
        p.slice(0, 3).map((x) => Math.round(num(x, 255))),
        alpha(p[3]),
      );
    })
    .replace(/color\(srgb\s+([^)]*)\)/g, (_, body) => {
      const p = body.split(/[\s/]+/).filter(Boolean);
      return mk(
        p.slice(0, 3).map((x) => clamp(num(x))),
        alpha(p[3]),
      );
    })
    .replace(/oklab\(([^)]*)\)/g, (_, body) => {
      const p = body.split(/[\s/]+/).filter(Boolean);
      return mk(oklabToRgb(num(p[0]), num(p[1], 0.4), num(p[2], 0.4)), alpha(p[3]));
    })
    .replace(/oklch\(([^)]*)\)/g, (_, body) => {
      const p = body.split(/[\s/]+/).filter(Boolean);
      const C = num(p[1], 0.4);
      const h = (parseFloat(p[2]) * Math.PI) / 180;
      return mk(oklabToRgb(num(p[0]), C * Math.cos(h), C * Math.sin(h)), alpha(p[3]));
    });
}

const NUM = /-?\d*\.?\d+(?:e-?\d+)?/g;
/** Zerlegt in Gerüst ohne Zahlen und die Zahlen, Farbkanäle getrennt markiert. */
function parts(s) {
  const nums = [];
  const skel = normColors(s)
    .replace(/#c\(([^)]*)\)/g, (_, body) => {
      body.split(',').forEach((x) => nums.push({ v: Number(x), color: true }));
      return '#c()';
    })
    .replace(NUM, (x) => {
      nums.push({ v: Number(x), color: false });
      return '#';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { skel, nums };
}

/** Gleich innerhalb der Toleranz? Farben bis 2 von 255, Längen bis 0,3 px oder 1 Prozent. */
export function same(a, b) {
  if (a === b) return true;
  const x = parts(a);
  const y = parts(b);
  if (x.skel !== y.skel || x.nums.length !== y.nums.length) return false;
  return x.nums.every((n, i) => {
    const m = y.nums[i].v;
    const tol = n.color ? 2 : Math.max(0.3, Math.abs(n.v) * 0.01);
    return Math.abs(n.v - m) <= tol;
  });
}

/* ---------- Abläufe am Tisch ---------- */

/** Fester Zufall statt Math.random (mulberry32), damit Karten und KIs bei jedem Lauf gleich fallen. */
async function seedRandom(ctx, seed) {
  await ctx.addInitScript((s0) => {
    let s = s0 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}
const seedOf = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const setHold = (page, on) =>
  page.evaluate((h) => {
    window.__schnautz.BOTS.hold = h;
  }, on);

/** Ist die Seite selbst am Zug und kein Ablauf mehr unterwegs? */
const myMove = (page) =>
  page.evaluate(() => {
    const s = window.__schnautz;
    const w = s.App.view;
    // #me.turn trägt den Schein am eigenen Platz, ohne ihn ist es für den Fingerabdruck kein eigener Zug
    if (!w || w.phase !== 'play' || s.SEQ.busy || !document.querySelector('#me.turn')) return false;
    // Bei Durak nur ein Zug, den das automatische Passen nicht wegnimmt: Verteidigen oder einen neuen Angriff
    // eröffnen (die Partie wartet auf mich, dkWaiting)
    if (w.game === 'durak') return w.dk?.def === w.me || (w.dk?.att === w.me && !w.dk.table.length);
    return w.players[w.turn]?.id === w.me;
  });

async function waitMyMove(page) {
  return poll(
    async () => {
      const v = await view(page);
      if (!v || v.phase !== 'play') {
        // Schnautz: Der Geber wählt zuerst und behält sein Blatt, Tauschrunde und Ansehen schließt der Gastgeber
        if (v?.phase === 'choose' && (await page.locator('[data-act=keep]').isVisible()))
          await page.click('[data-act=keep]');
        if (v?.phase === 'swap' || v?.phase === 'peek') await hostAct(page, null, { type: 'force' });
        return false;
      }
      if (await myMove(page)) return true;
      // Durak: Wartet die Partie als Mitangreifer auf mich, spielt die KI für mich weiter
      if (v.game === 'durak' && (await page.locator('#me.turn').isVisible())) await botMove(page);
      return false;
    },
    { timeout: 60_000, every: 300, what: 'eigener Zug' },
  );
}

/** Ein Zug für den eigenen Platz, wie die KI ihn wählt. Gibt einen Fehlertext zurück oder null. */
const botMove = (page) =>
  page.evaluate(() => {
    const s = window.__schnautz;
    const a = s.botDecide(s.viewFor(s.H.st, s.App.me, true), undefined, 'normal');
    if (!a || ['chat', 'emote', 'toss', 'sound'].includes(a.type)) return 'keine Aktion';
    const err = s.act(s.H.st, s.App.me, a);
    if (!err) s.hostCommit();
    return err ? String(err) : null;
  });

/**
 * Eigenen Zug abwarten und dann die KIs anhalten. Ein Zug einer KI, der schon geplant war, kann danach noch kommen
 * (etwa ein 4er, der verbrennt und die Reihenfolge dreht), deshalb kurz warten und nachsehen, höchstens dreimal.
 */
async function settleMyMove(page) {
  for (let k = 0; k < 3; k++) {
    const ok = await waitMyMove(page)
      .then(() => true)
      .catch(() => false);
    if (!ok) return false;
    await setHold(page, true);
    await sleep(2500);
    if (await myMove(page)) return true;
    await setHold(page, false);
  }
  return false;
}

/** Einen eigenen Zug wie die KI machen, bis jemand anderes dran ist (höchstens sechs Schritte). */
async function passTurn(page) {
  for (let k = 0; k < 6 && (await myMove(page)); k++) {
    const e = await botMove(page);
    // Die KI weiß gerade nichts (etwa während der 4er-Sperre), kurz warten und neu fragen
    if (e) await sleep(800);
    await poll(async () => !(await page.evaluate(() => window.__schnautz.SEQ.busy)), { what: 'Ablauf' });
    await sleep(900);
  }
  return poll(async () => page.locator('#opps .opp.turn').first().isVisible(), {
    timeout: 8000,
    what: 'Gegner am Zug',
  }).catch(() => false);
}

/** Meldung, Toast und Hinweis über die Module des Dev-Servers anstoßen. */
async function showMessages(page) {
  return page.evaluate(async () => {
    try {
      const f = await import(/* @vite-ignore */ '/src/ui/feedback.ts');
      f.announce({ title: 'Probe', sub: 'für den Fingerabdruck', ms: 20_000 });
      f.toast('Probe für den Fingerabdruck', 20_000);
      f.floatLabel(undefined, 'Probe Hinweis');
      return true;
    } catch {
      return false;
    }
  });
}
async function clearMessages(page) {
  await page.evaluate(async () => {
    const f = await import(/* @vite-ignore */ '/src/ui/feedback.ts');
    f.resetAnnouncements();
    document.querySelectorAll('#toasts .toast, #fly .fieldlbl').forEach((e) => e.remove());
  });
}

const prints = {};
const notes = [];
const errors = [];

async function take(page, game, state, size, extra = '') {
  const key = `${game}/${state}${extra}/${size}`;
  const fp = await fingerprint(page, rolesFor(game, state));
  await shot(page, `look-${key.replaceAll('/', '-')}`);
  // Ohne eine einzige Rolle ist der Zustand schon vorbei (etwa das Blatt am Rundenende nach dem Countdown)
  if (!Object.keys(fp).length) {
    notes.push(`${key}: keine Rolle gefunden, nicht aufgenommen`);
    console.log(`${key.padEnd(30)} keine Rolle gefunden`);
    return;
  }
  prints[key] = fp;
  const n = Object.values(fp).reduce((t, r) => t + Object.keys(r).length, 0);
  console.log(`${key.padEnd(30)} ${String(Object.keys(fp).length).padStart(2)} Rollen, ${n} Werte`);
}

async function run(browser, game, group) {
  const ctx = await context(browser, group[0], { look, theme });
  await seedRandom(ctx, seedOf(game));
  const page = watchErrors(await ctx.newPage(), game, errors);
  const each = async (fn) => {
    for (const size of group) {
      await page.setViewportSize(parseSize(size));
      await sleep(500);
      await fn(size);
    }
  };
  try {
    await hostTable(page, 'Tahna');
    await chooseGame(page, game);
    await fillSeats(page, seats);
    if (states.includes('lobby'))
      await each(async (size) => {
        for (const tab of isPhoneSize(size) ? ['table', 'game'] : ['']) {
          if (tab) await lobbyTab(page, tab);
          await page
            .locator('#scr-lobby .lfoot')
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => undefined);
          await sleep(400);
          await take(page, game, 'lobby', size, tab ? `-${tab}` : '');
        }
      });
    await startGame(page);
    await sleep(1500);
    if (game === 'shithead' && states.includes('swap')) {
      await poll(async () => (await view(page))?.phase === 'swap', { what: 'Tauschrunde' });
      await sleep(1500);
      await each((size) => take(page, game, 'swap', size));
    }
    const atTable = ['turn', 'menu', 'modal', 'msg', 'wait'].some((s) => states.includes(s));
    let mine = false;
    if (atTable) {
      // Ab hier ziehen die KIs nicht mehr, der Tisch bleibt stehen
      mine = await settleMyMove(page);
      if (!mine) notes.push(`${game}: nie selbst am Zug, turn und wait fehlen`);
      await setHold(page, true);
    }
    if (mine && states.includes('turn')) await each((size) => take(page, game, 'turn', size));
    if (states.includes('menu')) {
      await page.click('#btn-menu');
      await sleep(400);
      await each((size) => take(page, game, 'menu', size));
      await page.keyboard.press('Escape');
      await sleep(300);
    }
    if (states.includes('modal')) {
      await page.click('#btn-rules');
      await page.locator('#modal .paper').waitFor({ state: 'visible', timeout: 10_000 });
      await sleep(500);
      await each((size) => take(page, game, 'modal', size));
      await page.keyboard.press('Escape');
      await page
        .locator('#modal [data-act=closemodal]')
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
      await sleep(300);
    }
    if (states.includes('msg')) {
      if (await showMessages(page)) {
        await sleep(700);
        await each((size) => take(page, game, 'msg', size));
        await clearMessages(page);
        await sleep(300);
      } else notes.push(`${game}: Meldungen nur gegen den Dev-Server (/src/ui/feedback.ts), übersprungen`);
    }
    if (mine && states.includes('wait') && game !== 'durak') {
      if (await passTurn(page)) {
        await sleep(1500);
        await each((size) => take(page, game, 'wait', size));
      } else notes.push(`${game}: kein Gegner am Zug, Zustand wait fehlt`);
    }
    if (atTable) await setHold(page, false);
    if (states.includes('round') && ROUND[game]) {
      // Das Blatt am Rundenende geht nach dem Countdown von selbst, fehlt es, gibt es einen zweiten Versuch
      for (let k = 0; k < 2 && !group.every((size) => prints[`${game}/round/${size}`]); k++) {
        await devJump(page, ROUND[game], ['end', 'over']);
        if (await waitResult(page))
          await each(async (size) => {
            if (!prints[`${game}/round/${size}`]) await take(page, game, 'round', size);
          });
        else notes.push(`${game}: kein Ergebnisblatt am Rundenende`);
        if ((await view(page))?.phase === 'end') await hostAct(page, null, { type: 'force' });
        await sleep(1500);
      }
    }
    if (states.includes('over')) {
      await devJump(page, OVER[game], ['over']);
      if (await waitResult(page)) await each((size) => take(page, game, 'over', size));
      else notes.push(`${game}: kein Ergebnisblatt am Partieende`);
    }
  } catch (e) {
    console.log(`${game}: FEHLER ${e.message}`);
    errors.push(`[${game}] ${e.message}`);
    await shot(page, `look-${game}-FEHLER`);
  } finally {
    await ctx.close();
  }
}

/** Abweichungen gegen die Referenz. Fehlende Rollen oder Einträge sind nur Vermerke. */
function compare(ref, cur) {
  const finds = [];
  for (const [key, roles] of Object.entries(cur)) {
    const base = ref[key];
    if (!base) {
      notes.push(`${key}: ohne Referenz`);
      continue;
    }
    for (const [role, vals] of Object.entries(roles)) {
      const r = base[role];
      if (!r) {
        notes.push(`${key} ${role}: neu, nicht in der Referenz`);
        continue;
      }
      for (const prop of new Set([...Object.keys(r), ...Object.keys(vals)])) {
        const a = r[prop];
        const b = vals[prop];
        if (a === undefined || b === undefined || !same(a, b))
          finds.push({ key, role, prop, ref: a ?? '(fehlt)', now: b ?? '(fehlt)' });
      }
    }
    for (const role of Object.keys(base)) if (!roles[role]) notes.push(`${key} ${role}: nicht gefunden`);
  }
  return finds;
}

const stop = await serve();
const browser = await launch();
const t0 = Date.now();
try {
  for (const game of games)
    for (const group of [sizes.filter(isPhoneSize), sizes.filter((s) => !isPhoneSize(s))])
      if (group.length) await run(browser, game, group);
} finally {
  await browser.close();
  await stop();
}

const count = Object.values(prints).reduce(
  (t, roles) => t + Object.values(roles).reduce((u, r) => u + Object.keys(r).length, 0),
  0,
);
const roleCount = Object.values(prints).reduce((t, roles) => t + Object.keys(roles).length, 0);
const secs = Math.round((Date.now() - t0) / 1000);
let finds = [];
if (UPDATE) {
  if (errors.length) {
    console.log('\nFehler im Lauf, Referenz bleibt, wie sie ist:');
    errors.forEach((e) => console.log(`  ${e}`));
  } else {
    let commit = '';
    try {
      commit = execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim();
    } catch {
      // ohne git
    }
    const meta = {
      made: new Date().toISOString().slice(0, 10),
      commit,
      sizes: sizes.join(','),
      seats,
      look,
      theme,
      count,
    };
    writeFileSync(REF, `${JSON.stringify({ _: meta, ...prints }, null, 2)}\n`);
    console.log(`\nReferenz geschrieben: ${REF}`);
  }
} else {
  if (!existsSync(REF)) throw new Error(`Referenz ${REF} fehlt, erst mit --update aufnehmen`);
  const { _: meta, ...ref } = JSON.parse(readFileSync(REF, 'utf8'));
  console.log(`\nVergleich mit ${REF} (${meta?.made ?? '?'}, ${meta?.commit ?? '?'})`);
  finds = compare(ref, prints);
  for (const f of finds) console.log(`  ${f.key} ${f.role} ${f.prop}: ${f.ref} => ${f.now}`);
}
const file = save('look.json', { look, theme, sizes, seats, count, finds, notes, errors, prints });
console.log(
  `\n${Object.keys(prints).length} Einträge, ${roleCount} Rollen, ${count} Werte in ${secs} s. ` +
    `${finds.length} Abweichungen, ${errors.length} Fehler, ${notes.length} Vermerke. Ergebnis: ${file}`,
);
notes.forEach((n) => console.log(`  Vermerk: ${n}`));
errors.forEach((e) => console.log(`  Fehler: ${e}`));
process.exitCode = finds.length || errors.length ? 1 : 0;
