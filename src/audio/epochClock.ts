import { Station } from '../types/radio';

// Universal fixed epoch (GTA V launch date: Sept 17, 2013 00:00:00 UTC) ensures all listeners are synced
export const MASTER_BROADCAST_EPOCH = 1379376000000;

/**
 * Calculates the current playback position in seconds for a station,
 * locked deterministically to the universal broadcast epoch.
 *
 * @param station Station configuration including duration and initialOffset
 * @param masterEpochMs Optional current timestamp in milliseconds (defaults to Date.now())
 * @returns Current second within the station loop [0, station.duration)
 */
export function getStationCurrentSecond(
  station: Station,
  masterEpochMs: number = Date.now()
): number {
  if (!station.duration || station.duration <= 0) return 0;

  const elapsedSeconds = Math.max(0, Math.floor((masterEpochMs - MASTER_BROADCAST_EPOCH) / 1000));
  const offset = station.initialOffset || 0;

  return ((elapsedSeconds + offset) % station.duration + station.duration) % station.duration;
}
