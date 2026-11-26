/*
 * Aufgenommene Klänge (CC0, Quellen in src/assets/sfx/QUELLEN.md). Sie werden beim ersten Tipp geladen.
 * Bis dahin oder wenn das Laden scheitert, springen die erzeugten Klänge aus sound.ts ein. Die Adressen stehen in
 * samples-urls.ts und kommen erst mit dem ersten Tipp per import(), denn kleine Aufnahmen bettet Vite als Daten ein.
 */
export type SampleName =
  | 'bunny'
  | 'clap'
  | 'crick'
  | 'crown'
  | 'deal'
  | 'egg'
  | 'emote'
  | 'heart'
  | 'horn'
  | 'ooh'
  | 'poo'
  | 'roll'
  | 'sad'
  | 'tomato';

/** Lautstärke je Aufnahme, damit alle ungefähr gleich laut wirken */
const GAIN: Readonly<Record<SampleName, number>> = {
  bunny: 1.1,
  clap: 0.9,
  crick: 1.2,
  crown: 0.8,
  deal: 0.7,
  egg: 0.9,
  emote: 0.6,
  heart: 0.6,
  horn: 1,
  ooh: 0.9,
  poo: 0.8,
  roll: 0.9,
  sad: 0.95,
  tomato: 0.9,
};

const BUF = new Map<SampleName, AudioBuffer>();
let started = false;

/** Lädt alle Aufnahmen einmal, sobald es einen Audio-Kontext gibt. Fehler bleiben still. */
export function loadSamples(ac: AudioContext): void {
  if (started) return;
  started = true;
  import('./samples-urls')
    .then(({ URLS }) => {
      (Object.keys(URLS) as SampleName[]).forEach((k) => {
        fetch(URLS[k])
          .then((r) => r.arrayBuffer())
          .then((b) => ac.decodeAudioData(b))
          .then((buf) => BUF.set(k, buf))
          .catch(() => undefined);
      });
    })
    .catch(() => undefined);
}

/** Dev-Menü: Wie viele Aufnahmen sind geladen? */
export const sampleStatus = (): { started: boolean; loaded: number; total: number } => ({
  started,
  loaded: BUF.size,
  total: Object.keys(GAIN).length,
});

/** Spielt eine Aufnahme. Gibt ihre Länge in Sekunden zurück oder null, wenn sie noch nicht geladen ist. */
export function playSample(ac: AudioContext, name: SampleName, out: AudioNode, vol = 1, at = 0): number | null {
  return startSample(ac, name, out, vol, at)?.dur ?? null;
}

/** Wie playSample, mit Möglichkeit zum Abbrechen (sanft in 40 ms). */
export function startSample(
  ac: AudioContext,
  name: SampleName,
  out: AudioNode,
  vol = 1,
  at = 0,
): { dur: number; stop: () => void } | null {
  const b = BUF.get(name);
  if (!b) return null;
  const s = ac.createBufferSource();
  const g = ac.createGain();
  s.buffer = b;
  g.gain.value = vol * GAIN[name];
  s.connect(g);
  g.connect(out);
  s.start(at || ac.currentTime);
  return {
    dur: b.duration,
    stop: () => {
      try {
        g.gain.setTargetAtTime(0, ac.currentTime, 0.015);
        s.stop(ac.currentTime + 0.1);
      } catch {
        /* schon vorbei */
      }
    },
  };
}
