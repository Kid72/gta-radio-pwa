import type { GameId, Station } from '../types/radio';
import type { ChunkMeta } from '../data/chunkManifest';

/** Nominal chunk length, seconds. The manifest carries the same value per station. */
export const CHUNK_SECONDS = 120;

/** Public CDN root; `chunkUrl` appends `/<gameId>/<stationId>/<NNN>.mp3`. */
export const CHUNK_BASE = 'https://gta-media.pulsr.top/chunks';

/** Max index representable in the three-digit chunk name (000..999). */
export const MAX_CHUNK_INDEX = 999;

/** We never seek to the very end of a chunk: the MP3 would hit EOF and fire `ended`. */
export const CHUNK_END_GUARD = 0.25;

export interface StationTimeline {
  duration: number;
  count: number;
  chunkSeconds: number;
  source: 'manifest' | 'catalog';
}

export interface ChunkPosition {
  index: number;
  offset: number;
  clamped: boolean;
}

export interface ChunkBounds {
  start: number;
  end: number;
}

/**
 * Chunk URL, or `null` when the index cannot be expressed as three digits.
 * Pure string building: no network, no DOM, no storage.
 */
export function chunkUrl(gameId: GameId, stationId: string, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > MAX_CHUNK_INDEX) return null;
  return `${CHUNK_BASE}/${gameId}/${stationId}/${String(index).padStart(3, '0')}.mp3`;
}

/**
 * Timeline for a station: the manifest wins (real `ffprobe` duration and chunk
 * count), the catalog is the fallback when the station has no manifest entry.
 */
export function resolveTimeline(station: Station, meta: ChunkMeta | null): StationTimeline {
  if (
    meta &&
    Number.isFinite(meta.chunkSeconds) &&
    meta.chunkSeconds > 0 &&
    Number.isFinite(meta.duration) &&
    meta.duration > 0 &&
    Number.isInteger(meta.count) &&
    meta.count > 0
  ) {
    return {
      duration: meta.duration,
      count: meta.count,
      chunkSeconds: meta.chunkSeconds,
      source: 'manifest',
    };
  }

  const duration = Number.isFinite(station.duration) && station.duration > 0 ? station.duration : 0;
  return {
    duration,
    // A zero-length station still yields one (empty) chunk so index math cannot go negative.
    count: Math.max(1, Math.ceil(duration / CHUNK_SECONDS)),
    chunkSeconds: CHUNK_SECONDS,
    source: 'catalog',
  };
}

function chunkSecondsOf(timeline: StationTimeline): number {
  return Number.isFinite(timeline.chunkSeconds) && timeline.chunkSeconds > 0
    ? timeline.chunkSeconds
    : CHUNK_SECONDS;
}

/** Start and end of chunk `index` inside the station loop. Out-of-range indexes are clamped. */
export function chunkBounds(timeline: StationTimeline, index: number): ChunkBounds {
  const count = Number.isFinite(timeline.count) ? Math.floor(timeline.count) : 0;
  if (count <= 0 || !(timeline.duration > 0)) return { start: 0, end: 0 };

  const chunkSeconds = chunkSecondsOf(timeline);
  const safeIndex = Math.min(
    Math.max(Number.isFinite(index) ? Math.floor(index) : 0, 0),
    count - 1,
  );
  const start = safeIndex * chunkSeconds;
  const end = Math.min(start + chunkSeconds, timeline.duration);
  return { start, end };
}

/**
 * The only place where a chunk index is born.
 *
 * `absoluteSeconds` is normalised by the timeline duration (manifest, not catalog),
 * the index is clamped to the last chunk instead of asking for a chunk that does
 * not exist, and the chunk-local offset never reaches the end of its chunk.
 */
export function locate(timeline: StationTimeline, absoluteSeconds: number): ChunkPosition {
  const { duration, count } = timeline;
  if (!(duration > 0) || !(count > 0)) return { index: 0, offset: 0, clamped: true };

  const chunkSeconds = chunkSecondsOf(timeline);
  const seconds = Number.isFinite(absoluteSeconds) ? absoluteSeconds : 0;
  const absolute = ((seconds % duration) + duration) % duration;

  const wantedIndex = Math.floor(absolute / chunkSeconds);
  const index = Math.min(wantedIndex, count - 1);

  const { start, end } = chunkBounds(timeline, index);
  const chunkLength = Math.max(0, end - start);
  const maxOffset = Math.max(0, chunkLength - CHUNK_END_GUARD);
  const wantedOffset = Math.max(0, absolute - start);
  const offset = Math.min(wantedOffset, maxOffset);

  return { index, offset, clamped: index !== wantedIndex || offset !== wantedOffset };
}
