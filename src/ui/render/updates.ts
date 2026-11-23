/* Updates: alle Versionen mit ihren Änderungen, neueste zuerst. */
import { CHANGELOG } from '../../content/changelog';
import { esc } from '../dom';

const DATE = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

function dateOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? '' : DATE.format(d);
}

export function updatesHTML(): string {
  const rel = CHANGELOG.map(
    (r, i) =>
      '<section class="rsec rel">' +
      `<div class="relh"><span class="relv">${esc(r.v)}</span><h3>${esc(r.title)}</h3>` +
      (i === 0 ? '<span class="relnow">aktuell</span>' : '') +
      `<span class="reld">${esc(dateOf(r.date))}</span></div>` +
      r.groups
        .map(
          (g) =>
            `<div class="relg"><h4>${esc(g.h)}</h4><ul>${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`,
        )
        .join('') +
      '</section>',
  ).join('');
  return (
    '<div class="modal"><div class="paper sheet updates"><button class="x" data-act="closemodal" aria-label="Schließen">×</button>' +
    '<h2>Updates</h2><p class="lead">Was sich mit jeder Version am Tisch geändert hat.</p>' +
    rel +
    '</div></div>'
  );
}
