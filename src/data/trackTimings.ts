import type { GameId, TrackCue } from '../types/radio';
import raw from './track-timings.json';

/**
 * Measured track timings, generated offline from real track durations (see
 * `docs`/skill note) and laid on the shipped audio loop. This is the only source
 * of cue boundaries that matches the files we actually play: the authored
 * `station.timestamps` were written against the catalog duration, which is wrong
 * for 26 of 55 stations.
 *
 * Only stations whose playlist could be verified against the audio (coverage and
 * length ratio) are present. A station that is missing here must not get invented
 * titles — `resolveCueTimeline` falls back to station-level info instead.
 */
export interface StationTimings {
  /** Loop length the timings are expressed in (seconds, real file). */
  duration: number;
  cues: TrackCue[];
}

export const TRACK_TIMINGS: Record<string, StationTimings> = raw as Record<string, StationTimings>;

export function timingsKey(gameId: GameId, stationId: string): string {
  return `${gameId}:${stationId}`;
}

export function getStationTimings(
  gameId: GameId,
  stationId: string
): StationTimings | null {
  const entry = TRACK_TIMINGS[timingsKey(gameId, stationId)];
  if (!entry || !Number.isFinite(entry.duration) || entry.duration <= 0) return null;
  if (!Array.isArray(entry.cues) || entry.cues.length === 0) return null;
  return entry;
}

/**
 * Timings usable for this loop length: they must describe the same audio. A 1%
 * tolerance absorbs ffprobe rounding; anything wider means the file changed and
 * the timings are stale, so they are ignored rather than trusted.
 */
export function getTimingsForLoop(
  gameId: GameId,
  stationId: string,
  loopDuration: number
): StationTimings | null {
  const entry = getStationTimings(gameId, stationId);
  if (!entry) return null;
  if (!(loopDuration > 0)) return null;
  const drift = Math.abs(entry.duration - loopDuration) / loopDuration;
  return drift <= 0.01 ? entry : null;
}
