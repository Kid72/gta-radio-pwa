export type GameId = 'gtasa' | 'gta4' | 'gta5';

export interface TrackCue {
  start: number;
  end: number;
  song: string;
  artist: string;
  type: 'music' | 'talk' | 'ad';
  coverArtUrl?: string | null;
}

export interface Station {
  id: string;
  gameId: GameId;
  name: string;
  genre: string;
  host?: string;
  frequency?: string;
  logoUrl: string;
  audioUrl: string;
  duration: number; // total loop seconds
  initialOffset: number;
  timestamps: TrackCue[];
}

export interface GameMetadata {
  id: GameId;
  title: string;
  shortTitle: string;
  year: number;
  theme: {
    accentColor: string;
    bgWallpaper: string;
    fontFamily: string;
  };
  stations: Station[];
}

export interface CachedStationRecord {
  stationId: string;
  gameId: GameId;
  /**
   * Legacy single-file audio blob. Present for records written by `saveStationAudio`
   * (pre-chunk cache); summaries returned by `getAllCachedStations()` omit it, because
   * chunked downloads are stored one blob per 120 s chunk in the `chunks` store.
   */
  blob?: Blob;
  sizeBytes: number;
  downloadedAt: number;
}

/** One stored audio chunk (120 s of a station), keyed `<gameId>:<stationId>:<NNN>`. */
export interface CachedChunkRecord {
  /** Composite primary key: `${gameId}:${stationId}:${chunkIndex padded to 3 digits}`. */
  key: string;
  gameId: GameId;
  stationId: string;
  chunkIndex: number;
  blob: Blob;
  sizeBytes: number;
  savedAt: number;
}

/**
 * Storage seam between the chunked playback controller and IndexedDB.
 * The controller (`chunkedPlayback`) depends on this interface only, never on `storage/db`.
 */
export interface ChunkStorage {
  saveChunkBlob(gameId: GameId, stationId: string, chunkIndex: number, blob: Blob): Promise<void>;
  getChunkBlob(gameId: GameId, stationId: string, chunkIndex: number): Promise<Blob | null>;
}

export interface EngineState {
  currentStation: Station | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isOffline: boolean;
  currentCue: TrackCue | null;
  coverArtUrl?: string | null;
  error: string | null;
}
