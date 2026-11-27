import { afterEach, describe, expect, it, vi } from 'vitest';
import { asIce, iceServers, loadIce, resetIce } from '../../src/net/ice';

describe('TURN-Zugang', () => {
  afterEach(() => {
    resetIce();
    vi.unstubAllGlobals();
  });

  it('nimmt nur gültige Server, ohne Port 53, Zugangsdaten nur paarweise', () => {
    expect(
      asIce([
        {
          urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'],
          username: 'u',
          credential: 'c',
        },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: ['http://boese'] },
        { urls: 'turn:x:3478', username: 'nur-name' },
        null,
      ]),
    ).toEqual([
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' },
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:x:3478'] },
    ]);
    expect(asIce('kaputt')).toBeNull();
    expect(asIce([])).toBeNull();
  });

  it('holt im Hintergrund und merkt sich die Antwort, ohne Adresse passiert nichts', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ iceServers: [{ urls: ['turn:t:3478'], username: 'u', credential: 'c' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    loadIce('');
    expect(fetchMock).not.toHaveBeenCalled();
    loadIce('https://ice.example/');
    await vi.waitFor(() => expect(iceServers()).toEqual([{ urls: ['turn:t:3478'], username: 'u', credential: 'c' }]));
    loadIce('https://ice.example/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ein Fehler beim Holen lässt alles wie vorher', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    loadIce('https://ice.example/');
    await new Promise((r) => setTimeout(r, 0));
    expect(iceServers()).toBeNull();
  });
});
