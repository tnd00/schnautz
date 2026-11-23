/* Version dieser Seite. Host und Gäste vergleichen sie beim Beitreten, damit niemand mit altem Stand spielt. */
import pkg from '../../package.json' with { type: 'json' };

export const APP_VERSION: string = pkg.version;

/** Wie sort: kleiner null, wenn a älter ist als b. Fehlt eine Version, gilt sie als die ältere. */
export function cmpVersion(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
