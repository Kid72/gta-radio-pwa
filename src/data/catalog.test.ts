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
});
