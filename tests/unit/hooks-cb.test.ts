/*
 * Cabo auf dem gemeinsamen Tisch (Plan 2.8 Runde 4a und 4b): Die Modelle aus cbSpec erzeugen aus echten Spielständen die
 * Selektoren, die E2E, Flüge und Mess-Skripte lesen, gesperrte Knöpfe und nicht wählbare Karten nennen ihren Grund,
 * fremde verdeckte Karten verraten nichts und bis zur Krönung bleibt der neue Cabo-König verborgen.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/game/actions';
import { REJECT_TEXT } from '../../src/content/texts/reject';
import { addPlayer, newState } from '../../src/game/state';
import type { State } from '../../src/game/types';
import { viewFor } from '../../src/game/view';
import { App } from '../../src/ui/app';
import { seatOrder } from '../../src/ui/helpers';
import { meClass, meHTML } from '../../src/ui/table/me';
import { centerHTML } from '../../src/ui/table/pile';
import { seatHTML } from '../../src/ui/table/seat';
import { specOf } from '../../src/ui/table/spec';
import { parseHTML, qsa, rngF } from './helpers';

/** Cabo zu dritt (h, a, b), alle haben angesehen, die Runde läuft. Gibt auch zurück, wer dran ist. */
function play(edit?: (st: State, me: string) => void): { st: State; me: string } {
  const rng = rngF(3);
  const st = newState('h', 'H');
  addPlayer(st, 'a', 'Anna');
  addPlayer(st, 'b', 'Bert');
  act(st, 'h', { type: 'game', game: 'cabo' }, rng);
  act(st, 'h', { type: 'start' }, rng);
  for (const p of st.players) act(st, p.id, { type: 'cblook', ids: st.cb!.P[p.id].slice(0, 2).map((s) => s.id) });
  const me = st.players[st.turn].id;
  edit?.(st, me);
  return { st, me };
}

/** Tisch so, wie renderTable ihn für `me` schreibt */
function tableOf(st: State, me: string): ReturnType<typeof parseHTML> {
  const v = viewFor(st, me);
  Object.assign(App, { me, view: v, role: me === 'h' ? 'host' : 'guest', anim: {} });
  const spec = specOf('cabo');
  const center = spec.center(v);
  const m = spec.me(v);
  if (!center || !m) throw new Error('Cabo liefert keine Mitte oder keinen eigenen Platz');
  const opps = seatOrder(v).flatMap((p) => spec.seat(v, p) ?? []);
  return parseHTML(
    '<section class="game" id="scr-game"><div class="table" id="table"><div class="scorebar" id="scorebar"></div>' +
      `<div class="opps" id="opps">${opps.map(seatHTML).join('')}</div>` +
      `<div class="center" id="center">${centerHTML(center)}</div><div class="status" id="status"></div>` +
      `<div class="seat"><div class="${meClass(m)}" id="me">${meHTML(m)}</div></div></div></section>`,
  );
}

const missing = (root: ReturnType<typeof parseHTML>, sels: string[]): string[] =>
  sels.filter((s) => !qsa(root, s).length);

afterEach(() => {
  Object.assign(App, { me: '', view: null, role: null, zerHide: '', cs: { ids: [], opp: null, snap: false } });
});

describe('Cabo auf NewTable', () => {
  it('Selektoren beim Ziehen, mit gezogener Karte und beim Spionieren', () => {
    // Eine KI am Tisch, damit ihr Zeichen vor dem Namen steht. Die Punkte stehen als Wert auf der Unterkante
    const draw = play((st, me) => (st.players.find((p) => p.id !== me)!.bot = true));
    expect(
      missing(tableOf(draw.st, draw.me), [
        '#me .cbslot[data-sid]',
        '#me .cbrow',
        '#me .cbrow.mine [data-act]',
        '.opp[data-pid] .cbrow .cbslot[data-sid]',
        '#center .cbdeck[data-act=cbdeck]',
        '#center .cbdeck.can',
        '#center .cbdeck .card',
        '#center .pcount',
        '#center .cbpile',
        '#center .cbhold',
        '#center .cap',
        '#me .mehead .nm',
        '#me .mehead .pill',
        '#me [data-act=cbdeck]',
        '#me [data-act=cbcabo]',
        '.opp.sh.cb[data-act=aim]',
        '.opp .ometa .botb',
        '.opp > .val.hcount[data-k=points]',
        '#me.turn',
      ]),
    ).toEqual([]);

    const hold = play((st, me) => act(st, me, { type: 'cbdraw', from: 'deck' }));
    expect(
      missing(tableOf(hold.st, hold.me), [
        '#me [data-act=cbswap][aria-disabled=true]',
        '#me [data-act=cbdiscard]',
        '#center .cbhold.on > .card.held',
        '#center .cbhold .cnt',
        '#center .cbpile[data-act=cbdiscard]',
        '#me .cbslot.pick[data-act=cbm]',
      ]),
    ).toEqual([]);

    const spy = play((st, me) => {
      st.cb!.power = { by: me, kind: 'spy', c: 'H9' };
      st.cb!.pile.push('H9');
    });
    const root = tableOf(spy.st, spy.me);
    const other = spy.st.players.find((p) => p.id !== spy.me)!.id;
    const sid = spy.st.cb!.P[other][0].id;
    expect(
      missing(root, [
        '#opps .opp .cbslot[data-act=cbo]',
        '[data-st~=target]',
        '.opp.aimable',
        `[data-o=${other}][data-sid="${sid}"]`,
        `[data-fk="cb:${other}:${sid}"]`,
        '#me [data-act=cbskip]',
        '#center .cbpile > .card:not(.under)',
      ]),
    ).toEqual([]);
    // Ziel einer Fähigkeit ist kein Wurfziel
    expect(qsa(root, '.opp[data-st~=target][data-act=aim]')).toEqual([]);
  });

  it('gesperrte Knöpfe sind nie disabled und nennen ihren Grund, nicht wählbare Karten ebenso', () => {
    const hold = play((st, me) => act(st, me, { type: 'cbdraw', from: 'deck' }));
    const root = tableOf(hold.st, hold.me);
    expect(qsa(root, '[disabled]')).toEqual([]);
    const swap = qsa(root, '#me [data-act=cbswap]')[0].attrs;
    expect(swap['aria-description']).toBe(REJECT_TEXT['cb.pickSwap']);

    // Fremder Zug: Die eigene Karte bleibt antippbar, ist gesperrt und nennt den Grund
    const wait = play();
    const guest = wait.st.players.find((p) => p.id !== wait.me)!.id;
    const groot = tableOf(wait.st, guest);
    expect(qsa(groot, `.opp[data-pid=${wait.me}][data-st~=turn].turn`)).toHaveLength(1);
    const own = qsa(groot, '#me .cbslot[data-act=cbm]');
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((x) => !!x.attrs['aria-description'] && x.attrs['aria-disabled'] === 'true')).toBe(true);
    // Wählbare Karten tragen keinen Grund
    const pick = qsa(root, '#me .cbslot.pick[data-act=cbm]');
    expect(pick.length).toBeGreaterThan(0);
    expect(pick.some((x) => x.attrs['aria-disabled'] || x.attrs['aria-description'])).toBe(false);
    expect(own.every((x) => /^Deine \d\. Karte/.test(x.attrs['aria-label'] ?? ''))).toBe(true);
  });

  it('fremde verdeckte Karten tragen weder Namen noch Wert', () => {
    const { st, me } = play();
    const root = tableOf(st, me);
    expect(qsa(root, '#opps .card.back[aria-label]')).toEqual([]);
    expect(qsa(root, '#opps .cbv')).toEqual([]);
    expect(qsa(root, '#opps [data-fk]')).toEqual([]);
  });

  it('Cabo gerufen steht als Etikett an der Kachel und im Vorlesetext', () => {
    const { st, me } = play();
    act(st, me, { type: 'cbcabo' });
    const guest = st.players.find((p) => p.id !== me)!.id;
    const root = tableOf(st, guest);
    expect(qsa(root, `.opp[data-pid=${me}][data-st~=called] .tag.cabo[data-k=call]`)).toHaveLength(1);
    expect(qsa(root, `.opp[data-pid=${me}]`)[0].attrs['aria-label']).toMatch(/Cabo gerufen/);
  });

  it('bis zur Krönung verraten Etikett, Krone, Wert und Vorlesetext den neuen König nicht', () => {
    const { st } = play((s) => {
      s.phase = 'over';
      s.winner = 'a';
      s.players.find((p) => p.id === 'a')!.place = 1;
      s.reigns = { cabo: { win: 'a', game: 'cabo' } };
      s.players.forEach((p, i) => (p.cbp = [104, 12, 30][i]));
      // Anna kam mit 5 Punkten aus der letzten Runde von 7 auf 12
      const scores = { h: 9, a: 5, b: 3 };
      const totals = { h: 104, a: 12, b: 30 };
      s.result = {
        reason: 'cabo',
        scores,
        sums: scores,
        totals,
        resets: [],
        hands: {},
        caller: null,
        ok: null,
        kami: null,
        winner: 'a',
        names: {},
      };
    });
    App.zerHide = 'a';
    const hidden = tableOf(st, 'h');
    expect(qsa(hidden, '.tag.king')).toEqual([]);
    expect(qsa(hidden, '.reign')).toEqual([]);
    const anna = qsa(hidden, '.opp[data-pid=a]')[0].attrs['aria-label'] ?? '';
    expect(anna).not.toMatch(/Krone|König/);
    expect(anna).toMatch(/7 Punkte/);
    expect(qsa(hidden, '.opp[data-pid=a] > .rmark')).toEqual([]);
    expect(qsa(hidden, '.opp[data-pid=a] > .val')[0].attrs.title).toBe('7 Punkte');
    App.zerHide = '';
    const shown = tableOf(st, 'h');
    expect(qsa(shown, '.opp[data-pid=a] .tag.king')).toHaveLength(1);
    expect(qsa(shown, '.opp[data-pid=a] > .rmark .reign')).toHaveLength(1);
    expect(qsa(shown, '.opp[data-pid=a] > .val')[0].attrs.title).toBe('12 Punkte');
  });
});
