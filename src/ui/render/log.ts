import type { LogEntry, View } from '../../game/types';
import { LOG_EMPTY, logText, persp, type LogLine } from '../../content/texts/log';
import { App } from '../app';
import { cardChip } from '../cards';
import { $, esc } from '../dom';
import { pById } from '../helpers';
import { SEQ } from '../shithead/sequence';
import { ZER } from '../ceremony';

/** Eine Zeile im Verlauf: CSS-Klasse und HTML (Namen und Texte sind escaped). Die Sätze stehen im Textkatalog. */
export function logLine(v: View, e: LogEntry): LogLine {
  const t = persp({
    me: App.me,
    game: v.game,
    name: (id, fb) => pById(v, id)?.name ?? fb ?? 'Jemand',
    wrap: (s) => '<b>' + esc(s) + '</b>',
    esc,
    card: cardChip,
  });
  return logText(t, e);
}

let lastLogKey = '';
let scrolledOnce = false;

export function resetLog(): void {
  lastLogKey = '';
  scrolledOnce = false;
}

/** Verlauf und Chat. Während einer Shithead-Sequenz erscheinen Züge erst, wenn sie zu sehen waren. */
export function renderLog(v: View): void {
  const list = (
    SEQ.busy
      ? v.log.filter((e) => {
          return e.n <= App.seenN || e.k === 'chat';
        })
      : v.log
  ).filter((e) => !ZER.logN || e.n < ZER.logN || e.k === 'chat');
  const key = (list.length ? list[list.length - 1].n : 0) + ':' + list.length + ':' + App.me;
  const u = $('#unread');
  u.hidden = !App.unread;
  u.textContent = App.unread > 9 ? '9+' : String(App.unread);
  if (key === lastLogKey) return;
  lastLogKey = key;
  const el = $('#log'),
    near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML =
    list
      .map((e) => {
        const l = logLine(v, e);
        return l ? '<div class="e ' + l[0] + '">' + l[1] + '</div>' : '';
      })
      .join('') || '<div class="e sys">' + LOG_EMPTY + '</div>';
  if (near || !scrolledOnce) {
    el.scrollTop = el.scrollHeight;
    scrolledOnce = true;
  }
}
