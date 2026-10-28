import { Station, TrackCue } from '../types/radio';
import { RadioEngine } from './radioEngine';

/**
 * Attaches W3C Media Session API action handlers to the RadioEngine.
 * Handles Apple CarPlay / vehicle steering wheel skip buttons via synchronous station switching.
 * Returns a cleanup unregister function.
 */
export function setupMediaSession(engine: RadioEngine): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {};
  }

  const setHandler = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null
  ) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Ignore unsupported media session actions on certain platforms
    }
  };

  setHandler('play', () => {
    engine.resume();
  });

  setHandler('pause', () => {
    engine.pause();
  });

  // Synchronous station switching for Apple CarPlay & Steering wheel buttons
  setHandler('nexttrack', () => {
    engine.nextStationSync();
  });

  setHandler('previoustrack', () => {
    engine.previousStationSync();
  });

  return () => {
    setHandler('play', null);
    setHandler('pause', null);
    setHandler('nexttrack', null);
    setHandler('previoustrack', null);
  };
}

/**
 * Updates W3C Media Session metadata with high-resolution artwork and track information.
 * - If music cue: Displays song title, artist name, and station name as album.
 * - If talk/ad/null cue: Displays station name, host name (or 'Live Radio'), and genre (or 'Grand Theft Auto').
 * - Provides 96x96, 256x256, and 512x512 artwork for crisp Apple CarPlay head unit display.
 */
export function updateMediaSessionMetadata(
  station: Station,
  cue?: TrackCue | null
): void {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    typeof window === 'undefined' ||
    !window.MediaMetadata
  ) {
    return;
  }

  const isSong = cue?.type === 'music';
  const title = isSong ? cue.song : station.name;
  const artist = isSong ? cue.artist : (station.host || 'Live Radio');
  const album = isSong ? station.name : (station.genre || 'Grand Theft Auto');

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork: [
        { src: station.logoUrl, sizes: '96x96', type: 'image/png' },
        { src: station.logoUrl, sizes: '256x256', type: 'image/png' },
        { src: station.logoUrl, sizes: '512x512', type: 'image/png' },
      ],
    });
  } catch {
    // Ignore metadata assignment failures on non-standard platforms
  }
}
