/*
 * Zweiter Gastgeber-Tab: Sperre, Ansprüche und Übergabe aus src/net/tablock.ts, mit nachgebauter navigator.locks.
 * Zwei Tabs sind zwei frisch geladene Module, die sich dieselbe Sperre teilen.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LockApi } from '../../src/net/tablock';
import * as T from '../../src/net/tablock';

type Entry = {
  cb: (lock: unknown) => unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

/** Genug von navigator.locks für eine Sperre: warten, ifAvailable, steal und Abbruch per signal. */
class FakeLocks implements LockApi {
  holder: Entry | null = null;
  queue: Entry[] = [];

  request(
    _name: string,
    opts: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    cb: (lock: unknown) => unknown,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const e: Entry = { cb, resolve, reject };
      if (opts.steal && this.holder) {
        const old = this.holder;
        this.holder = null;
        old.reject(new Error('AbortError'));
      }
      if (!this.holder && (opts.steal || !this.queue.length)) {
        this.grant(e);
        return;
      }
      if (opts.ifAvailable) {
        Promise.resolve(cb(null)).then(resolve, reject);
        return;
      }
      this.queue.push(e);
      opts.signal?.addEventListener('abort', () => {
        const i = this.queue.indexOf(e);
        if (i < 0) return;
        this.queue.splice(i, 1);
        reject(new Error('AbortError'));
      });
    });
  }

  private grant(e: Entry): void {
    this.holder = e;
    Promise.resolve(e.cb({ name: T.LOCK_NAME })).then(
      (v) => {
        if (this.holder === e) this.holder = null;
        e.resolve(v);
        const next = this.queue.shift();
        if (next) this.grant(next);
      },
      (err) => e.reject(err),
    );
  }

  query(): Promise<{ held: { name: string }[]; pending: { name: string }[] }> {
    return Promise.resolve({
      held: this.holder ? [{ name: T.LOCK_NAME }] : [],
      pending: this.queue.map(() => ({ name: T.LOCK_NAME })),
    });
  }
}

/** Ein eigener Tab: das Modul frisch geladen, mit eigenem Zustand und eigener Kennung. */
async function tab(): Promise<typeof T> {
  vi.resetModules();
  return import('../../src/net/tablock');
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Ansprüche zwischen Tabs', () => {
  it('nimmt nur Ansprüche mit passender Form, ohne Schlüssel oder Spielstand', () => {
    expect(T.asClaim(null)).toBeNull();
    expect(T.asClaim({ tab: 't-1', code: 'ABCDE' })).toBeNull();
    expect(T.asClaim({ tab: 't-1', code: 'ABCDE', at: 5, key: 'k-geheim', st: {} })).toEqual({
      tab: 't-1',
      code: 'ABCDE',
      at: 5,
    });
    const c = T.newClaim('ABCDE', 100);
    expect(c).toEqual({ tab: T.TAB, code: 'ABCDE', at: 100 });
  });

  it('entscheidet, was der laufende Tab mit einem Anspruch macht', () => {
    const me = { tab: 't-alt', code: 'ABCDE', hosting: true };
    const now = 1_000_000;
    const c = (code: string, at = now, t = 't-neu') => ({ tab: t, code, at });
    // Gleicher Tisch: letzter Stand gespeichert, dann übergeben
    expect(T.claimVerdict(c('ABCDE'), me, now)).toBe('keep');
    // Neuer Tisch im anderen Tab: dieser hier geht zu
    expect(T.claimVerdict(c(''), me, now)).toBe('end');
    expect(T.claimVerdict(c('XYZAB'), me, now)).toBe('end');
    // Erst nach dem Aufwachen gesehen: Der neue Tab speichert vielleicht schon, also ohne Speichern abtreten
    expect(T.claimVerdict(c('ABCDE', now - T.CLAIM_FRESH_MS - 1), me, now)).toBe('drop');
    // Eigener Anspruch, kein Gastgeber oder gar kein Anspruch
    expect(T.claimVerdict(c('ABCDE', now, 't-alt'), me, now)).toBe('ignore');
    expect(T.claimVerdict(c('ABCDE'), { ...me, hosting: false }, now)).toBe('ignore');
    expect(T.claimVerdict(null, me, now)).toBe('ignore');
  });

  it('zählt einen Anspruch, der über Kanal und Speicher kommt, nur einmal', () => {
    const seen: string[] = [];
    const cb = T.dedupe((c) => seen.push(c.code));
    const c = { tab: 't-x', code: 'ABCDE', at: 7 };
    cb(c);
    cb({ ...c });
    cb({ ...c, at: 8 });
    expect(seen).toEqual(['ABCDE', 'ABCDE']);
  });
});

describe('Sperre schnautz-host', () => {
  it('lässt nur einen Tab Gastgeber sein und sagt dem zweiten, dass der Tisch woanders offen ist', async () => {
    const locks = new FakeLocks();
    const A = await tab();
    const B = await tab();
    expect(A.TAB).not.toBe(B.TAB);
    expect(await A.tryHostLock(locks)).toBe(true);
    expect(A.holdsHostLock()).toBe(true);
    expect(await B.tryHostLock(locks)).toBe(false);
    expect(B.holdsHostLock()).toBe(false);
    expect(await B.hostLockElsewhere(locks)).toBe(true);
    expect(await A.hostLockElsewhere(locks)).toBe(false);
    // Nach dem Abgeben ist der Weg frei
    A.releaseHostLock();
    await tick();
    expect(await B.hostLockElsewhere(locks)).toBe(false);
    expect(await B.tryHostLock(locks)).toBe(true);
  });

  it('übergibt freiwillig: Der neue Tab wartet, bis der alte die Sperre freigibt', async () => {
    const locks = new FakeLocks();
    const A = await tab();
    const B = await tab();
    const lost = vi.fn();
    A.onHostLockLost(lost);
    await A.tryHostLock(locks);
    const taking = B.takeHostLock(locks, 1000);
    await tick();
    // Der alte Tab hat den Anspruch bekommen, gespeichert und gibt jetzt frei
    A.releaseHostLock();
    await taking;
    expect(B.holdsHostLock()).toBe(true);
    expect(A.holdsHostLock()).toBe(false);
    expect(lost).not.toHaveBeenCalled();
  });

  it('nimmt sich die Sperre, wenn der alte Tab nicht antwortet, und der alte merkt das', async () => {
    const locks = new FakeLocks();
    const A = await tab();
    const B = await tab();
    const lost = vi.fn();
    A.onHostLockLost(lost);
    await A.tryHostLock(locks);
    await B.takeHostLock(locks, 30);
    await tick();
    expect(B.holdsHostLock()).toBe(true);
    expect(A.holdsHostLock()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('wartet nach dem Neuladen kurz auf die Sperre des entladenen Dokuments, nimmt sie aber nicht weg', async () => {
    const locks = new FakeLocks();
    const A = await tab();
    const B = await tab();
    await A.tryHostLock(locks);
    expect(await B.waitHostLock(30, locks)).toBe(false);
    expect(A.holdsHostLock()).toBe(true);
    const waiting = B.waitHostLock(1000, locks);
    A.releaseHostLock();
    expect(await waiting).toBe(true);
  });

  it('ohne navigator.locks: keine Rückfrage, die Übergabe läuft nur über den Anspruch', async () => {
    const A = await tab();
    expect(await A.hostLockElsewhere(null)).toBeNull();
    expect(await A.tryHostLock(null)).toBe(true);
    expect(await A.waitHostLock(10, null)).toBe(true);
    await A.takeHostLock(null);
    expect(A.holdsHostLock()).toBe(false);
  });
});
