/*
 * Effekte aus dem Dev-Menü. Beim Host kommen sie als Logeintrag `dev` zu allen am Tisch und laufen wie Würfe
 * sofort über liveFx. Gäste spielen sie nur bei sich ab. Nur der Host schreibt solche Einträge, eine Aktion gibt es nicht.
 */
import type { LogEntry } from '../game/types';
import { confetti, dropOn } from './animations';
import { App } from './app';
import { replayCeremony } from './ceremony';
import { emit, panelFor, toast } from './feedback';
import { sfx, SOUND_NAMES, type SoundName } from './sound';
import { showUpdate } from './update';

export type DevEntry = Extract<LogEntry, { k: 'dev' }>;

export function playDevFx(e: Pick<DevEntry, 'fx' | 's' | 'to'>): void {
  switch (e.fx) {
    case 'confetti':
      confetti();
      return;
    case 'poo': {
      const el = panelFor(e.to || App.me);
      if (el) dropOn(el, '💩');
      return;
    }
    case 'ann':
      // Ein Takt, damit die Testansage nie gekürzt wird
      emit(
        { level: 'big', beat: true },
        { text: 'Testansage', icon: '🛠', tone: 'wood', sub: 'So sieht eine Meldung am Tisch aus.', ms: 1800 },
      );
      return;
    case 'toast':
      toast('So sieht ein kurzer Hinweis aus.');
      return;
    case 'updbar':
      showUpdate('Neue Version verfügbar. Lade neu, dein Platz bleibt.', true);
      return;
    case 'ceremony':
      replayCeremony();
      return;
    case 'sfx':
      if (SOUND_NAMES.includes(e.s as SoundName)) sfx(e.s as SoundName);
      return;
  }
}
