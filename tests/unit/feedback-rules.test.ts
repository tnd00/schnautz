import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../src/game/types';
import { genitive, SEAT } from '../../src/content/texts/seat';
import {
  holdsBatch,
  levelInBatch,
  movedEnough,
  newBatch,
  ownSeatNote,
  SEAT_FRESH,
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
  it('klein hat keinen Meldeton, außer bei Automatischem', () => {
    expect(toneOf(SMALL, 'small')).toEqual({ calm: false });
    expect(toneOf(AUTO, 'small')).toEqual({ calm: true });
  });

  it('der Klang des Ereignisses bleibt auch bei klein (Karte, Tipp, Schnappen, Blindtausch)', () => {
    for (const s of ['card', 'pop', 'smack'] as const) {
      expect(toneOf(SMALL, 'small', s)).toEqual({ sfx: s, calm: false });
      // Er ersetzt den leisen Meldeton, auch bei Automatischem klingt nur einmal etwas
      expect(toneOf(AUTO, 'small', s)).toEqual({ sfx: s, calm: false });
    }
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

// Wo Meldungen stehen, rechnet src/ui/band.ts (tests/unit/band.test.ts)
describe('Lage der Meldungen', () => {
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

  it('meldet nur einen frischen Sitz-Eintrag, nicht noch einmal in einem neuen Tab', () => {
    const take = { k: 'takeover', p: 'me', name: 'Tahna', from: 'Uschi' } as const;
    const chat = (k: number) => Array.from({ length: k }, () => ({ k: 'chat', p: 'a', text: 'na' }) as const);
    // Gleich danach: ein paar Einträge (KI-Züge, Chat) dürfen dazwischen liegen
    expect(ownSeatNote(log({ k: 'shplay', p: 'a' }, take), 'me', -1)?.n).toBe(2);
    expect(ownSeatNote(log(take, ...chat(SEAT_FRESH)), 'me', -1)?.text).toBe('Du übernimmst Uschis Platz samt Karten.');
    expect(ownSeatNote(log(take, ...chat(SEAT_FRESH + 1)), 'me', -1)).toBeNull();
    // Übernahme bei Nummer 5, danach 84 Einträge, wie im Verlauf einer Ansicht (90 Einträge)
    const old = log(...chat(4), take, ...chat(84));
    expect(old).toHaveLength(89);
    expect(ownSeatNote(old, 'me', -1)).toBeNull();
    // Ebenso die Rückkehr
    expect(ownSeatNote(log({ k: 'back', p: 'me' }, ...chat(84)), 'me', -1)).toBeNull();
    expect(ownSeatNote(log({ k: 'back', p: 'me' }), 'me', -1)?.text).toBe(SEAT.backSelf);
  });

  it('eine Übernahme in der Lobby heißt am Tisch nie „samt Karten“', () => {
    // In der Lobby übernommen, dann beginnt die Partie: Ein neuer Tab am Tisch meldet nichts
    const take = { k: 'takeover', p: 'me', name: 'Tahna', from: 'Uschi' } as const;
    for (const k of ['game', 'shdeal', 'dkdeal', 'cbdeal', 'round', 'lobby', 'abort'] as const)
      expect(ownSeatNote(log(take, { k } as Partial<LogEntry>), 'me', -1)).toBeNull();
    const start = log(take, { k: 'game', g: 1, game: 'shithead' }, { k: 'shdeal' });
    expect(ownSeatNote(start, 'me', -1)).toBeNull();
    // Mitten in der Partie übernommen: kein neuer Anfang danach, die Meldung kommt
    const mid = log({ k: 'game', g: 1, game: 'shithead' }, { k: 'shdeal' }, take);
    expect(ownSeatNote(mid, 'me', -1)?.text).toBe('Du übernimmst Uschis Platz samt Karten.');
  });

  it('zählt nur der letzte Sitz-Eintrag: zurück ja, gegangen nein', () => {
    const back = log({ k: 'takeover', p: 'me', from: 'Uschi' }, { k: 'tobot', p: 'me' }, { k: 'back', p: 'me' });
    expect(ownSeatNote(back, 'me', 1)?.text).toBe(SEAT.backSelf);
    const gone = log({ k: 'takeover', p: 'me', from: 'Uschi' }, { k: 'tobot', p: 'me' });
    expect(ownSeatNote(gone, 'me', -1)).toBeNull();
  });
});
