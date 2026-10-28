import { GameId, GameMetadata, Station } from '../types/radio';
import { resolveAssetUrl } from '../utils/assets';
import gtasaRaw from './gtasa.json';
import gta4Raw from './gta4.json';
import gta5Raw from './gta5.json';

function mapStations(stations: Station[]): Station[] {
  return stations.map((station) => ({
    ...station,
    logoUrl: resolveAssetUrl(station.logoUrl),
  }));
}

export const gtasaStations: Station[] = mapStations(gtasaRaw as Station[]);
export const gta4Stations: Station[] = mapStations(gta4Raw as Station[]);
export const gta5Stations: Station[] = mapStations(gta5Raw as Station[]);

export const GAMES: Record<GameId, GameMetadata> = {
  gta5: {
    id: 'gta5',
    title: 'Grand Theft Auto V',
    shortTitle: 'GTA V',
    year: 2013,
    theme: {
      accentColor: '#4ae891',
      bgWallpaper: resolveAssetUrl('/wallpapers/gta5.webp'),
      fontFamily: "'Oswald', sans-serif",
    },
    stations: gta5Stations,
  },
  gtasa: {
    id: 'gtasa',
    title: 'Grand Theft Auto: San Andreas',
    shortTitle: 'GTA San Andreas',
    year: 2004,
    theme: {
      accentColor: '#f59e0b',
      bgWallpaper: resolveAssetUrl('/wallpapers/gtasa.svg'),
      fontFamily: "'Pricedown', sans-serif",
    },
    stations: gtasaStations,
  },
  gta4: {
    id: 'gta4',
    title: 'Grand Theft Auto IV',
    shortTitle: 'GTA IV',
    year: 2008,
    theme: {
      accentColor: '#eab308',
      bgWallpaper: resolveAssetUrl('/wallpapers/gta4.svg'),
      fontFamily: "'Bank Gothic', sans-serif",
    },
    stations: gta4Stations,
  },
};

export const GAME_LIST: GameMetadata[] = [GAMES.gta5, GAMES.gtasa, GAMES.gta4];

export const DEFAULT_GAME_ID: GameId = 'gta5';

export function getGame(gameId: GameId): GameMetadata {
  return GAMES[gameId] || GAMES[DEFAULT_GAME_ID];
}

export function getStationsForGame(gameId: GameId): Station[] {
  return getGame(gameId).stations;
}

export function getStation(stationId: string, gameId?: GameId): Station | undefined {
  if (gameId) {
    return GAMES[gameId]?.stations.find((s) => s.id === stationId);
  }
  for (const game of GAME_LIST) {
    const found = game.stations.find((s) => s.id === stationId);
    if (found) return found;
  }
  return undefined;
}

export function getAllStations(): Station[] {
  return [...gta5Stations, ...gtasaStations, ...gta4Stations];
}
