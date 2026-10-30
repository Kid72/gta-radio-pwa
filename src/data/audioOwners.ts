import raw from './audio-owners.json';
import type { GameId } from '../types/radio';

/**
 * Stations whose shipped audio file is a byte-identical copy of another station's
 * file. The ID3 title of the file names the real owner, so the copy must not
 * claim a tracklist: until the audio is re-acquired it shows station-level info.
 *
 * Generated from the media set (chunk geometry + ffprobe tags), not hand-written.
 */
export interface AudioOwnerOverride {
  owner: string;
  ownerName: string;
  fileTitle: string;
}

export const AUDIO_OWNER_OVERRIDES: Record<string, AudioOwnerOverride> =
  raw as Record<string, AudioOwnerOverride>;

export function getAudioOwnerOverride(
  gameId: GameId,
  stationId: string
): AudioOwnerOverride | null {
  return AUDIO_OWNER_OVERRIDES[`${gameId}:${stationId}`] ?? null;
}

/** True when this station's audio belongs to another station (so cues are meaningless). */
export function hasForeignAudio(gameId: GameId, stationId: string): boolean {
  return getAudioOwnerOverride(gameId, stationId) !== null;
}
