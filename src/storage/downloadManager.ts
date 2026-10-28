import { Station, GameId, CachedStationRecord } from '../types/radio';
import {
  saveStationAudio,
  getCachedStationAudio,
  deleteCachedStationAudio,
  listCachedStationKeys,
  listCachedStationIds,
  getAllCachedStations,
  clearAllCachedStations,
  getStorageUsageEstimate,
} from './db';
import { acquireWakeLock, requestPersistentStorage } from './wakeLock';

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  percent: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface DownloadOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

export async function downloadStationWithProgress(
  station: Station,
  onProgressOrOptions?: ProgressCallback | DownloadOptions,
  signalParam?: AbortSignal
): Promise<Blob> {
  let onProgress: ProgressCallback | undefined;
  let signal: AbortSignal | undefined = signalParam;

  if (typeof onProgressOrOptions === 'function') {
    onProgress = onProgressOrOptions;
  } else if (onProgressOrOptions) {
    onProgress = onProgressOrOptions.onProgress;
    signal = onProgressOrOptions.signal || signal;
  }

  const releaseWakeLock = await acquireWakeLock();

  try {
    await requestPersistentStorage().catch(() => false);

    const response = await fetch(station.audioUrl, { signal });
    if (!response.ok) {
      throw new Error(
        `Failed to download audio for "${station.name}": ${response.status} ${response.statusText}`
      );
    }

    const contentLengthHeader = response.headers.get('content-length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    let blob: Blob;

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.byteLength || value.length;
          if (onProgress) {
            const percent =
              totalBytes > 0
                ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
                : 0;
            onProgress({
              receivedBytes,
              totalBytes: totalBytes > 0 ? totalBytes : receivedBytes,
              percent,
            });
          }
        }
      }

      const mimeType = response.headers.get('content-type') || 'audio/mpeg';
      blob = new Blob(chunks, { type: mimeType });
    } else {
      blob = await response.blob();
      if (onProgress) {
        onProgress({
          receivedBytes: blob.size,
          totalBytes: blob.size,
          percent: 100,
        });
      }
    }

    const record: CachedStationRecord = {
      stationId: station.id,
      gameId: station.gameId,
      blob,
      sizeBytes: blob.size,
      downloadedAt: Date.now(),
    };

    await saveStationAudio(record);

    return blob;
  } finally {
    releaseWakeLock();
  }
}

export async function isStationDownloaded(gameId: GameId, stationId: string): Promise<boolean> {
  const blob = await getCachedStationAudio(gameId, stationId);
  return blob !== null;
}

export async function removeDownloadedStation(gameId: GameId, stationId: string): Promise<void> {
  await deleteCachedStationAudio(gameId, stationId);
}

export {
  saveStationAudio,
  getCachedStationAudio,
  deleteCachedStationAudio,
  listCachedStationKeys,
  listCachedStationIds,
  getAllCachedStations,
  clearAllCachedStations,
  getStorageUsageEstimate,
  acquireWakeLock,
  requestPersistentStorage,
};
