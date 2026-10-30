import type { GameId, Station } from '../types/radio';
import raw from './chunk-manifest.json';

/**
 * One station as measured by `ffprobe` on the producer side.
 *
 * `count` and `duration` are the source of truth for chunk geometry: the
 * catalog `station.duration` is only a fallback, because it does not match the
 * real file — `gtasa/playback-fm` is 2810 s in the catalog but 3168.054 s on
 * disk (27 chunks, not 24), so catalog arithmetic loses the tail of the loop.
 */
export interface ChunkMeta {
  chunkSeconds: number;
  count: number;
  duration: number;
  bytes: number[];
}

/** `"<gameId>:<stationId>"` -> chunk geometry. Shipped as data, no runtime fetch. */
export const CHUNK_MANIFEST: Record<string, ChunkMeta> = raw as Record<string, ChunkMeta>;

export function chunkManifestKey(gameId: GameId, stationId: string): string {
  return `${gameId}:${stationId}`;
}

/** Manifest entry for a station, or `null` when the station has no audio (or no entry). */
export function getChunkMeta(gameId: GameId, stationId: string): ChunkMeta | null {
  return CHUNK_MANIFEST[chunkManifestKey(gameId, stationId)] ?? null;
}

/**
 * Real loop length of the audio we actually play, in seconds.
 *
 * The catalog `station.duration` is only an estimate and is wrong for many
 * stations — `gta5:radio-los-santos` claims 21384 s while the file is 6691 s,
 * `gta5:non-stop-pop-fm` claims 13878 s against 10006 s — so any broadcast
 * arithmetic done with it lands outside the file or at the wrong offset. The
 * manifest (ffprobe on the shipped audio) wins whenever it exists.
 */
export function getStationLoopDuration(station: Station): number {
  const meta = getChunkMeta(station.gameId, station.id);
  if (meta && Number.isFinite(meta.duration) && meta.duration > 0) {
    return meta.duration;
  }
  return Number.isFinite(station.duration) && station.duration > 0 ? station.duration : 0;
}

function isPlayable(station: Station): boolean {
  return Boolean(station.audioUrl) && station.duration > 0;
}

/**
 * Consistency check for the shipped manifest — tests and dev tooling only, never
 * on the playback hot path. Returns a list of human-readable problems; an empty
 * array means the manifest is valid.
 */
export function validateManifest(
  manifest: Record<string, ChunkMeta>,
  stations: Station[],
): string[] {
  const errors: string[] = [];
  const stationsByKey = new Map<string, Station>(
    stations.map((station) => [chunkManifestKey(station.gameId, station.id), station]),
  );
  const seen = new Set<string>();

  for (const [key, meta] of Object.entries(manifest)) {
    const separator = key.indexOf(':');
    if (separator <= 0 || separator === key.length - 1) {
      errors.push(`malformed key "${key}": expected "<gameId>:<stationId>"`);
      continue;
    }
    seen.add(key);

    const station = stationsByKey.get(key);
    if (!station) {
      errors.push(`unknown station key "${key}": no station with this game/id in the catalog`);
      continue;
    }
    if (!isPlayable(station)) {
      errors.push(
        `"${key}": station is not playable (no audioUrl or duration 0), it must not have chunks`,
      );
    }

    const { chunkSeconds, count, duration, bytes } = meta;

    if (!Number.isFinite(chunkSeconds) || chunkSeconds <= 0) {
      errors.push(`"${key}": chunkSeconds must be a positive number, got ${String(chunkSeconds)}`);
      continue;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`"${key}": duration must be > 0, got ${String(duration)}`);
      continue;
    }
    if (!Number.isInteger(count) || count < 1) {
      errors.push(`"${key}": count must be a positive integer, got ${String(count)}`);
      continue;
    }

    const expectedCount = Math.ceil(duration / chunkSeconds);
    if (count !== expectedCount) {
      errors.push(
        `"${key}": count ${count} does not match ceil(duration ${duration} / ${chunkSeconds}) = ${expectedCount}`,
      );
    }
    if (count * chunkSeconds < duration) {
      errors.push(
        `"${key}": ${count} chunks of ${chunkSeconds}s cover only ${count * chunkSeconds}s of ${duration}s`,
      );
    }
    if ((count - 1) * chunkSeconds >= duration) {
      errors.push(
        `"${key}": ${count - 1} chunks of ${chunkSeconds}s already cover ${duration}s, count ${count} is one too many`,
      );
    }
    if (!Array.isArray(bytes)) {
      errors.push(`"${key}": bytes must be an array of chunk sizes`);
    } else if (bytes.length !== 0 && bytes.length !== count) {
      errors.push(`"${key}": bytes has ${bytes.length} entries, expected 0 or ${count}`);
    } else if (bytes.some((size) => !Number.isFinite(size) || size <= 0)) {
      errors.push(`"${key}": bytes must contain positive numbers only`);
    }
  }

  for (const [key, station] of stationsByKey) {
    if (isPlayable(station) && !seen.has(key)) {
      errors.push(`missing chunk entry for playable station "${key}"`);
    }
  }

  return errors;
}
