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

function getArtworkMimeType(url?: string): string {
  if (!url) return 'image/png';
  const cleanUrl = url.split(/[?#]/)[0].toLowerCase();
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (cleanUrl.endsWith('.webp')) {
    return 'image/webp';
  }
  if (cleanUrl.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  return 'image/png';
}

/**
 * Updates W3C Media Session metadata with high-resolution artwork and track information.
 * - If music cue: Displays song title, artist name, and station name as album.
 * - If talk/ad/null cue: Displays station name, host name (or 'Live Radio'), and genre (or 'Grand Theft Auto').
 * - Provides 96x96, 256x256, and 512x512 artwork for crisp Apple CarPlay head unit display.
 * - Prioritizes dynamic coverArtUrl for 256x256 and 512x512, keeping station logo for 96x96 and fallback.
 */
export function updateMediaSession(
  station: Station,
  cue?: TrackCue | null,
  isPlaying?: boolean,
  coverArtUrl?: string | null
): void;
export function updateMediaSession(
  station: Station,
  cue?: TrackCue | null,
  coverArtUrl?: string | null
): void;
export function updateMediaSession(
  station: Station,
  cue?: TrackCue | null,
  isPlayingOrCover?: boolean | string | null,
  maybeCoverArtUrl?: string | null
): void {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    typeof window === 'undefined'
  ) {
    return;
  }

  let isPlaying: boolean | undefined;
  let coverArtUrl: string | null | undefined;

  if (typeof isPlayingOrCover === 'boolean') {
    isPlaying = isPlayingOrCover;
    coverArtUrl = maybeCoverArtUrl;
  } else if (typeof isPlayingOrCover === 'string' || isPlayingOrCover === null) {
    coverArtUrl = isPlayingOrCover;
    if (typeof maybeCoverArtUrl === 'string') {
      coverArtUrl = maybeCoverArtUrl;
    }
  }

  // Also check if cue has coverArtUrl attached
  if (!coverArtUrl && cue?.coverArtUrl) {
    coverArtUrl = cue.coverArtUrl;
  }

  // Update playbackState if provided
  if (typeof isPlaying === 'boolean') {
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // Ignore unsupported playbackState assignments
    }
  }

  if (!window.MediaMetadata) {
    return;
  }

  const isSong = cue?.type === 'music';
  const title = isSong ? cue.song : station.name;
  const artist = isSong ? cue.artist : (station.host || 'Live Radio');
  const album = isSong ? station.name : (station.genre || 'Grand Theft Auto');

  const stationLogoMime = getArtworkMimeType(station.logoUrl);
  const coverArtMime = coverArtUrl ? getArtworkMimeType(coverArtUrl) : stationLogoMime;

  const artwork: Array<{ src: string; sizes: string; type: string }> = coverArtUrl
    ? [
        { src: station.logoUrl, sizes: '96x96', type: stationLogoMime },
        { src: coverArtUrl, sizes: '256x256', type: coverArtMime },
        { src: coverArtUrl, sizes: '512x512', type: coverArtMime },
      ]
    : [
        { src: station.logoUrl, sizes: '96x96', type: stationLogoMime },
        { src: station.logoUrl, sizes: '256x256', type: stationLogoMime },
        { src: station.logoUrl, sizes: '512x512', type: stationLogoMime },
      ];

  const currentMeta = navigator.mediaSession.metadata;
  const currentLargeArtwork = currentMeta?.artwork?.find(
    (a: any) => a.sizes === '512x512'
  )?.src || currentMeta?.artwork?.[0]?.src;
  const expectedLargeArtwork = coverArtUrl || station.logoUrl;

  // Avoid flooding CarPlay head unit and lock screen on high-frequency interval updates
  if (
    currentMeta &&
    currentMeta.title === title &&
    currentMeta.artist === artist &&
    currentMeta.album === album &&
    currentLargeArtwork === expectedLargeArtwork
  ) {
    return;
  }

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork,
    });
  } catch {
    // Ignore metadata assignment failures on non-standard platforms
  }
}

/**
 * Backward compatibility alias for updateMediaSession.
 */
export function updateMediaSessionMetadata(
  station: Station,
  cue?: TrackCue | null,
  coverArtUrl?: string | null
): void {
  updateMediaSession(station, cue, undefined, coverArtUrl);
}
