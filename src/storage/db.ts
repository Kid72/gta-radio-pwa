import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CachedChunkRecord, CachedStationRecord, GameId } from '../types/radio';

export interface GTARadioDB extends DBSchema {
  stations: {
    key: string; // `${gameId}:${stationId}` — legacy single-blob cache (v1 schema)
    value: CachedStationRecord;
    indexes: { 'by-game': GameId };
  };
  chunks: {
    key: string; // `${gameId}:${stationId}:${NNN}`
    value: CachedChunkRecord;
    indexes: {
      'by-station': [GameId, string]; // [gameId, stationId]
      'by-game': GameId;
    };
  };
}

export const DB_NAME = 'gta-radio-offline';
export const DB_VERSION = 2;
export const CHUNK_STORE = 'chunks';
export const LEGACY_STATION_STORE = 'stations';

let dbPromise: Promise<IDBPDatabase<GTARadioDB>> | null = null;

export function getStationKey(gameId: GameId, stationId: string): string {
  return stationId.startsWith(`${gameId}:`) ? stationId : `${gameId}:${stationId}`;
}

/** Strips a leading `<gameId>:` so composite keys never double the game prefix. */
function cleanStationId(gameId: GameId, stationId: string): string {
  const prefix = `${gameId}:`;
  return stationId.startsWith(prefix) ? stationId.slice(prefix.length) : stationId;
}

/** Composite chunk key: `<gameId>:<stationId>:<NNN>` (index padded to three digits). */
export function getChunkKey(gameId: GameId, stationId: string, chunkIndex: number): string {
  return `${gameId}:${cleanStationId(gameId, stationId)}:${String(chunkIndex).padStart(3, '0')}`;
}

export function getDB(): Promise<IDBPDatabase<GTARadioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GTARadioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Existing v1 databases already own `stations`; leave it untouched so legacy
        // single-blob records stay readable. Fresh databases get both stores.
        if (!db.objectStoreNames.contains(LEGACY_STATION_STORE)) {
          const stations = db.createObjectStore(LEGACY_STATION_STORE, { keyPath: 'stationId' });
          stations.createIndex('by-game', 'gameId');
        }
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const chunks = db.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
          chunks.createIndex('by-station', ['gameId', 'stationId']);
          chunks.createIndex('by-game', 'gameId');
        }
      },
      blocked() {
        // Another tab still holds the old version open: drop our handle so the
        // upgrade is not stuck behind this connection.
        void closeDB();
      },
      blocking() {
        // Another tab wants to upgrade: release this connection.
        void closeDB();
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

export async function closeDB(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // The connection may already be closed or the open request may have failed.
  }
}

// ---------------------------------------------------------------------------
// Chunk storage (v2)
// ---------------------------------------------------------------------------

export async function saveChunkBlob(
  gameId: GameId,
  stationId: string,
  chunkIndex: number,
  blob: Blob
): Promise<void> {
  const db = await getDB();
  const record: CachedChunkRecord = {
    key: getChunkKey(gameId, stationId, chunkIndex),
    gameId,
    stationId: cleanStationId(gameId, stationId),
    chunkIndex,
    blob,
    sizeBytes: blob.size,
    savedAt: Date.now(),
  };
  await db.put(CHUNK_STORE, record);
}

export async function getChunkBlob(
  gameId: GameId,
  stationId: string,
  chunkIndex: number
): Promise<Blob | null> {
  const db = await getDB();
  const record = await db.get(CHUNK_STORE, getChunkKey(gameId, stationId, chunkIndex));
  return record ? record.blob : null;
}

export async function listChunkKeys(): Promise<string[]> {
  const db = await getDB();
  return (await db.getAllKeys(CHUNK_STORE)) as string[];
}

/** All stored chunks of one station, ordered by chunk index. */
export async function getChunksForStation(
  gameId: GameId,
  stationId: string
): Promise<{ index: number; blob: Blob }[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex(CHUNK_STORE, 'by-station', [
    gameId,
    cleanStationId(gameId, stationId),
  ]);
  return records
    .slice()
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((record) => ({ index: record.chunkIndex, blob: record.blob }));
}

/** Total stored bytes of a station's chunks (0 when nothing is cached). */
export async function getStationChunksSize(gameId: GameId, stationId: string): Promise<number> {
  const db = await getDB();
  const records = await db.getAllFromIndex(CHUNK_STORE, 'by-station', [
    gameId,
    cleanStationId(gameId, stationId),
  ]);
  return records.reduce((total, record) => total + record.sizeBytes, 0);
}

export async function deleteChunksForStation(
  gameId: GameId,
  stationId: string
): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex(CHUNK_STORE, 'by-station', [
    gameId,
    cleanStationId(gameId, stationId),
  ]);
  if (keys.length === 0) return;
  const tx = db.transaction(CHUNK_STORE, 'readwrite');
  await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
}

export async function clearAllChunks(): Promise<void> {
  const db = await getDB();
  await db.clear(CHUNK_STORE);
}

// ---------------------------------------------------------------------------
// Legacy single-blob API (kept for compatibility; chunk cache is the new path)
// ---------------------------------------------------------------------------

export async function saveStationAudio(record: CachedStationRecord): Promise<void> {
  const db = await getDB();
  const key = getStationKey(record.gameId, record.stationId);
  const normalizedRecord: CachedStationRecord = {
    ...record,
    stationId: key,
  };
  await db.put(LEGACY_STATION_STORE, normalizedRecord);
}

/**
 * Reads the legacy single-blob cache only. Chunked downloads are read through
 * `getChunkBlob`/`getChunksForStation`; this returns `null` for chunk-only stations.
 */
export async function getCachedStationAudio(
  gameId: GameId,
  stationId: string
): Promise<Blob | null> {
  const db = await getDB();
  const key = getStationKey(gameId, stationId);
  let record = await db.get(LEGACY_STATION_STORE, key);
  if (!record && key !== stationId) {
    record = await db.get(LEGACY_STATION_STORE, stationId);
  }
  return record?.blob ?? null;
}

/** Removes every chunk of the station *and* its legacy single-blob record. */
export async function deleteCachedStationAudio(
  gameId: GameId,
  stationId: string
): Promise<void> {
  const db = await getDB();
  const key = getStationKey(gameId, stationId);
  await db.delete(LEGACY_STATION_STORE, key);
  if (key !== stationId) {
    await db.delete(LEGACY_STATION_STORE, stationId);
  }
  await deleteChunksForStation(gameId, stationId);
}

/** One `gameId:stationId` per cached station, from chunk and legacy records alike. */
export async function listCachedStationKeys(): Promise<string[]> {
  const db = await getDB();
  const [legacyRecords, chunkRecords] = await Promise.all([
    db.getAll(LEGACY_STATION_STORE),
    db.getAll(CHUNK_STORE),
  ]);
  const keys = new Set<string>();
  for (const record of legacyRecords) {
    keys.add(getStationKey(record.gameId, record.stationId));
  }
  for (const chunk of chunkRecords) {
    keys.add(getStationKey(chunk.gameId, chunk.stationId));
  }
  return Array.from(keys).sort();
}

/**
 * Summaries of everything cached — legacy blobs and chunked stations aggregated by
 * station. Field names are unchanged (`stationId`/`gameId`/`sizeBytes`/`downloadedAt`),
 * so `App.tsx` and `StorageDrawer` keep working without edits.
 */
export async function getAllCachedStations(): Promise<CachedStationRecord[]> {
  const db = await getDB();
  const [legacyRecords, chunkRecords] = await Promise.all([
    db.getAll(LEGACY_STATION_STORE),
    db.getAll(CHUNK_STORE),
  ]);

  const summaries = new Map<string, CachedStationRecord>();
  const accumulate = (
    gameId: GameId,
    stationId: string,
    sizeBytes: number,
    timestamp: number
  ): void => {
    const key = getStationKey(gameId, stationId);
    const existing = summaries.get(key);
    if (existing) {
      existing.sizeBytes += sizeBytes;
      existing.downloadedAt = Math.max(existing.downloadedAt, timestamp);
      return;
    }
    summaries.set(key, {
      stationId: key,
      gameId,
      sizeBytes,
      downloadedAt: timestamp,
    });
  };

  for (const record of legacyRecords) {
    accumulate(
      record.gameId,
      record.stationId,
      record.sizeBytes ?? record.blob?.size ?? 0,
      record.downloadedAt ?? 0
    );
  }
  for (const chunk of chunkRecords) {
    accumulate(chunk.gameId, chunk.stationId, chunk.sizeBytes, chunk.savedAt);
  }

  return Array.from(summaries.values()).sort((a, b) =>
    a.stationId.localeCompare(b.stationId)
  );
}

export async function listCachedStationIds(): Promise<string[]> {
  return listCachedStationKeys();
}

export async function clearAllCachedStations(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([LEGACY_STATION_STORE, CHUNK_STORE], 'readwrite');
  await Promise.all([
    tx.objectStore(LEGACY_STATION_STORE).clear(),
    tx.objectStore(CHUNK_STORE).clear(),
    tx.done,
  ]);
}

export async function getStorageUsageEstimate(): Promise<{ usedBytes: number; quotaBytes: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usedBytes: estimate.usage ?? 0,
        quotaBytes: estimate.quota ?? 0,
      };
    } catch {
      // Fall through to fallback
    }
  }
  return { usedBytes: 0, quotaBytes: 0 };
}
