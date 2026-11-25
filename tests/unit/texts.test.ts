/*
 * Sichtbare Texte nach CLAUDE.md und Glossar (Stufe 2.7 „Klare Worte“).
 * Teil A rendert jede Logart aus mehreren Blickwinkeln und sucht nach kaputten Sätzen.
 * Teil B liest alle sichtbaren Literale aus dem Quelltext (TypeScript-API, Kommentare fallen dabei weg),
 * dazu die Spruchtöpfe, index.html und die Changelog-Einträge ab 2.7.
 * Teil C prüft die Spruchtöpfe selbst (Spielnamen, Platzhalter, Bedingungen, Kronen).
 * Jede Prüfung sammelt alle Funde und vergleicht am Ende mit einer leeren Liste, damit die Ausgabe vollständig ist.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import botlines from '../../src/content/botlines.json' with { type: 'json' };
import { CHANGELOG } from '../../src/content/changelog';
import tauntsJson from '../../src/content/taunts.json' with { type: 'json' };
import { cmpVersion } from '../../src/content/version';
import type { GameKind, LogEntry, LogKind, View } from '../../src/game/types';
import { App } from '../../src/ui/app';
import { logLine } from '../../src/ui/render/log';
import { burnAnn } from '../../src/ui/shithead/sequence';
import { taunt } from '../../src/ui/taunts';

const ROOT = path.resolve(__dirname, '../..');

/** Regeln aus CLAUDE.md und dem Glossar, sie gelten für jeden sichtbaren Text */
const RULES: readonly (readonly [string, RegExp])[] = [
  ['Gedankenstrich', /[–—]/],
  ['Bindestrich als Gedankenstrich', /[a-zäöüß] - [A-Za-zÄÖÜäöüß]/],
  ['Komma vor „und“', /,\s+und\b/],
  // Höchstens drei Wörter ohne Komma am Satzanfang, dann ein Doppelpunkt
  ['Doppelpunkt-Label', /(?:^|[.!?]\s+)[A-ZÄÖÜ][\wäöüß-]*(?: [\wäöüß-]+){0,2}:\s/],
  ['„Spieler“ statt „Leute“ oder „Person“', /[Ss]pieler/],
  ['„Host“ statt „Gastgeber“', /\bHosts?\b/],
  ['„Bierdeckel“ statt „Leben“', /Bierdeckel/],
  ['„Raum“ statt „Tisch“', /\bR[aä]ume?s?\b/],
];

/** Fehler, die erst beim Zusammensetzen entstehen (Perspektive, fehlende Felder, Maskierung) */
const RENDER_RULES: readonly (readonly [string, RegExp])[] = [
  ['„Du“ mit Verb der dritten Person', /\bDu (?:ist|hat|war|wird|kann|darf|muss|will)\b|\bDu [a-zäöüß]+(?<![sßzx])t\b/],
  ['„Du“ als Objekt', /\b(?:für|an|mit|von|gegen|bei|auf|zu|über) Du\b/],
  ['„Jemand“ statt Name', /\bJemand\b/],
  ['Platzhalter oder leerer Wert', /\bundefined\b|\bNaN\b|\[object|[{}]/],
  ['null aus dem Code', /\bnull\b/],
  ['doppeltes Leerzeichen', / {2}/],
  ['Leerzeichen vor Satzzeichen', /\s[.,!?]/],
  ['Leerzeichen am Rand', /^\s|\s$/],
  ['doppelter Punkt', /\.\./],
  ['doppelt maskiert', /&(?:amp|lt|gt|quot|#39);/],
];

/** Für Sprüche gelten dieselben Regeln, nur „Jemand“ und „null“ sind dort normale Wörter */
const TAUNT_RULES = RENDER_RULES.filter(([name]) => name !== '„Jemand“ statt Name' && name !== 'null aus dem Code');

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
/** Einmal entschlüsseln, so wie der Browser es beim Anzeigen tut */
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k: string) => ENTITIES[k]);
const plain = (html: string): string => decode(html.replace(/<[^>]*>/g, ''));

function check(text: string, rules: readonly (readonly [string, RegExp])[]): string[] {
  return rules.filter(([, re]) => re.test(text)).map(([name]) => name);
}

// ---------------------------------------------------------------------------------------------------------------
// Teil A: gerenderte Sätze

/** Lena, Tom und Elfi spielen, Mia schaut als vierte Person zu. Ein Name mit & zeigt doppelte Maskierung. */
const PEOPLE = [
  ['a', 'Lena'],
  ['b', 'Tom & Jo'],
  ['c', 'Elfi'],
  ['o', 'Mia'],
] as const;
const GAMES: readonly GameKind[] = ['schnautz', 'shithead', 'durak', 'cabo'];

function view(game: GameKind): View {
  return {
    game,
    phase: 'play',
    games: 1,
    turn: 0,
    dealer: 0,
    log: [],
    players: PEOPLE.map(([id, name]) => ({ id, name })),
  } as unknown as View;
}

/** Beispiele für jede Logart. Kommt eine neue Art dazu, kompiliert der Test erst mit einem Beispiel dafür. */
const SAMPLES: { [K in LogKind]: readonly Omit<Extract<LogEntry, { k: K }>, 'n'>[] } = {
  join: [
    { k: 'join', p: 'a' },
    { k: 'join', p: 'a', bot: true },
  ],
  leave: [{ k: 'leave', p: 'a', name: 'Lena' }],
  quit: [{ k: 'quit', p: 'a' }],
  takeover: [{ k: 'takeover', p: 'a', from: 'Bodo' }],
  tobot: [{ k: 'tobot', p: 'a' }],
  back: [{ k: 'back', p: 'a' }],
  timeout: [{ k: 'timeout', p: 'a' }],
  game: [
    { k: 'game', g: 2, game: 'shithead' },
    { k: 'game', g: 1 },
  ],
  round: [
    { k: 'round', r: 2, p: 'a', start: 'b' },
    { k: 'round', r: 1, p: 'a' },
  ],
  keep: [{ k: 'keep', p: 'a' }],
  take: [{ k: 'take', p: 'a' }],
  swap: [{ k: 'swap', p: 'a', take: 'H7', give: 'SK' }],
  swapAll: [{ k: 'swapAll', p: 'a' }],
  pass: [{ k: 'pass', p: 'a' }],
  renew: [{ k: 'renew' }],
  knock: [{ k: 'knock', p: 'a' }],
  result: [
    {
      k: 'result',
      reason: 'schnautz',
      by: 'a',
      changes: { b: { n: 1, to: 'life' }, c: { n: 1, to: 'swim' } },
      tie: false,
      names: { b: 'Tom & Jo', c: 'Elfi' },
    },
    {
      k: 'result',
      reason: 'feuer',
      by: 'a',
      changes: { b: { n: 1, to: 'out' }, c: { n: 1, to: 'life' } },
      tie: false,
      names: { b: 'Tom & Jo', c: 'Elfi' },
    },
    { k: 'result', reason: 'knock', by: null, changes: { b: { n: 2, to: 'life' } }, tie: false, names: {} },
    { k: 'result', reason: 'knock', by: null, changes: {}, tie: true, names: {} },
    { k: 'result', reason: 'quit', by: null, changes: { a: { n: 1, to: 'out' } }, tie: false, names: { a: 'Lena' } },
  ],
  winner: [{ k: 'winner', p: 'a' }, { k: 'winner' }],
  lobby: [{ k: 'lobby' }],
  abort: [
    { k: 'abort', p: 'a', game: 'shithead' },
    { k: 'abort', p: 'a', game: 'durak', bets: true },
  ],
  ffwd: [{ k: 'ffwd', p: 'a' }],
  chat: [{ k: 'chat', p: 'a', text: 'Hallo' }],
  emote: [{ k: 'emote', p: 'a', e: '😀' }],
  toss: [{ k: 'toss', p: 'a', item: 'tomato', to: 'b' }],
  sound: [{ k: 'sound', p: 'a', s: 'tusch' }],
  shdeal: [{ k: 'shdeal' }],
  shstart: [
    { k: 'shstart', p: 'a', card: 'H3' },
    { k: 'shstart', p: 'a', card: null },
  ],
  shplay: [
    { k: 'shplay', p: 'a', cards: ['H7', 'S7'], src: 'hand' },
    { k: 'shplay', p: 'a', cards: ['H7'], src: 'up' },
    { k: 'shplay', p: 'a', cards: ['H7'], src: 'down' },
  ],
  shthrow: [
    { k: 'shthrow', p: 'a', cards: ['H4'], src: 'hand' },
    { k: 'shthrow', p: 'a', cards: ['H4'], src: 'up' },
  ],
  shbomb: [
    { k: 'shbomb', p: 'a', cards: ['H9', 'S9', 'C9', 'D9'], src: 'hand', out: true },
    { k: 'shbomb', p: 'a', cards: ['H9', 'S9', 'C9', 'D9'], src: 'up', out: false },
  ],
  shburn: [
    { k: 'shburn', p: 'a', four: true, cut: true },
    { k: 'shburn', p: 'a', four: true, cut: false },
    { k: 'shburn', p: 'a', four: false, cut: false },
  ],
  shpickup: [
    { k: 'shpickup', p: 'a', cnt: 1 },
    { k: 'shpickup', p: 'a', cnt: 7 },
  ],
  shblindfail: [
    { k: 'shblindfail', p: 'a', card: 'HK', cnt: 1 },
    { k: 'shblindfail', p: 'a', card: 'HK', cnt: 5 },
  ],
  shdone: [{ k: 'shdone', p: 'a', place: 1 }],
  shend: [{ k: 'shend', p: 'a' }, { k: 'shend' }],
  shbet: [{ k: 'shbet', p: 'a', on: 'b', onName: 'Tom & Jo', q: 2 }],
  rematch: [
    { k: 'rematch', p: 'a', to: 'b', tn: 'Tom & Jo', c: 1 },
    { k: 'rematch', p: 'a', to: 'b', tn: 'Tom & Jo', c: 2 },
    { k: 'rematch', p: 'a', to: null, c: 1 },
  ],
  rematchend: [
    { k: 'rematchend', p: 'a', to: 'b', tn: 'Tom & Jo', res: 'won', c: 1 },
    { k: 'rematchend', p: 'a', to: 'b', tn: 'Tom & Jo', res: 'lost', c: 1 },
    { k: 'rematchend', p: 'a', to: 'b', tn: 'Tom & Jo', res: 'tie', c: 1 },
  ],
  dkdeal: [
    { k: 'dkdeal', trump: 'H6', att: 'a', def: 'b' },
    { k: 'dkdeal', trump: 'H6', att: 'a', def: 'b', prev: true },
    { k: 'dkdeal', trump: 'H6', att: 'a', def: 'b', rnd: true },
  ],
  dkattack: [
    { k: 'dkattack', p: 'a', cards: ['H7'], lead: true },
    { k: 'dkattack', p: 'a', cards: ['S7', 'C7'] },
  ],
  dkdefend: [{ k: 'dkdefend', p: 'a', a: 'H7', d: 'H9' }],
  dktransfer: [{ k: 'dktransfer', p: 'a', cards: ['S7'], to: 'b', tn: 'Tom & Jo' }],
  dktake: [{ k: 'dktake', p: 'a' }],
  dkpass: [{ k: 'dkpass', p: 'a' }],
  dkbito: [
    { k: 'dkbito', p: 'a', cnt: 1 },
    { k: 'dkbito', p: 'a', cnt: 6 },
  ],
  dkpickup: [
    { k: 'dkpickup', p: 'a', cnt: 3 },
    { k: 'dkpickup', p: 'a', cnt: 9 },
  ],
  dkout: [{ k: 'dkout', p: 'a', place: 2 }],
  dkend: [{ k: 'dkend', p: 'a' }, { k: 'dkend' }],
  cbdeal: [{ k: 'cbdeal', r: 1, start: 'a' }],
  cblook: [{ k: 'cblook', p: 'a', ids: [0, 1] }],
  cbdraw: [
    { k: 'cbdraw', p: 'a', from: 'pile', c: 'H5' },
    { k: 'cbdraw', p: 'a', from: 'deck' },
  ],
  cbswap: [
    { k: 'cbswap', p: 'a', out: ['H5'], ok: true, slots: 1 },
    { k: 'cbswap', p: 'a', out: ['H5', 'S5'], ok: true, slots: 2 },
    { k: 'cbswap', p: 'a', out: ['H5', 'S6'], ok: false, slots: 2, pen: true },
    { k: 'cbswap', p: 'a', out: ['H5', 'S6'], ok: false, slots: 2 },
  ],
  cbdiscard: [
    { k: 'cbdiscard', p: 'a', c: 'H7', power: 'peek' },
    { k: 'cbdiscard', p: 'a', c: 'H9', power: 'spy' },
    { k: 'cbdiscard', p: 'a', c: 'HB', power: 'swap' },
    { k: 'cbdiscard', p: 'a', c: 'H3' },
  ],
  cbpeek: [{ k: 'cbpeek', p: 'a', id: 0 }],
  cbspy: [{ k: 'cbspy', p: 'a', to: 'b', tn: 'Tom & Jo', id: 1 }],
  cbblind: [{ k: 'cbblind', p: 'a', to: 'b', tn: 'Tom & Jo', id: 1, oid: 2 }],
  cbskip: [{ k: 'cbskip', p: 'a' }],
  cbcabo: [{ k: 'cbcabo', p: 'a' }],
  cbsnap: [
    { k: 'cbsnap', p: 'a', c: 'H5', ok: true },
    { k: 'cbsnap', p: 'a', c: 'H5', ok: false },
  ],
  cbround: [
    { k: 'cbround', scores: { a: 0, b: 50, c: 50 }, caller: null, ok: null, kami: 'a' },
    { k: 'cbround', scores: { a: 0, b: 12, c: 5 }, caller: 'a', ok: true, kami: null },
    { k: 'cbround', scores: { a: 22, b: 12, c: 5 }, caller: 'a', ok: false, kami: null },
    { k: 'cbround', scores: { a: 8, b: 12, c: 5 }, caller: null, ok: null, kami: null },
  ],
  cbreset: [{ k: 'cbreset', p: 'a' }],
  cbend: [{ k: 'cbend', p: 'a' }, { k: 'cbend', p: 'a', again: true }, { k: 'cbend' }],
  dev: [{ k: 'dev', fx: 'confetti' }],
};

/** Jeder Eintrag aus jeder Sicht: als Handelnde, als Ziel, unbeteiligt und als Zuschauerin, in jedem Spiel */
function rendered(): { where: string; html: string }[] {
  const out: { where: string; html: string }[] = [];
  const me0 = App.me;
  try {
    let n = 1;
    for (const list of Object.values(SAMPLES)) {
      for (const s of list) {
        const e = { ...s, n: n++ } as LogEntry;
        for (const game of GAMES) {
          const v = view(game);
          for (const [me] of PEOPLE) {
            App.me = me;
            const l = logLine(v, e);
            if (l) out.push({ where: `${e.k} ${JSON.stringify(s)} aus Sicht von ${me} (${game})`, html: l[1] });
          }
        }
      }
    }
  } finally {
    App.me = me0;
  }
  return out;
}

describe('Teil A: gerenderte Sätze im Verlauf', () => {
  const lines = rendered();

  it('rendert jede Logart ohne kaputte Sätze', () => {
    const hits: string[] = [];
    for (const { where, html } of lines) {
      const t = plain(html);
      for (const r of check(t, [...RENDER_RULES, ...RULES])) hits.push(`${r}: „${t}“ bei ${where}`);
    }
    expect(hits).toEqual([]);
  });

  it('nennt vier Gleiche im Verlauf Bombe', () => {
    const hits = lines
      .filter((l) => /^shbomb|^shburn \{[^}]*"four":true/.test(l.where))
      .filter((l) => !plain(l.html).includes('Bombe'))
      .map((l) => `${plain(l.html)} bei ${l.where}`);
    expect(hits).toEqual([]);
  });

  it('sagt bei der Bombe nur außer der Reihe, wenn sie wirklich außer der Reihe kam', () => {
    const hits: string[] = [];
    const me0 = App.me;
    try {
      for (const e of SAMPLES.shburn) {
        for (const [me] of PEOPLE) {
          App.me = me;
          // Mehrere Lognummern, damit verschiedene Sprüche drankommen
          for (let n = 1; n <= 40; n++) {
            const a = burnAnn(view('shithead'), { ...e, n });
            const t = plain(`${a.title} ${a.sub ?? ''}`);
            const where = `burnAnn ${JSON.stringify(e)} n=${n} aus Sicht von ${me}`;
            for (const r of check(t, [...RENDER_RULES, ...RULES])) hits.push(`${r}: „${t}“ bei ${where}`);
            if (e.four && !t.includes('Bombe')) hits.push(`ohne Bombe: „${t}“ bei ${where}`);
            if (!e.cut && /außer der Reihe|nicht dran|dazwischen|drängel/i.test(t))
              hits.push(`außer der Reihe ohne cut: „${t}“ bei ${where}`);
          }
        }
      }
    } finally {
      App.me = me0;
    }
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Teil B: statischer Scan

interface Unit {
  at: string;
  text: string;
}

/** Aufrufe, deren erstes Argument nie zu sehen ist (Selektoren, Klassen, Attributnamen, Ereignisse) */
const FIRST_ARG_HIDDEN = new Set([
  '$',
  '$opt',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'createElement',
  'matchMedia',
  'closest',
  'matches',
  'setAttribute',
  'getAttribute',
  'hasAttribute',
  'removeAttribute',
  'toggleAttribute',
  'addEventListener',
  'removeEventListener',
  'setProperty',
  'getPropertyValue',
  'removeProperty',
]);

const CSS_LIKE = /[{};]|px\b|var\(|calc\(|rgba|translate|^[.#[]/;
const looksVisible = (t: string): boolean =>
  /[A-Za-zÄÖÜäöüß]{2}/.test(t) && (/\s/.test(t) || /^[A-ZÄÖÜ]/.test(t)) && !CSS_LIKE.test(t);

/**
 * Text plus Attributwerte, die der Browser zeigt (title, aria-label, placeholder, alt). Steht HTML im Literal,
 * zählt zusätzlich jedes Stück zwischen zwei Tags für sich, damit ein Label direkt nach einem Tag auffällt.
 */
function unitsOf(at: string, raw: string): Unit[] {
  const attrs = [...raw.matchAll(/\b(?:title|aria-label|placeholder|alt|data-tip)="([^"]*)"/g)].map((m) => m[1]);
  const pieces = raw.includes('<') ? raw.split(/<[^>]*>/).map(decode) : [];
  const texts = [plain(raw), ...pieces, ...attrs.map(decode)].map((t) => t.replace(/\s+/g, ' ').trim());
  return [...new Set(texts)].filter(looksVisible).map((text) => ({ at, text }));
}

const isText = (n: ts.Node): boolean =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
const isPlus = (n: ts.Node): n is ts.BinaryExpression =>
  ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken;

/** Steht dieser Text an einer Stelle, die nie jemand sieht? */
function hiddenAt(node: ts.Node, sf: ts.SourceFile): boolean {
  let n = node;
  let p = n.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p))) {
    n = p;
    p = p.parent;
  }
  if (!p) return false;
  if (
    ts.isImportDeclaration(p) ||
    ts.isExportDeclaration(p) ||
    ts.isLiteralTypeNode(p) ||
    ts.isImportTypeNode(p) ||
    ts.isExternalModuleReference(p) ||
    ts.isCaseClause(p)
  )
    return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (
      k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      k === ts.SyntaxKind.EqualsEqualsToken ||
      k === ts.SyntaxKind.ExclamationEqualsToken ||
      k === ts.SyntaxKind.InKeyword
    )
      return true;
  }
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.some((a) => a === n)) {
    const callee = p.expression;
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
    const full = callee.getText(sf);
    if (full.startsWith('console.') || name === 'dlog') return true;
    if (ts.isNewExpression(p) && /Error$/.test(name)) return true;
    if (ts.isPropertyAccessExpression(callee) && /classList$/.test(callee.expression.getText(sf))) return true;
    if (p.arguments[0] === n && FIRST_ARG_HIDDEN.has(name)) return true;
  }
  return false;
}

/** Text eines Literals, Template-Spannen werden zu X */
function literalText(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => 'X' + s.literal.text).join('');
  return null;
}

function flattenPlus(n: ts.Node): ts.Node[] {
  let x = n;
  while (ts.isParenthesizedExpression(x)) x = x.expression;
  return isPlus(x) ? [...flattenPlus(x.left), ...flattenPlus(x.right)] : [x];
}

function tsUnits(file: string): Unit[] {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const rel = path.relative(ROOT, file);
  const out: Unit[] = [];
  const at = (n: ts.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node): void => {
    // Ketten mit + gelten als ein Satz, damit „…, “ + „und …“ nicht durchrutscht
    if (isPlus(n) && !(n.parent && isPlus(n.parent))) {
      const parts = flattenPlus(n);
      if (parts.some(isText)) {
        if (!hiddenAt(n, sf)) out.push(...unitsOf(at(n), parts.map((x) => literalText(x) ?? 'X').join('')));
        for (const x of parts) {
          if (ts.isTemplateExpression(x)) x.templateSpans.forEach((s) => visit(s.expression));
          else if (!isText(x)) visit(x);
        }
        return;
      }
    }
    const t = literalText(n);
    if (t !== null) {
      if (!hiddenAt(n, sf)) out.push(...unitsOf(at(n), t));
      if (ts.isTemplateExpression(n)) n.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function walk(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

/** Zeile, in der ein JSON-Wert steht */
function jsonLine(file: string, src: string, value: string): string {
  const i = src.indexOf(JSON.stringify(value).slice(1, -1));
  return `${file}:${i < 0 ? 0 : src.slice(0, i).split('\n').length}`;
}

function jsonUnits(): Unit[] {
  const out: Unit[] = [];
  const add = (file: string, pots: Record<string, readonly string[]>) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const lines of Object.values(pots))
      for (const s of lines) out.push(...unitsOf(jsonLine(file, src, s), s.replace(/\{\w+\}/g, 'X')));
  };
  add('src/content/taunts.json', tauntsJson.screen);
  add('src/content/taunts.json', tauntsJson.bot);
  add('src/content/botlines.json', botlines.lines);
  return out;
}

function htmlUnits(): Unit[] {
  const file = 'index.html';
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // Skripte, Stile und Kommentare durch Leerzeichen ersetzen, damit die Zeilennummern stimmen
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  const body = src
    .replace(/<script[\s\S]*?<\/script>/gi, blank)
    .replace(/<style[\s\S]*?<\/style>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
  const line = (i: number) => `${file}:${body.slice(0, i).split('\n').length}`;
  const out: Unit[] = [];
  for (const m of body.matchAll(/>([^<]+)</g)) out.push(...unitsOf(line(m.index), m[1]));
  for (const m of body.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g))
    out.push(...unitsOf(line(m.index), m[1]));
  for (const m of body.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"/g)) out.push(...unitsOf(line(m.index), m[1]));
  return out;
}

/** Changelog streng ab 2.7, ältere Einträge bleiben als Geschichte stehen */
function changelogUnits(): Unit[] {
  return CHANGELOG.filter((r) => cmpVersion(r.v, '2.7') >= 0).flatMap((r) =>
    [r.title, ...r.groups.flatMap((g) => [g.h, ...g.items])].flatMap((t) =>
      unitsOf(`src/content/changelog.ts (${r.v})`, t),
    ),
  );
}

function allUnits(): Unit[] {
  const files = ['src/ui', 'src/content', 'src/net']
    .flatMap((d) => walk(path.join(ROOT, d)))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith(path.join('content', 'changelog.ts')));
  return [...files.flatMap(tsUnits), ...jsonUnits(), ...htmlUnits(), ...changelogUnits()];
}

describe('Teil B: sichtbare Texte im Quelltext', () => {
  const units = allUnits();

  it('findet überhaupt Texte (der Filter ist nicht zu streng)', () => {
    const has = (s: string) => units.some((u) => u.text.includes(s));
    expect(has('Hier erscheint, was am Tisch passiert.')).toBe(true);
    expect(has('Danke fürs Aufräumen')).toBe(true);
    expect(units.some((u) => u.at.startsWith('index.html'))).toBe(true);
    expect(units.some((u) => u.at.startsWith('src/net/'))).toBe(true);
  });

  it('hält CLAUDE.md und das Glossar ein', () => {
    const hits: string[] = [];
    for (const u of units) for (const r of check(u.text, RULES)) hits.push(`${u.at} ${r}: „${u.text}“`);
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Teil C: Spruchtöpfe

/** Zu welchem Spiel ein Topf gehört, abgelesen am Namen. Ohne Spiel im Namen gilt er als gemeinsam. */
const POT_GAME: readonly (readonly [GameKind, RegExp])[] = [
  ['shithead', /^(?:mock)?[Ss]h[A-Z]|[Ss]hithead/],
  ['durak', /^(?:mock)?[Dd]k[A-Z]|[Dd]urak/],
  ['cabo', /^(?:mock)?[Cc]b[A-Z]|[Cc]abo/],
  ['schnautz', /^(?:mock)?[Ss]c[A-Z]|[Ss]chnautz/],
];
const potGame = (key: string): GameKind | null => POT_GAME.find(([, re]) => re.test(key))?.[0] ?? null;

const POTS: readonly { src: string; key: string; lines: readonly string[] }[] = [
  ...Object.entries(tauntsJson.screen).map(([key, lines]) => ({ src: 'taunts.json screen', key, lines })),
  ...Object.entries(tauntsJson.bot).map(([key, lines]) => ({ src: 'taunts.json bot', key, lines })),
  ...Object.entries(botlines.lines).map(([key, lines]) => ({ src: 'botlines.json lines', key, lines })),
];

describe('Teil C: Spruchtöpfe', () => {
  it('nennt in gemeinsamen Töpfen kein Spiel und keinen Titel', () => {
    const hits = POTS.filter((p) => !potGame(p.key)).flatMap((p) =>
      p.lines.filter((s) => /Shithead|Durak|Cabo|Schnautz/.test(s)).map((s) => `${p.src} ${p.key}: „${s}“`),
    );
    expect(hits).toEqual([]);
  });

  it('nutzt nur die Platzhalter {name}, {n} und {what}', () => {
    const hits = POTS.flatMap((p) =>
      p.lines.filter((s) => /[{}]/.test(s.replace(/\{(?:name|n|what)\}/g, ''))).map((s) => `${p.src} ${p.key}: „${s}“`),
    );
    expect(hits).toEqual([]);
  });

  it('sagt „schon wieder“ nur in Töpfen, die genau dafür gedacht sind', () => {
    const hits = POTS.filter((p) => !/Again|Stays|Forgot/.test(p.key)).flatMap((p) =>
      p.lines.filter((s) => /schon wieder/i.test(s)).map((s) => `${p.src} ${p.key}: „${s}“`),
    );
    expect(hits).toEqual([]);
  });

  it('krönt niemanden in Sprüchen für Verlierer', () => {
    const loser = /Lose|Loser|Fail|Out|^out$|Shithead|Durak|^mock/;
    const hits = POTS.filter((p) => loser.test(p.key)).flatMap((p) =>
      p.lines.filter((s) => /👑|Krone|krön/i.test(s)).map((s) => `${p.src} ${p.key}: „${s}“`),
    );
    expect(hits).toEqual([]);
  });

  it('zeigt 💩 nur bei Shithead und 🤡 nur bei Durak', () => {
    const hits = POTS.flatMap((p) =>
      p.lines
        .filter(
          (s) =>
            (s.includes('💩') && potGame(p.key) !== 'shithead') || (s.includes('🤡') && potGame(p.key) !== 'durak'),
        )
        .map((s) => `${p.src} ${p.key}: „${s}“`),
    );
    expect(hits).toEqual([]);
  });

  it('hat eigene Sprüche für vier Gleiche im eigenen Zug und keinen Satz gegen erlaubte Bomben', () => {
    expect(tauntsJson.screen.fourSelf?.length).toBeGreaterThan(0);
    expect(tauntsJson.screen.fourOther?.length).toBeGreaterThan(0);
    const hits = POTS.flatMap((p) =>
      p.lines.filter((s) => /als erlaubt/.test(s)).map((s) => `${p.src} ${p.key}: „${s}“`),
    );
    expect(hits).toEqual([]);
  });

  it('rendert jeden Spruch mit allen Platzhaltern sauber, auch ohne {what}', () => {
    const hits: string[] = [];
    const data = [
      { name: 'Lena', n: 7, what: 'Shithead' },
      { name: 'Lena', n: 7, what: 'Durak' },
      { name: 'Lena', n: 7 },
      { name: 'Lena', n: 7, what: '' },
    ];
    for (const key of Object.keys(tauntsJson.screen))
      for (const d of data)
        for (let seed = 0; seed < 60; seed++) {
          const t = taunt(key, d, seed);
          for (const r of check(t, [...TAUNT_RULES, ...RULES])) hits.push(`${key} ${JSON.stringify(d)}: ${r}: „${t}“`);
        }
    expect([...new Set(hits)]).toEqual([]);
  });
});
