/* Fenster Einladen (Menü ⋯) und Einladeteil im Fenster Tisch: Code und Einladungslink zum Kopieren oder Teilen. */
import { seatLimit } from '../../game/state';
import { App } from '../app';
import { esc } from '../dom';
import { sheetHTML } from '../dialog';
import { shareLink } from '../screens';

const n = (x: number): string => `<span class="st-num">${x}</span>`;

/** Was noch frei ist. In der Lobby gibt es KI-Plätze, mitten in der Partie KI-Plätze samt Karten. */
function seatsHTML(): string {
  const v = App.view;
  if (!v) return '';
  const bots = v.players.filter((p) => p.bot && !p.left).length;
  const free = Math.max(0, seatLimit(v) - v.players.length);
  const room = free + bots;
  if (!room) return '<p class="iseats">Der Tisch ist gerade voll.</p>';
  const lobby = v.phase === 'lobby';
  return (
    `<p class="iseats">${room === 1 ? 'Noch ein Platz frei.' : `Noch ${n(room)} Plätze frei.`}</p>` +
    (bots ? `<p class="ibot">Wer jetzt kommt, übernimmt einen KI-Platz${lobby ? '' : ' samt Karten'}.</p>` : '')
  );
}

/** Code, Link zum Kopieren oder Teilen und freie Plätze. Steht im Fenster Einladen und im Fenster hinter dem Punkt oben. */
export function inviteBody(): string {
  const link = shareLink();
  const code = esc(App.code);
  return (
    '<p class="lead">Schick den Link oder sag den Code an, dann sitzt ihr am selben Tisch.</p>' +
    `<p class="icode"><span class="sr">Tischcode </span><span class="icodev st-num st-l3">${code}</span></p>` +
    `<div class="ilink"><input class="st-input" readonly value="${esc(link)}" aria-label="Einladungslink" />` +
    '<button type="button" class="st-btn st-primary" data-act="copylink">Link kopieren</button></div>' +
    (typeof navigator.share === 'function'
      ? '<button type="button" class="st-btn st-secondary ishare" data-act="share">Link teilen</button>'
      : '') +
    seatsHTML()
  );
}

export function inviteHTML(): string {
  return sheetHTML({ kind: 'invite', title: 'Freunde einladen', body: inviteBody() });
}
