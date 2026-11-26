/*
 * Kern des Vorlesers ohne DOM (src/ui/a11y/say.ts, Plan 2.8 Abschnitt 9.1): kein Verlierer vor der Enthüllung, keine
 * Werte, die der Bildschirm nicht zeigt, nichts nach resetSay, höchstens drei Sätze pro Schub, Dubletten fallen weg.
 * Dazu `emit` mit einer Attrappe: Große Meldungen spricht er erst, wenn sie erscheinen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coreBatch,
  coreDraw,
  coreFlush,
  coreReset,
  coreSay,
  coreStatus,
  newSayCore,
  plain,
  say,
  SAY_MAX,
  sentences,
} from '../../src/ui/a11y/say';
import { ANN, announce, emit, resetAnnouncements } from '../../src/ui/feedback';

vi.mock('../../src/ui/a11y/say', async (orig) => ({
  ...(await orig<typeof import('../../src/ui/a11y/say')>()),
  say: vi.fn(),
  resetSay: vi.fn(),
}));
vi.mock('../../src/ui/render/index', () => ({ render: vi.fn() }));
vi.mock('../../src/ui/sound', () => ({ sfx: vi.fn(), sfxCalm: vi.fn() }));

describe('Vorleser', () => {
  it('sagt den Shithead erst nach der Enthüllung', () => {
    const c = newSayCore();
    coreBatch(c, 40);
    coreSay(c, 'Lena ist der Shithead!', 'big', ['Lena']);
    coreSay(c, 'Aufdecken …', 'info', ['Lena']);
    expect(coreFlush(c)).toBe('Aufdecken …');
    coreSay(c, 'Lena ist der Shithead!', 'big', []);
    expect(coreFlush(c)).toBe('Lena ist der Shithead!');
  });

  it('sagt keine gesperrten Kartenwerte (fremde Cabo-Karten)', () => {
    const c = newSayCore();
    coreSay(c, 'Tom hat eine Herz Sieben', 'info', ['Herz Sieben']);
    coreSay(c, 'Tom schaut eine Karte an', 'info', ['Herz Sieben']);
    expect(coreFlush(c)).toBe('Tom schaut eine Karte an.');
  });

  it('sagt nach resetSay nichts Wartendes und keinen alten Schub', () => {
    const c = newSayCore();
    coreBatch(c, 10);
    coreSay(c, 'Du nimmst 7 Karten', 'mine');
    coreReset(c, 12);
    expect(coreFlush(c)).toBe('');
    coreBatch(c, 12);
    coreSay(c, 'Alter Zug', 'mine');
    expect(coreFlush(c)).toBe('');
    coreBatch(c, 13);
    coreSay(c, 'Neuer Zug', 'mine');
    expect(coreFlush(c)).toBe('Neuer Zug.');
  });

  it('nimmt nach dem Laden den Wasserstand beim ersten Zeichnen', () => {
    const c = newSayCore();
    coreDraw(c, 30);
    coreDraw(c, 35);
    expect(c.mark).toBe(30);
    coreBatch(c, 30);
    coreSay(c, 'Alter Zug', 'mine');
    expect(coreFlush(c)).toBe('');
    // resetSay(0) beim Verlassen des Tisches: wieder offen bis zum nächsten Zeichnen
    coreReset(c, 0);
    coreDraw(c, 8);
    expect(c.mark).toBe(8);
    // Kam zuerst ein Schub (Lobby ohne Statuszeile), ist das Laden vorbei
    const d = newSayCore();
    coreBatch(d, 5);
    coreDraw(d, 5);
    expect(d.mark).toBe(0);
  });

  it('sagt höchstens drei Sätze pro Schub, die wichtigsten, in ihrer Reihenfolge', () => {
    const c = newSayCore();
    coreSay(c, 'eins', 'info');
    coreSay(c, 'Bombe!', 'big');
    coreSay(c, 'zwei', 'info');
    coreSay(c, 'Du bist dran', 'turn');
    coreSay(c, 'Du nimmst 3 Karten', 'mine');
    expect(SAY_MAX).toBe(3);
    expect(coreFlush(c)).toBe('Bombe! Du bist dran. Du nimmst 3 Karten.');
    expect(coreFlush(c)).toBe('');
  });

  it('lässt Dubletten weg, auch eine Statuszeile, die bei jedem Zeichnen kommt', () => {
    const c = newSayCore();
    coreSay(c, 'Passt nicht.', 'mine');
    coreSay(c, 'Passt nicht.', 'mine');
    expect(coreFlush(c)).toBe('Passt nicht.');
    const st = { main: '<em>Du bist dran.</em>', sub: '', tone: 'turn' as const };
    expect(coreStatus(c, st)).toBe('Du bist dran.');
    expect(coreStatus(c, st)).toBe('');
    expect(coreStatus(c, { main: '<b>Lena</b> ist dran.', sub: '', tone: 'calm' })).toBe('');
    expect(coreStatus(c, st)).toBe('Du bist dran.');
  });

  it('macht aus HTML reinen Text', () => {
    expect(plain('<b>Tom &amp; Jerry</b> legen <span class="x">2</span> ,  fertig')).toBe(
      'Tom & Jerry legen 2, fertig',
    );
    expect(sentences('Bombe!', '', 'Lena legt vier')).toBe('Bombe! Lena legt vier.');
  });
});

/* ---------- emit mit Attrappe ---------- */

const classes = () => {
  const s = new Set<string>();
  return {
    contains: (c: string) => s.has(c),
    add: (...c: string[]) => c.forEach((x) => s.add(x)),
    remove: (...c: string[]) => c.forEach((x) => s.delete(x)),
    toggle: (c: string, on?: boolean) => ((on ?? !s.has(c)) ? s.add(c) : s.delete(c), s.has(c)),
  };
};
const fakeEl = () => ({
  classList: classes(),
  style: { top: '', removeProperty: () => '' },
  dataset: {},
  innerHTML: '',
  title: '',
  className: '',
  addEventListener: () => {},
  appendChild: () => {},
  remove: () => {},
  querySelectorAll: () => [],
});

describe('Vorleser in emit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const ann = fakeEl();
    vi.stubGlobal('document', {
      body: { classList: classes() },
      hidden: false,
      createElement: fakeEl,
      querySelector: (sel: string) => (sel === '#announce' ? ann : null),
      querySelectorAll: () => [],
      getElementById: () => null,
    });
    vi.mocked(say).mockClear();
  });
  afterEach(() => {
    resetAnnouncements();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('spricht eine große Meldung erst, wenn sie erscheint', () => {
    // Es läuft schon eine Meldung, die neue reiht sich ein
    ANN.busy = true;
    emit({ level: 'big' }, { text: 'Bombe!', title: 'Bombe!', sub: 'Lena legt <b>vier</b>' });
    expect(say).not.toHaveBeenCalled();
    expect(ANN.q).toHaveLength(1);
    ANN.busy = false;
    announce({ title: 'Danach' });
    expect(say).toHaveBeenCalledWith('Bombe! Lena legt vier.', 'big');
  });

  it('spricht nach onShow, die Zeremonie gibt dort den Verlierer frei', () => {
    const order: string[] = [];
    vi.mocked(say).mockImplementation(() => void order.push('say'));
    announce({ title: 'Lena ist der Shithead!', say: 'Lena ist der Shithead!', onShow: () => order.push('show') });
    expect(order).toEqual(['show', 'say']);
  });
});
