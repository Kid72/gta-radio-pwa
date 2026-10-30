import { openDB, IDBPDatabase } from 'idb';
import { generateVinylCoverSvg } from '../utils/coverFallback';
import { lookupCoverArt, type CoverSource } from '../data/coverIndex';

const STORE_NAME = 'cover_art';
const DATA_URI_PREFIX = 'data:image/svg+xml';

/** Total time budget for the live network phase (all providers together). */
const LIVE_BUDGET_MS = 2500;

export interface CoverArtResult {
  url: string;
  source: CoverSource;
}

export interface CoverFallbackOptions {
  artist?: string;
  song?: string;
  stationName?: string;
  accentColor?: string;
}

/** True when the URL already is the procedural vinyl sleeve (never retry it). */
export function isProceduralCover(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(DATA_URI_PREFIX);
}

/**
 * <img onError> handler body: swap broken artwork for the procedural vinyl
 * sleeve. Returns the input untouched when it already is the procedural cover,
 * so a failing <img> can never loop forever.
 */
export function coverArtOnError(
  currentSrc: string | null | undefined,
  options: CoverFallbackOptions = {}
): string {
  if (isProceduralCover(currentSrc)) return currentSrc as string;
  return generateVinylCoverSvg({
    song: options.song,
    artist: options.artist,
    stationName: options.stationName,
    accentColor: options.accentColor,
  });
}

export class CoverArtService {
  private memoryCache = new Map<string, string>();
  private inFlight = new Map<string, Promise<string>>();
  private dbPromise: Promise<IDBPDatabase<any>> | null = null;
  private dbName: string;

  constructor(dbName: string = 'gta-radio-cover-art') {
    this.dbName = dbName;
  }

  private getDB(): Promise<IDBPDatabase<any>> | null {
    if (typeof indexedDB === 'undefined') return null;
    if (!this.dbPromise) {
      try {
        this.dbPromise = openDB(this.dbName, 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          },
        });
      } catch {
        this.dbPromise = null;
      }
    }
    return this.dbPromise;
  }

  private async getFromIdb(key: string): Promise<string | null> {
    try {
      const db = await this.getDB();
      if (!db) return null;
      const val = await db.get(STORE_NAME, key);
      return typeof val === 'string' ? val : null;
    } catch {
      return null;
    }
  }

  private async saveToIdb(key: string, url: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db) return;
      await db.put(STORE_NAME, url, key);
    } catch {
      // Ignore quota or write failures gracefully
    }
  }

  /**
   * Resolves album artwork for a music cue through an offline-first chain:
   *
   *   1. in-memory cache                (no network, no disk)
   *   2. in-flight request coalescing   (dedupes concurrent callers)
   *   3. pre-built cover index          (O(1), shipped with the bundle, no network)
   *   4. IndexedDB cache                (no network, survives reloads)
   *   5. live search: iTunes -> Deezer  (shared 2.5s budget)
   *   6. `fallbackUrl`, else the procedural vinyl sleeve (data URI, always renders)
   *
   * It never resolves to an empty string for a music cue: when every source
   * fails the caller still gets a renderable data-URI sleeve.
   */
  async getCoverArt(
    artist: string,
    song: string,
    fallbackUrl: string = '',
    stationName: string = '',
    accentColor: string = '#f59e0b'
  ): Promise<string> {
    return (await this.resolveCoverArt(artist, song, fallbackUrl, stationName, accentColor)).url;
  }

  /** Same chain as getCoverArt(), but also reports which tier answered. */
  async resolveCoverArt(
    artist: string,
    song: string,
    fallbackUrl: string = '',
    stationName: string = '',
    accentColor: string = '#f59e0b'
  ): Promise<CoverArtResult> {
    const cleanArtist = (artist || '').trim();
    const cleanSong = (song || '').trim();

    const proceduralFallback = (cleanSong && cleanArtist)
      ? generateVinylCoverSvg({ song: cleanSong, artist: cleanArtist, stationName, accentColor })
      : fallbackUrl;

    const resolvedFallback = fallbackUrl || proceduralFallback;

    if (!cleanArtist || !cleanSong) {
      return { url: resolvedFallback, source: 'fallback' };
    }

    const cacheKey = `${cleanArtist.toLowerCase()} - ${cleanSong.toLowerCase()}`;

    // 1. In-memory cache
    const memoryHit = this.memoryCache.get(cacheKey);
    if (memoryHit) return { url: memoryHit, source: 'memory' };

    // 2. Coalesce with an identical request already in flight
    if (this.inFlight.has(cacheKey)) {
      return { url: await this.inFlight.get(cacheKey)!, source: 'shared' };
    }

    // 3. Pre-built index: the fast path, zero network for known tracks
    const indexed = lookupCoverArt(cleanArtist, cleanSong);
    if (indexed) {
      this.memoryCache.set(cacheKey, indexed.url);
      return { url: indexed.url, source: indexed.source };
    }

    const fetchTask = (async () => {
      // 4. Persistent IndexedDB cache
      const idbCached = await this.getFromIdb(cacheKey);
      if (idbCached) {
        this.memoryCache.set(cacheKey, idbCached);
        return idbCached;
      }

      // 5. Live search (iTunes first, Deezer as backup), shared time budget
      const networked = await this.searchNetwork(cleanArtist, cleanSong);
      if (networked && !isProceduralCover(networked)) {
        this.memoryCache.set(cacheKey, networked);
        await this.saveToIdb(cacheKey, networked);
        return networked;
      }

      // 6. Procedural sleeve / station logo — always renderable
      return resolvedFallback;
    })();

    this.inFlight.set(cacheKey, fetchTask);

    try {
      return { url: await fetchTask, source: 'network' };
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /** Live lookup. Returns '' when both providers miss or the budget is spent. */
  private async searchNetwork(artist: string, song: string): Promise<string> {
    const startedAt = Date.now();
    const remaining = () => LIVE_BUDGET_MS - (Date.now() - startedAt);

    const itunesBudget = Math.min(remaining(), LIVE_BUDGET_MS);
    if (itunesBudget > 250) {
      const itunes = await this.searchItunes(artist, song, itunesBudget);
      if (itunes) return itunes;
    }

    const deezerBudget = Math.min(remaining(), LIVE_BUDGET_MS);
    if (deezerBudget > 250) {
      const deezer = await this.searchDeezer(artist, song, deezerBudget);
      if (deezer) return deezer;
    }

    return '';
  }

  private async fetchJson(url: string, budgetMs: number): Promise<any | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1, budgetMs));
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Loose comparison form: no accents, case, punctuation, brackets or "feat." tails. */
  private normalize(value: unknown): string {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s*[([][^)\]]*[)\]]/g, ' ')
      .replace(/\s+(feat\.?|ft\.?|featuring|with)\s.*$/i, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Removes spaces so "N-Joi" and "NJOI" compare equal. */
  private compact(value: string): string {
    return value.replace(/\s+/g, '');
  }

  private matches(wantArtist: string, wantSong: string, gotArtist: unknown, gotSong: unknown): boolean {
    const want = this.normalize(wantSong);
    const got = this.normalize(gotSong);
    if (!want || !got) return false;
    const titleOk =
      want === got ||
      this.compact(want) === this.compact(got) ||
      (want.length >= 6 && (want.includes(got) || got.includes(want)));
    if (!titleOk) return false;

    const wantA = this.normalize(wantArtist);
    const gotA = this.normalize(gotArtist);
    if (!wantA || !gotA) return false;
    if (wantA === gotA || this.compact(wantA) === this.compact(gotA)) return true;
    const [shortSide, longSide] = wantA.length <= gotA.length ? [wantA, gotA] : [gotA, wantA];
    if (shortSide.length >= 4 && longSide.includes(shortSide)) return true;

    // Token containment: "Charles Wright & the Watts 103rd Street Band" and
    // "Charles Wright & The Watts 103rd Street Rhythm Band" are the same act.
    const tokens = (value: string) => value.split(' ').filter((t) => t && t !== 'the' && t !== 'and');
    const shortTokens = tokens(shortSide);
    const longTokens = new Set(tokens(longSide));
    return shortTokens.length >= 3 && shortTokens.every((token) => longTokens.has(token));
  }

  private async searchItunes(artist: string, song: string, budgetMs: number): Promise<string | null> {
    const term = encodeURIComponent(`${artist} ${song}`);
    const data = await this.fetchJson(
      `https://itunes.apple.com/search?term=${term}&entity=song&limit=5`,
      budgetMs
    );
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      const raw = item?.artworkUrl100 || item?.artworkUrl60 || item?.artworkUrl600;
      if (typeof raw !== 'string') continue;
      const hasMetadata = !!(item?.artistName || item?.trackName);
      // A payload with no artist/title is unverifiable: only its top hit is trusted.
      if (hasMetadata && !this.matches(artist, song, item?.artistName, item?.trackName)) continue;
      if (!hasMetadata && i > 0) continue;
      // Bump the thumbnail (e.g. 100x100bb) to 600x600 for retina display
      return raw.replace(/\d+x\d+bb/, '600x600bb');
    }
    return null;
  }

  private async searchDeezer(artist: string, song: string, budgetMs: number): Promise<string | null> {
    const query = encodeURIComponent(`${artist} ${song}`);
    const data = await this.fetchJson(`https://api.deezer.com/search?q=${query}&limit=5`, budgetMs);
    const results: any[] = Array.isArray(data?.data) ? data.data : [];
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      const cover = item?.album?.cover_xl || item?.album?.cover_big || item?.album?.cover_medium;
      if (typeof cover !== 'string') continue;
      const hasMetadata = !!(item?.artist?.name || item?.title);
      if (hasMetadata && !this.matches(artist, song, item?.artist?.name, item?.title)) continue;
      if (!hasMetadata && i > 0) continue;
      return cover;
    }
    return null;
  }
}

export const coverArtService = new CoverArtService();
