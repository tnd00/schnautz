/*
 * Gemeinsame Teile der Ergebnisfenster aller Spiele: Fußzeile mit bereit melden und Revanche, „Tisch ansehen“,
 * die Leiste, wenn nur noch KIs spielen, und die Tippzeile für Shithead und Durak.
 */
import { shCanBet } from '../../game/bets';
import { onlyBotsPlaying } from '../../game/games';
import type { Player, ShBetResult, View } from '../../game/types';
import { ffwdInLog } from '../../net/pace';
import { App } from '../app';
import { esc, listJoin, num } from '../dom';
import { nameOf } from '../helpers';
import { nextSecs } from '../nextround';
import { canChallenge, mustAccept } from './rematch';

/**
 * „Tisch ansehen“ am Ende einer Runde: unten eine Leiste mit Ergebnis, nächster Runde und für den Host am Ende
 * der Partie „Zur Lobby“. Das Reaktionsfenster am Tisch ist dann weg, reagieren geht in der Übersicht.
 */
export function peekHTML(v: View, me: Player | null): string {
  const next = v.phase === 'over' ? 'Neue Partie' : 'Nächste Runde';
  return (
    '<div class="peek">' +
    '<button class="btn ghost" data-act="unpeek"><span class="blong">Ergebnis zeigen</span><span class="bshort">Ergebnis</span></button>' +
    (App.role === 'host' && v.phase === 'over'
      ? '<button class="btn ghost" data-act="lobbynow"><span class="blong">Zur Lobby</span><span class="bshort">Lobby</span></button>'
      : '') +
    (me && !me.ready ? `<button class="btn primary" data-act="ready">${next}</button>` : '') +
    '</div>'
  );
}

/** Statt des Knopfs, sobald vorgespult wird */
export const FFWD_ON_HTML = '<span class="botsonly">⏩ Die KIs spielen es aus.</span>';

/**
 * Ich bin raus oder fertig und nur noch KIs spielen: Der Gastgeber spult vor oder beendet die Partie, Gäste sehen
 * einen Hinweis. Ob schon vorgespult wird, steht im Verlauf (`ffwd` seit Partiebeginn und seit der letzten Übernahme).
 */
export function botsOnlyHTML(v: View, small = false): string {
  if (!onlyBotsPlaying(v)) return '';
  const fast = ffwdInLog(v.log);
  if (App.role !== 'host')
    return `<span class="botsonly">Nur noch KIs im Spiel. ${fast ? 'Die KIs spielen es gleich aus.' : 'Der Gastgeber kann vorspulen.'}</span>`;
  const sz = small ? ' small' : '';
  // Wer fertig ist und noch tippen kann, soll es vor dem Vorspulen wissen. Gesperrt wird nicht, sonst hält ein
  // Gast, der nicht mehr hinschaut, den ganzen Tisch auf
  const bettors = v.players.filter((p) => !p.bot && p.online && shCanBet(v, p.id));
  const meBets = bettors.some((p) => p.id === App.me);
  const names = [...(meBets ? ['Du'] : []), ...bettors.filter((p) => p.id !== App.me).map((p) => esc(p.name))];
  const verb = names.length === 1 ? (meBets ? 'kannst' : 'kann') : meBets ? 'könnt' : 'können';
  const hint = names.length
    ? `<span class="botsonly" style="flex-basis:100%;text-align:center">${listJoin(names)} ${verb} noch tippen.</span>`
    : '';
  return (
    hint +
    (fast ? FFWD_ON_HTML : `<button class="btn primary${sz}" data-act="ffwd">⏩ Vorspulen</button>`) +
    `<button class="btn ghost${sz}" data-act="restart">Neue Partie</button>` +
    `<button class="btn ghost${sz}" data-act="lobbynow">Zur Lobby</button>`
  );
}

/** Fußzeile der Ergebnisfenster: bereit melden, warten, Tisch ansehen. */
export function overlayFoot(v: View, me: Player | null): string {
  const waiting = v.players
    .filter((p) => {
      return p.online && !p.ready && !p.bot && p.id !== App.me && (v.phase === 'over' || !p.out);
    })
    .map((p) => {
      return p.name;
    });
  const ready = me && me.ready;
  const btnLabel = v.phase === 'over' ? 'Neue Partie' : 'Nächste Runde';
  const cd = v.phase === 'end' && nextSecs() ? `Weiter in <b class="nextcd">${nextSecs()}</b> s` : '';
  return (
    '<div class="rfoot">' +
    (me ? '<div class="emotes oemotes"></div>' : '') +
    `<div class="foot${!ready && (canChallenge(v) || mustAccept(v)) ? ' rv' : ''}">` +
    // Der Wartetext nur, wenn es etwas zu sagen gibt, sonst kostet er Platz in der Knopfreihe
    (ready || cd
      ? '<span class="waittxt">' +
        (ready ? (waiting.length ? 'Warte auf ' + esc(listJoin(waiting)) + '…' : "Los geht's…") : '') +
        (cd ? (ready ? ' · ' : '') + cd : '') +
        '</span>'
      : '') +
    (App.role === 'host' && ready && waiting.length
      ? '<button class="btn ghost" data-act="force"><span class="blong">Nicht warten</span><span class="bshort">Los</span></button>'
      : '') +
    (App.role === 'host' && v.phase === 'over'
      ? '<button class="btn ghost" data-act="lobbynow"><span class="blong">Zur Lobby</span><span class="bshort">Lobby</span></button>'
      : '') +
    '<button class="btn ghost" data-act="peek"><span class="blong">Tisch ansehen</span><span class="bshort">Tisch</span></button>' +
    readyBtns(v, !!ready, btnLabel) +
    '</div></div>'
  );
}

/** Weiter-Knöpfe: Wer verloren hat, darf Revanche fordern, wer gefordert wurde, nimmt an. */
export function readyBtns(v: View, ready: boolean, label: string): string {
  if (ready) return '';
  if (mustAccept(v))
    return '<button class="btn primary rv" data-act="ready" aria-label="Revanche annehmen"><span class="blong">⚔️ Revanche annehmen</span><span class="bshort">⚔️ Annehmen</span></button>';
  if (canChallenge(v))
    return (
      `<button class="btn ghost" data-act="ready" aria-label="${label}"><span class="blong">${label}</span><span class="bshort">Weiter</span></button>` +
      '<button class="btn primary rv" data-act="rematch">⚔️ Revanche!</button>'
    );
  return `<button class="btn primary" data-act="ready">${label}</button>`;
}

/** Eine Zeile unter den Plätzen: Wer hat richtig getippt? Für Shithead und Durak. */
export function betResultHTML(v: View, raw: ShBetResult[] | undefined, loser: string | null, what: string): string {
  const bets = Array.isArray(raw) ? raw : [];
  if (!bets.length) return '';
  if (!loser) return `<p class="betres">🔮 Ohne ${what} zählt kein Tipp.</p>`;
  const r = { bets, names: v.result && 'names' in v.result ? v.result.names : {} };
  const mine = bets.find((b) => b.p === App.me);
  const others = bets.filter((b) => b.ok && b.p !== App.me);
  const names = r.names ?? {};
  const list = others.map((b) => `${esc(nameOf(v, b.p, names[b.p]))} (+${num(b.q)})`);
  let text = '';
  if (mine)
    text = mine.ok
      ? `Richtig getippt! +${num(mine.q)} ${mine.q === 1 ? 'Punkt' : 'Punkte'}.`
      : 'Dein Tipp lag daneben.';
  if (list.length)
    text +=
      `${text ? ' ' : ''}${listJoin(list)} ${list.length > 1 ? 'haben' : 'hat'}` +
      ` ${mine?.ok ? 'auch ' : ''}richtig getippt.`;
  else if (!mine) text = 'Niemand hat richtig getippt.';
  return `<p class="betres">🔮 ${text}</p>`;
}
