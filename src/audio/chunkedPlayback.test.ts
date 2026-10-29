import { describe, it, expect, afterEach, vi } from 'vitest';
import { CHUNK_TRANSITION_GUARD, ChunkedPlayback } from './chunkedPlayback';
import { chunkUrl } from './chunkedSource';
import type { ChunkMeta } from '../data/chunkManifest';
import type { ChunkStorage, GameId, Station } from '../types/radio';

/**
 * Manifest for the tests: 60 chunks of 120 s (7200 s). Chunk 51 therefore covers
 * [6120, 6240) and the live second 6207 lands at offset 87 — the same arithmetic
 * as the real fan-out (`6207 = 51 * 120 + 87`), without depending on producer data.
 */
const META: ChunkMeta = { chunkSeconds: 120, count: 60, duration: 7200, bytes: [] };
const SHORT_META: ChunkMeta = { chunkSeconds: 120, count: 3, duration: 360, bytes: [] };

const stationK: Station = {
  id: 'k-rose',
  gameId: 'gtasa',
  name: 'K-Rose',
  genre: 'Country',
  logoUrl: '/logos/k-rose.png',
  audioUrl: 'https://archive.org/k-rose.mp3',
  duration: 2900,
  initialOffset: 0,
  timestamps: [],
};

const stationX: Station = {
  id: 'channel-x',
  gameId: 'gta5',
  name: 'Channel X',
  genre: 'Punk',
  logoUrl: '/logos/channel-x.png',
  audioUrl: 'https://archive.org/channel-x.mp3',
  duration: 2827,
  initialOffset: 0,
  timestamps: [],
};

function url(gameId: GameId, stationId: string, index: number): string {
  const built = chunkUrl(gameId, stationId, index);
  if (!built) throw new Error('chunk URL must exist for the fixtures');
  return built;
}

interface FakeAudio extends HTMLAudioElement {
  writes: number[];
  readyState: number;
  setReadyState(value: number): void;
  emit(type: string): void;
}

/**
 * Minimal `<audio>` stand-in in the style of `radioEngine.test.ts`, plus what the
 * chunk controller needs: a readable `readyState` and recorded `currentTime`
 * writes (the spy on the setter that gates the "never zeroes" rule).
 */
function createFakeAudio(): FakeAudio {
  const listeners: Record<string, EventListener[]> = {};
  const writes: number[] = [];
  let currentTime = 0;
  let source = '';
  let readyStateValue = 0;
  let pausedValue = true;

  const audio = {
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      writes.push(value);
    },
    get readyState() {
      return readyStateValue;
    },
    get src() {
      return source;
    },
    set src(value: string) {
      source = value;
      // A real element resets its position and drops metadata on a source change.
      currentTime = 0;
      readyStateValue = 0;
      pausedValue = true;
    },
    get paused() {
      return pausedValue;
    },
    duration: Number.NaN,
    loop: true,
    preload: '',
    error: null,
    play: vi.fn(() => {
      pausedValue = false;
      return Promise.resolve();
    }),
    pause: vi.fn(() => {
      pausedValue = true;
    }),
    load: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn().mockReturnValue(''),
    addEventListener: vi.fn((event: string, callback: EventListener) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
    }),
    removeEventListener: vi.fn((event: string, callback: EventListener) => {
      if (listeners[event]) listeners[event] = listeners[event].filter((fn) => fn !== callback);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      (listeners[event.type] || []).forEach((callback) => callback(event));
      return true;
    }),
    emit(type: string) {
      (listeners[type] || []).forEach((callback) => callback(new Event(type)));
    },
    setReadyState(value: number) {
      readyStateValue = value;
    },
    writes,
  };

  return audio as unknown as FakeAudio;
}

function storageWith(blobs: Map<number, Blob>): ChunkStorage {
  return {
    saveChunkBlob: vi.fn().mockResolvedValue(undefined),
    getChunkBlob: vi.fn(async (_gameId: GameId, _stationId: string, chunkIndex: number) => {
      return blobs.get(chunkIndex) ?? null;
    }),
  };
}

/** Drain the microtask chain of an async chunk switch. */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChunkedPlayback', () => {
  it('starts at the chunk containing the live offset and never zeroes it', async () => {
    const audio = createFakeAudio();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META });

    await playback.start(stationK, 6207, 1);

    expect(playback.getChunkIndex()).toBe(51);
    expect(audio.src).toBe(url('gtasa', 'k-rose', 51));
    expect(audio.loop).toBe(false);
    expect(audio.play).toHaveBeenCalled();
    expect(audio.writes).not.toContain(0);
    expect(audio.writes[audio.writes.length - 1]).toBeCloseTo(87, 5);
    expect(playback.getAbsoluteSecond()).toBeCloseTo(6207, 5);

    playback.dispose();
  });

  it('reapplies the pending offset when metadata arrives 2500 ms later', async () => {
    vi.useFakeTimers();
    const audio = createFakeAudio();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META });

    await playback.start(stationK, 6207, 1);
    expect(audio.readyState).toBe(0);

    await vi.advanceTimersByTimeAsync(2500);
    expect(audio.writes).not.toContain(0);

    audio.setReadyState(1);
    audio.emit('loadedmetadata');

    expect(audio.currentTime).toBeCloseTo(87, 5);
    expect(playback.getAbsoluteSecond()).toBeCloseTo(6207, 5);

    // Later retries must not drag the position back to the start of the chunk.
    await vi.advanceTimersByTimeAsync(5000);
    expect(audio.currentTime).toBeCloseTo(87, 5);

    playback.dispose();
  });

  it('does not write 0 to currentTime while metadata is still missing', async () => {
    vi.useFakeTimers();
    const audio = createFakeAudio();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META });

    await playback.start(stationK, 6207, 1);
    const before = audio.writes.length;

    // Well past the old 1500 ms watchdog: the position must still be the target.
    await vi.advanceTimersByTimeAsync(10_000);

    const later = audio.writes.slice(before);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((value) => value === 87)).toBe(true);
    expect(audio.writes).not.toContain(0);
    expect(audio.currentTime).toBe(87);

    playback.dispose();
  });

  it('advances to the next chunk at the end guard and keeps playing', async () => {
    const audio = createFakeAudio();
    audio.setReadyState(4);
    const onChunkChange = vi.fn();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META, onChunkChange });

    await playback.start(stationK, 6207, 1);
    audio.emit('loadedmetadata');
    expect(audio.currentTime).toBeCloseTo(87, 5);

    audio.currentTime = 120 - CHUNK_TRANSITION_GUARD / 2;
    audio.emit('timeupdate');
    await flush();

    expect(playback.getChunkIndex()).toBe(52);
    expect(audio.src).toBe(url('gtasa', 'k-rose', 52));
    expect(audio.writes[audio.writes.length - 1]).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.paused).toBe(false);
    expect(onChunkChange).toHaveBeenLastCalledWith(52);

    playback.dispose();
  });

  it('advances on ended and wraps to the first chunk after the last', async () => {
    const audio = createFakeAudio();
    audio.setReadyState(4);
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => SHORT_META });

    // 240 s in a 360 s / 3-chunk loop: the last chunk.
    await playback.start(stationK, 240, 1);
    expect(playback.getChunkIndex()).toBe(2);

    audio.currentTime = 359.9;
    audio.emit('ended');
    await flush();

    expect(playback.getChunkIndex()).toBe(0);
    expect(audio.src).toBe(url('gtasa', 'k-rose', 0));
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.paused).toBe(false);

    playback.dispose();
  });

  it('reports a transition gap in milliseconds', async () => {
    const audio = createFakeAudio();
    audio.setReadyState(4);
    const onTransition = vi.fn();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META, onTransition });

    await playback.start(stationK, 6207, 1);

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    audio.currentTime = 119.9;
    audio.emit('timeupdate');
    await flush();
    expect(onTransition).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(1_000_042);
    audio.emit('playing');

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition).toHaveBeenCalledWith({ from: 51, to: 52, gapMs: 42 });

    playback.dispose();
  });

  it('ignores a stale generation after a station switch', async () => {
    const audio = createFakeAudio();
    let releaseFirst: () => void = () => {};
    const storage: ChunkStorage = {
      saveChunkBlob: vi.fn().mockResolvedValue(undefined),
      getChunkBlob: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Blob | null>((resolve) => {
              releaseFirst = () => resolve(null);
            }),
        )
        .mockResolvedValue(null),
    };
    const playback = new ChunkedPlayback({ audio, storage, getChunkMeta: () => META });

    // First tune is stuck inside storage resolution.
    const first = playback.start(stationK, 0, 1);
    await flush();

    // The listener switches station before the first resolution finishes.
    await playback.start(stationX, 300, 2);
    await flush();
    expect(playback.getChunkIndex()).toBe(2);
    expect(audio.src).toBe(url('gta5', 'channel-x', 2));

    releaseFirst();
    await first;
    await flush();

    // The stale resolution must not rewrite the source of the live station.
    expect(audio.src).toBe(url('gta5', 'channel-x', 2));
    expect(playback.getChunkIndex()).toBe(2);

    playback.dispose();
  });

  it('plays a cached chunk from blob storage and revokes the previous blob url', async () => {
    const audio = createFakeAudio();
    audio.setReadyState(4);

    const objectUrls = ['blob:chunk-51', 'blob:chunk-52'];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => objectUrls.shift() ?? 'blob:extra');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const blobs = new Map<number, Blob>([
      [51, new Blob(['51'])],
      [52, new Blob(['52'])],
    ]);
    const storage = storageWith(blobs);

    const playback = new ChunkedPlayback({ audio, storage, getChunkMeta: () => META });

    await playback.start(stationK, 6207, 1);
    expect(audio.src).toBe('blob:chunk-51');
    expect(playback.isOfflineSource()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    audio.emit('ended');
    await flush();

    expect(audio.src).toBe('blob:chunk-52');
    expect(playback.isOfflineSource()).toBe(true);
    expect(revokeSpy).toHaveBeenCalledWith('blob:chunk-51');
    expect(fetchSpy).not.toHaveBeenCalled();

    playback.dispose();
  });

  it('prefetches the next chunk once and swallows prefetch errors', async () => {
    const audio = createFakeAudio();
    audio.setReadyState(4);
    const fetchSpy = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['warm']) }));
    vi.stubGlobal('fetch', fetchSpy);
    const onError = vi.fn();

    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META, onError });
    await playback.start(stationK, 6207, 1);

    audio.currentTime = 100; // 20 s left in the chunk -> inside the prefetch lead
    audio.emit('timeupdate');
    await flush();
    audio.currentTime = 101;
    audio.emit('timeupdate');
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(url('gtasa', 'k-rose', 52), { cache: 'force-cache' });
    expect(onError).not.toHaveBeenCalled();
    playback.dispose();

    // A 404 on the warm request is speculative and must stay silent.
    const failing = vi.fn(async () => {
      throw new Error('404');
    });
    vi.stubGlobal('fetch', failing);
    const audio2 = createFakeAudio();
    audio2.setReadyState(4);
    const onError2 = vi.fn();
    const playback2 = new ChunkedPlayback({ audio: audio2, getChunkMeta: () => META, onError: onError2 });
    await playback2.start(stationK, 6207, 1);

    audio2.currentTime = 100;
    audio2.emit('timeupdate');
    await flush();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(onError2).not.toHaveBeenCalled();

    playback2.dispose();
  });

  it('dispose revokes blob urls and clears timers', async () => {
    vi.useFakeTimers();
    const objectUrls = ['blob:warm', 'blob:current'];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => objectUrls.shift() ?? 'blob:extra');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['warm']) })));

    // A network chunk (no storage): the retry timer runs and the next chunk is warmed.
    const audio = createFakeAudio();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META });
    await playback.start(stationK, 6207, 1);
    expect(audio.src).toBe(url('gtasa', 'k-rose', 51));

    audio.currentTime = 100;
    audio.emit('timeupdate');
    await vi.advanceTimersByTimeAsync(1);
    expect(audio.writes.length).toBeGreaterThan(0);

    const writesBefore = audio.writes.length;
    playback.dispose();

    expect(revokeSpy).toHaveBeenCalledWith('blob:warm');
    expect(audio.removeEventListener).toHaveBeenCalled();

    // No timer survives dispose: the position cannot be rewritten any more.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(audio.writes.length).toBe(writesBefore);

    // An offline source (blob from storage) is revoked on dispose as well.
    const offlineAudio = createFakeAudio();
    const storage: ChunkStorage = {
      saveChunkBlob: vi.fn().mockResolvedValue(undefined),
      getChunkBlob: vi.fn(async () => new Blob(['chunk'])),
    };
    const offlinePlayback = new ChunkedPlayback({
      audio: offlineAudio,
      storage,
      getChunkMeta: () => META,
    });
    await offlinePlayback.start(stationK, 6207, 1);
    expect(offlineAudio.src).toBe('blob:current');

    offlinePlayback.dispose();
    expect(revokeSpy).toHaveBeenCalledWith('blob:current');
  });

  it('keeps the current chunk when the next one fails and reports one error', async () => {
    const audio = createFakeAudio();
    audio.setReadyState(4);
    const onError = vi.fn();
    const playback = new ChunkedPlayback({ audio, getChunkMeta: () => META, onError });

    await playback.start(stationK, 6207, 1);
    audio.emit('loadedmetadata');
    audio.currentTime = 100;
    audio.emit('timeupdate');

    audio.emit('ended');
    await flush();
    expect(playback.getChunkIndex()).toBe(52);

    audio.emit('error');
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(playback.getChunkIndex()).toBe(51);
    expect(audio.src).toBe(url('gtasa', 'k-rose', 51));

    // No retry loop: a second error of the same failure is not reported again.
    audio.emit('error');
    expect(onError).toHaveBeenCalledTimes(1);

    playback.dispose();
  });
});
