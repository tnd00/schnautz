/** Regelfenster: Karte „Sonderregeln“ unter dem ersten Text, nur wenn etwas vom Standard abweicht (Punkt 80). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/game/constants';
import type { Rules } from '../../src/game/types';
import { sonderHTML } from '../../src/ui/render/rules';

const rules = (patch: Partial<Rules>): Rules => ({ ...structuredClone(DEFAULT_RULES), ...patch });

describe('sonderHTML', () => {
  it('ist leer, wenn nach Standard gespielt wird', () => {
    for (const g of ['schnautz', 'shithead', 'durak', 'cabo'] as const) expect(sonderHTML(DEFAULT_RULES, g)).toBe('');
  });

  it('listet Abweichungen des gezeigten Spiels, groß geschrieben', () => {
    const r = rules({ turnSecs: 45, sh: { ...DEFAULT_RULES.sh, ten: !DEFAULT_RULES.sh.ten } });
    const h = sonderHTML(r, 'shithead');
    expect(h).toContain('<section class="rsec rsonder g-shithead"><h3>Sonderregeln</h3>');
    expect(h).toContain('<li>45 s pro Zug</li>');
    expect(h).toContain(`<li>10 verbrennt ${DEFAULT_RULES.sh.ten ? 'aus' : 'an'}</li>`);
    // Die Shithead-Regel gehört nicht in die Karte von Durak, das Zeitlimit gilt für alle
    expect(sonderHTML(r, 'durak')).not.toContain('verbrennt');
    expect(sonderHTML(r, 'durak')).toContain('<li>45 s pro Zug</li>');
  });

  it('nennt Leben bei Schnautz und Zielpunkte bei Cabo', () => {
    expect(sonderHTML(rules({ lives: DEFAULT_RULES.lives + 2 }), 'schnautz')).toContain(
      `<li>${DEFAULT_RULES.lives + 2} Leben</li>`,
    );
    expect(sonderHTML(rules({ turnSecs: 0 }), 'cabo')).toContain('<li>Ohne Zeitlimit</li>');
  });
});
