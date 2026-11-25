import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO } from '../../game/constants';
import type { LogEntry, View } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { type Announcement, announce, floatLabel, holdForAnnouncements, shakePanel, tauntLabel } from '../feedback';
import { nameOf, vb } from '../helpers';
import { sfx } from '../sound';
import { shitheadCeremony } from '../ceremony';
import { taunt } from '../taunts';

type CbEntry = Extract<LogEntry, { k: `cb${string}` }>;

const isCb = (e: LogEntry): e is CbEntry => e.k.startsWith('cb');

/** Was eine abgelegte Karte erlaubt, als kurzer Hinweis am Platz. */
const CB_POWER_LABEL = {
  peek: ['darf eine eigene Karte ansehen', 'darfst eine eigene Karte ansehen'],
  spy: ['darf spionieren', 'darfst spionieren'],
  swap: ['darf blind tauschen', 'darfst blind tauschen'],
} as const;

/** Cabo: Rundenbeginn, Klänge am Tisch, Cabo-Ruf, Spionieren und Blindtausch, Schnappen, Abrechnung, Krönung. */
export function caboEffect(prev: View, v: View, e0: LogEntry, fresh: readonly LogEntry[]): void {
  if (!isCb(e0)) return;
  const e = e0;
  const mine = e.p === App.me;
  const N = (id: string | null | undefined, fb?: string) => esc(nameOf(v, id, fb));
  /** Name nach „bei“ oder „mit“ als reiner Text, nur für floatLabel (setzt textContent, maskiert selbst) */
  const toWhom = (id: string | null | undefined, fb?: string) => (id === App.me ? 'dir' : nameOf(v, id, fb));
  // Endet die Partie im selben Schub, wartet alles Kleine bis nach der Krönung
  const ending = fresh.some((x) => x.k === 'cbend');
  switch (e.k) {
    case 'cbdeal': {
      // Den Austeilklang spielt schon das Austeilen selbst (src/ui/apply.ts)
      const first = e.r === 1;
      announce({
        icon: '🃏',
        tone: 'gold',
        title: first ? 'Cabo!' : `Runde ${num(e.r)}`,
        sub:
          (first ? 'Wenig Punkte gewinnen. ' : '') +
          'Sieh dir zwei deiner Karten an und merk sie dir gut. ' +
          `${N(e.start)}${vb(e.start, ' fängst', ' fängt')} an.`,
        ms: first ? 2600 : 1800,
      });
      return;
    }
    case 'cblook':
      if (mine) sfx('pop');
      return;
    case 'cbdraw':
      if (!mine) sfx('card');
      if (!mine && e.from === 'pile') setTimeout(() => floatLabel(e.p, 'nimmt von der Ablage'), 60);
      return;
    case 'cbswap': {
      if (!mine) sfx('card');
      if (!e.ok) {
        sfx('nope');
        shakePanel(e.p);
        setTimeout(() => floatLabel(e.p, 'greift daneben, Strafkarte!', 'greifst daneben, Strafkarte!'), 60);
      } else if (e.slots > 1)
        setTimeout(() => floatLabel(e.p, `wirft ${e.slots} gleiche ab`, `wirfst ${e.slots} gleiche ab`), 60);
      return;
    }
    case 'cbdiscard':
      if (!mine) sfx('card');
      if (e.power) {
        const [er, du] = CB_POWER_LABEL[e.power];
        setTimeout(() => floatLabel(e.p, er, du), 60);
      }
      return;
    case 'cbpeek':
      if (!mine) setTimeout(() => floatLabel(e.p, 'schaut sich eine Karte an'), 60);
      return;
    case 'cbspy':
      if (mine) return;
      setTimeout(() => floatLabel(e.p, `spioniert bei ${toWhom(e.to, e.tn)}`), 60);
      if (e.to === App.me) {
        sfx('knock');
        if (e.n % 2 === 0) tauntLabel(taunt('cbSpyOnMe', { name: nameOf(v, e.p, e.name) }, e.n));
      }
      return;
    case 'cbblind':
      sfx('smack');
      setTimeout(
        () => floatLabel(e.p, `tauscht blind mit ${toWhom(e.to, e.tn)}`, `tauschst blind mit ${toWhom(e.to, e.tn)}`),
        60,
      );
      if (e.to === App.me && !mine) {
        shakePanel(App.me);
        tauntLabel(taunt('cbBlindOnMe', { name: nameOf(v, e.p, e.name) }, e.n));
        try {
          navigator.vibrate?.([40, 40, 40]);
        } catch {
          // Manche Browser verbieten Vibration ohne vorherige Geste
        }
      }
      return;
    case 'cbcabo': {
      sfx('knock');
      setTimeout(() => sfx('duel'), 250);
      if (!mine) shakePanel(e.p);
      const t = mine ? taunt('cbCaboSelf', null, e.n) : taunt('cbCaboOther', { name: nameOf(v, e.p, e.name) }, e.n);
      announce({
        icon: '📣',
        tone: 'red',
        title: mine ? 'Du rufst Cabo!' : `${N(e.p, e.name)} ruft Cabo!`,
        sub: `Alle anderen haben noch einen Zug.<span class="tt">${esc(t)}</span>`,
        ms: 2400,
      });
      return;
    }
    case 'cbsnap':
      if (e.ok) {
        sfx('pop');
        setTimeout(() => floatLabel(e.p, 'schnappt!', 'schnappst!'), 60);
      } else {
        sfx('nope');
        shakePanel(e.p);
        setTimeout(() => floatLabel(e.p, 'schnappt daneben, Strafkarte!', 'schnappst daneben, Strafkarte!'), 60);
        if (mine) tauntLabel(taunt('cbSnapFailSelf', null, e.n));
      }
      return;
    case 'cbround': {
      // Kurz vorab, das Ergebnisfenster danach zeigt alles genau
      let icon = '🃏';
      let title = 'Stapel leer!';
      let tone: Announcement['tone'] = '';
      let sub = 'Alle Karten auf den Tisch.';
      if (e.kami) {
        icon = '💥';
        title = 'Kamikaze!';
        tone = 'red';
        sub = `${N(e.kami)}${vb(e.kami, ' hast', ' hat')} zwei Damen und zwei schwarze Könige. Alle anderen bekommen ${CB_KAMI}.`;
        sfx('bomb');
      } else if (e.caller) {
        icon = e.ok ? '🎯' : '🙈';
        title = e.ok ? 'Cabo geschafft!' : 'Cabo daneben!';
        tone = e.ok ? 'gold' : 'red';
        sub = e.ok
          ? `${N(e.caller)}${vb(e.caller, ' hattest', ' hatte')} am wenigsten.`
          : `${N(e.caller)}${vb(e.caller, ' bekommst', ' bekommt')} ${CB_PENALTY} Strafpunkte obendrauf.`;
        setTimeout(() => sfx(e.ok === (e.caller === App.me) ? 'win' : 'lose'), 250);
      }
      announce({ icon, tone, title, sub, ms: ending ? 1600 : 2200 });
      holdForAnnouncements(300);
      return;
    }
    case 'cbreset':
      setTimeout(
        () =>
          floatLabel(
            e.p,
            `landet genau auf ${CB_RESET_AT} und fällt auf ${CB_RESET_TO}`,
            `landest genau auf ${CB_RESET_AT} und fällst auf ${CB_RESET_TO}`,
          ),
        400,
      );
      return;
    case 'cbend':
      if (prev.phase === 'over' || v.phase !== 'over') return;
      if (e.p) shitheadCeremony(v, e);
      else {
        announce({
          icon: '🤝',
          tone: 'gold',
          title: 'Unentschieden!',
          sub: 'Vorne liegen mehrere gleichauf. Diesmal gibt es keinen neuen Cabo-König.',
          ms: 2600,
        });
        holdForAnnouncements();
      }
      return;
    default:
      return;
  }
}
