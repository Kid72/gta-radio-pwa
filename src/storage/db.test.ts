import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DB_NAME,
  closeDB,
  getDB,
  saveChunkBlob,
  getChunkBlob,
  listChunkKeys,
  getChunksForStation,
  getStationChunksSize,
  deleteChunksForStation,
  clearAllChunks,
  saveStationAudio,
  getCachedStationAudio,
  deleteCachedStationAudio,
  getAllCachedStations,
  listCachedStationKeys,
  clearAllCachedStations,
} from './db';
import { CachedStationRecord } from '../types/radio';

function makeBlob(bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
}

function makeLegacyRecord(
  gameId: CachedStationRecord['gameId'],
  stationId: string,
  bytes: number[],
  downloadedAt = 1_000
): CachedStationRecord {
  const blob = makeBlob(bytes);
  return { stationId, gameId, blob, sizeBytes: blob.size, downloadedAt };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/** Recreates the v1 schema by hand and writes one legacy single-blob record. */
function createV1DatabaseWithLegacyRecord(record: CachedStationRecord): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore('stations', { keyPath: 'stationId' });
      store.createIndex('by-game', 'gameId');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('stations', 'readwrite');
      tx.objectStore('stations').put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('Chunked audio storage (src/storage/db.ts v2)', () => {
  beforeEach(async () => {
    await clearAllCachedStations();
  });

  afterEach(async () => {
    await closeDB();
  });

  it('saves and reads a chunk blob by composite key', async () => {
    const bytes = [1, 2, 3, 4, 5];
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob(bytes));

    const retrieved = await getChunkBlob('gtasa', 'k-rose', 0);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.size).toBe(5);
    expect(retrieved!.type).toBe('audio/mpeg');
    expect(new Uint8Array(await retrieved!.arrayBuffer())).toEqual(new Uint8Array(bytes));

    // The composite key is `<gameId>:<stationId>:<NNN>` with three digits.
    expect(await listChunkKeys()).toEqual(['gtasa:k-rose:000']);
  });

  it('returns null for a missing chunk', async () => {
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1]));

    expect(await getChunkBlob('gtasa', 'k-rose', 7)).toBeNull();
    expect(await getChunkBlob('gta4', 'k-rose', 0)).toBeNull();
  });

  it('lists chunk keys for a single station only', async () => {
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1]));
    await saveChunkBlob('gtasa', 'k-rose', 1, makeBlob([2]));
    await saveChunkBlob('gtasa', 'playback-fm', 0, makeBlob([3]));
    await saveChunkBlob('gta5', 'k-rose', 0, makeBlob([4]));

    const keys = await listChunkKeys();
    expect(keys.sort()).toEqual([
      'gta5:k-rose:000',
      'gtasa:k-rose:000',
      'gtasa:k-rose:001',
      'gtasa:playback-fm:000',
    ]);

    const gtasaChunks = await getChunksForStation('gtasa', 'k-rose');
    expect(gtasaChunks.map((chunk) => chunk.index)).toEqual([0, 1]);
    expect(gtasaChunks[1].blob.size).toBe(1);

    const gta5Chunks = await getChunksForStation('gta5', 'k-rose');
    expect(gta5Chunks.map((chunk) => chunk.index)).toEqual([0]);
    expect(new Uint8Array(await gta5Chunks[0].blob.arrayBuffer())).toEqual(new Uint8Array([4]));

    expect(await getChunksForStation('gta5', 'beat')).toEqual([]);
  });

  it('deletes all chunks of a station without touching another station', async () => {
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1]));
    await saveChunkBlob('gtasa', 'k-rose', 1, makeBlob([2]));
    await saveChunkBlob('gta4', 'the-beat', 0, makeBlob([3]));

    await deleteChunksForStation('gtasa', 'k-rose');

    expect(await getChunkBlob('gtasa', 'k-rose', 0)).toBeNull();
    expect(await getChunkBlob('gtasa', 'k-rose', 1)).toBeNull();
    expect(await listChunkKeys()).toEqual(['gta4:the-beat:000']);
    expect((await getChunkBlob('gta4', 'the-beat', 0))!.size).toBe(1);
  });

  it('sums station chunk sizes', async () => {
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1, 2, 3, 4, 5]));
    await saveChunkBlob('gtasa', 'k-rose', 1, makeBlob([6, 7, 8, 9, 10, 11, 12]));
    await saveChunkBlob('gta4', 'the-beat', 0, makeBlob([1, 2, 3]));

    expect(await getStationChunksSize('gtasa', 'k-rose')).toBe(12);
    expect(await getStationChunksSize('gta4', 'the-beat')).toBe(3);
    expect(await getStationChunksSize('gta5', 'nothing')).toBe(0);
  });

  it('deleteCachedStationAudio removes both chunks and the legacy record', async () => {
    await saveStationAudio(makeLegacyRecord('gtasa', 'k-rose', [9, 9]));
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1, 2]));
    await saveChunkBlob('gta5', 'non-stop-pop-fm', 0, makeBlob([3]));

    await deleteCachedStationAudio('gtasa', 'k-rose');

    expect(await getCachedStationAudio('gtasa', 'k-rose')).toBeNull();
    expect(await getChunkBlob('gtasa', 'k-rose', 0)).toBeNull();
    expect(await listChunkKeys()).toEqual(['gta5:non-stop-pop-fm:000']);
  });

  it('getAllCachedStations reports chunked stations with the same field names', async () => {
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1, 2, 3, 4, 5]));
    await saveChunkBlob('gtasa', 'k-rose', 1, makeBlob([6, 7, 8, 9, 10, 11, 12]));
    await saveStationAudio(makeLegacyRecord('gta4', 'the-beat', [1, 2, 3], 2_000));

    const summaries = await getAllCachedStations();
    expect(summaries.map((summary) => summary.stationId).sort()).toEqual([
      'gta4:the-beat',
      'gtasa:k-rose',
    ]);

    const rose = summaries.find((summary) => summary.stationId === 'gtasa:k-rose')!;
    expect(rose.gameId).toBe('gtasa');
    expect(rose.sizeBytes).toBe(12);
    expect(typeof rose.downloadedAt).toBe('number');
    expect(rose.downloadedAt).toBeGreaterThan(0);

    const beat = summaries.find((summary) => summary.stationId === 'gta4:the-beat')!;
    expect(beat.sizeBytes).toBe(3);

    expect((await listCachedStationKeys()).sort()).toEqual(['gta4:the-beat', 'gtasa:k-rose']);
  });

  it('upgrade keeps legacy station_audio records readable', async () => {
    await closeDB();
    await deleteDatabase(DB_NAME);

    const legacy = makeLegacyRecord('gtasa', 'k-rose', [4, 2], 1_234);
    await createV1DatabaseWithLegacyRecord(legacy);

    // Opening the module connection upgrades the existing v1 database to v2.
    const db = await getDB();
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains('chunks')).toBe(true);
    expect(db.objectStoreNames.contains('stations')).toBe(true);

    const blob = await getCachedStationAudio('gtasa', 'k-rose');
    expect(blob).not.toBeNull();
    expect(blob!.size).toBe(2);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([4, 2]));

    // The new chunk store starts empty and does not shadow the legacy record.
    expect(await listChunkKeys()).toEqual([]);
    const summaries = await getAllCachedStations();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].stationId).toBe('gtasa:k-rose');
    expect(summaries[0].sizeBytes).toBe(2);
  });

  it('clearAllCachedStations clears chunks too', async () => {
    await saveStationAudio(makeLegacyRecord('gtasa', 'k-rose', [1]));
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1, 2]));
    await saveChunkBlob('gta5', 'non-stop-pop-fm', 0, makeBlob([3]));

    await clearAllCachedStations();

    expect(await listChunkKeys()).toEqual([]);
    expect(await listCachedStationKeys()).toEqual([]);
    expect(await getAllCachedStations()).toEqual([]);
    expect(await getCachedStationAudio('gtasa', 'k-rose')).toBeNull();
  });

  it('clearAllChunks clears chunks only and keeps legacy records', async () => {
    await saveStationAudio(makeLegacyRecord('gta4', 'the-beat', [1]));
    await saveChunkBlob('gtasa', 'k-rose', 0, makeBlob([1, 2]));

    await clearAllChunks();

    expect(await listChunkKeys()).toEqual([]);
    expect((await getCachedStationAudio('gta4', 'the-beat'))!.size).toBe(1);
    expect(await listCachedStationKeys()).toEqual(['gta4:the-beat']);
  });
});
