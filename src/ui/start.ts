/* Startbildschirm: Name, Tisch eröffnen oder beitreten, angefangene Tische fortsetzen. */
import { cleanCode, cleanName } from '../net/ids';
import { asSavedGuest, asSavedHost, GUEST_RESUME_MS, HOST_RESUME_MS } from '../net/protocol';
import { cardHTML } from './cards';
import { $, esc, num } from './dom';
import { shakeEl, toast } from './feedback';
import { LS } from './storage';

export function showStartError(msg: string): void {
  const e = $('#start-err');
  e.textContent = msg;
  e.hidden = !msg;
  // Eine Fehlermeldung steht im Popup, also muss es offen sein
  if (msg) document.body.classList.add('startform');
}

/** Bietet an, einen gespeicherten Tisch fortzusetzen oder an einen Tisch zurückzukehren. */
export function renderResume(): void {
  const box = $('#resume');
  const now = Date.now();
  const hs = asSavedHost(LS.get<unknown>('host', null));
  const gs = asSavedGuest(LS.get<unknown>('guest', null));
  let h = '';
  if (hs && now - hs.ts < HOST_RESUME_MS) {
    const n = hs.st.players.length;
    const state =
      hs.st.phase === 'lobby'
        ? ' wartet noch.'
        : hs.st.game === 'shithead'
          ? ' läuft noch (Shithead).'
          : ` läuft noch (Runde ${num(hs.st.round)}).`;
    h +=
      `<div class="resume"><p>Dein Tisch <b>${esc(hs.code)}</b> mit ${n} ${n === 1 ? 'Person' : 'Leuten'}${state}</p>` +
      '<button class="btn primary" data-act="resumehost">Fortsetzen</button><button class="btn ghost" data-act="dropresume" data-k="host">Verwerfen</button></div>';
  }
  if (gs && now - gs.ts < GUEST_RESUME_MS) {
    h +=
      `<div class="resume"><p>Zurück an Tisch <b>${esc(gs.code)}</b> als ${esc(gs.name)}?</p>` +
      '<button class="btn primary" data-act="resumeguest">Zurück an den Tisch</button><button class="btn ghost" data-act="dropresume" data-k="guest">Nein</button></div>';
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

export function initStart(): void {
  $<HTMLInputElement>('#name').value = LS.get('name', '');
  const code = cleanCode(location.hash.slice(1));
  if (code) {
    $<HTMLInputElement>('#joincode').value = code;
    $('#joinbox').classList.add('hi');
  }
  if (location.protocol === 'file:') $('#filenote').hidden = false;
  $('#fan').innerHTML =
    `${cardHTML('HA')}${cardHTML('HK')}${cardHTML('H10')}<div class="score">31<small>Schnautz</small></div>`;
  renderResume();
  // Einladungslink oder ein Tisch zum Fortsetzen: Das Popup gleich öffnen, darum geht es ja
  document.body.classList.toggle('startform', !!code || !$('#resume').hidden);
}
