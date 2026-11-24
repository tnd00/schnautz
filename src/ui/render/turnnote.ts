/* Hinweis im Chat-Fenster: Mobil verdeckt der Chat den eigenen Platz, also sagt er Bescheid, wenn man gefragt ist. */
import { App } from '../app';
import { $ } from '../dom';
import { dealerId, myMoveNow } from '../helpers';
import { quickHTML } from './shithead';
import { CLK } from '../clock';
import { shCanBet } from '../../game/bets';
import { LOSER_NAME } from '../../game/games';

export function renderTurnNote(): void {
  const el = $('#turnnote');
  const v = App.view;
  let html = '';
  if (v && v.phase !== 'lobby' && document.body.classList.contains('logopen')) {
    // 4er und Bombe gehen nur kurz, deshalb liegt der Knopf direkt hier
    const quick = quickHTML(v);
    // Bei Durak ist dran, auf wen die Partie wartet, auch wer nur noch fertig sagen soll
    const mine = myMoveNow(v) || (v.phase === 'choose' && dealerId(v) === App.me);
    // Läuft ein Zeitlimit, steht die Restzeit gleich im Knopf
    const clk = CLK.ids.includes(App.me) ? ' <span class="clkn"></span>' : '';
    const turnBtn = `<button class="btn primary pulse" data-act="closelog">Du bist dran! Zurück zum Tisch${clk}</button>`;
    // Wer dran ist, darf auch reinwerfen. Nach der kurzen Sperre zählt aber zuerst der eigene Zug
    if (mine && !v.sh?.win?.lock) html = turnBtn + quick;
    else if (quick) html = `<span>Schnell, sonst ist es weg!</span>${quick}`;
    else if (mine) html = turnBtn;
    // In der Tauschrunde sind alle gleichzeitig dran, bis sie auf Fertig drücken
    else if (v.phase === 'peek' && v.players.some((p) => p.id === App.me && !p.ready && !!v.cb?.P[p.id]))
      html = `<button class="btn primary pulse" data-act="closelog">Karten ansehen! Zurück zum Tisch${CLK.ids.includes(App.me) ? ' <span class="clkn"></span>' : ''}</button>`;
    else if (v.phase === 'swap' && v.players.some((p) => p.id === App.me && !p.ready && !p.out))
      html = `<button class="btn primary pulse" data-act="closelog">Tauschrunde läuft! Zurück zum Tisch${CLK.ids.includes(App.me) ? ' <span class="clkn"></span>' : ''}</button>`;
    // Fertig, aber noch nicht getippt: Auch aus dem Chat heraus geht der Tipp
    else if (shCanBet(v, App.me))
      html = `<button class="btn ghost betbtn" data-act="betopen"><span class="bl">🔮 Tippen, wer ${LOSER_NAME[v.game]} wird</span></button>`;
  }
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = !html;
}
