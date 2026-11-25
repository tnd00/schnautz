import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../src/game/types';
import { genitive, SEAT } from '../../src/content/texts/seat';
import {
  bandBox,
  holdsBatch,
  levelInBatch,
  movedEnough,
  newBatch,
  ownSeatNote,
  slotOf,
  toneOf,
} from '../../src/ui/feedback-rules';
import type { Cue } from '../../src/ui/levels';

const SMALL: Cue = { level: 'small' };
const AUTO: Cue = { level: 'small', sound: true };
const MID: Cue = { level: 'mid' };
const BIG: Cue = { level: 'big' };
const BEAT: Cue = { level: 'big', beat: true };

describe('pro Zug höchstens ein Großes', () => {
  it('das zweite Große wird mittel, Takte zählen nicht mit', () => {
    const b = newBatch([{ k: 'shburn' }]);
    expect(levelInBatch(BEAT, b)).toBe('big');
    expect(levelInBatch(BIG, b)).toBe('big');
    expect(levelInBatch(BEAT, b)).toBe('big');
    expect(levelInBatch(BIG, b)).toBe('mid');
    expect(levelInBatch(SMALL, b)).toBe('small');
    expect(levelInBatch(MID, b)).toBe('mid');
  });

  it('neuer Schub gibt das Große wieder frei', () => {
    const b = newBatch();
    expect(levelInBatch(BIG, b)).toBe('big');
    expect(levelInBatch(BIG, newBatch())).toBe('big');
  });

  it('steht ein Ende im Schub, wird nichts gekürzt (annLeft und Enthüllung bleiben gleich)', () => {
    for (const k of ['shend', 'dkend', 'cbend', 'result', 'winner', 'cbround', 'rematchend'] as const) {
      expect(holdsBatch([{ k: 'shplay' }, { k }])).toBe(true);
      const b = newBatch([{ k }]);
      expect(levelInBatch(BIG, b)).toBe('big');
      expect(levelInBatch(BIG, b)).toBe('big');
    }
    expect(holdsBatch([{ k: 'shburn' }, { k: 'shpickup' }])).toBe(false);
  });
});

describe('Ton je Stufe', () => {
  it('klein ist still, außer bei Automatischem oder eigenem Klang', () => {
    expect(toneOf(SMALL, 'small')).toEqual({ calm: false });
    expect(toneOf(AUTO, 'small')).toEqual({ calm: true });
    expect(toneOf(SMALL, 'small', 'smack')).toEqual({ sfx: 'smack', calm: false });
  });

  it('mittel klingt immer, der eigene Klang ersetzt den Meldeton', () => {
    expect(toneOf(MID, 'mid')).toEqual({ calm: true });
    expect(toneOf(MID, 'mid', 'knock')).toEqual({ sfx: 'knock', calm: false });
    // Ein gekürztes Großes klingt wie mittel
    expect(toneOf(BIG, 'mid')).toEqual({ calm: true });
  });

  it('groß spielt den Meldeton in announce selbst, dazu nur den eigenen Klang', () => {
    expect(toneOf(BIG, 'big')).toEqual({ calm: false });
    expect(toneOf(BIG, 'big', 'bomb')).toEqual({ sfx: 'bomb', calm: false });
  });
});

describe('Lage der Meldungen', () => {
  it('am eigenen Zug, in der Tauschrunde und ohne Spielfläche als Band', () => {
    expect(slotOf({ swap: false, myMove: false, field: true })).toBe('field');
    expect(slotOf({ swap: false, myMove: true, field: true })).toBe('band');
    expect(slotOf({ swap: true, myMove: false, field: true })).toBe('band');
    expect(slotOf({ swap: false, myMove: false, field: false })).toBe('band');
  });

  it('Band endet unten mit der Statuszeile und wächst nur bis knapp unter den Stapel', () => {
    const status = { left: 10, top: 500, width: 340, height: 56 };
    expect(bandBox(status, 450)).toEqual({ left: 10, top: 454, width: 340, height: 102 });
    // Viel Platz: höchstens 150 hoch
    expect(bandBox(status, 100).height).toBe(150);
    // Kein Platz: nie niedriger als die Zeile selbst
    expect(bandBox(status, 520)).toEqual(status);
  });

  it('verschiebt erst ab mehr als ein paar Pixeln', () => {
    const a = { left: 100, top: 200, width: 300, height: 80 };
    expect(movedEnough(a, { ...a, top: 203 })).toBe(false);
    expect(movedEnough(a, { ...a, left: 96 })).toBe(false);
    expect(movedEnough(a, { ...a, top: 210 })).toBe(true);
    expect(movedEnough(a, { ...a, height: 40 })).toBe(true);
  });
});

describe('Kommen, Gehen, Zurück und Übernahme', () => {
  it('Genitiv für den Platz', () => {
    expect(genitive('Uschi')).toBe('Uschis');
    expect(genitive('Klaus')).toBe("Klaus'");
    expect(genitive('Max')).toBe("Max'");
    expect(genitive('Fritz')).toBe("Fritz'");
    expect(genitive('KI Igor')).toBe('KI Igors');
  });

  it('wer übernimmt, liest „samt Karten“, die anderen nicht', () => {
    expect(SEAT.takeoverSelf('Uschi')).toBe('Du übernimmst Uschis Platz samt Karten.');
    expect(SEAT.takeover('Lena', 'Uschi')).toBe('Lena setzt sich an Uschis Platz.');
    expect(SEAT.tobot('Uschi')).toBe('Uschi ist gegangen, die KI spielt weiter.');
    expect(SEAT.timeout('Lena')).toBe('⏰ Zeit um, die KI spielt einmal für Lena.');
  });

  const log = (...x: Partial<LogEntry>[]) => x.map((e, i) => ({ n: i + 1, ...e }) as LogEntry);

  it('eigene Übernahme einmal nach der ersten Ansicht, dann nicht wieder', () => {
    const l = log({ k: 'chat', p: 'me' }, { k: 'takeover', p: 'me', name: 'Tahna', from: 'Uschi' });
    expect(ownSeatNote(l, 'me', -1)).toEqual({ n: 2, text: 'Du übernimmst Uschis Platz samt Karten.' });
    expect(ownSeatNote(l, 'me', 2)).toBeNull();
    expect(ownSeatNote(l, 'other', -1)).toBeNull();
  });

  it('zählt nur der letzte Sitz-Eintrag: zurück ja, gegangen nein', () => {
    const back = log({ k: 'takeover', p: 'me', from: 'Uschi' }, { k: 'tobot', p: 'me' }, { k: 'back', p: 'me' });
    expect(ownSeatNote(back, 'me', 1)?.text).toBe(SEAT.backSelf);
    const gone = log({ k: 'takeover', p: 'me', from: 'Uschi' }, { k: 'tobot', p: 'me' });
    expect(ownSeatNote(gone, 'me', -1)).toBeNull();
  });
});
