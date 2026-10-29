import { describe, it, expect } from 'vitest';
import { CHUNK_BASE, chunkBounds, chunkUrl, locate, resolveTimeline } from './chunkedSource';
import { CHUNK_SECONDS } from './chunkedSource';
import { getChunkMeta } from '../data/chunkManifest';
import { getStation } from '../data/catalog';
import type { GameId, Station } from '../types/radio';

function station(id: string, gameId: GameId): Station {
  const found = getStation(id, gameId);
  if (!found) throw new Error(`missing fixture station ${gameId}:${id}`);
  return found;
}

describe('chunkUrl', () => {
  it('chunkUrl builds a three-digit path under the CDN base', () => {
    expect(CHUNK_BASE).toBe('https://gta-media.pulsr.top/chunks');
    expect(chunkUrl('gta5', 'los-santos-rock-radio', 0)).toBe(
      'https://gta-media.pulsr.top/chunks/gta5/los-santos-rock-radio/000.mp3',
    );
    expect(chunkUrl('gtasa', 'playback-fm', 27)).toBe(
      'https://gta-media.pulsr.top/chunks/gtasa/playback-fm/027.mp3',
    );
    expect(chunkUrl('gta4', 'if99', 51)).toBe(
      'https://gta-media.pulsr.top/chunks/gta4/if99/051.mp3',
    );
    expect(chunkUrl('gta5', 'the-music-locker', 139)).toBe(
      'https://gta-media.pulsr.top/chunks/gta5/the-music-locker/139.mp3',
    );
  });

  it('chunkUrl returns null outside the three-digit range', () => {
    expect(chunkUrl('gta5', 'channel-x', -1)).toBeNull();
    expect(chunkUrl('gta5', 'channel-x', 1000)).toBeNull();
    expect(chunkUrl('gta5', 'channel-x', 1.5)).toBeNull();
    expect(chunkUrl('gta5', 'channel-x', Number.NaN)).toBeNull();
    expect(chunkUrl('gta5', 'channel-x', 999)).toBe(
      'https://gta-media.pulsr.top/chunks/gta5/channel-x/999.mp3',
    );
  });
});

describe('resolveTimeline', () => {
  it('uses manifest duration for the timeline instead of catalog duration', () => {
    const playbackFm = station('playback-fm', 'gtasa');
    const meta = getChunkMeta('gtasa', 'playback-fm');
    expect(meta).not.toBeNull();
    expect(playbackFm.duration).toBe(2810);

    const timeline = resolveTimeline(playbackFm, meta);

    expect(timeline.source).toBe('manifest');
    expect(timeline.count).toBe(27);
    expect(timeline.duration).toBeCloseTo(3168.054, 2);
    expect(timeline.chunkSeconds).toBe(120);

    // The catalog timeline wraps 3000 s into the first minutes of the loop, so the
    // tail the manifest addresses is simply not expressible: 3000 % 2810 = 190.
    const catalogTimeline = resolveTimeline(playbackFm, null);
    expect(catalogTimeline.source).toBe('catalog');
    expect(catalogTimeline.count).toBe(24);
    expect(catalogTimeline.duration).toBe(2810);
    expect(locate(timeline, 3000)).toEqual({ index: 25, offset: 0, clamped: false });
    expect(locate(catalogTimeline, 3000)).toEqual({ index: 1, offset: 70, clamped: false });
  });

  it('falls back to catalog when the station is absent from the manifest', () => {
    const unknownStation: Station = { ...station('k-rose', 'gtasa'), id: 'unknown-fm', duration: 245 };
    const meta = getChunkMeta('gtasa', 'unknown-fm');
    expect(meta).toBeNull();

    const timeline = resolveTimeline(unknownStation, meta);

    expect(timeline.source).toBe('catalog');
    expect(timeline.duration).toBe(245);
    expect(timeline.chunkSeconds).toBe(CHUNK_SECONDS);
    expect(timeline.count).toBe(3);
  });
});

describe('locate', () => {
  it('locate returns the chunk containing the offset with a chunk-local offset', () => {
    const meta = getChunkMeta('gta5', 'los-santos-rock-radio');
    const timeline = resolveTimeline(station('los-santos-rock-radio', 'gta5'), meta);
    expect(timeline.count).toBe(78);

    expect(locate(timeline, 6207)).toEqual({ index: 51, offset: 87, clamped: false });
    expect(chunkBounds(timeline, 51)).toEqual({ start: 6120, end: 6240 });
    expect(locate(timeline, 0)).toEqual({ index: 0, offset: 0, clamped: false });
    expect(locate(timeline, 120)).toEqual({ index: 1, offset: 0, clamped: false });
    // Negative and out-of-cycle seconds are normalised by the timeline duration, not dropped.
    expect(locate(timeline, -30)).toEqual(locate(timeline, timeline.duration - 30));
    expect(locate(timeline, timeline.duration + 123)).toEqual(locate(timeline, 123));
  });

  it('locate clamps an offset beyond the last chunk to the final chunk', () => {
    // Manifest duration exceeds count * chunkSeconds (stale count, truncated publish):
    // 24 chunks of 120 s cover 2880 s, the recorded duration is 3208 s.
    const stale = { duration: 3208, count: 24, chunkSeconds: 120, source: 'manifest' as const };

    const result = locate(stale, 3200);

    expect(result.index).toBe(23);
    expect(result.clamped).toBe(true);
    expect(result.offset).toBeGreaterThan(0);
    expect(result.offset).toBeLessThanOrEqual(stale.chunkSeconds - 0.25);
    const bounds = chunkBounds(stale, result.index);
    expect(bounds.start + result.offset).toBeLessThan(bounds.end);
    // No request for chunk 026 (which does not exist) is produced by this geometry.
    expect(result.index).toBeLessThan(stale.count);
  });

  it('handles a station shorter than one chunk (count = 1)', () => {
    const short = { duration: 45, count: 1, chunkSeconds: 120, source: 'manifest' as const };

    expect(locate(short, 10)).toEqual({ index: 0, offset: 10, clamped: false });
    // Seconds beyond the 45 s loop wrap inside the single chunk.
    expect(locate(short, 100)).toEqual({ index: 0, offset: 10, clamped: false });
    expect(locate(short, 44.9).index).toBe(0);
    expect(locate(short, 44.9).offset).toBeLessThanOrEqual(44.75);
    expect(chunkBounds(short, 0)).toEqual({ start: 0, end: 45 });
  });

  it('never returns an offset past the end of its chunk', () => {
    const meta = getChunkMeta('gta5', 'the-music-locker');
    const timeline = resolveTimeline(station('the-music-locker', 'gta5'), meta);
    expect(timeline.count).toBe(140);

    // The last chunk is a remainder: 16730.548 - 139 * 120 = 50.548 s.
    const last = locate(timeline, timeline.duration - 0.01);
    expect(last.index).toBe(139);
    expect(last.offset).toBeLessThanOrEqual(50.548 - 0.25);
    expect(chunkBounds(timeline, 139)).toEqual({ start: 16680, end: timeline.duration });
  });
});

describe('chunkBounds', () => {
  it('clamps an out-of-range chunk index to the last chunk', () => {
    const timeline = { duration: 3168.054, count: 27, chunkSeconds: 120, source: 'manifest' as const };

    expect(chunkBounds(timeline, 26)).toEqual({ start: 3120, end: timeline.duration });
    expect(chunkBounds(timeline, 99)).toEqual(chunkBounds(timeline, 26));
    expect(chunkBounds(timeline, -3)).toEqual(chunkBounds(timeline, 0));
    expect(chunkBounds(timeline, 0)).toEqual({ start: 0, end: 120 });
  });
});
