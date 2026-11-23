/* Browser-Speicher mit Präfix. Fehler (privater Modus, voller Speicher) werden still ignoriert. */

export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  del(key: string): void;
}

const PREFIX = 'schnautz:';

export function store(kind: 'localStorage' | 'sessionStorage'): Store {
  return {
    get<T>(k: string, d: T): T {
      try {
        const v = window[kind].getItem(PREFIX + k);
        return v == null ? d : (JSON.parse(v) as T);
      } catch {
        return d;
      }
    },
    set(k: string, v: unknown): void {
      try {
        window[kind].setItem(PREFIX + k, JSON.stringify(v));
      } catch {
        /* Speicher nicht verfügbar */
      }
    },
    del(k: string): void {
      try {
        window[kind].removeItem(PREFIX + k);
      } catch {
        /* Speicher nicht verfügbar */
      }
    },
  };
}

export const LS = store('localStorage');
export const SS = store('sessionStorage');
