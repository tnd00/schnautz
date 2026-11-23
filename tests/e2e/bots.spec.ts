/* Allein mit KI-Mitspielern: die KI spielt selbstständig, der Host nur über die Oberfläche. */
import { expect, test } from '@playwright/test';
import { rankOf } from '../../src/game/cards';
import { shCanBomb, shCanPlay, shCanThrow } from '../../src/game/shithead';
import {
  desktop,
  Errors,
  hostTable,
  mustView,
  myId,
  playerCount,
  seqBusy,
  view,
  waitForChange,
  waitForPhase,
} from './helpers';

test('Schnautz gegen zwei KI-Gegner', async ({ browser }) => {
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await host.click('[data-act=addbot]');
  await host.click('[data-act=addbot]');
  await expect.poll(() => playerCount(host)).toBe(3);
  await host.click('[data-act=start]');
  const me = await myId(host);

  for (let i = 0; i < 200; i++) {
    const v = await mustView(host);
    if (v.phase === 'end' || v.phase === 'over') break;
    const actor = v.phase === 'choose' ? v.players[v.dealer].id : v.players[v.turn].id;
    if (actor !== me) {
      await waitForChange(host, v.n, 30_000);
      continue;
    }
    if (v.phase === 'choose') await host.click('[data-act=keep]');
    else if (v.turns >= 3 && !v.knocker) await host.click('[data-act=knock]');
    else await host.click('[data-act=swapAll]');
    await waitForChange(host, v.n);
  }
  await waitForPhase(host, ['end', 'over']);
  await host.click('#overlay [data-act=ready]');
  // Die KI bestätigt selbst, danach geht die nächste Runde los
  await waitForPhase(host, ['choose', 'play', 'over'], 30_000);
  expect(errors.list).toEqual([]);
});

test('Shithead gegen eine KI bis zum Ende', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const errors = new Errors();
  const host = errors.watch(await (await desktop(browser)).newPage(), 'host');
  await hostTable(host, 'Tahna');
  await host.click('[data-act=game][data-g=shithead]');
  await host.click('[data-act=addbot]');
  await expect.poll(() => playerCount(host)).toBe(2);
  await host.click('[data-act=start]');
  await host.click('[data-act=shready]');
  await waitForPhase(host, ['play'], 30_000);
  const me = await myId(host);

  for (let i = 0; i < 2000; i++) {
    const v = await mustView(host);
    if (v.phase === 'over') break;
    if (await seqBusy(host)) {
      await host.waitForTimeout(150);
      continue;
    }
    const q = v.sh?.win ? (shCanThrow(v, me) ? 'shthrow' : null) : shCanBomb(v, me) ? 'shbomb' : null;
    if (q && (await host.locator(`[data-act=${q}]`).count())) {
      await host.click(`[data-act=${q}]`);
      await host.waitForTimeout(300);
      continue;
    }
    const S = v.sh;
    if (!S || S.win || v.players[v.turn].id !== me) {
      await host.waitForTimeout(250);
      continue;
    }
    const P = S.P[me];
    const hand = Array.isArray(P.hand) ? P.hand : [];
    if (!hand.length && !P.up.length)
      await host.click('.shme .card[data-act=shd] >> nth=0', { position: { x: 10, y: 20 } });
    else {
      const arr = hand.length ? hand : P.up;
      const i0 = arr.findIndex((c) => shCanPlay(v, rankOf(c)));
      if (i0 < 0) await host.click('[data-act=shpickup]');
      else {
        await host.click(`.shme [data-act=${hand.length ? 'shh' : 'shu'}][data-i="${i0}"]`, {
          position: { x: 8, y: 18 },
        });
        await host.click('[data-act=shplay]');
      }
    }
    await waitForChange(host, v.n);
  }
  expect((await view(host))?.phase).toBe('over');
  expect(errors.list).toEqual([]);
});
