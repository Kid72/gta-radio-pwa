import { Station } from '../types/radio';

// Universal fixed epoch (GTA V launch date: Sept 17, 2013 00:00:00 UTC) ensures all listeners are synced
export const MASTER_BROADCAST_EPOCH = 1379376000000;

/**
 * Calculates the station second for an explicit loop duration.
 *
 * The station's real loop length comes from the chunk manifest (ffprobe), which
 * differs from the catalog `station.duration` — `gtasa/playback-fm` is 2810 s in
 * the catalog but 3168.054 s on disk — so the epoch arithmetic has to be driven
 * by the measured value, otherwise the tail of the loop is unreachable.
 *
 * @param station Station configuration (only `initialOffset` is used here)
 * @param durationSeconds Real loop length in seconds (manifest `duration`)
 * @param masterEpochMs Optional current timestamp in milliseconds (defaults to Date.now())
 * @returns Current second within the loop [0, durationSeconds)
 */
export function getStationSecondForDuration(
  station: Station,
  durationSeconds: number,
  masterEpochMs: number = Date.now()
): number {
  const duration =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  if (duration === 0) return 0;

  const elapsedSeconds = Math.max(0, Math.floor((masterEpochMs - MASTER_BROADCAST_EPOCH) / 1000));
  const offset = station.initialOffset || 0;

  return ((elapsedSeconds + offset) % duration + duration) % duration;
}

/**
 * Calculates the current playback position in seconds for a station,
 * locked deterministically to the universal broadcast epoch.
 *
 * Legacy entry point: identical to `getStationSecondForDuration` with the
 * catalog `station.duration`. Kept unchanged for existing callers.
 *
 * @param station Station configuration including duration and initialOffset
 * @param masterEpochMs Optional current timestamp in milliseconds (defaults to Date.now())
 * @returns Current second within the station loop [0, station.duration)
 */
export function getStationCurrentSecond(
  station: Station,
  masterEpochMs: number = Date.now()
): number {
  return getStationSecondForDuration(station, station.duration, masterEpochMs);
}
