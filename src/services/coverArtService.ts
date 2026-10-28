import { openDB, IDBPDatabase } from 'idb';
import { generateVinylCoverSvg } from '../utils/coverFallback';

const STORE_NAME = 'cover_art';

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
   * Retrieves high-resolution album cover art from iTunes Search API.
   * Caches in-memory and persistently in IndexedDB.
   * Falls back gracefully to fallbackUrl or procedural vinyl sleeve on network failure, timeout (2.5s), or talk/commercials.
   */
  async getCoverArt(
    artist: string,
    song: string,
    fallbackUrl: string = '',
    stationName: string = '',
    accentColor: string = '#f59e0b'
  ): Promise<string> {
    const cleanArtist = (artist || '').trim();
    const cleanSong = (song || '').trim();

    const proceduralFallback = (cleanSong && cleanArtist)
      ? generateVinylCoverSvg({ song: cleanSong, artist: cleanArtist, stationName, accentColor })
      : fallbackUrl;

    const resolvedFallback = fallbackUrl || proceduralFallback;

    if (!cleanArtist || !cleanSong) {
      return resolvedFallback;
    }

    const cacheKey = `${cleanArtist.toLowerCase()} - ${cleanSong.toLowerCase()}`;

    // 1. Check in-memory cache
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    // 2. Return in-flight request if already querying
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)!;
    }

    const fetchTask = (async () => {
      // 3. Check persistent IndexedDB cache
      const idbCached = await this.getFromIdb(cacheKey);
      if (idbCached) {
        this.memoryCache.set(cacheKey, idbCached);
        return idbCached;
      }

      // 4. Query iTunes Search API with 2.5s AbortController timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      try {
        const query = `${cleanArtist} ${cleanSong}`;
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          return resolvedFallback;
        }

        const data = await response.json();
        const firstItem = data?.results?.[0];
        const rawArtwork =
          firstItem?.artworkUrl100 ||
          firstItem?.artworkUrl600 ||
          firstItem?.artworkUrl60;

        if (rawArtwork && typeof rawArtwork === 'string') {
          // Upgrade artwork thumbnail (e.g. 100x100bb or 60x60bb) to 600x600 high-resolution artwork
          const highResArtwork = rawArtwork.replace(/\d+x\d+bb/, '600x600bb');

          this.memoryCache.set(cacheKey, highResArtwork);
          await this.saveToIdb(cacheKey, highResArtwork);
          return highResArtwork;
        }

        return resolvedFallback;
      } catch {
        return resolvedFallback;
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    this.inFlight.set(cacheKey, fetchTask);

    try {
      return await fetchTask;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }
}

export const coverArtService = new CoverArtService();
