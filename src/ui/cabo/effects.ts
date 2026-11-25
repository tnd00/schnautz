import { CB_KAMI, CB_PENALTY, CB_RESET_AT, CB_RESET_TO } from '../../game/constants';
import type { LogEntry } from '../../game/types';
import { App } from '../app';
import { esc, num } from '../dom';
import { type Announcement, emit, shakePanel } from '../feedback';
import { cueOf, type LevelCtx } from '../levels';
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
export function caboEffect(c: LevelCtx, e0: LogEntry): void {
  const { prev, v, fresh } = c;
  if (!isCb(e0)) return;
  const e = e0;
  const cue = cueOf(e, c);
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
      emit(cue, {
        text: first ? 'Cabo!' : `Runde ${num(e.r)}`,
        icon: '🃏',
        tone: 'gold',
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
      if (!mine && e.from === 'pile') emit(cue, { pid: e.p, text: 'nimmt von der Ablage' });
      return;
    case 'cbswap': {
      if (!mine) sfx('card');
      if (!e.ok) {
        shakePanel(e.p);
        emit(cue, { pid: e.p, text: 'greift daneben, Strafkarte!', mine: 'greifst daneben, Strafkarte!', sfx: 'nope' });
      } else if (e.slots > 1)
        emit(cue, { pid: e.p, text: `wirft ${e.slots} gleiche ab`, mine: `wirfst ${e.slots} gleiche ab` });
      return;
    }
    case 'cbdiscard':
      if (!mine) sfx('card');
      if (e.power) {
        const [er, du] = CB_POWER_LABEL[e.power];
        emit(cue, { pid: e.p, text: er, mine: du });
      }
      return;
    case 'cbpeek':
      if (!mine) emit(cue, { pid: e.p, text: 'schaut sich eine Karte an' });
      return;
    case 'cbspy':
      if (mine) return;
      emit(cue, {
        pid: e.p,
        text: `spioniert bei ${toWhom(e.to, e.tn)}`,
        sfx: e.to === App.me ? 'knock' : undefined,
        taunt: taunt('cbSpyOnMe', { name: nameOf(v, e.p, e.name) }, e.n),
      });
      return;
    case 'cbblind':
      emit(cue, {
        pid: e.p,
        text: `tauscht blind mit ${toWhom(e.to, e.tn)}`,
        mine: `tauschst blind mit ${toWhom(e.to, e.tn)}`,
        sfx: 'smack',
        taunt: taunt('cbBlindOnMe', { name: nameOf(v, e.p, e.name) }, e.n),
      });
      if (e.to === App.me && !mine) {
        shakePanel(App.me);
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
      emit(cue, {
        pid: e.p,
        text: 'ruft Cabo!',
        mine: 'rufst Cabo!',
        icon: '📣',
        tone: 'red',
        sub: 'Alle anderen haben noch einen Zug.',
        taunt: t,
        ms: 2400,
      });
      return;
    }
    case 'cbsnap':
      if (e.ok) emit(cue, { pid: e.p, text: 'schnappt!', mine: 'schnappst!', sfx: 'pop' });
      else {
        shakePanel(e.p);
        emit(cue, {
          pid: e.p,
          text: 'schnappt daneben, Strafkarte!',
          mine: 'schnappst daneben, Strafkarte!',
          sfx: 'nope',
          taunt: taunt('cbSnapFailSelf', null, e.n),
        });
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
      emit(cue, { text: title, icon, tone, sub, ms: ending ? 1600 : 2200, hold: 300 });
      return;
    }
    case 'cbreset':
      emit(cue, {
        pid: e.p,
        text: `landet genau auf ${CB_RESET_AT} und fällt auf ${CB_RESET_TO}`,
        mine: `landest genau auf ${CB_RESET_AT} und fällst auf ${CB_RESET_TO}`,
        delay: 400,
      });
      return;
    case 'cbend':
      if (prev.phase === 'over' || v.phase !== 'over') return;
      if (e.p) shitheadCeremony(v, e);
      else {
        emit(cue, {
          text: 'Unentschieden!',
          icon: '🤝',
          tone: 'gold',
          sub: 'Vorne liegen mehrere gleichauf. Diesmal gibt es keinen neuen Cabo-König.',
          ms: 2600,
          hold: 250,
        });
      }
      return;
    default:
      return;
  }
}
