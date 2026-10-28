import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupMediaSession, updateMediaSession, updateMediaSessionMetadata } from './mediaSession';
import { RadioEngine } from './radioEngine';
import { Station, TrackCue } from '../types/radio';

class MockMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: Array<{ src: string; sizes: string; type: string }>;

  constructor(init: {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: Array<{ src: string; sizes: string; type: string }>;
  }) {
    this.title = init.title || '';
    this.artist = init.artist || '';
    this.album = init.album || '';
    this.artwork = init.artwork || [];
  }
}

class MockMediaSession {
  metadata: any = null;
  playbackState: string = 'none';
  actionHandlers: Map<string, Function | null> = new Map();

  setActionHandler(action: string, handler: Function | null) {
    this.actionHandlers.set(action, handler);
  }
}

const mockStation: Station = {
  id: 'radiox',
  gameId: 'gtasa',
  name: 'Radio X',
  genre: 'Alternative Rock',
  host: 'Sage',
  frequency: '104.5',
  logoUrl: '/logos/radiox.png',
  audioUrl: '/audio/gtasa/radiox.mp3',
  duration: 3600,
  initialOffset: 0,
  timestamps: [
    {
      start: 0,
      end: 200,
      song: 'Rusty Cage',
      artist: 'Soundgarden',
      type: 'music',
    },
    {
      start: 200,
      end: 300,
      song: 'Radio X DJ Banter',
      artist: 'Sage',
      type: 'talk',
    },
    {
      start: 300,
      end: 350,
      song: 'Eris Footwear Commercial',
      artist: 'Commercial',
      type: 'ad',
    },
  ],
};

describe('W3C Media Session API Controller & CarPlay Integration', () => {
  let mockMediaSession: MockMediaSession;
  let originalMediaSession: any;
  let originalMediaMetadata: any;

  beforeEach(() => {
    originalMediaSession = (navigator as any).mediaSession;
    originalMediaMetadata = (window as any).MediaMetadata;

    mockMediaSession = new MockMediaSession();
    Object.defineProperty(navigator, 'mediaSession', {
      value: mockMediaSession,
      configurable: true,
      writable: true,
    });

    (window as any).MediaMetadata = MockMediaMetadata;
    (globalThis as any).MediaMetadata = MockMediaMetadata;
  });

  afterEach(() => {
    if (originalMediaSession !== undefined) {
      Object.defineProperty(navigator, 'mediaSession', {
        value: originalMediaSession,
        configurable: true,
        writable: true,
      });
    } else {
      delete (navigator as any).mediaSession;
    }

    if (originalMediaMetadata !== undefined) {
      (window as any).MediaMetadata = originalMediaMetadata;
      (globalThis as any).MediaMetadata = originalMediaMetadata;
    } else {
      delete (window as any).MediaMetadata;
      delete (globalThis as any).MediaMetadata;
    }
  });

  describe('updateMediaSessionMetadata', () => {
    it('formats metadata with song title, artist, and station as album when playing music', () => {
      const musicCue: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
      };

      updateMediaSessionMetadata(mockStation, musicCue);

      expect(mockMediaSession.metadata).not.toBeNull();
      expect(mockMediaSession.metadata.title).toBe('Rusty Cage');
      expect(mockMediaSession.metadata.artist).toBe('Soundgarden');
      expect(mockMediaSession.metadata.album).toBe('Radio X');
    });

    it('provides multi-resolution artwork including 96x96, 256x256, and 512x512 for CarPlay head units', () => {
      const musicCue: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
      };

      updateMediaSessionMetadata(mockStation, musicCue);

      expect(mockMediaSession.metadata.artwork).toEqual([
        { src: '/logos/radiox.png', sizes: '96x96', type: 'image/png' },
        { src: '/logos/radiox.png', sizes: '256x256', type: 'image/png' },
        { src: '/logos/radiox.png', sizes: '512x512', type: 'image/png' },
      ]);
    });

    it('infers proper MIME types for webp, jpg, and svg station artwork', () => {
      const webpStation = { ...mockStation, logoUrl: '/logos/station.webp' };
      updateMediaSessionMetadata(webpStation);
      expect(mockMediaSession.metadata.artwork[0].type).toBe('image/webp');

      const jpgStation = { ...mockStation, logoUrl: '/logos/station.jpg' };
      updateMediaSessionMetadata(jpgStation);
      expect(mockMediaSession.metadata.artwork[0].type).toBe('image/jpeg');

      const svgStation = { ...mockStation, logoUrl: '/logos/station.svg' };
      updateMediaSessionMetadata(svgStation);
      expect(mockMediaSession.metadata.artwork[0].type).toBe('image/svg+xml');
    });

    it('formats metadata with station name and host when playing DJ banter/talk', () => {
      const talkCue: TrackCue = {
        start: 200,
        end: 300,
        song: 'Radio X DJ Banter',
        artist: 'Sage',
        type: 'talk',
      };

      updateMediaSessionMetadata(mockStation, talkCue);

      expect(mockMediaSession.metadata.title).toBe('Radio X');
      expect(mockMediaSession.metadata.artist).toBe('Sage');
      expect(mockMediaSession.metadata.album).toBe('Alternative Rock');
    });

    it('falls back to "Live Radio" and "Grand Theft Auto" when host or genre is not defined for talk/ad', () => {
      const fallbackStation: Station = {
        ...mockStation,
        host: undefined,
        genre: '',
      };
      const adCue: TrackCue = {
        start: 300,
        end: 350,
        song: 'Eris Footwear Commercial',
        artist: 'Commercial',
        type: 'ad',
      };

      updateMediaSessionMetadata(fallbackStation, adCue);

      expect(mockMediaSession.metadata.title).toBe('Radio X');
      expect(mockMediaSession.metadata.artist).toBe('Live Radio');
      expect(mockMediaSession.metadata.album).toBe('Grand Theft Auto');
    });

    it('handles null or undefined track cue gracefully by showing station name and host', () => {
      updateMediaSessionMetadata(mockStation, null);

      expect(mockMediaSession.metadata.title).toBe('Radio X');
      expect(mockMediaSession.metadata.artist).toBe('Sage');
      expect(mockMediaSession.metadata.album).toBe('Alternative Rock');
    });

    it('safely handles missing navigator.mediaSession or MediaMetadata without throwing', () => {
      delete (navigator as any).mediaSession;
      delete (window as any).MediaMetadata;

      expect(() => {
        updateMediaSessionMetadata(mockStation, mockStation.timestamps[0]);
      }).not.toThrow();
    });

    it('prioritizes dynamic coverArtUrl for 256x256 and 512x512 artwork while keeping station logo for 96x96', () => {
      const musicCue: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
      };
      const coverArtUrl = 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg';

      updateMediaSession(mockStation, musicCue, true, coverArtUrl);

      expect(mockMediaSession.metadata.artwork).toEqual([
        { src: '/logos/radiox.png', sizes: '96x96', type: 'image/png' },
        { src: coverArtUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: coverArtUrl, sizes: '512x512', type: 'image/jpeg' },
      ]);
      expect(mockMediaSession.playbackState).toBe('playing');
    });

    it('updates playbackState to paused when isPlaying is false', () => {
      updateMediaSession(mockStation, null, false);
      expect(mockMediaSession.playbackState).toBe('paused');
    });

    it('reads coverArtUrl embedded directly on the TrackCue object', () => {
      const musicCueWithCover: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
        coverArtUrl: 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.webp',
      };

      updateMediaSession(mockStation, musicCueWithCover);

      expect(mockMediaSession.metadata.artwork).toEqual([
        { src: '/logos/radiox.png', sizes: '96x96', type: 'image/png' },
        { src: 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.webp', sizes: '256x256', type: 'image/webp' },
        { src: 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.webp', sizes: '512x512', type: 'image/webp' },
      ]);
    });

    it('supports 3-argument signature updateMediaSession(station, cue, coverArtUrl)', () => {
      const musicCue: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
      };
      const coverArtUrl = 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg';

      updateMediaSession(mockStation, musicCue, coverArtUrl);

      expect(mockMediaSession.metadata.artwork[1].src).toBe(coverArtUrl);
      expect(mockMediaSession.metadata.artwork[2].src).toBe(coverArtUrl);
    });

    it('properly passes coverArtUrl through updateMediaSessionMetadata without dropping it', () => {
      const musicCue: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
      };
      const coverArtUrl = 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg';

      updateMediaSessionMetadata(mockStation, musicCue, coverArtUrl);

      expect(mockMediaSession.metadata.artwork[1].src).toBe(coverArtUrl);
      expect(mockMediaSession.metadata.artwork[2].src).toBe(coverArtUrl);
    });

    it('updates metadata when coverArtUrl resolves asynchronously after initial tune', () => {
      const musicCue: TrackCue = {
        start: 0,
        end: 200,
        song: 'Rusty Cage',
        artist: 'Soundgarden',
        type: 'music',
      };

      // 1. Initial tune without dynamic cover art yet
      updateMediaSession(mockStation, musicCue, true, null);
      expect(mockMediaSession.metadata.artwork[1].src).toBe('/logos/radiox.png');

      // 2. CoverArtService resolves art 200ms later
      const resolvedArt = 'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg';
      updateMediaSession(mockStation, musicCue, true, resolvedArt);
      expect(mockMediaSession.metadata.artwork[1].src).toBe(resolvedArt);
      expect(mockMediaSession.metadata.artwork[2].src).toBe(resolvedArt);
    });
  });

  describe('setupMediaSession', () => {
    let mockEngine: RadioEngine;

    beforeEach(() => {
      mockEngine = {
        resume: vi.fn(),
        pause: vi.fn(),
        nextStationSync: vi.fn(),
        previousStationSync: vi.fn(),
      } as unknown as RadioEngine;
    });

    it('registers handlers for play, pause, nexttrack, and previoustrack', () => {
      const cleanup = setupMediaSession(mockEngine);

      expect(mockMediaSession.actionHandlers.has('play')).toBe(true);
      expect(mockMediaSession.actionHandlers.has('pause')).toBe(true);
      expect(mockMediaSession.actionHandlers.has('nexttrack')).toBe(true);
      expect(mockMediaSession.actionHandlers.has('previoustrack')).toBe(true);

      cleanup();
    });

    it('routes play and pause actions to engine.resume() and engine.pause()', () => {
      setupMediaSession(mockEngine);

      const playHandler = mockMediaSession.actionHandlers.get('play');
      const pauseHandler = mockMediaSession.actionHandlers.get('pause');

      expect(typeof playHandler).toBe('function');
      expect(typeof pauseHandler).toBe('function');

      playHandler!();
      expect(mockEngine.resume).toHaveBeenCalledTimes(1);

      pauseHandler!();
      expect(mockEngine.pause).toHaveBeenCalledTimes(1);
    });

    it('routes CarPlay nexttrack and previoustrack synchronously to nextStationSync and previousStationSync', () => {
      setupMediaSession(mockEngine);

      const nextHandler = mockMediaSession.actionHandlers.get('nexttrack');
      const prevHandler = mockMediaSession.actionHandlers.get('previoustrack');

      expect(typeof nextHandler).toBe('function');
      expect(typeof prevHandler).toBe('function');

      nextHandler!();
      expect(mockEngine.nextStationSync).toHaveBeenCalledTimes(1);

      prevHandler!();
      expect(mockEngine.previousStationSync).toHaveBeenCalledTimes(1);
    });

    it('unregisters all mediaSession handlers when calling the returned cleanup function', () => {
      const cleanup = setupMediaSession(mockEngine);

      expect(mockMediaSession.actionHandlers.get('play')).not.toBeNull();
      expect(mockMediaSession.actionHandlers.get('pause')).not.toBeNull();
      expect(mockMediaSession.actionHandlers.get('nexttrack')).not.toBeNull();
      expect(mockMediaSession.actionHandlers.get('previoustrack')).not.toBeNull();

      cleanup();

      expect(mockMediaSession.actionHandlers.get('play')).toBeNull();
      expect(mockMediaSession.actionHandlers.get('pause')).toBeNull();
      expect(mockMediaSession.actionHandlers.get('nexttrack')).toBeNull();
      expect(mockMediaSession.actionHandlers.get('previoustrack')).toBeNull();
    });

    it('safely handles missing navigator.mediaSession returning a no-op cleanup function', () => {
      delete (navigator as any).mediaSession;

      let cleanup: () => void;
      expect(() => {
        cleanup = setupMediaSession(mockEngine);
      }).not.toThrow();

      expect(typeof cleanup!).toBe('function');
      expect(() => cleanup!()).not.toThrow();
    });

    it('catches and ignores unsupported action handler exceptions', () => {
      mockMediaSession.setActionHandler = vi.fn().mockImplementation(() => {
        throw new TypeError('Unsupported action');
      });

      expect(() => {
        const cleanup = setupMediaSession(mockEngine);
        cleanup();
      }).not.toThrow();
    });
  });
});
