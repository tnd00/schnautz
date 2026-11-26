import { describe, expect, it } from 'vitest';
import {
  BAND_MIN,
  type BandGeo,
  type BandIn,
  bandGeo,
  coverWidth,
  cutsStatus,
  FIELD_MIN,
  firstFit,
  panelText,
  type Pill,
  parkedWaits,
  pillStack,
  seatVia,
  slotOf,
  STAGE_DROP,
  STAGE_MIN,
  stageRoom,
  stageTop,
  waitsForBig,
  yieldToBig,
} from '../../src/ui/band';

/*
 * Kanten aus echten Messungen am eigenen Zug (8 Plätze, Namen mit 16 Zeichen, Gastgeber): Unterkante der Gegner,
 * Unterkante der Mitte samt Regelzeile, Oberkante des eigenen Platzes und seines ersten Inhalts (am Handy die runden
 * Knöpfe 5 px unter der Oberkante, am PC der Kopf mit dem Namen), Haupt- und Unterzeile der Statuszeile.
 */
const TURN: Record<string, BandIn> = {
  'shithead 375x548': { opps: 122, pile: 253, me: 324, head: 329, status: { main: 287, text: 303 } },
  'shithead 360x640': { opps: 127, pile: 297, me: 400, head: 405, status: { main: 331, text: 347 } },
  'durak 375x548': { opps: 122, pile: 268, me: 363, head: 368, status: { main: 294, text: 325 } },
  'durak 360x640': { opps: 127, pile: 315, me: 443, head: 448, status: { main: 341, text: 372 } },
  'cabo 375x548': { opps: 159, pile: 289, me: 364, head: 369, status: { main: 315, text: 346 } },
  'schnautz 375x548': { opps: 162, pile: 262, me: 322, head: 327, status: { main: 293, text: 309 } },
  'durak 1280x860': { opps: 230, pile: 421, me: 517, head: 531, status: { main: 472, text: 490 } },
};

const span = (g: BandGeo) => g.zone.bottom - g.zone.top;

describe('Spielfläche oder Band', () => {
  it('nutzt für Spielfläche und Band dieselbe Schwelle', () => {
    expect(slotOf({ swap: false, myMove: false, field: FIELD_MIN - 1 })).toBe('band');
    expect(slotOf({ swap: false, myMove: false, field: FIELD_MIN })).toBe('field');
    // Cabo 375x548 mit offenem Reaktionsfenster: 88 px Spielfläche fielen früher auf top 13 % über die Gegner
    expect(slotOf({ swap: false, myMove: false, field: 88 })).toBe('band');
  });

  it('stellt am eigenen Zug und in der Tauschrunde immer ins Band', () => {
    expect(slotOf({ swap: false, myMove: true, field: 400 })).toBe('band');
    expect(slotOf({ swap: true, myMove: false, field: 400 })).toBe('band');
  });
});

describe('Band', () => {
  it('reicht am eigenen Zug von unter dem Stapel bis zum eigenen Platz', () => {
    expect(bandGeo(TURN['shithead 375x548'])).toEqual({
      zone: { top: 257, bottom: 323 },
      lane: { top: 305, bottom: 323 },
      dip: 326,
      guard: 289,
      text: 303,
      over: null,
      open: 126,
      st: null,
      shut: false,
      lines: [],
    });
    expect(bandGeo(TURN['schnautz 375x548'])).toEqual({
      zone: { top: 266, bottom: 321 },
      lane: { top: 311, bottom: 321 },
      dip: 324,
      guard: 295,
      text: 309,
      over: null,
      open: 166,
      st: null,
      shut: false,
      lines: [],
    });
  });

  it('lässt den Stapel samt Regelzeile frei und bleibt über dem eigenen Platz', () => {
    for (const [k, b] of Object.entries(TURN)) {
      const g = bandGeo(b);
      expect(g.zone.top, k).toBeGreaterThanOrEqual((b.pile ?? 0) + 4);
      expect(g.zone.bottom, k).toBeLessThan(b.me);
      expect(g.lane.bottom, k).toBeLessThan(b.me);
      // Die Hauptzeile der Statuszeile deckt keine kleine Meldung
      expect(g.guard, k).toBeGreaterThan(b.status?.main ?? 0);
      expect(span(g), k).toBeGreaterThanOrEqual(BAND_MIN);
    }
  });

  it('ankert ohne Spielfläche über dem offenen Reaktionsfenster, nie über den Gegnern', () => {
    // Cabo 375x548, nicht am Zug, Reaktionsfenster offen, 8 Plätze
    const g = bandGeo({
      opps: 159,
      pile: null,
      me: 364,
      emotes: { top: 259, bottom: 344 },
      status: { main: 315, text: 346 },
    });
    expect(g.zone).toEqual({ top: 163, bottom: 255 });
    expect(g.zone.top).toBeGreaterThan(159);
    expect(g.zone.bottom).toBeLessThan(259);
    // Die Statuszeile liegt unter dem Fenster und schützt nichts
    expect(g.guard).toBe(163);
  });

  it('gibt am eigenen Zug den Stapel frei, wenn das Reaktionsfenster sonst keinen Platz lässt', () => {
    // Durak 375x548 am Zug mit offenem Reaktionsfenster: zwischen Stapel (268) und Fenster (258) ist nichts frei
    const g = bandGeo({
      opps: 122,
      pile: 268,
      me: 363,
      emotes: { top: 258, bottom: 343 },
      status: { main: 294, text: 325 },
    });
    expect(g.zone).toEqual({ top: 126, bottom: 254 });
  });

  it('steht in der Tauschrunde über dem Kopf am Platz und darf ihn für große Meldungen decken', () => {
    const g = bandGeo({ opps: 122, pile: null, me: 158, deep: 250, status: null });
    expect(g.zone).toEqual({ top: 126, bottom: 249 });
    expect(g.lane).toEqual({ top: 126, bottom: 157 });
    // Reaktionsfenster über den Gegnern: das Band beginnt darunter
    const e = bandGeo({ opps: 122, pile: null, me: 158, deep: 250, emotes: { top: 53, bottom: 138 }, status: null });
    expect(e.zone.top).toBe(142);
  });
});

describe('Bühne im Band (große Meldung, Hinweis mit Spruch)', () => {
  it('steht unter der Statuszeile, wenn sie dort passt, sonst über ihr', () => {
    const g = bandGeo(TURN['durak 360x640']);
    expect(stageTop(g, 56)).toBe(374);
    expect(stageTop(g, 82)).toBe(g.zone.top);
  });

  it('deckt die Statuszeile ganz oder gar nicht, nie die Unterzeile halb', () => {
    // Shithead 375x548 am Zug: Hinweis mit Spruch (37 px) passt nicht unter die Statuszeile (268 bis 303)
    const g = bandGeo({ ...TURN['shithead 375x548'], status: { top: 268, main: 287, text: 303 } });
    expect(g.st).toEqual({ top: 268, bottom: 303 });
    // Oben im Band endete sie bei 294, mitten in der Unterzeile: Jetzt steht sie direkt unter der Hauptzeile (berührt
    // ihren Rand um 1 px) und deckt die ganze Unterzeile
    expect(stageTop(g, 37)).toBe(286);
    expect(stageTop(g, 37) + 37).toBeGreaterThanOrEqual(303);
    expect(cutsStatus(g, stageTop(g, 37), 37)).toBe(false);
    // Ohne Platz unter der Hauptzeile deckt sie die ganze Statuszeile, mittig mit Rand
    expect(stageTop(g, 37, { top: g.zone.top, bottom: 310 })).toBe(267);
    // Hoch genug für die ganze Statuszeile: mittig darüber
    expect(stageTop(g, 50)).toBe(260);
    // Niedrig genug für den Platz unter der Hauptzeile: Sie deckt nur die Unterzeile, die Hauptzeile bleibt lesbar
    expect(stageTop(g, 30)).toBe(g.guard);
    expect(cutsStatus(g, stageTop(g, 30), 30)).toBe(false);
    // Kein sauberer Platz (eine kleine Meldung steht darunter): bleibt oben, und das gilt als angeschnitten
    expect(stageTop(g, 37, { top: g.zone.top, bottom: 296 })).toBe(g.zone.top);
    expect(cutsStatus(g, g.zone.top, 37)).toBe(true);
    // Ohne gemessene Oberkante der Statuszeile wie bisher
    expect(stageTop(bandGeo(TURN['shithead 375x548']), 37)).toBe(257);
  });

  it('schneidet keine Zeile der Statuszeile halb an, die Hauptzeile bleibt möglichst frei (Messungen)', () => {
    // Durak 1280x860 am Zug, Hinweis mit einzeiligem Spruch (39 px): stand oben bei 425 bis 464 und deckte die
    // Hauptzeile (446 bis 472) zur Hälfte. Jetzt direkt unter der Hauptzeile über der Unterzeile
    const desk = bandGeo({ ...TURN['durak 1280x860'], status: { top: 446, main: 472, text: 490 } });
    expect(desk.zone).toEqual({ top: 425, bottom: 516 });
    expect(cutsStatus(desk, 425, 39)).toBe(true);
    expect(stageTop(desk, 39)).toBe(474);
    // Zweizeiliger Spruch (55 px) passt nicht unter die Hauptzeile: über der ganzen Statuszeile
    expect(stageTop(desk, 55)).toBe(440);
    // Durak 375x548: beide Höhen passen unter die Hauptzeile (früher schnitt die einzeilige die Unterzeile an)
    const phone = bandGeo({ ...TURN['durak 375x548'], status: { top: 274, main: 294, text: 325 } });
    expect(stageTop(phone, 39)).toBe(296);
    expect(stageTop(phone, 55)).toBe(296);
    // Cabo 375x548, „Cabo!“ ohne Spruch (49 px): deckte 26 von 30 px der Unterzeile, jetzt die ganze unter der
    // Hauptzeile (deren Rand sie um 1 px berührt)
    const cabo = bandGeo({ ...TURN['cabo 375x548'], status: { top: 296, main: 315, text: 346 } });
    expect(stageTop(cabo, 49)).toBe(314);
    // Durak 390x844 am Zug mit offenem Reaktionsfenster, große Meldung (49 px): unter der Hauptzeile
    const emo = bandGeo({
      opps: 162,
      pile: 428,
      me: 618,
      emotes: { top: 511, bottom: 598 },
      status: { top: 435, main: 456, text: 489 },
    });
    expect(stageTop(emo, 49)).toBe(458);
    for (const [g, h] of [
      [desk, 39],
      [desk, 55],
      [phone, 39],
      [phone, 55],
      [cabo, 49],
      [emo, 49],
    ] as const) {
      const top = stageTop(g, h);
      expect(cutsStatus(g, top, h), `${h} bei ${top}`).toBe(false);
      expect(top).toBeGreaterThanOrEqual(g.zone.top);
      expect(top + h).toBeLessThanOrEqual(g.zone.bottom);
    }
  });

  it('zählt mit, was kleine Meldungen von einer Zeile decken (sie liegen obenauf)', () => {
    // Cabo 375x548, große Meldung (47 px) über einem Grund (342 bis 361): Sie endet bei 340, von der Unterzeile (315
    // bis 346) bleiben 6 px frei, die deckt der Grund. Das ist kein Anschnitt, sie muss nicht schließen
    const cabo = bandGeo({ ...TURN['cabo 375x548'], status: { top: 296, main: 315, text: 346 } });
    const nope = { top: 342, bottom: 361 };
    expect(cutsStatus(cabo, 293, 47)).toBe(true);
    expect(cutsStatus(cabo, 293, 47, [nope])).toBe(false);
    expect(stageTop(cabo, 47, stageRoom(cabo, [nope], 47), [nope])).toBe(293);
    // Liegt die kleine woanders, hilft sie nicht
    expect(cutsStatus(cabo, 293, 47, [{ top: 200, bottom: 219 }])).toBe(true);
    // Von der Unterzeile dürfen ihre Unterlängen (4 px) frei bleiben, von der Hauptzeile nur 2 px
    expect(cutsStatus(cabo, 293, 49)).toBe(false);
    expect(cutsStatus(cabo, 299, 49)).toBe(true);
    // Schnautz 375x548, „Klopf, klopf!“ (27 px) über einem Grund (305 bis 324): Zwischen beiden schaute bei 302 bis 305
    // die Mitte der Unterzeile (294 bis 309) hervor. Eine Lücke mitten in der Zeile ist immer ein Anschnitt
    const sz = bandGeo({ ...TURN['schnautz 375x548'], status: { top: 274, main: 293, text: 309 } });
    const why = { top: 305, bottom: 324 };
    expect(cutsStatus(sz, 275, 27, [why])).toBe(true);
    expect(stageTop(sz, 27, stageRoom(sz, [why], 27), [why])).toBe(276);
    expect(cutsStatus(sz, 276, 27, [why])).toBe(false);
    // Halbe Pixel (Cabo 375x548, Stapel bis 288.7): „Cabo!“ (49 px) über „Zeit um“ ab 344 steht bündig bei 293, nicht
    // bei 292.7, sonst wüchse die Lücke zum Hinweis über 2 px und mitten in der Unterzeile schaute Schrift hervor
    const half = bandGeo({ ...TURN['cabo 375x548'], pile: 288.7, status: { top: 295.6, main: 314.8, text: 345.8 } });
    const late = { top: 344, bottom: 363 };
    expect(cutsStatus(half, 292.7, 49, [late])).toBe(true);
    expect(stageTop(half, 49, stageRoom(half, [late], 49), [late])).toBe(293);
    // Durak 390x844 am Zug mit Reaktionsfenster: große Meldung über „Zeit um“ (488 bis 507)
    const emo = bandGeo({
      opps: 162,
      pile: 428,
      me: 618,
      emotes: { top: 511, bottom: 598 },
      status: { top: 435, main: 456, text: 489 },
    });
    const auto = { top: 488, bottom: 507 };
    const room = stageRoom(emo, [auto], 49);
    expect(room).toEqual({ top: 432, bottom: 486 });
    expect(cutsStatus(emo, stageTop(emo, 49, room, [auto]), 49, [auto])).toBe(false);
  });

  it('findet für jede Höhe, die ins Band passt, einen Platz ohne halbe Zeile, wenn es einen gibt', () => {
    for (const [k, b] of Object.entries(TURN)) {
      const s = b.status;
      if (!s) continue;
      // Oberkante der Hauptzeile rund 20 px über ihrer Unterkante
      const g = bandGeo({ ...b, status: { ...s, top: s.main - 20 } });
      for (let h = 20; h <= span(g); h++) {
        const any = Array.from({ length: g.zone.bottom - h - g.zone.top + 1 }, (_, i) => g.zone.top + i).some(
          (t) => !cutsStatus(g, t, h),
        );
        if (any) expect(cutsStatus(g, stageTop(g, h), h), `${k} ${h}`).toBe(false);
      }
    }
  });

  it('ragt nie über den Stapel oder in den eigenen Platz, solange sie ins Band passt', () => {
    for (const [k, b] of Object.entries(TURN)) {
      const g = bandGeo(b);
      for (let h = 10; h <= span(g); h += 3) {
        const top = stageTop(g, h);
        expect(top, `${k} ${h}`).toBeGreaterThanOrEqual(g.zone.top);
        expect(top + h, `${k} ${h}`).toBeLessThanOrEqual(g.zone.bottom);
      }
    }
  });

  it('hat für Hinweis mit zweizeiligem Spruch überall Platz (rund 56 px)', () => {
    for (const k of ['shithead 375x548', 'durak 375x548', 'cabo 375x548', 'durak 360x640', 'shithead 360x640'])
      expect(span(bandGeo(TURN[k])), k).toBeGreaterThanOrEqual(56);
  });

  it('weicht den kleinen Meldungen aus: oberste Lücke, in die sie passt, sonst die größte', () => {
    const g = bandGeo(TURN['durak 375x548']);
    expect(g.zone).toEqual({ top: 272, bottom: 362 });
    // Ohne kleine Meldungen das ganze Band
    expect(stageRoom(g, [], 60)).toEqual(g.zone);
    // Ein Grund unten am eigenen Platz: die Bühne endet darüber
    const nope = { top: 343, bottom: 362 };
    expect(stageRoom(g, [nope], 60)).toEqual({ top: 272, bottom: 341 });
    // Grund und Automatisches: Die Lücke darüber ist zu klein für 60, sie bleibt trotzdem die größte
    expect(stageRoom(g, [nope, { top: 322, bottom: 341 }], 60)).toEqual({ top: 272, bottom: 320 });
    // Steht eine kleine Meldung weit oben, darf die Bühne darunter, wenn dort mehr Platz ist
    expect(stageRoom(g, [{ top: 300, bottom: 319 }], 60)).toEqual({ top: 321, bottom: 362 });
    // Keine Lücke für eine Titelzeile: dann gilt das ganze Band und die kleinen liegen oben
    expect(stageRoom(g, [{ top: 280, bottom: 350 }], 60)).toEqual(g.zone);
    expect(STAGE_MIN).toBe(30);
  });

  it('ragt mit der Lage aus stageRoom nie in eine kleine Meldung, solange sie in die Lücke passt', () => {
    for (const [k, b] of Object.entries(TURN)) {
      const g = bandGeo(b);
      for (const pill of [g.lane.bottom - 19, g.lane.bottom - 40, g.zone.top + 10]) {
        const pills = [{ top: pill, bottom: pill + 19 }];
        for (let h = 20; h <= span(g); h += 7) {
          const room = stageRoom(g, pills, h);
          // Ohne Lücke für eine Titelzeile gilt das ganze Band, die kleine Meldung liegt dann oben (z-index)
          const whole = room.top === g.zone.top && room.bottom === g.zone.bottom;
          if (room.bottom - room.top < h || whole) continue;
          const top = stageTop(g, h, room);
          const hit = top < pill + 19 && top + h > pill;
          expect(hit, `${k} Pille ${pill} Höhe ${h}`).toBe(false);
          expect(top).toBeGreaterThanOrEqual(g.zone.top);
          expect(top + h).toBeLessThanOrEqual(g.zone.bottom);
        }
      }
    }
  });

  it('deckt nie die Knöpfe der Statuszeile, notfalls gibt der Stapel nach', () => {
    // Shithead 375x548 im 4er-Fenster: „4 reinwerfen“ steht statt der Unterzeile
    const g = bandGeo({ ...TURN['shithead 375x548'], status: { top: 268, main: 320, text: 320 } });
    const quick = { top: 290, bottom: 320 };
    // Daneben ist kein Platz für eine Titelzeile: Die Bühne steht über den Knöpfen, auch über dem Stapel
    const room = stageRoom(g, [], 60, quick);
    expect(room).toEqual({ top: g.open, bottom: 288 });
    expect(stageTop(g, 60, room)).toBe(g.open);
    expect(stageTop(g, 60, room) + 60).toBeLessThanOrEqual(quick.top);
    expect(cutsStatus(g, stageTop(g, 60, room), 60)).toBe(false);
    // Auch ein Hinweis mit Spruch (39 px) steht über Knöpfen und Hauptzeile, ohne sie anzuschneiden
    const r39 = stageRoom(g, [], 39, quick);
    expect(stageTop(g, 39, r39) + 39).toBeLessThanOrEqual(g.st?.top ?? 0);
    // Mit Platz darüber bleibt der Stapel frei
    const h = bandGeo({ ...TURN['durak 360x640'], status: { top: 320, main: 341, text: 372 } });
    expect(stageRoom(h, [], 40, { top: 345, bottom: 372 })).toEqual({ top: 374, bottom: 442 });
    // Ohne Knöpfe im Band wie bisher
    expect(stageRoom(g, [], 60, null)).toEqual(g.zone);
    expect(stageRoom(g, [], 60, { top: 900, bottom: 930 })).toEqual(g.zone);
  });

  it('ist über Zeilen der Statuszeile so breit wie deren Text, damit seitlich nichts hervorragt', () => {
    // Durak 1280x860: Unterzeile „Tippe eine Karte …“ 300 bis 660 breit, Mitte der Bühne bei 480
    const main = { left: 395, right: 565, top: 446, bottom: 472 };
    const sub = { left: 300, right: 660, top: 474, bottom: 490 };
    // Unter der Hauptzeile über der Unterzeile: so breit wie die Unterzeile samt Rand
    expect(coverWidth(480, [main, sub], 474, 39)).toBe(360 + 16);
    // Nicht mittig: so breit, dass auch die weitere Seite gedeckt ist
    expect(coverWidth(470, [sub], 474, 39)).toBe(2 * 190 + 16);
    // Deckt sie keine Zeile (oder nur ein paar Pixel davon), bleibt sie so breit wie ihr Text
    expect(coverWidth(480, [main, sub], 492, 39)).toBe(0);
    expect(coverWidth(480, [main, sub], 488, 39)).toBe(0);
    expect(coverWidth(480, [], 474, 39)).toBe(0);
  });

  it('lässt ganze Teile weg statt abzuschneiden, in fester Reihenfolge', () => {
    expect(STAGE_DROP).toEqual(['', 'd-tt', 'd-sub', 'd-t2']);
    expect(firstFit([82, 66, 49, 31], 90)).toBe(0);
    expect(firstFit([82, 66, 49, 31], 66)).toBe(1);
    expect(firstFit([82, 66, 49, 31], 50)).toBe(2);
    expect(firstFit([82, 66, 49, 31], 20)).toBe(3);
    expect(firstFit([82], 50)).toBe(0);
  });
});

describe('Kleine Meldungen im Band (Grund, Hinweis, Automatisches)', () => {
  const hint: Pill = { h: 19, prio: 0 };
  const auto: Pill = { h: 19, prio: 1 };
  const auto2: Pill = { h: 34, prio: 1 };
  const nope: Pill = { h: 19, prio: 2 };

  it('rücken nur um das Fehlende auf den Rand des eigenen Platzes, nie auf Kopf oder runde Knöpfe', () => {
    // Schnautz 375x548: unter der Statuszeile 10 px frei, es fehlen 3 px bis zu den Unterlängen der Unterzeile
    const b = TURN['schnautz 375x548'];
    const g = bandGeo(b);
    const s = pillStack(g, [{ h: 19, prio: 2 }]);
    expect(s.tops[0]).toBe(305);
    expect(s.tops[0]! + 19).toBeLessThan(b.head!);
    expect(s.tops[0]! + 19 - (b.me - 1)).toBe(3);
    // Shithead 375x548: Die Unterlängen der Unterzeile zu berühren reicht nicht, um auf den Rand zu rücken
    expect(pillStack(bandGeo(TURN['shithead 375x548']), [{ h: 19, prio: 2 }]).tops[0]).toBe(304);
    // Höchstens bis 3 px vor den ersten Inhalt, höchstens 8 px auf den Rand
    expect(bandGeo({ ...TURN['shithead 375x548'], head: 400 }).dip).toBe(332);
    expect(bandGeo({ ...TURN['shithead 375x548'], head: 330 }).dip).toBe(327);
    expect(bandGeo({ ...TURN['shithead 375x548'], head: 326 }).dip).toBe(323);
    expect(bandGeo({ ...TURN['shithead 375x548'], head: undefined }).dip).toBe(323);
    // Ein Reaktionsfenster über dem eigenen Platz begrenzt auch den Rand
    const e = bandGeo({ ...TURN['durak 375x548'], emotes: { top: 300, bottom: 360 } });
    expect(e.dip).toBe(e.lane.bottom);
  });

  it('stehen über der Statuszeile, wenn das Reaktionsfenster direkt unter der Hauptzeile liegt', () => {
    // Shithead 390x844 am eigenen Zug mit offenem Reaktionsfenster: Die Unterzeile liegt schon unter dem Fenster
    const b: BandIn = {
      opps: 160,
      pile: 411,
      me: 566,
      head: 571,
      emotes: { top: 467, bottom: 545 },
      status: { top: 437, main: 452, text: 482 },
    };
    const g = bandGeo(b);
    expect(g.over).toBe(435);
    const s = pillStack(g, [auto]);
    expect(s.tops[0]).toBe(416);
    // Weder im Fenster noch auf der Hauptzeile noch auf dem Stapel
    expect(s.tops[0]! + 19).toBeLessThanOrEqual(b.status!.top!);
    expect(s.tops[0]!).toBeGreaterThan(b.pile!);
    // Mit Platz unter der Hauptzeile bleibt alles beim Alten
    expect(
      pillStack(bandGeo({ ...TURN['durak 375x548'], status: { top: 280, main: 294, text: 325 } }), [nope]).tops,
    ).toEqual([343]);
    // Ein zweizeiliges Automatisches hat über der Statuszeile nur Platz, wenn der Stapel weicht: Bei offenem
    // Reaktionsfenster darf er das, statt dass die Meldung im Fenster liegt
    const tall = pillStack(g, [auto2]).tops[0]!;
    expect(tall).toBe(401);
    expect(tall + 34).toBeLessThanOrEqual(b.status!.top!);
    expect(tall).toBeGreaterThanOrEqual(g.open);
  });

  it('decken die Hauptzeile auch dann nicht, wenn sie unten ans Reaktionsfenster stößt', () => {
    // Durak 360x640 am eigenen Zug mit offenem Reaktionsfenster, gemessen (Gastgeber und Gast): Hauptzeile 322 bis 341,
    // Fenster ab 340. Früher galt die Statuszeile als „unter dem Fenster“ und „⏰ Zeit um“ lag auf der Hauptzeile
    const b: BandIn = {
      opps: 127,
      pile: 315,
      me: 443,
      head: 448,
      emotes: { top: 340, bottom: 423 },
      status: { top: 322, main: 341, text: 372 },
    };
    const g = bandGeo(b);
    expect(g.guard).toBe(343);
    expect(g.over).toBe(320);
    expect(g.shut).toBe(true);
    for (const pills of [[auto], [auto2], [nope], [hint]]) {
      const top = pillStack(g, pills).tops[0]!;
      const h = pills[0].h;
      expect(top + h, JSON.stringify(pills)).toBeLessThanOrEqual(b.status!.top!);
      expect(top, JSON.stringify(pills)).toBeGreaterThan(b.opps);
    }
    expect(pillStack(g, [auto]).tops).toEqual([301]);
    // Die Regelzeile am Stapel („noch 5 Karten passen dazu“, 290 bis 308) wird ganz gedeckt statt halb
    const r = bandGeo({ ...b, lines: [{ top: 290, bottom: 308 }] });
    expect(pillStack(r, [auto]).tops).toEqual([290]);
    // Zu niedrig, um sie ganz zu decken: bleibt über der Statuszeile
    expect(pillStack(bandGeo({ ...b, lines: [{ top: 290, bottom: 315 }] }), [auto]).tops).toEqual([301]);
    // Eine Zeile, die sie nicht berührt, ändert nichts
    expect(pillStack(bandGeo({ ...b, lines: [{ top: 250, bottom: 268 }] }), [auto]).tops).toEqual([301]);
  });

  it('schneiden die Regelzeile am Stapel nicht an, wenn sie unten am Reaktionsfenster hängen', () => {
    // Durak 375x548 am Zug, gemessen: Die Statuszeile liegt ganz unter dem Fenster (ab 258), die Regelzeile (242 bis
    // 261) zum Teil. Früher lag „⏰ Zeit um“ bei 235 bis 254 auf ihrer oberen Hälfte
    const b: BandIn = {
      opps: 122,
      pile: 268,
      me: 363,
      head: 368,
      emotes: { top: 258, bottom: 343 },
      status: { top: 274, main: 294, text: 325 },
      lines: [{ top: 242, bottom: 261 }],
    };
    const g = bandGeo(b);
    expect(g.lines).toEqual([{ top: 242, bottom: 258 }]);
    const top = pillStack(g, [auto]).tops[0]!;
    expect(top).toBe(239);
    expect(top + 19).toBeLessThanOrEqual(258);
    // Ohne Fenster und mit freiem Stapel ändert eine Zeile am Stapel nichts
    expect(pillStack(bandGeo({ ...TURN['durak 375x548'], lines: [{ top: 240, bottom: 258 }] }), [nope]).tops).toEqual([
      343,
    ]);
  });

  it('liegen bei offenem Reaktionsfenster nie im Fenster und nie auf der Hauptzeile', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let n = 0; n < 400; n++) {
      const opps = 100 + rnd() * 60;
      const pile = opps + 80 + rnd() * 120;
      const top = pile + 4 + rnd() * 20;
      const main = top + 19;
      const text = main + rnd() * 32;
      // Das Fenster beginnt irgendwo zwischen Hauptzeile und Unterkante des Texts oder etwas darunter
      const em = { top: main - 2 + rnd() * (text - main + 30), bottom: 0 };
      em.bottom = em.top + 80;
      const me = em.bottom + 10 + rnd() * 30;
      // Regelzeile am Stapel, mal über, mal unter dem Fenster
      const line = pile - 10 - rnd() * 30;
      const lines = [{ top: line, bottom: line + 16 + rnd() * 6 }];
      const g = bandGeo({ opps, pile, me, head: me + 5, emotes: em, status: { top, main, text }, lines });
      const pills: Pill[] = [];
      for (let k = 0; k < 1 + (n % 3); k++) pills.push({ h: rnd() < 0.8 ? 19 : 34, prio: (k % 3) as Pill['prio'] });
      const s = pillStack(g, pills);
      pills.forEach((p, i) => {
        const t = s.tops[i];
        if (t === null) return;
        const at = `${n} ${JSON.stringify(pills)} ${i}`;
        // Nie auf der Hauptzeile
        expect(t + p.h <= top + 0.5 || t >= main - 0.5, at).toBe(true);
        // Nie im Fenster
        expect(t + p.h <= em.top + 0.5 || t >= em.bottom - 0.5, at).toBe(true);
        // Nie über den Gegnern
        expect(t, at).toBeGreaterThan(opps);
      });
    }
  });

  it('hängen unten am eigenen Platz, unter dem Text der Statuszeile', () => {
    const b = TURN['durak 375x548'];
    expect(pillStack(bandGeo(b), [nope])).toEqual({ tops: [343], evict: [] });
    expect(343).toBeGreaterThan(b.status!.text);
  });

  it('decken bei Shithead 375x548 die Unterzeile nicht, auch nicht mit Automatischem davor', () => {
    const b = TURN['shithead 375x548'];
    const g = bandGeo(b);
    for (const pills of [[nope], [auto, nope], [auto2, nope], [hint, nope], [nope, hint]]) {
      const s = pillStack(g, pills);
      const i = pills.indexOf(nope);
      expect(s.tops[i]!, JSON.stringify(pills)).toBeGreaterThan(b.status!.text);
      expect(s.tops[i]! + 19).toBeLessThan(b.me);
    }
  });

  it('stapeln sich nach oben, ältere unten, solange Platz ist', () => {
    const g = bandGeo(TURN['durak 360x640']);
    expect(pillStack(g, [hint, hint])).toEqual({ tops: [423, 402], evict: [] });
  });

  it('setzen den Grund zuunterst, Automatisches darf dafür die Unterzeile decken', () => {
    const b = TURN['durak 375x548'];
    const g = bandGeo(b);
    const s = pillStack(g, [auto, nope]);
    expect(s).toEqual({ tops: [322, 343], evict: [] });
    expect(s.tops[0]!).toBeGreaterThan(b.status!.main);
  });

  it('verdrängen erst den ältesten Hinweis, dann Automatisches, nie den Grund', () => {
    const g = bandGeo(TURN['shithead 375x548']);
    // Kein Platz für zwei unter der Statuszeile: der alte Hinweis weicht dem neuen
    expect(pillStack(g, [hint, hint]).evict).toEqual([0]);
    // Ein Hinweis weicht dem Grund, auch wenn er neuer ist
    expect(pillStack(g, [nope, hint]).evict).toEqual([1]);
    // Automatisches würde die Hauptzeile decken und weicht dem Grund
    expect(pillStack(g, [auto, nope]).evict).toEqual([0]);
    // Ein Grund weicht nie
    expect(pillStack(g, [nope, auto]).evict).toEqual([1]);
  });

  it('decken notfalls die ganze Unterzeile, nie die Hauptzeile und nie eine halbe Zeile', () => {
    const b = TURN['schnautz 375x548'];
    const g = bandGeo(b);
    // Ein zweizeiliger Grund passt auch mit dem Rand des Platzes nicht unter die Statuszeile: Er deckt die Unterzeile
    // ganz statt ihrer unteren Hälfte, nie die Hauptzeile
    expect(pillStack(g, [{ h: 34, prio: 2 }]).tops[0]).toBe(g.guard);
    expect(g.guard).toBeGreaterThan(b.status!.main);
    expect(g.guard + 34).toBeGreaterThanOrEqual(b.status!.text);
    // Ohne Rand am eigenen Platz (kein Kopf gemessen) gilt dasselbe schon für einen einzeiligen Grund
    expect(pillStack(bandGeo({ ...b, head: undefined }), [nope]).tops[0]).toBe(g.guard);
    // Ragt eine Meldung nur mit den Unterlängen in die Unterzeile, bleibt sie unten am Platz
    const c = bandGeo({ opps: 159, pile: 289, me: 364, status: { main: 315, text: 346 } });
    expect(pillStack(c, [nope]).tops[0]).toBe(344);
  });

  it('bleiben für beliebige Lagen unter der Hauptzeile, ein Grund bleibt immer', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let n = 0; n < 400; n++) {
      const opps = 100 + rnd() * 60;
      const pile = opps + 60 + rnd() * 120;
      const main = pile + 20 + rnd() * 20;
      const text = main + rnd() * 32;
      const me = text + 8 + rnd() * 120;
      const head = me + rnd() * 16;
      const g = bandGeo({ opps, pile, me, head, status: { main, text } });
      const pills: Pill[] = [];
      for (let k = 0; k < 5; k++) pills.push({ h: rnd() < 0.8 ? 19 : 34, prio: (k % 3) as Pill['prio'] });
      const s = pillStack(g, pills);
      pills.forEach((p, i) => {
        const top = s.tops[i];
        if (top === null) {
          expect(p.prio).not.toBe(2);
          expect(s.evict).toContain(i);
          return;
        }
        expect(top).toBeGreaterThan(main);
        // Ohne Notlage (direkt unter der Hauptzeile) nie auf den Kopf am eigenen Platz
        if (top > Math.round(g.guard)) expect(top + p.h).toBeLessThanOrEqual(Math.max(g.lane.bottom, head - 3) + 0.5);
      });
    }
  });
});

describe('Große Meldung in der Spielfläche', () => {
  /*
   * Gemessen bei Shithead mit 8 Plätzen, nicht am Zug, eine KI wirft außer der Reihe eine Bombe ein: „… wirft eine Bombe
   * ein“ steht an der Stapelkante, dann kommt „Bombe!“ (left, top, right, bottom)
   */
  const box = (l: number, t: number, r: number, b: number) => ({ left: l, top: t, right: r, bottom: b });
  const pill390 = box(93.6, 241, 296.4, 263.3);
  const pill360 = box(81, 162, 279, 184.3);

  it('blendet eine kleine Meldung aus, die sie schneidet (zweizeiliger Spruch, 390x844 und 360x640)', () => {
    expect(yieldToBig([box(8, 225, 382, 376.9)], [pill390])).toEqual([0]);
    // 360x640 ragt die kleine nur oben heraus
    expect(yieldToBig([box(8, 178.6, 352, 268.4)], [pill360])).toEqual([0]);
  });

  it('lässt eine kleine Meldung stehen, die sie nicht schneidet (einzeiliger Spruch, 390x844)', () => {
    expect(yieldToBig([box(20.9, 298.2, 369.1, 429.8)], [box(97.1, 241, 292.9, 263.3)])).toEqual([]);
  });

  it('zählt Berühren nicht, einen Bruchteil eines Pixels schon', () => {
    expect(yieldToBig([box(8, 263.3, 382, 376.9)], [pill390])).toEqual([]);
    expect(yieldToBig([box(8, 263, 382, 376.9)], [pill390])).toEqual([0]);
    // Daneben auf gleicher Höhe zählt nicht
    expect(yieldToBig([box(300, 225, 382, 376.9)], [pill390])).toEqual([]);
    expect(yieldToBig([box(296.4, 225, 382, 376.9)], [pill390])).toEqual([]);
  });

  it('nennt nur die kleinen Meldungen, die eine der großen schneidet, in ihrer Reihenfolge', () => {
    const below = box(93.6, 380, 296.4, 402.3);
    // Ragt unten ein Stück in die große hinein
    const edge = box(120, 370, 270, 392.3);
    expect(yieldToBig([box(8, 225, 382, 376.9)], [below, pill390, pill360, edge])).toEqual([1, 3]);
    expect(yieldToBig([], [pill390])).toEqual([]);
    expect(yieldToBig([box(8, 225, 382, 376.9), box(8, 390, 382, 420)], [below])).toEqual([0]);
  });
});

describe('Warten und Toasts', () => {
  it('Hinweise und Sprüche warten im Band auf das Ende der großen Meldung, Grund und Automatisches nicht', () => {
    expect(waitsForBig({ band: true, bigLive: true, urgent: false })).toBe(true);
    expect(waitsForBig({ band: true, bigLive: true, urgent: true })).toBe(false);
    expect(waitsForBig({ band: true, bigLive: false, urgent: false })).toBe(false);
    expect(waitsForBig({ band: false, bigLive: true, urgent: false })).toBe(false);
  });

  it('holt verdrängtes Automatisches nach, sobald kein Grund und nichts Automatisches mehr im Band steht', () => {
    expect(parkedWaits({ band: true, urgentLive: 1 })).toBe(true);
    expect(parkedWaits({ band: true, urgentLive: 0 })).toBe(false);
    // In der Spielfläche ist Platz für alle
    expect(parkedWaits({ band: false, urgentLive: 2 })).toBe(false);
  });

  it('zeigt Sitzmeldungen bei offenem Ergebnisblatt als Toast', () => {
    expect(seatVia({ phase: 'over', sheet: true })).toBe('toast');
    expect(seatVia({ phase: 'end', sheet: false })).toBe('toast');
    expect(seatVia({ phase: 'over', sheet: false })).toBe('toast');
    expect(seatVia({ phase: 'play', sheet: false })).toBe('table');
    expect(seatVia({ phase: 'swap', sheet: false })).toBe('table');
  });

  it('nennt im Rückfall am eigenen Platz die Du-Form', () => {
    expect(panelText(true, 'verbrennt den Stapel', 'verbrennst den Stapel')).toBe('Du verbrennst den Stapel');
    expect(panelText(false, 'verbrennt den Stapel', 'verbrennst den Stapel')).toBe('verbrennt den Stapel');
    expect(panelText(true, 'Neue Mitte')).toBe('Neue Mitte');
  });
});
