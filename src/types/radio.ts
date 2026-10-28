export type GameId = 'gtasa' | 'gta4' | 'gta5';

export interface TrackCue {
  start: number;
  end: number;
  song: string;
  artist: string;
  type: 'music' | 'talk' | 'ad';
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
  blob: Blob;
  sizeBytes: number;
  downloadedAt: number;
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
  error: string | null;
}
