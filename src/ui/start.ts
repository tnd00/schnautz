/*
 * Startbildschirm: vier Spiel-Sticker, Name, Tisch aufmachen, gegen die KI spielen oder mit Code beitreten.
 * Kommt jemand über einen Einladungslink (#CODE), wird das Formular zur Einladung an genau diesen Tisch.
 */
import { MAX_SEATS, MIN_SEATS } from '../game/constants';
import { GAME_NAME, GAMES, isGame, isNewGame } from '../game/games';
import type { GameKind } from '../game/types';
import { APP_VERSION } from '../content/version';
import { cleanCode, cleanName } from '../net/ids';
import { asSavedGuest, asSavedHost, GUEST_RESUME_MS, HOST_RESUME_MS } from '../net/protocol';
import { $, esc, num } from './dom';
import { shakeEl, toast } from './feedback';
import { LS } from './storage';

/**
 * Zeichen pro Spiel, als Sticker auf dem Spiel-Sticker (auch in der Lobby). Nur Emoji, die es seit Jahren überall
 * gibt, und nur solche, die auch bei 20 px noch eine klare Form haben: Die Welle liest sich klein, der Schwimmer nicht.
 */
export const MARK: Readonly<Record<GameKind, string>> = { schnautz: '🌊', shithead: '💩', durak: '🤡', cabo: '👑' };

/** Ein frecher Halbsatz pro Spiel */
const TAG: Readonly<Record<GameKind, string>> = {
  schnautz: '31 jagen, nicht absaufen',
  shithead: 'Letzter wird Shithead',
  durak: 'Abwehren oder Narr sein',
  cabo: 'Merken, bluffen, Cabo rufen',
};

/** Feste Neigung pro Spiel-Sticker, nie zufällig, auf Startseite und in der Lobby gleich */
export const TILT: Readonly<Record<GameKind, string>> = {
  schnautz: 'st-l5',
  shithead: 'st-r4',
  durak: 'st-r3',
  cabo: 'st-l3',
};

export const PEOPLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0M16 4.8a3.2 3.2 0 0 1 0 6.4M18.2 13.6a6 6 0 0 1 2.8 5.9"/></svg>';

/** Tischcode aus dem Einladungslink, leer ohne Einladung. */
let inviteCode = '';

export function showStartError(msg: string): void {
  const e = $('#start-err');
  e.textContent = msg;
  e.hidden = !msg;
  // Eine Fehlermeldung steht im Formular, also muss es am Handy offen sein
  if (msg) document.body.classList.add('startform');
}

/** Die vier Spiele als Sticker. Antippen öffnet die Regeln dieses Spiels. */
function gameStickers(): string {
  return GAMES.map((g) => {
    const name = GAME_NAME[g];
    const seats = `${MIN_SEATS} bis ${MAX_SEATS[g]}`;
    const isNew = isNewGame(g, APP_VERSION);
    const neu = isNew ? '<span class="st-tag st-r6" aria-hidden="true">Neu</span>' : '';
    return (
      `<li><button class="st st-lift st-game g-${g} ${TILT[g]}" data-act="rulestab" data-g="${g}" ` +
      `aria-label="${name}${isNew ? ', neu' : ''}, ${seats} Leute. Regeln ansehen">` +
      `<span class="st-game-in"><span class="st-game-top"><span class="st-mark" aria-hidden="true">${MARK[g]}</span>` +
      `<span class="st-num">${PEOPLE}${seats}</span></span>` +
      `<span class="st-game-name">${name}</span><span class="st-game-tag">${TAG[g]}</span></span>${neu}</button></li>`
    );
  }).join('');
}

/** Bietet an, einen gespeicherten Tisch fortzusetzen oder an einen Tisch zurückzukehren. Jede Karte hat eine Hauptaktion. */
export function renderResume(): void {
  const box = $('#resume');
  const now = Date.now();
  const hs = asSavedHost(LS.get<unknown>('host', null));
  const gs = asSavedGuest(LS.get<unknown>('guest', null));
  let h = '';
  // In der Einladung zählt nur der Weg an diesen Tisch: Karten für andere Tische bleiben weg, die für diesen
  // Tisch bleibt, denn „An den Tisch“ nimmt in einem neuen Tab einen neuen Platz (zweiter Tab im E2E-Test)
  const here = (code: string) => !inviteCode || code === inviteCode;
  if (here(hs?.code ?? '') && hs && now - hs.ts < HOST_RESUME_MS) {
    const n = hs.st.players.length;
    const game = isGame(hs.st.game) ? hs.st.game : 'schnautz';
    const state =
      hs.st.phase === 'lobby'
        ? ' wartet noch.'
        : game === 'schnautz'
          ? ` läuft noch (Runde ${num(hs.st.round)}).`
          : ` läuft noch (${GAME_NAME[game]}).`;
    h +=
      `<div class="resume st st-l1 g-${game}"><p>Dein Tisch <b class="st-num">${esc(hs.code)}</b> mit ${n} ${n === 1 ? 'Person' : 'Leuten'}${state}</p>` +
      '<div class="resume-acts"><button class="st-btn st-primary" data-act="resumehost">Fortsetzen</button>' +
      '<button class="st-link" data-act="dropresume" data-k="host">Verwerfen</button></div></div>';
  }
  if (here(gs?.code ?? '') && gs && now - gs.ts < GUEST_RESUME_MS) {
    h +=
      `<div class="resume st st-r1"><p>Zurück an Tisch <b class="st-num">${esc(gs.code)}</b> als ${esc(gs.name)}?</p>` +
      '<div class="resume-acts"><button class="st-btn st-primary" data-act="resumeguest">Zurück an den Tisch</button>' +
      '<button class="st-link" data-act="dropresume" data-k="guest">Nein</button></div></div>';
  }
  box.innerHTML = h;
  box.hidden = !h;
}

export function readName(): string | null {
  const inp = $<HTMLInputElement>('#name');
  const n = cleanName(inp.value);
  if (!n) {
    inp.focus();
    shakeEl(inp);
    toast('Sag kurz, wie du heißt.');
    return null;
  }
  LS.set('name', n);
  return n;
}

/** Einladung an einen Tisch: nur Name und „An den Tisch“, ohne Code-Feld. Leer schaltet sie aus. */
function setInvite(code: string): void {
  inviteCode = code;
  document.body.classList.toggle('invite', !!code);
  $('#invite').hidden = !code;
  $('#invite-code').textContent = code;
  // Derselbe Knopf tritt bei: in der Einladung als Hauptaktion, sonst neben dem Code-Feld
  $('#btn-join').textContent = code ? 'An den Tisch' : 'Beitreten';
  // Am Handy öffnet der große Knopf den Bogen, in der Einladung also die Einladung
  $('.playbtn').textContent = code ? 'An den Tisch' : 'Tisch aufmachen';
  if (code) $<HTMLInputElement>('#joincode').value = code;
}

/** „Lieber eigenen Tisch aufmachen“: Einladung verwerfen, das normale Formular bleibt offen. */
export function leaveInvite(): void {
  history.replaceState(null, '', location.pathname + location.search);
  setInvite('');
  $<HTMLInputElement>('#joincode').value = '';
  showStartError('');
  renderResume();
  $('#name').focus();
}

let seenGame: GameKind | null = null;

/** Zeigt am Knopf „Gegen die KI spielen“, welches Spiel startet. */
function renderBotsGame(g: GameKind): void {
  const chip = $('#bots-game');
  chip.className = `st-chip g-${g}`;
  chip.textContent = GAME_NAME[g];
}

/** Merkt sich das zuletzt gespielte Spiel für „Gegen die KI spielen“. */
export function rememberGame(g: GameKind): void {
  if (seenGame === g) return;
  seenGame = g;
  LS.set('lastGame', g);
  // Nach einem Abbruch landet man ohne initStart auf der Startseite, der Knopf soll trotzdem stimmen
  renderBotsGame(g);
}

/** Zuletzt gespieltes Spiel, sonst Shithead. */
export function lastGame(): GameKind {
  const g = LS.get<unknown>('lastGame', null);
  return isGame(g) ? g : 'shithead';
}

export function initStart(): void {
  $<HTMLInputElement>('#name').value = LS.get('name', '');
  const code = cleanCode(location.hash.slice(1));
  setInvite(code.length === 5 ? code : '');
  if (code) $<HTMLInputElement>('#joincode').value = code;
  if (location.protocol === 'file:') $('#filenote').hidden = false;
  $('#st-games').innerHTML = gameStickers();
  renderBotsGame(lastGame());
  renderResume();
  // Einladungslink oder ein Tisch zum Fortsetzen: Das Formular gleich öffnen, darum geht es ja
  document.body.classList.toggle('startform', !!code || !$('#resume').hidden);
}
