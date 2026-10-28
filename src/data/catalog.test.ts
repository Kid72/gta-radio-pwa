import { describe, it, expect } from 'vitest';
import { GAMES, GAME_LIST, getGame, getStation, getStationsForGame, getAllStations } from './catalog';

describe('catalog', () => {
  it('contains all 3 games with valid themes', () => {
    expect(GAME_LIST.length).toBe(3);
    expect(GAMES.gta5).toBeDefined();
    expect(GAMES.gtasa).toBeDefined();
    expect(GAMES.gta4).toBeDefined();

    expect(GAMES.gta5.theme.accentColor).toBe('#4ae891');
    expect(GAMES.gtasa.theme.accentColor).toBe('#f59e0b');
    expect(GAMES.gta4.theme.accentColor).toBe('#eab308');
  });

  it('contains all 26 GTA V stations', () => {
    expect(GAMES.gta5.stations.length).toBe(26);
    const nonStopPop = GAMES.gta5.stations.find((s) => s.id === 'non-stop-pop-fm');
    expect(nonStopPop).toBeDefined();
    expect(nonStopPop?.genre).toBe('Pop, Dance & R&B');
    expect(nonStopPop?.host).toBe('Cara Delevingne');
    expect(nonStopPop?.timestamps.length).toBeGreaterThan(0);
  });

  it('contains all 11 GTA San Andreas stations', () => {
    expect(GAMES.gtasa.stations.length).toBe(11);
    const kdst = GAMES.gtasa.stations.find((s) => s.id === 'k-dst');
    expect(kdst).toBeDefined();
    expect(kdst?.name).toBe('K-DST');
    expect(kdst?.host).toContain('Tommy');
    expect(kdst?.timestamps.length).toBeGreaterThan(0);
  });

  it('contains all 19 GTA IV stations', () => {
    expect(GAMES.gta4.stations.length).toBe(19);
    const vladivostok = GAMES.gta4.stations.find((s) => s.id === 'vladivostok-fm');
    expect(vladivostok).toBeDefined();
    expect(vladivostok?.name).toBe('Vladivostok FM');
    expect(vladivostok?.host).toBe('Ruslana');
    expect(vladivostok?.timestamps.length).toBeGreaterThan(0);
  });

  it('retrieves games and stations by helpers', () => {
    expect(getGame('gtasa').shortTitle).toBe('GTA San Andreas');
    expect(getStationsForGame('gta4').length).toBe(19);
    expect(getStation('k-dst')?.name).toBe('K-DST');
    expect(getStation('non-stop-pop-fm', 'gta5')?.host).toBe('Cara Delevingne');
    expect(getAllStations().length).toBe(26 + 11 + 19);
  });

  it('resolves wallpapers and logo URLs using resolveAssetUrl', () => {
    expect(GAMES.gta5.theme.bgWallpaper.startsWith('//')).toBe(false);
    expect(GAMES.gta5.theme.bgWallpaper).toContain('wallpapers/gta5.webp');
    expect(GAMES.gtasa.theme.bgWallpaper.startsWith('//')).toBe(false);
    expect(GAMES.gtasa.theme.bgWallpaper).toContain('wallpapers/gtasa.svg');

    const saStations = getStationsForGame('gtasa');
    expect(saStations[0].logoUrl.startsWith('//')).toBe(false);
    expect(saStations[0].logoUrl).toContain('logos/gtasa/');
  });

  it('orders stations in canonical in-game sequences', () => {
    expect(GAMES.gta5.stations[0].id).toBe('blaine-county-talk-radio');
    expect(GAMES.gta5.stations[GAMES.gta5.stations.length - 1].id).toBe('radio-off');

    expect(GAMES.gtasa.stations[0].id).toBe('playback-fm');
    expect(GAMES.gtasa.stations[1].id).toBe('k-rose');
    expect(GAMES.gtasa.stations[GAMES.gtasa.stations.length - 1].id).toBe('wctr');

    expect(GAMES.gta4.stations[0].id).toBe('the-beat-102-7');
    expect(GAMES.gta4.stations[1].id).toBe('the-classics');
    expect(GAMES.gta4.stations[GAMES.gta4.stations.length - 1].id).toBe('self-actualization-fm');
  });
});
