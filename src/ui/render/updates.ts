/* Updates: alle Versionen mit ihren Änderungen, neueste zuerst. */
import { CHANGELOG } from '../../content/changelog';
import { APP_VERSION } from '../../content/version';
import { esc } from '../dom';
import { sheetHTML } from '../dialog';
import { BUILD } from '../update';

const DATE = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

function dateOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? '' : DATE.format(d);
}

export function updatesHTML(): string {
  const now = CHANGELOG[0]?.v ?? APP_VERSION;
  const rel = CHANGELOG.map(
    (r, i) =>
      `<section class="rsec rel${i === 0 ? ' now' : ''}">` +
      `<div class="relh"><span class="relv st-num${i === 0 ? ' st-ink' : ''}">${esc(r.v)}</span><h3>${esc(r.title)}</h3>` +
      `<span class="reld">${i === 0 ? '<b class="relnow">Aktuell</b> · ' : ''}${esc(dateOf(r.date))}</span></div>` +
      r.groups
        .map(
          (g) =>
            `<div class="relg"><h4>${esc(g.h)}</h4><ul>${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`,
        )
        .join('') +
      '</section>',
  ).join('');
  return sheetHTML({
    kind: 'updates',
    title: 'Updates',
    badge: `<span class="dlg-ver st-num st-ink st-r4"><span class="sr">Aktuelle Version </span>${esc(now)}</span>`,
    body:
      '<p class="lead">Was sich mit jeder Version am Tisch geändert hat.</p>' +
      rel +
      // Fünf schnelle Tipps hier öffnen das versteckte Dev-Menü (src/ui/events.ts)
      `<p class="relfoot" data-act="devtap">Version ${esc(APP_VERSION)}${BUILD ? ` · Build ${esc(BUILD)}` : ''}</p>`,
  });
}
