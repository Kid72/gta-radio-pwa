import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoverArtService } from './coverArtService';

describe('CoverArtService', () => {
  let service: CoverArtService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    service = new CoverArtService('test-cover-art-db-' + Math.random().toString(36).substring(7));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns fallback URL for empty song or artist', async () => {
    const art = await service.getCoverArt('', '', 'fallback.png');
    expect(art).toBe('fallback.png');

    const art2 = await service.getCoverArt('   ', 'Song', 'fallback.png');
    expect(art2).toBe('fallback.png');

    const art3 = await service.getCoverArt('Artist', '   ', 'fallback.png');
    expect(art3).toBe('fallback.png');
  });

  it('returns empty string if no fallback URL provided and song/artist is empty', async () => {
    const art = await service.getCoverArt('', '');
    expect(art).toBe('');
  });

  it('fetches cover art from iTunes API and replaces with 600x600', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' },
        ],
      }),
    });

    const art = await service.getCoverArt('Fixture Artist Alpha', 'Fixture Song Alpha', 'fallback.png');
    expect(art).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://itunes.apple.com/search?term='),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('uses in-memory cache for repeated calls without re-fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' }],
      }),
    });
    global.fetch = fetchMock;

    const res1 = await service.getCoverArt('Fixture Artist Beta', 'Fixture Song Beta', 'fallback.png');
    const res2 = await service.getCoverArt('Fixture Artist Beta', 'Fixture Song Beta', 'fallback.png');

    expect(res1).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
    expect(res2).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes query trimming and casing for cache matching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' }],
      }),
    });
    global.fetch = fetchMock;

    await service.getCoverArt('fixture artist beta  ', '  Fixture Song Beta', 'fallback.png');
    await service.getCoverArt('FIXTURE ARTIST BETA', 'fixture song beta', 'fallback.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent in-flight requests into a single network fetch', async () => {
    let resolveFetch: (val: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockImplementation(() => fetchPromise);
    global.fetch = fetchMock;

    const p1 = service.getCoverArt('Fixture Artist Gamma', 'Fixture Song Gamma', 'fallback.png');
    const p2 = service.getCoverArt('Fixture Artist Gamma', 'Fixture Song Gamma', 'fallback.png');

    resolveFetch!({
      ok: true,
      json: async () => ({
        results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' }],
      }),
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
    expect(r2).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns fallback URL when iTunes API returns empty results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const art = await service.getCoverArt('Unknown Artist', 'Unknown Song', 'fallback.png');
    expect(art).toBe('fallback.png');
  });

  it('returns fallback URL when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const art = await service.getCoverArt('Fixture Artist Delta', 'Fixture Song Delta', 'fallback.png');
    expect(art).toBe('fallback.png');
  });

  it('returns fallback URL when response is not ok (e.g. 503)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const art = await service.getCoverArt('Fixture Artist Epsilon', 'Fixture Song Epsilon', 'fallback.png');
    expect(art).toBe('fallback.png');
  });

  it('persists fetched artwork to IndexedDB and recovers from DB when memory cache is empty', async () => {
    const dbName = 'test-idb-persistence-' + Math.random().toString(36).substring(7);
    const service1 = new CoverArtService(dbName);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' }],
      }),
    });

    const res1 = await service1.getCoverArt('Fixture Artist Zeta', 'Fixture Song Zeta', 'fallback.png');
    expect(res1).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');

    // Create a new service instance sharing the same DB, but with a fresh empty in-memory cache
    const service2 = new CoverArtService(dbName);
    const fetchMock2 = vi.fn();
    global.fetch = fetchMock2;

    const res2 = await service2.getCoverArt('Fixture Artist Zeta', 'Fixture Song Zeta', 'fallback.png');
    expect(res2).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
    expect(fetchMock2).not.toHaveBeenCalled();
  });

  it('upgrades any artwork dimension variant using regex', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/512x512bb.jpg' },
        ],
      }),
    });

    const art = await service.getCoverArt('Artist', 'Song', 'fallback.png');
    expect(art).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
  });

  it('aborts fetch and returns fallbackUrl when network request exceeds 2.5s timeout', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        }
      });
    });

    const promise = service.getCoverArt('Slow Band', 'Neverending Song', 'fallback.png');

    // Advance timers by 2600ms to trigger AbortController timeout
    await vi.advanceTimersByTimeAsync(2600);

    const art = await promise;
    expect(art).toBe('fallback.png');

    vi.useRealTimers();
  });
});

/* ------------------------------------------------------------------ */
/* Pre-built cover index + fallback chain (offline-first behaviour)     */
/* ------------------------------------------------------------------ */

import coverIndexRaw from '../data/cover-index.json';
import { coverArtOnError, isProceduralCover } from './coverArtService';

const INDEX = coverIndexRaw as unknown as Record<string, { url: string; source: string }>;
const INDEX_KEYS = Object.keys(INDEX).filter((k) => k !== '_meta');

/** Take a real indexed track straight out of the shipped index. */
function sampleIndexed(): { artist: string; song: string; url: string; source: string } {
  const key = INDEX_KEYS[0];
  const [artist, song] = key.split('|');
  return { artist, song, url: INDEX[key].url, source: INDEX[key].source };
}

describe('CoverArtService — pre-built index chain', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('serves an indexed track from the bundle without any network call', async () => {
    const sample = sampleIndexed();
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const service = new CoverArtService('test-index-hit-' + Math.random().toString(36).slice(2));

    const result = await service.resolveCoverArt(sample.artist, sample.song, 'fallback.png');

    expect(result.url).toBe(sample.url);
    expect(result.source).toBe(sample.source);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls through to the live search when the index misses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { artistName: 'Nonexistent Test Band', trackName: 'Nothing Real Here', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' },
        ],
      }),
    });
    global.fetch = fetchMock;
    const service = new CoverArtService('test-index-miss-' + Math.random().toString(36).slice(2));

    const result = await service.resolveCoverArt('Nonexistent Test Band', 'Nothing Real Here', 'fallback.png');

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain('itunes.apple.com/search');
    expect(result.url).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
  });

  it('prefers the index over the network even when the network would answer', async () => {
    const sample = sampleIndexed();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ artistName: sample.artist, trackName: sample.song, artworkUrl100: 'https://example.test/100x100bb.jpg' }],
      }),
    });
    global.fetch = fetchMock;
    const service = new CoverArtService('test-index-priority-' + Math.random().toString(36).slice(2));

    const result = await service.getCoverArt(sample.artist, sample.song);
    expect(result).toBe(sample.url);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to the procedural vinyl sleeve when the network fails and no fallback URL is given', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const service = new CoverArtService('test-net-fail-' + Math.random().toString(36).slice(2));

    const art = await service.getCoverArt('Unknown Band', 'Unknown Song');
    expect(art.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(art)).toContain('Unknown Song');
    expect(art).not.toBe('');
  });

  it('never returns an empty string for a music cue, even when every tier fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const service = new CoverArtService('test-never-empty-' + Math.random().toString(36).slice(2));

    const art = await service.getCoverArt('Unknown Band', 'Unknown Song', '');
    expect(art.length).toBeGreaterThan(0);
    expect(art.startsWith('data:image/svg+xml')).toBe(true);
  });
});

describe('coverArtOnError — broken <img> can never stay broken', () => {
  it('replaces a broken remote URL with the procedural sleeve', () => {
    const next = coverArtOnError('https://cdn.example.test/gone.jpg', {
      artist: 'Tupac',
      song: 'California Love',
      stationName: 'Radio Los Santos',
    });
    expect(next.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(next)).toContain('California Love');
  });

  it('is a no-op on the procedural sleeve itself (no error loop)', () => {
    const sleeve = coverArtOnError('https://broken.test/x.jpg', { song: 'A', artist: 'B' });
    expect(coverArtOnError(sleeve, { song: 'A', artist: 'B' })).toBe(sleeve);
    expect(isProceduralCover(sleeve)).toBe(true);
  });

  it('handles a null src (station logo missing) by rendering the sleeve', () => {
    const next = coverArtOnError(null, { stationName: 'K-DST' });
    expect(next.startsWith('data:image/svg+xml')).toBe(true);
  });
});
