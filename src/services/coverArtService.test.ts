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

    const art = await service.getCoverArt('2Pac', 'Ambitionz Az a Ridah', 'fallback.png');
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

    const res1 = await service.getCoverArt('Dr. Dre', 'Nuthin But A G Thang', 'fallback.png');
    const res2 = await service.getCoverArt('Dr. Dre', 'Nuthin But A G Thang', 'fallback.png');

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

    await service.getCoverArt('dr. dre  ', '  Nuthin But A G Thang', 'fallback.png');
    await service.getCoverArt('DR. DRE', 'nuthin but a g thang', 'fallback.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent in-flight requests into a single network fetch', async () => {
    let resolveFetch: (val: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockImplementation(() => fetchPromise);
    global.fetch = fetchMock;

    const p1 = service.getCoverArt('Snoop Dogg', 'Gin and Juice', 'fallback.png');
    const p2 = service.getCoverArt('Snoop Dogg', 'Gin and Juice', 'fallback.png');

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

    const art = await service.getCoverArt('Guns N Roses', 'Welcome to the Jungle', 'fallback.png');
    expect(art).toBe('fallback.png');
  });

  it('returns fallback URL when response is not ok (e.g. 503)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const art = await service.getCoverArt('Guns N Roses', 'Paradise City', 'fallback.png');
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

    const res1 = await service1.getCoverArt('Tupac', 'California Love', 'fallback.png');
    expect(res1).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');

    // Create a new service instance sharing the same DB, but with a fresh empty in-memory cache
    const service2 = new CoverArtService(dbName);
    const fetchMock2 = vi.fn();
    global.fetch = fetchMock2;

    const res2 = await service2.getCoverArt('Tupac', 'California Love', 'fallback.png');
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
