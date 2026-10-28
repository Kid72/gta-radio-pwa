import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CachedStationRecord, GameId } from '../types/radio';

export interface GTARadioDB extends DBSchema {
  stations: {
    key: string; // `${gameId}:${stationId}`
    value: CachedStationRecord;
    indexes: { 'by-game': GameId };
  };
}

export const DB_NAME = 'gta-radio-offline';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GTARadioDB>> | null = null;

export function getStationKey(gameId: GameId, stationId: string): string {
  return stationId.startsWith(`${gameId}:`) ? stationId : `${gameId}:${stationId}`;
}

export function getDB(): Promise<IDBPDatabase<GTARadioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GTARadioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('stations', { keyPath: 'stationId' });
        store.createIndex('by-game', 'gameId');
      },
    });
  }
  return dbPromise;
}

export function closeDB(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}

export async function saveStationAudio(record: CachedStationRecord): Promise<void> {
  const db = await getDB();
  const key = getStationKey(record.gameId, record.stationId);
  const normalizedRecord: CachedStationRecord = {
    ...record,
    stationId: key,
  };
  await db.put('stations', normalizedRecord);
}

export async function getCachedStationAudio(gameId: GameId, stationId: string): Promise<Blob | null> {
  const db = await getDB();
  const key = getStationKey(gameId, stationId);
  let record = await db.get('stations', key);
  if (!record && key !== stationId) {
    record = await db.get('stations', stationId);
  }
  return record ? record.blob : null;
}

export async function deleteCachedStationAudio(gameId: GameId, stationId: string): Promise<void> {
  const db = await getDB();
  const key = getStationKey(gameId, stationId);
  await db.delete('stations', key);
  if (key !== stationId) {
    await db.delete('stations', stationId);
  }
}

export async function listCachedStationKeys(): Promise<string[]> {
  const db = await getDB();
  return (await db.getAllKeys('stations')) as string[];
}

export async function listCachedStationIds(): Promise<string[]> {
  return listCachedStationKeys();
}

export async function clearAllCachedStations(): Promise<void> {
  const db = await getDB();
  await db.clear('stations');
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
