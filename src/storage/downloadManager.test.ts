import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveStationAudio,
  getCachedStationAudio,
  deleteCachedStationAudio,
  listCachedStationKeys,
  listCachedStationIds,
  clearAllCachedStations,
  getStorageUsageEstimate,
  closeDB,
} from './db';
import { acquireWakeLock, requestPersistentStorage } from './wakeLock';
import {
  downloadStationWithProgress,
  isStationDownloaded,
  removeDownloadedStation,
  DownloadProgress,
} from './downloadManager';
import { CachedStationRecord, Station } from '../types/radio';

describe('IndexedDB Offline Storage (src/storage/db.ts)', () => {
  beforeEach(async () => {
    await clearAllCachedStations();
  });

  afterEach(() => {
    closeDB();
  });

  it('saves and retrieves a cached station audio Blob', async () => {
    const audioContent = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([audioContent], { type: 'audio/mpeg' });

    const record: CachedStationRecord = {
      stationId: 'krose',
      gameId: 'gtasa',
      blob,
      sizeBytes: blob.size,
      downloadedAt: Date.now(),
    };

    await saveStationAudio(record);

    const retrievedBlob = await getCachedStationAudio('gtasa', 'krose');
    expect(retrievedBlob).not.toBeNull();
    expect(retrievedBlob?.size).toBe(5);
    expect(retrievedBlob?.type).toBe('audio/mpeg');

    const buffer = await retrievedBlob!.arrayBuffer();
    expect(new Uint8Array(buffer)).toEqual(audioContent);
  });

  it('returns null when station is not cached', async () => {
    const nonExistent = await getCachedStationAudio('gtasa', 'non-existent');
    expect(nonExistent).toBeNull();
  });

  it('isolates stations with same stationId across different games', async () => {
    const gtasaBlob = new Blob([new Uint8Array([10, 20])], { type: 'audio/mpeg' });
    const gta5Blob = new Blob([new Uint8Array([30, 40, 50])], { type: 'audio/mpeg' });

    await saveStationAudio({
      stationId: 'radio-los-santos',
      gameId: 'gtasa',
      blob: gtasaBlob,
      sizeBytes: gtasaBlob.size,
      downloadedAt: 1000,
    });

    await saveStationAudio({
      stationId: 'radio-los-santos',
      gameId: 'gta5',
      blob: gta5Blob,
      sizeBytes: gta5Blob.size,
      downloadedAt: 2000,
    });

    const saResult = await getCachedStationAudio('gtasa', 'radio-los-santos');
    const gta5Result = await getCachedStationAudio('gta5', 'radio-los-santos');

    expect(saResult?.size).toBe(2);
    expect(gta5Result?.size).toBe(3);
  });

  it('deletes cached station audio', async () => {
    const blob = new Blob([new Uint8Array([7, 8, 9])]);
    await saveStationAudio({
      stationId: 'vladivostok',
      gameId: 'gta4',
      blob,
      sizeBytes: blob.size,
      downloadedAt: Date.now(),
    });

    let cached = await getCachedStationAudio('gta4', 'vladivostok');
    expect(cached).not.toBeNull();

    await deleteCachedStationAudio('gta4', 'vladivostok');

    cached = await getCachedStationAudio('gta4', 'vladivostok');
    expect(cached).toBeNull();
  });

  it('lists cached station keys and IDs', async () => {
    await saveStationAudio({
      stationId: 'krose',
      gameId: 'gtasa',
      blob: new Blob([new Uint8Array([1])]),
      sizeBytes: 1,
      downloadedAt: Date.now(),
    });

    await saveStationAudio({
      stationId: 'the-beat',
      gameId: 'gta4',
      blob: new Blob([new Uint8Array([2])]),
      sizeBytes: 1,
      downloadedAt: Date.now(),
    });

    const keys = await listCachedStationKeys();
    const ids = await listCachedStationIds();

    expect(keys).toContain('gtasa:krose');
    expect(keys).toContain('gta4:the-beat');
    expect(ids).toEqual(keys);
  });

  it('clears all cached stations', async () => {
    await saveStationAudio({
      stationId: 's1',
      gameId: 'gtasa',
      blob: new Blob([new Uint8Array([1])]),
      sizeBytes: 1,
      downloadedAt: Date.now(),
    });

    await clearAllCachedStations();
    const keys = await listCachedStationKeys();
    expect(keys).toHaveLength(0);
  });

  it('estimates storage usage', async () => {
    const mockEstimate = { usage: 1024 * 1024 * 50, quota: 1024 * 1024 * 500 };
    vi.spyOn(navigator.storage, 'estimate').mockResolvedValueOnce(mockEstimate);

    const estimate = await getStorageUsageEstimate();
    expect(estimate.usedBytes).toBe(mockEstimate.usage);
    expect(estimate.quotaBytes).toBe(mockEstimate.quota);
  });
});

describe('Screen Wake Lock & Persistent Storage (src/storage/wakeLock.ts)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acquires wake lock and returns a release function', async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined);
    const sentinelMock = {
      release: releaseMock,
      released: false,
    };

    const requestMock = vi.fn().mockResolvedValue(sentinelMock);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const release = await acquireWakeLock();
    expect(requestMock).toHaveBeenCalledWith('screen');

    release();
    expect(releaseMock).toHaveBeenCalled();
  });

  it('handles wake lock request failure gracefully without throwing', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      configurable: true,
      writable: true,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const release = await acquireWakeLock();

    expect(typeof release).toBe('function');
    expect(() => release()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('handles missing wakeLock API gracefully', async () => {
    const originalWakeLock = (navigator as any).wakeLock;
    delete (navigator as any).wakeLock;

    const release = await acquireWakeLock();
    expect(typeof release).toBe('function');
    expect(() => release()).not.toThrow();

    if (originalWakeLock) {
      (navigator as any).wakeLock = originalWakeLock;
    }
  });

  it('requests persistent storage when available', async () => {
    vi.spyOn(navigator.storage, 'persisted').mockResolvedValueOnce(false);
    const persistSpy = vi.spyOn(navigator.storage, 'persist').mockResolvedValueOnce(true);

    const result = await requestPersistentStorage();
    expect(persistSpy).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns true if storage is already persisted', async () => {
    vi.spyOn(navigator.storage, 'persisted').mockResolvedValueOnce(true);
    const persistSpy = vi.spyOn(navigator.storage, 'persist');

    const result = await requestPersistentStorage();
    expect(persistSpy).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

describe('Download Manager (src/storage/downloadManager.ts)', () => {
  const dummyStation: Station = {
    id: 'krose',
    gameId: 'gtasa',
    name: 'K-Rose',
    genre: 'Country',
    logoUrl: '/logos/krose.png',
    audioUrl: 'https://example.com/audio/krose.mp3',
    duration: 1000,
    initialOffset: 0,
    timestamps: [],
  };

  beforeEach(async () => {
    await clearAllCachedStations();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeDB();
  });

  it('downloads audio via stream, tracks progress, saves to DB, and releases wake lock', async () => {
    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);
    const totalBytes = 4;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: {
        'content-length': totalBytes.toString(),
        'content-type': 'audio/mpeg',
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const releaseMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn().mockResolvedValue({ release: releaseMock }),
      },
      configurable: true,
      writable: true,
    });

    const progressUpdates: DownloadProgress[] = [];
    const downloadedBlob = await downloadStationWithProgress(dummyStation, (p) => {
      progressUpdates.push(p);
    });

    expect(downloadedBlob).toBeInstanceOf(Blob);
    expect(downloadedBlob.size).toBe(4);
    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(progressUpdates[progressUpdates.length - 1].percent).toBe(100);

    // Verify wake lock was released
    expect(releaseMock).toHaveBeenCalled();

    // Verify it is saved in IndexedDB
    const cachedBlob = await getCachedStationAudio('gtasa', 'krose');
    expect(cachedBlob).not.toBeNull();
    expect(cachedBlob?.size).toBe(4);

    const isDownloaded = await isStationDownloaded('gtasa', 'krose');
    expect(isDownloaded).toBe(true);

    await removeDownloadedStation('gtasa', 'krose');
    expect(await isStationDownloaded('gtasa', 'krose')).toBe(false);
  });

  it('releases wake lock and throws if download HTTP response fails', async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn().mockResolvedValue({ release: releaseMock }),
      },
      configurable: true,
      writable: true,
    });

    const mockResponse = new Response(null, {
      status: 404,
      statusText: 'Not Found',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    await expect(downloadStationWithProgress(dummyStation)).rejects.toThrow(
      /Failed to download audio/
    );

    expect(releaseMock).toHaveBeenCalled();
  });

  it('supports fallback when ReadableStream is not used and downloads via blob', async () => {
    const mockBlob = new Blob([new Uint8Array([99, 98])], { type: 'audio/mpeg' });
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-length': '2',
        'content-type': 'audio/mpeg',
      }),
      body: null,
      blob: vi.fn().mockResolvedValue(mockBlob),
    } as unknown as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const progressUpdates: DownloadProgress[] = [];
    const blob = await downloadStationWithProgress(dummyStation, (p) => {
      progressUpdates.push(p);
    });

    expect(blob.size).toBe(2);
    expect(progressUpdates[0].percent).toBe(100);
  });
});
