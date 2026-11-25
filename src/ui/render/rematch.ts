/* Revanche in der Oberfläche: Knöpfe, Zeile im Ergebnisfenster, Ansagen und Verlauf. */
import type { LogEntry, RematchDuel, RematchOffer, View } from '../../game/types';
import { duelText, persp } from '../../content/texts/log';
import { App } from '../app';
import { esc } from '../dom';
import { nameOf, pById } from '../helpers';

/** Offene Revanche dieser Partie und das daraus entstandene Duell, defensiv gelesen. */
export function rematchOf(v: View): { rm: RematchOffer | null; du: RematchDuel | null } {
  const r = v.rematch;
  const rm = v.phase === 'over' && r && r.game === v.games && Array.isArray(r.can) ? r : null;
  const d = v.rematchDuel;
  const du = rm?.by && d && d.by === rm.by && d.game === v.games + 1 ? d : null;
  return { rm, du };
}

/** Darf ich gerade Revanche fordern? */
export function canChallenge(v: View): boolean {
  const { rm } = rematchOf(v);
  const me = v.players.find((p) => p.id === App.me);
  return !!rm && !rm.by && rm.can.includes(App.me) && !!me && !me.ready;
}

/** Bin ich der Herausgeforderte und muss noch annehmen? */
export function mustAccept(v: View): boolean {
  const { du } = rematchOf(v);
  const me = v.players.find((p) => p.id === App.me);
  return !!du && du.vs === App.me && !!me && !me.ready;
}

const N = (v: View, id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));

/** Zeile anstelle des Spruchs: offene Forderung oder Ausgang des Duells. */
export function rematchLine(v: View): string {
  const { rm, du } = rematchOf(v);
  if (rm?.by) {
    const by = rm.by;
    if (!du) return by === App.me ? '⚔️ Du willst Revanche.' : `⚔️ ${N(v, by)} will Revanche.`;
    if (by === App.me) return `⚔️ Du forderst ${N(v, du.vs)} heraus.`;
    if (du.vs === App.me) return `⚔️ ${N(v, by)} will Revanche. Traust du dich?`;
    return `⚔️ ${N(v, by)} fordert ${N(v, du.vs)} zur Revanche.`;
  }
  const d = v.rematchDuel;
  if (v.phase !== 'over' || !d || d.game !== v.games || !d.res) return '';
  return `⚔️ ${duelResult(v, d)}`;
}

/** Ausgang eines Duells aus Sicht der jeweiligen Person. Der Wortlaut steht im Katalog (duelText). */
export function duelResult(v: View, d: { by: string; vs: string; res?: string }, bn?: string, vn?: string): string {
  const t = persp({
    me: App.me,
    game: v.game,
    name: (id, fb) => pById(v, id)?.name ?? fb ?? 'Jemand',
    wrap: esc,
    esc,
    card: () => '',
  });
  return duelText(t, d, bn, vn);
}

/** ⚔️ hinter dem Namen, wer gefordert hat. */
export function rematchMark(v: View, id: string): string {
  const { rm } = rematchOf(v);
  return rm?.by === id ? ' <span class="rmk" title="fordert Revanche">⚔️</span>' : '';
}

/** Große Ansage zur Forderung. */
export function rematchAnn(v: View, e: Extract<LogEntry, { k: 'rematch' }>): { title: string; sub: string } {
  const me = e.p === App.me;
  const vsMe = e.to === App.me;
  const by = N(v, e.p, e.name);
  const vs = N(v, e.to, e.tn);
  if (!e.to) return { title: me ? 'Du willst Revanche!' : `${by} will Revanche!`, sub: 'Alle nochmal an den Tisch.' };
  if (e.c >= 2)
    return {
      title: `Revanche Nummer ${e.c}!`,
      sub: me
        ? `Du forderst ${vs} erneut heraus.`
        : vsMe
          ? `${by} fordert dich erneut heraus. Zeig, dass es kein Glück war.`
          : `${by} gegen ${vs}. Popcorn bereit?`,
    };
  if (me) return { title: 'Du forderst Revanche!', sub: `Gegen ${vs}. Diesmal zählt es.` };
  if (vsMe) return { title: `${by} fordert dich heraus!`, sub: 'Zeig, dass es kein Glück war.' };
  return { title: `${by} will Revanche!`, sub: `Gegen ${vs}. Popcorn bereit?` };
}

/** Kurzer Hinweis zu Beginn der Revanche-Partie. */
export function duelRunning(v: View): string {
  const d = v.rematchDuel;
  if (!d || d.game !== v.games || d.res) return '';
  if (d.by === App.me) return `⚔️ Revanche läuft. Du gegen ${nameOf(v, d.vs)}.`;
  if (d.vs === App.me) return `⚔️ Revanche läuft. ${nameOf(v, d.by)} gegen dich.`;
  return `⚔️ Revanche läuft. ${nameOf(v, d.by)} gegen ${nameOf(v, d.vs)}.`;
}
