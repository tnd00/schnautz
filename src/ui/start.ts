/*
 * Startbildschirm: vier Spiel-Sticker, Name, Tisch aufmachen, gegen die KI spielen oder mit Code beitreten.
 * Kommt jemand über einen Einladungslink (#CODE), wird das Formular zur Einladung an genau diesen Tisch.
 */
import { GAME_NAME, GAMES, isGame, isNewGame } from '../game/games';
import type { GameKind } from '../game/types';
import { APP_VERSION } from '../content/version';
import { cleanCode, cleanName } from '../net/ids';
import { asSavedGuest, asSavedHost, GUEST_RESUME_MS, HOST_RESUME_MS } from '../net/protocol';
import { $, esc, num } from './dom';
import { shakeEl, toast } from './feedback';
import { LS, SS } from './storage';
import { AKA, MARK, TILT } from './gamestickers';

/** Ein frecher Halbsatz pro Spiel, nur wo der Sticker Platz hat */
const TAG: Readonly<Record<GameKind, string>> = {
  schnautz: '31 jagen, nicht absaufen',
  shithead: 'Letzter wird Shithead',
  durak: 'Abwehren oder Narr sein',
  cabo: 'Merken, bluffen, Cabo rufen',
};

/** Tischcode aus dem Einladungslink, leer ohne Einladung. */
let inviteCode = '';

export function showStartError(msg: string): void {
  const e = $('#start-err');
  e.textContent = msg;
  e.hidden = !msg;
  // Eine Fehlermeldung steht im Formular, also muss es am Handy offen sein
  if (msg) document.body.classList.add('startform');
}

/**
 * Die vier Spiele als Sticker: Zeichen, Name, weitere Namen und der freche Halbsatz, solange Platz ist.
 * „Neu“ klebt innen in der Ecke, damit nichts in den Nachbarn ragt. Antippen öffnet die Regeln dieses Spiels.
 */
function gameStickers(): string {
  return GAMES.map((g) => {
    const name = GAME_NAME[g];
    const isNew = isNewGame(g, APP_VERSION);
    const neu = isNew ? '<span class="st-tag st-r4" aria-hidden="true">Neu</span>' : '';
    return (
      `<li><button class="st st-lift st-game g-${g} ${TILT[g]}" data-act="rulestab" data-g="${g}" ` +
      `aria-label="${name}${isNew ? ', neu' : ''}. ${AKA[g]}. Regeln ansehen">` +
      `<span class="st-game-in"><span class="st-game-top"><span class="st-mark" aria-hidden="true">${MARK[g]}</span>${neu}</span>` +
      `<span class="st-game-name">${name}</span><span class="st-game-aka">${AKA[g]}</span>` +
      `<span class="st-game-tag">${TAG[g]}</span><span class="st-help" aria-hidden="true">?</span></span></button></li>`
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
  // „invited“, denn .invite gehört dem Einladungsfenster (shithead-flow.css)
  document.body.classList.toggle('invited', !!code);
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

/**
 * Einladung beenden, weil der Tisch nicht zu erreichen ist (aufgelöst, nicht gefunden, abgewiesen). Code-Feld und
 * „Tisch aufmachen“ kommen zurück, der Code bleibt im Feld, damit man einen Tippfehler verbessern kann.
 */
export function endInvite(): void {
  history.replaceState(null, '', location.pathname + location.search);
  setInvite('');
  renderResume();
}

let seenGame: GameKind | null = null;

/** Merkt sich das zuletzt gespielte Spiel, damit „Gegen die KI spielen“ den Tisch damit aufmacht. */
export function rememberGame(g: GameKind): void {
  if (seenGame === g) return;
  seenGame = g;
  LS.set('lastGame', g);
}

/** Zuletzt gespieltes Spiel, sonst Shithead. */
export function lastGame(): GameKind {
  const g = LS.get<unknown>('lastGame', null);
  return isGame(g) ? g : 'shithead';
}

/**
 * Neu geladen wegen einer neuen Version (autoResume in update.ts), aber der Link zeigt auf einen anderen Tisch als
 * den gespeicherten: Dann zählt der eigene Tisch, sonst blendet die Einladung den Knopf zum Fortsetzen aus.
 */
function resumingElsewhere(code: string): boolean {
  const role = SS.get<string>('autoresume', '');
  if (!role) return false;
  const saved =
    role === 'host' ? asSavedHost(LS.get<unknown>('host', null)) : asSavedGuest(LS.get<unknown>('guest', null));
  return !!saved && saved.code !== code;
}

export function initStart(): void {
  $<HTMLInputElement>('#name').value = LS.get('name', '');
  let code = cleanCode(location.hash.slice(1));
  if (code && resumingElsewhere(code)) {
    history.replaceState(null, '', location.pathname + location.search);
    code = '';
  }
  setInvite(code.length === 5 ? code : '');
  if (code) $<HTMLInputElement>('#joincode').value = code;
  if (location.protocol === 'file:') $('#filenote').hidden = false;
  $('#st-games').innerHTML = gameStickers();
  renderResume();
  // Einladungslink oder ein Tisch zum Fortsetzen: Das Formular gleich öffnen, darum geht es ja
  document.body.classList.toggle('startform', !!code || !$('#resume').hidden);
}
