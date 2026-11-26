/*
 * Barrierefreiheit per axe (WCAG 2.2 AA) für die Specs der Spiele. Noch in keiner Spec eingebaut, das kommt mit
 * Runde 3 (Shithead) und 4b (die anderen drei), siehe Plan 2.8 Abschnitt 9.2.
 *
 *   const found = await axeCheck(page, { include: '#scr-game', disable: ['color-contrast'] });
 *
 * Ohne `soft` lässt ein Befund den Test scheitern, mit `soft` steht er nur als Vermerk (Annotation `axe`) am Test.
 * Die Rückgabe ist in beiden Fällen die lesbare Befundliste (leer heißt nichts gefunden).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Regelgruppen von axe für WCAG 2.0, 2.1 und 2.2 jeweils A und AA. */
export const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'] as const;

export interface AxeOptions {
  /** Nur diesen Bereich prüfen, etwa '#scr-game' oder '#overlay' */
  include?: string | string[];
  /** Bereiche auslassen, etwa '#fly' für Meldungen im Flug */
  exclude?: string | string[];
  /** Regeln einzeln abschalten, etwa ['color-contrast'] */
  disable?: string[];
  /** Andere Regelgruppen statt WCAG 2.2 AA */
  tags?: string[];
  /** Kleinste Wirkung, die zählt (Standard alle: minor, moderate, serious, critical) */
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  /** Nicht scheitern, nur als Vermerk am Test notieren */
  soft?: boolean;
  /** Ort für die Meldung im Bericht, etwa 'Shithead eigener Zug 390x844' */
  where?: string;
}

const RANK = { minor: 0, moderate: 1, serious: 2, critical: 3 } as const;
const list = (x: string | string[] | undefined): string[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/**
 * axe auf der Seite laufen lassen und die Verstöße als Zeilen zurückgeben, je Regel eine Zeile mit Wirkung, Zahl der
 * Treffer und den ersten drei Selektoren, etwa
 * `serious button-name (2): Buttons must have discernible text | #emofab, .fab.logfab`.
 */
export async function axeCheck(page: Page, opts: AxeOptions = {}): Promise<string[]> {
  let b = new AxeBuilder({ page }).withTags(opts.tags ?? [...WCAG_AA]);
  for (const s of list(opts.include)) b = b.include(s);
  for (const s of list(opts.exclude)) b = b.exclude(s);
  if (opts.disable?.length) b = b.disableRules(opts.disable);
  const res = await b.analyze();
  const min = RANK[opts.impact ?? 'minor'];
  const found = res.violations
    .filter((v) => RANK[v.impact ?? 'minor'] >= min)
    .map((v) => {
      const where = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(', ');
      const more = v.nodes.length > 3 ? ` und ${v.nodes.length - 3} weitere` : '';
      return `${v.impact ?? '?'} ${v.id} (${v.nodes.length}): ${v.help} | ${where}${more}`;
    });
  const label = opts.where ? `axe ${opts.where}` : 'axe';
  if (!opts.soft) expect(found, label).toEqual([]);
  else
    try {
      for (const f of found) test.info().annotations.push({ type: 'axe', description: `${label}: ${f}` });
    } catch {
      // außerhalb eines Tests, dann zählt nur die Rückgabe
    }
  return found;
}
