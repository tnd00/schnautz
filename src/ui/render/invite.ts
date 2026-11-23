/* Fenster hinter dem Raumcode oben: Code und Einladungslink zum Kopieren oder Teilen. */
import { seatLimit } from '../../game/state';
import { App } from '../app';
import { esc } from '../dom';
import { shareLink } from '../screens';

export function inviteHTML(): string {
  const v = App.view;
  const link = shareLink();
  const humans = v ? v.players.filter((p) => !p.bot).length : 0;
  const bots = v ? v.players.filter((p) => p.bot && !p.left).length : 0;
  const free = v ? Math.max(0, seatLimit(v) - v.players.length) : 0;
  const room = free + bots;
  const seats = !v
    ? ''
    : room
      ? `${humans === 1 ? 'Ein Mensch sitzt' : `${humans} Menschen sitzen`} am Tisch. ` +
        `${room === 1 ? 'Ein Platz ist' : `${room} Plätze sind`} noch zu haben` +
        (bots ? ', wer kommt, übernimmt einen KI-Platz samt Karten.' : '.')
      : 'Der Tisch ist gerade voll.';
  return (
    '<div class="modal"><div class="paper sheet invite"><button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    '<h2>Freunde einladen</h2><p class="lead">Schick den Link oder sag den Code an, dann sitzt ihr am selben Tisch.</p>' +
    `<div class="icode" aria-label="Raumcode">${esc(App.code)}</div>` +
    `<div class="ilink"><input class="input" readonly value="${esc(link)}" aria-label="Einladungslink" />` +
    '<button class="btn primary" data-act="copylink">Kopieren</button></div>' +
    (typeof navigator.share === 'function'
      ? '<button class="btn ghost ishare" data-act="share">Link teilen</button>'
      : '') +
    (seats ? `<p class="nnote">${esc(seats)}</p>` : '') +
    '</div></div>'
  );
}
