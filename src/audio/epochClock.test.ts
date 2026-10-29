import { describe, it, expect } from 'vitest';
import { getStationCurrentSecond, getStationSecondForDuration, MASTER_BROADCAST_EPOCH } from './epochClock';
import { Station } from '../types/radio';

describe('epochClock', () => {
  const station: Station = {
    id: 'k-dst',
    gameId: 'gtasa',
    name: 'K-DST',
    genre: 'Classic Rock',
    logoUrl: '/logos/k-dst.png',
    audioUrl: 'https://archive.org/kdst.mp3',
    duration: 3600, // 1 hour
    initialOffset: 600, // 10 min offset
    timestamps: [],
  };

  it('calculates deterministic station second based on master epoch', () => {
    // 500 seconds after epoch start
    const testNowMs = MASTER_BROADCAST_EPOCH + 500 * 1000;
    const second = getStationCurrentSecond(station, testNowMs);
    // (500 + 600) % 3600 = 1100
    expect(second).toBe(1100);
  });

  it('wraps around duration cleanly after multiple cycles', () => {
    // 2.5 cycles (9000 seconds)
    const testNowMs = MASTER_BROADCAST_EPOCH + 9000 * 1000;
    const second = getStationCurrentSecond(station, testNowMs);
    // (9000 + 600) % 3600 = 9600 % 3600 = 2400
    expect(second).toBe(2400);
  });

  it('handles station with duration 0 or negative duration safely', () => {
    const zeroStation: Station = { ...station, duration: 0 };
    expect(getStationCurrentSecond(zeroStation, MASTER_BROADCAST_EPOCH + 1000)).toBe(0);

    const negativeStation: Station = { ...station, duration: -100 };
    expect(getStationCurrentSecond(negativeStation, MASTER_BROADCAST_EPOCH + 1000)).toBe(0);
  });

  it('handles station with 0 or missing initialOffset', () => {
    const noOffsetStation: Station = { ...station, initialOffset: 0 };
    const testNowMs = MASTER_BROADCAST_EPOCH + 450 * 1000;
    expect(getStationCurrentSecond(noOffsetStation, testNowMs)).toBe(450);
  });

  it('clamps elapsed time to 0 if masterEpochMs is before MASTER_BROADCAST_EPOCH', () => {
    const pastMs = MASTER_BROADCAST_EPOCH - 100000;
    // elapsedSeconds = 0, so (0 + 600) % 3600 = 600
    expect(getStationCurrentSecond(station, pastMs)).toBe(600);
  });

  it('uses a manifest duration for the live offset', () => {
    // `gtasa/playback-fm`: 2810 s in the catalog, 3168.054 s measured by ffprobe.
    const playbackFm: Station = { ...station, duration: 2810, initialOffset: 600 };
    const testNowMs = MASTER_BROADCAST_EPOCH + 3100 * 1000;

    const fromManifest = getStationSecondForDuration(playbackFm, 3168.054, testNowMs);
    const fromCatalog = getStationCurrentSecond(playbackFm, testNowMs);

    // 3700 % 2810 = 890 by the catalog, 3700 % 3168.054 = 531.946 by the manifest.
    expect(fromCatalog).toBe(890);
    expect(fromManifest).toBeCloseTo(531.946, 3);
    expect(fromManifest).toBeGreaterThanOrEqual(0);
    expect(fromManifest).toBeLessThan(3168.054);
    expect(fromManifest).not.toBeCloseTo(fromCatalog, 0);
  });

  it('uses Date.now() if masterEpochMs is omitted', () => {
    const second = getStationCurrentSecond(station);
    expect(typeof second).toBe('number');
    expect(second).toBeGreaterThanOrEqual(0);
    expect(second).toBeLessThan(station.duration);
  });
});
