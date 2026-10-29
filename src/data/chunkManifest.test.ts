import { describe, it, expect } from 'vitest';
import { CHUNK_MANIFEST, getChunkMeta, validateManifest } from './chunkManifest';
import { getAllStations, getStation } from './catalog';

describe('chunk manifest', () => {
  it('manifest proves catalog durations are understated for known stations', () => {
    const playbackFm = CHUNK_MANIFEST['gtasa:playback-fm'];
    const if99 = CHUNK_MANIFEST['gta4:if99'];
    const channelX = CHUNK_MANIFEST['gta5:channel-x'];
    const musicLocker = CHUNK_MANIFEST['gta5:the-music-locker'];

    expect(playbackFm).toBeDefined();
    expect(if99).toBeDefined();
    expect(channelX).toBeDefined();
    expect(musicLocker).toBeDefined();

    // Catalog says 2810 s -> 24 chunks; the real file is 3168.054 s -> 27 chunks.
    expect(playbackFm.count).toBe(27);
    expect(playbackFm.duration).toBeCloseTo(3168.054, 2);
    expect(Math.ceil(getStation('playback-fm', 'gtasa')!.duration / 120)).toBe(24);
    expect(playbackFm.count).toBeGreaterThan(Math.ceil(2810 / 120));

    // Catalog 3699 s -> 31 chunks; real file -> 37 (six chunks of the tail were unreachable).
    expect(if99.count).toBe(37);
    expect(if99.duration).toBeGreaterThan(3699);

    // Catalog 2741 s -> 23 chunks; real file -> 24.
    expect(channelX.count).toBe(24);
    expect(channelX.count).toBeGreaterThan(Math.ceil(2741 / 120));

    // Catalog 24984 s -> 209 chunks; real file -> 140 (catalog overstates the length here).
    expect(musicLocker.count).toBe(140);
    expect(musicLocker.duration).toBeLessThan(24984);

    // The shipped manifest describes 55 playable stations and 2408 chunks in total.
    expect(Object.keys(CHUNK_MANIFEST)).toHaveLength(55);
    const totalChunks = Object.values(CHUNK_MANIFEST).reduce((sum, meta) => sum + meta.count, 0);
    expect(totalChunks).toBe(2408);
  });

  it('manifest is internally consistent', () => {
    const keys = Object.keys(CHUNK_MANIFEST);
    expect(keys.length).toBeGreaterThanOrEqual(55);

    for (const [key, meta] of Object.entries(CHUNK_MANIFEST)) {
      expect(meta.chunkSeconds, key).toBeGreaterThan(0);
      expect(meta.duration, key).toBeGreaterThan(0);
      expect(meta.count, key).toBe(Math.ceil(meta.duration / meta.chunkSeconds));
      expect(meta.count * meta.chunkSeconds, key).toBeGreaterThanOrEqual(meta.duration);
      expect((meta.count - 1) * meta.chunkSeconds, key).toBeLessThan(meta.duration);
      expect(meta.bytes.length === 0 || meta.bytes.length === meta.count, key).toBe(true);
    }
  });

  it('getChunkMeta returns the entry of a known station and null otherwise', () => {
    expect(getChunkMeta('gtasa', 'playback-fm')?.count).toBe(27);
    expect(getChunkMeta('gta5', 'los-santos-rock-radio')?.count).toBe(78);
    expect(getChunkMeta('gta5', 'radio-off')).toBeNull();
    expect(getChunkMeta('gta5', 'no-such-station')).toBeNull();
  });

  it('validateManifest accepts the shipped manifest', () => {
    expect(validateManifest(CHUNK_MANIFEST, getAllStations())).toEqual([]);
  });

  it('validateManifest reports an unknown station key', () => {
    const errors = validateManifest(
      {
        'gta5:does-not-exist': { chunkSeconds: 120, count: 2, duration: 200, bytes: [] },
      },
      getAllStations(),
    );

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('gta5:does-not-exist');
  });

  it('validateManifest rejects a record whose count contradicts its duration', () => {
    const broken = {
      ...CHUNK_MANIFEST,
      'gtasa:playback-fm': { ...CHUNK_MANIFEST['gtasa:playback-fm'], count: 24 },
    };

    const errors = validateManifest(broken, getAllStations());

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('gtasa:playback-fm');
  });

  it('validateManifest reports a station that has no chunk entry', () => {
    const withoutPlaybackFm = Object.fromEntries(
      Object.entries(CHUNK_MANIFEST).filter(([key]) => key !== 'gtasa:playback-fm'),
    );

    const errors = validateManifest(withoutPlaybackFm, getAllStations());

    expect(errors.join('\n')).toContain('gtasa:playback-fm');
  });
});
