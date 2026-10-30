import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RadioEngine, EngineState } from './radioEngine';
import { RadioSFX } from './sfx';
import { MASTER_BROADCAST_EPOCH } from './epochClock';
import { locate, resolveTimeline } from './chunkedSource';
import type { ChunkMeta } from '../data/chunkManifest';
import type { ChunkStorage, Station } from '../types/radio';

const mockStations: Station[] = [
  {
    id: 'radiox',
    gameId: 'gtasa',
    name: 'Radio X',
    genre: 'Alternative Rock',
    host: 'Sage',
    frequency: '107.9',
    logoUrl: '/logos/radiox.png',
    audioUrl: 'https://stream.gtaradio.net/gtasa/radiox.mp3',
    duration: 3600,
    initialOffset: 120,
    timestamps: [
      { start: 0, end: 200, song: 'Rusty Cage', artist: 'Soundgarden', type: 'music' },
      { start: 200, end: 260, song: 'Radio X DJ Banter', artist: 'Sage', type: 'talk' },
      { start: 260, end: 3600, song: 'Plush', artist: 'Stone Temple Pilots', type: 'music' },
    ],
  },
  {
    id: 'kdst',
    gameId: 'gtasa',
    name: 'K-DST',
    genre: 'Classic Rock',
    host: 'Tommy "The Nightmare" Smith',
    frequency: '98.5',
    logoUrl: '/logos/kdst.png',
    audioUrl: 'https://stream.gtaradio.net/gtasa/kdst.mp3',
    duration: 3600,
    initialOffset: 0,
    timestamps: [
      { start: 0, end: 3600, song: 'Free Bird', artist: 'Lynyrd Skynyrd', type: 'music' },
    ],
  },
  {
    id: 'vrock',
    gameId: 'gtasa',
    name: 'V-Rock',
    genre: 'Hard Rock',
    logoUrl: '/logos/vrock.png',
    audioUrl: 'https://stream.gtaradio.net/gtasa/vrock.mp3',
    duration: 3600,
    initialOffset: 50,
    timestamps: [],
  },
];

/**
 * `gtasa:playback-fm` as measured by ffprobe: the catalog says 2810 s (24 chunks),
 * the file is 3168.054 s (27 chunks). Everything past second 2810 is a tail that
 * catalog arithmetic cannot address.
 */
const playbackFm: Station = {
  id: 'playback-fm',
  gameId: 'gtasa',
  name: 'Playback FM',
  genre: 'Hip-hop',
  logoUrl: '/logos/playback-fm.png',
  audioUrl: 'https://archive.org/playback-fm.mp3',
  duration: 2810,
  initialOffset: 0,
  timestamps: [],
};

const PLAYBACK_FM_META: ChunkMeta = {
  chunkSeconds: 120,
  count: 27,
  duration: 3168.054,
  bytes: [],
};

/** No IndexedDB in the engine tests: the storage seam is injected (plan #14). */
const emptyStorage: ChunkStorage = {
  saveChunkBlob: async () => {},
  getChunkBlob: async () => null,
};

/**
 * Fixed clock: 6 000 030 s after the master epoch. With `radiox` (duration 3600,
 * initialOffset 120) the live second is 2550 — chunk 21, offset 30 — so a
 * chunk-local position of 0 can never be mistaken for a valid epoch position.
 */
const FIXED_CLOCK_MS = MASTER_BROADCAST_EPOCH + 6_000_030_000;
const FIXED_LIVE_SECOND = 2550;
const FIXED_CHUNK_OFFSET = 30;

interface FakeAudio extends HTMLAudioElement {
  writes: number[];
  events: string[];
  setReadyState(value: number): void;
}

/**
 * `<audio>` stand-in with the three things the chunk path needs: a readable
 * `readyState`, recorded `currentTime` writes (the "never zeroes" assertion) and
 * an ordered event log (`src` before `play` on the CarPlay path).
 */
function createFakeAudio(): FakeAudio {
  const listeners: Record<string, EventListener[]> = {};
  const writes: number[] = [];
  const events: string[] = [];
  let currentTime = 0;
  let source = '';
  let readyStateValue = 0;

  const audio = {
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      writes.push(value);
      events.push('currentTime');
    },
    get readyState() {
      return readyStateValue;
    },
    get src() {
      return source;
    },
    set src(value: string) {
      source = value;
      events.push('src');
    },
    get currentSrc() {
      return source;
    },
    duration: 120,
    paused: true,
    loop: false,
    preload: '',
    volume: 1,
    muted: false,
    error: null,
    play: vi.fn(() => {
      events.push('play');
      return Promise.resolve();
    }),
    pause: vi.fn(),
    load: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn().mockReturnValue(''),
    addEventListener: (type: string, cb: EventListener) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    removeEventListener: (type: string, cb: EventListener) => {
      if (listeners[type]) listeners[type] = listeners[type].filter((fn) => fn !== cb);
    },
    dispatchEvent: (event: Event) => {
      (listeners[event.type] || []).forEach((cb) => cb(event));
      return true;
    },
  } as unknown as FakeAudio;

  (audio as any).writes = writes;
  (audio as any).events = events;
  (audio as any).setReadyState = (value: number) => {
    readyStateValue = value;
  };
  return audio;
}

function createMockAudioContext() {
  const mockGain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      value: 1,
    },
    connect: vi.fn(),
  };

  const mockFilter = {
    type: '',
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(),
  };

  const mockBufferSource = {
    buffer: null as any,
    connect: vi.fn(),
    start: vi.fn(),
  };

  const mockOscillator = {
    type: '',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  const mockBuffer = {
    getChannelData: vi.fn().mockReturnValue(new Float32Array(500)),
  };

  const ctx = {
    sampleRate: 44100,
    currentTime: 5.0,
    state: 'running',
    destination: {},
    createBuffer: vi.fn().mockReturnValue(mockBuffer),
    createBufferSource: vi.fn().mockReturnValue(mockBufferSource),
    createBiquadFilter: vi.fn().mockReturnValue(mockFilter),
    createGain: vi.fn().mockReturnValue(mockGain),
    createOscillator: vi.fn().mockReturnValue(mockOscillator),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;

  return { ctx, mockGain, mockFilter, mockBufferSource, mockOscillator, mockBuffer };
}

describe('RadioSFX (Authentic Tuning Bursts and Switch Clicks)', () => {
  it('synthesizes white noise static burst via Web Audio API bandpass filter and gain envelope', () => {
    const { ctx, mockFilter, mockGain, mockBufferSource } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.playTuningStatic(160);

    expect(ctx.createBuffer).toHaveBeenCalledWith(1, expect.any(Number), 44100);
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.createBiquadFilter).toHaveBeenCalled();
    expect(mockFilter.type).toBe('bandpass');
    expect(mockFilter.frequency.value).toBe(1200);
    expect(mockFilter.Q.value).toBe(3.0);
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.2, 5.0);
    expect(mockGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.01,
      5.0 + 0.16
    );
    expect(mockBufferSource.start).toHaveBeenCalled();
  });

  it('synthesizes mechanical notch click using frequency and gain ramps', () => {
    const { ctx, mockOscillator, mockGain } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.playClick();

    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(mockOscillator.type).toBe('triangle');
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(220, 5.0);
    expect(mockOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      40,
      5.0 + 0.04
    );
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.15, 5.0);
    expect(mockGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.001, 5.0 + 0.04);
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalledWith(5.0 + 0.04);
  });

  it('resumes suspended AudioContext on trigger', () => {
    const { ctx } = createMockAudioContext();
    (ctx as any).state = 'suspended';
    const sfx = new RadioSFX(ctx);

    sfx.playClick();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('gracefully degrades when AudioContext is unavailable without throwing', () => {
    const sfx = new RadioSFX();
    sfx.setContext(null);

    expect(() => {
      sfx.playTuningStatic();
      sfx.playClick();
    }).not.toThrow();
  });

  it('respects enabled state flag', () => {
    const { ctx, mockOscillator } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);
    sfx.setEnabled(false);
    expect(sfx.isEnabled()).toBe(false);

    sfx.playClick();
    sfx.playTuningStatic();

    expect(mockOscillator.start).not.toHaveBeenCalled();
    expect(ctx.createBuffer).not.toHaveBeenCalled();
  });
});

describe('RadioEngine Core Audio Player', () => {
  let engine: RadioEngine;
  let mockSFX: RadioSFX;
  let createObjectURLSpy: any;
  let revokeObjectURLSpy: any;

  beforeEach(() => {
    // Spies for Blob URL creation & revocation
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-uuid');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock HTMLMediaElement methods in jsdom
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(function (this: HTMLAudioElement) {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    window.HTMLMediaElement.prototype.pause = vi.fn().mockImplementation(function (this: HTMLAudioElement) {
      this.dispatchEvent(new Event('pause'));
    });
    window.HTMLMediaElement.prototype.load = vi.fn();

    mockSFX = new RadioSFX();
    vi.spyOn(mockSFX, 'playClick');
    vi.spyOn(mockSFX, 'playTuningStatic');

    engine = new RadioEngine({
      stations: mockStations,
      sfx: mockSFX,
      initialVolume: 0.8,
      // Manifest geometry is injected: the engine tests must not depend on producer data.
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });
  });

  afterEach(() => {
    engine?.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes native HTML5 audio element with playsinline and preload attributes', () => {
    const audio = engine.getAudioElement();
    expect(audio).toBeDefined();
    expect(audio.getAttribute('playsinline')).toBe('');
    expect(audio.getAttribute('webkit-playsinline')).toBe('');
    expect(audio.preload).toBe('auto');
    // Chunked playback never loops the element; the controller loops the station.
    expect(audio.loop).toBe(false);
    expect(engine.getVolume()).toBe(0.8);
  });

  it('defaults to catalog stations if no custom station list is passed', () => {
    const defaultEngine = new RadioEngine();
    expect(defaultEngine.getStations().length).toBeGreaterThan(0);
    defaultEngine.destroy();
  });

  it('tunes the station through the chunk source', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXED_CLOCK_MS));

    const station = mockStations[0];
    await engine.playStation(station, true);

    const audio = engine.getAudioElement();
    expect(mockSFX.playClick).toHaveBeenCalled();
    expect(mockSFX.playTuningStatic).toHaveBeenCalled();
    // The chunk CDN is the source now, never the archive.org single file.
    expect(audio.src).toBe('https://gta-media.pulsr.top/chunks/gtasa/radiox/021.mp3');
    expect(audio.play).toHaveBeenCalled();

    const state = engine.getState();
    expect(state.currentStation?.id).toBe(station.id);
    expect(state.isPlaying).toBe(true);
    expect(state.isOffline).toBe(false);
    expect(state.duration).toBe(station.duration);
    expect(state.currentCue).toBeDefined();
  });

  it('supports playing station from beginning when instantLiveSync is false', async () => {
    const station = mockStations[0];
    await engine.playStation(station, false);

    const audio = engine.getAudioElement();
    expect(audio.src).toContain('/chunks/gtasa/radiox/000.mp3');
    expect(engine.getState().currentTime).toBe(0);
  });

  it('plays a fully cached station from chunk blobs', async () => {
    const station = mockStations[1];
    const mockBlob = new Blob(['sample-mp3-bytes'], { type: 'audio/mp3' });
    const cachedStorage: ChunkStorage = {
      saveChunkBlob: async () => {},
      getChunkBlob: async () => mockBlob,
    };
    const cachedEngine = new RadioEngine({
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: cachedStorage,
    });

    await cachedEngine.playStation(station);

    const audio = cachedEngine.getAudioElement();
    expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
    expect(audio.src).toContain('blob:');
    expect(cachedEngine.getState().isOffline).toBe(true);
    cachedEngine.destroy();
  });

  it('revokes the previous chunk blob URL when switching stations', async () => {
    const station1 = mockStations[0];
    const station2 = mockStations[1];
    const mockBlob = new Blob(['bytes'], { type: 'audio/mp3' });
    let stored: Blob | null = mockBlob;
    const switchStorage: ChunkStorage = {
      saveChunkBlob: async () => {},
      getChunkBlob: async () => stored,
    };
    const switchingEngine = new RadioEngine({
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: switchStorage,
    });

    await switchingEngine.playStation(station1);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    stored = null;
    await switchingEngine.playStation(station2);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-uuid');
    expect(switchingEngine.getState().isOffline).toBe(false);
    switchingEngine.destroy();
  });

  it('cycles to nextStation and previousStation wrapping around the list', async () => {
    await engine.playStation(mockStations[0]);
    expect(engine.getState().currentStation?.id).toBe('radiox');

    engine.nextStation();
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.getState().currentStation?.id).toBe('kdst');

    engine.nextStation();
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.getState().currentStation?.id).toBe('vrock');

    // Wraps around to start
    engine.nextStation();
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.getState().currentStation?.id).toBe('radiox');

    // Previous wraps backwards
    engine.previousStation();
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.getState().currentStation?.id).toBe('vrock');
  });

  it('supports synchronous CarPlay nextStationSync and previousStationSync triggers', async () => {
    await engine.playStation(mockStations[0]);
    const audio = engine.getAudioElement();
    const playSpy = vi.spyOn(audio, 'play');

    engine.nextStationSync();
    // audio.play() was invoked synchronously
    expect(playSpy).toHaveBeenCalled();
    expect(engine.getState().currentStation?.id).toBe('kdst');

    engine.previousStationSync();
    expect(engine.getState().currentStation?.id).toBe('radiox');
  });

  it('tunes the chunk source synchronously on the CarPlay path', () => {
    const audio = createFakeAudio();
    const syncEngine = new RadioEngine({
      audio,
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    syncEngine.nextStationSync();

    // src is assigned before play(): both inside the user-activation tick.
    const srcAt = audio.events.indexOf('src');
    const playAt = audio.events.indexOf('play');
    expect(srcAt).toBeGreaterThanOrEqual(0);
    expect(playAt).toBeGreaterThan(srcAt);
    expect(audio.src).toContain('/chunks/gtasa/radiox/');
    expect(audio.loop).toBe(false);
    // Adopted, not reloaded: exactly one source assignment for the tune.
    expect(audio.events.filter((e) => e === 'src')).toHaveLength(1);
    expect(syncEngine.getState().currentStation?.id).toBe('radiox');
    syncEngine.destroy();
  });

  it('seeks to target live epoch on loadedmetadata during nextStationSync', () => {
    const audio = createFakeAudio();
    const syncEngine = new RadioEngine({
      audio,
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    syncEngine.nextStationSync();
    expect(syncEngine.getState().currentStation?.id).toBe('radiox');

    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBeGreaterThanOrEqual(0);
    syncEngine.destroy();
  });

  it('keeps the epoch position when metadata arrives after 1500 ms on the sync path', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    vi.setSystemTime(new Date(FIXED_CLOCK_MS));

    const audio = createFakeAudio();
    const syncEngine = new RadioEngine({
      audio,
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    syncEngine.nextStationSync();
    // Chunk 21 starts at 2520 s, the live second is 2550 -> chunk-local 30.
    expect(audio.currentTime).toBeCloseTo(FIXED_CHUNK_OFFSET, 3);

    // Metadata is 2.5 s away (and readyState is still 0). The old watchdog wrote 0 here.
    vi.advanceTimersByTime(2500);
    expect(audio.currentTime).not.toBe(0);
    expect(audio.currentTime).toBeCloseTo(FIXED_CHUNK_OFFSET, 3);

    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBeCloseTo(FIXED_CHUNK_OFFSET, 3);

    const state = syncEngine.getState();
    expect(Math.abs(state.currentTime - FIXED_LIVE_SECOND)).toBeLessThanOrEqual(3);
    syncEngine.destroy();
  });

  it('does not reset position when readyState is 0 at the 1500 ms mark', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    vi.setSystemTime(new Date(FIXED_CLOCK_MS));

    const audio = createFakeAudio(); // readyState stays 0: metadata never arrives
    const pendingEngine = new RadioEngine({
      audio,
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    await pendingEngine.playStation(mockStations[0], true);
    expect(audio.currentTime).toBeCloseTo(FIXED_CHUNK_OFFSET, 3);

    vi.advanceTimersByTime(1600);
    expect(audio.currentTime).toBeCloseTo(FIXED_CHUNK_OFFSET, 3);
    expect(audio.currentTime).not.toBe(0);
    expect(audio.writes).not.toContain(0);
    expect(pendingEngine.getState().currentTime).toBeGreaterThan(1500);
    pendingEngine.destroy();
  });

  it('never writes 0 to currentTime while a seek is pending', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    vi.setSystemTime(new Date(FIXED_CLOCK_MS));

    const audio = createFakeAudio();
    const pendingEngine = new RadioEngine({
      audio,
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    await pendingEngine.playStation(mockStations[0], true);
    expect(audio.writes.length).toBeGreaterThan(0);
    expect(audio.writes.every((written) => written !== 0)).toBe(true);

    // The retry timer keeps re-applying the *planned* offset, never 0.
    vi.advanceTimersByTime(3000);
    expect(audio.writes.every((written) => written !== 0)).toBe(true);

    // Metadata finally lands: the target is applied as-is and the seek settles.
    audio.setReadyState(1);
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBeCloseTo(FIXED_CHUNK_OFFSET, 3);
    expect(audio.writes).not.toContain(0);
    pendingEngine.destroy();
  });

  it('plays the station tail that the catalog duration cannot address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 2870 s = catalog duration (2810) + 60 s: the same tail the live probe uses.
    vi.setSystemTime(new Date(MASTER_BROADCAST_EPOCH + 2_870_000));

    const tailEngine = new RadioEngine({
      stations: [playbackFm],
      sfx: mockSFX,
      getChunkMeta: (gameId, stationId) =>
        gameId === 'gtasa' && stationId === 'playback-fm' ? PLAYBACK_FM_META : null,
      chunkStorage: emptyStorage,
    });

    await tailEngine.playStation(playbackFm, true);

    // Catalog geometry loops at 2810 s, so 2870 wraps to second 60 -> chunk 000.
    // The manifest keeps the real 3168.054 s loop and addresses chunk 023.
    const catalogTimeline = resolveTimeline(playbackFm, null);
    expect(locate(catalogTimeline, 2870).index).toBe(0);
    expect(locate(resolveTimeline(playbackFm, PLAYBACK_FM_META), 2870).index).toBe(23);

    const audio = tailEngine.getAudioElement();
    expect(audio.src).toBe('https://gta-media.pulsr.top/chunks/gtasa/playback-fm/023.mp3');
    expect(audio.src).not.toContain('/000.mp3');
    expect(tailEngine.getState().error).toBeNull();
    expect(tailEngine.getState().currentTime).toBeCloseTo(2870, 3);
    tailEngine.destroy();
  });

  it('uses the manifest duration for the live offset', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(MASTER_BROADCAST_EPOCH + 2_900_000));

    const manifestEngine = new RadioEngine({
      stations: [playbackFm],
      sfx: mockSFX,
      getChunkMeta: () => PLAYBACK_FM_META,
      chunkStorage: emptyStorage,
    });

    await manifestEngine.playStation(playbackFm, true);
    const state = manifestEngine.getState();

    // 3168.054 s (ffprobe), not 2810 s (catalog): otherwise the offset wraps early.
    expect(state.duration).toBeCloseTo(PLAYBACK_FM_META.duration, 3);
    expect(state.duration).not.toBe(playbackFm.duration);
    expect(state.currentTime).toBeCloseTo(2900, 3);
    expect(state.currentTime).toBeLessThan(state.duration);
    manifestEngine.destroy();
  });

  it('keeps state.currentTime absolute while audio.currentTime is chunk-local', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXED_CLOCK_MS));

    const audio = createFakeAudio();
    const absoluteEngine = new RadioEngine({
      audio,
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    await absoluteEngine.playStation(mockStations[0], true);
    expect(audio.src).toContain('/021.mp3');

    // Chunk-local 87 s inside chunk 21 == absolute 2607 s.
    audio.currentTime = 87;
    audio.dispatchEvent(new Event('timeupdate'));

    const state = absoluteEngine.getState();
    expect(state.currentTime).toBe(2607);
    expect(state.currentCue?.song).toBe('Plush');
    absoluteEngine.destroy();
  });

  it('falls back to the archive.org stream when the chunk request fails', async () => {
    const station = mockStations[0];
    await engine.playStation(station);

    const audio = engine.getAudioElement();
    expect(audio.src).toContain('/chunks/');

    // 404 on the chunk: the element fires `error`.
    audio.dispatchEvent(new Event('error'));
    await new Promise((r) => setTimeout(r, 0));

    expect(audio.src).toBe(station.audioUrl);
    expect(engine.getState().error).toBeNull();
    expect(audio.loop).toBe(true);

    // Exactly one fallback: a second failure is surfaced, never retried.
    audio.dispatchEvent(new Event('error'));
    expect(audio.src).toBe(station.audioUrl);
    expect(engine.getState().error).not.toBeNull();
  });

  it('handles pause, resume, and togglePlay lifecycle', async () => {
    const station = mockStations[0];
    await engine.playStation(station);
    expect(engine.getState().isPlaying).toBe(true);

    engine.pause();
    expect(engine.getState().isPlaying).toBe(false);

    await engine.resume();
    expect(engine.getState().isPlaying).toBe(true);

    engine.togglePlay();
    expect(engine.getState().isPlaying).toBe(false);

    engine.togglePlay();
    expect(engine.getState().isPlaying).toBe(true);
  });

  it('resumes playing first station if resume() is called with no active station', async () => {
    expect(engine.getState().currentStation).toBeNull();
    await engine.resume();
    expect(engine.getState().currentStation?.id).toBe(mockStations[0].id);
  });

  it('sets and clamps volume between 0 and 1', () => {
    const audio = engine.getAudioElement();

    engine.setVolume(0.5);
    expect(engine.getVolume()).toBe(0.5);
    expect(audio.volume).toBe(0.5);
    expect(engine.getState().isMuted).toBe(false);

    engine.setVolume(1.5);
    expect(engine.getVolume()).toBe(1);
    expect(audio.volume).toBe(1);

    engine.setVolume(-0.5);
    expect(engine.getVolume()).toBe(0);
    expect(audio.volume).toBe(0);
    expect(engine.getState().isMuted).toBe(true);
  });

  it('controls mute state via setMuted and toggleMute', () => {
    const audio = engine.getAudioElement();

    engine.setMuted(true);
    expect(engine.getState().isMuted).toBe(true);
    expect(audio.muted).toBe(true);

    engine.toggleMute();
    expect(engine.getState().isMuted).toBe(false);
    expect(audio.muted).toBe(false);
  });

  it('seeks to target time and updates currentCue', async () => {
    const station = mockStations[0];
    await engine.playStation(station);

    engine.seek(220); // within DJ banter
    expect(engine.getState().currentTime).toBe(220);
    expect(engine.getState().currentCue?.song).toBe('Radio X DJ Banter');
  });

  it('switches to the chunk that contains the seek target', async () => {
    const station = mockStations[0];
    await engine.playStation(station, false);
    const audio = engine.getAudioElement();
    expect(audio.src).toContain('/000.mp3');

    engine.seek(3000);
    await new Promise((r) => setTimeout(r, 0));

    // 3000 s -> chunk 25, offset 0.
    expect(audio.src).toContain('/025.mp3');
    expect(engine.getState().currentTime).toBe(3000);
  });

  it('subscribes to state updates and immediately receives initial state', async () => {
    const subscriber = vi.fn();
    const unsubscribe = engine.subscribe(subscriber);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const initialCall = subscriber.mock.calls[0][0] as EngineState;
    expect(initialCall.isPlaying).toBe(false);

    await engine.playStation(mockStations[0]);
    expect(subscriber).toHaveBeenCalled();

    unsubscribe();
    const callCountAfterUnsubscribe = subscriber.mock.calls.length;

    engine.setVolume(0.3);
    expect(subscriber.mock.calls.length).toBe(callCountAfterUnsubscribe);
  });

  it('updates currentCue and currentTime on audio timeupdate events', async () => {
    const station = mockStations[0];
    // Start at the top of the station so the chunk-local clock equals the absolute one.
    await engine.playStation(station, false);

    const audio = engine.getAudioElement();
    audio.currentTime = 100;
    audio.dispatchEvent(new Event('timeupdate'));

    const state = engine.getState();
    expect(state.currentTime).toBe(100);
    expect(state.currentCue?.song).toBe('Rusty Cage');
    expect(state.currentCue?.artist).toBe('Soundgarden');
  });

  it('handles waiting and canplay events for loading states', async () => {
    const audio = engine.getAudioElement();

    audio.dispatchEvent(new Event('waiting'));
    expect(engine.getState().isLoading).toBe(true);

    audio.dispatchEvent(new Event('canplay'));
    expect(engine.getState().isLoading).toBe(false);
  });

  it('handles playback error event', async () => {
    const audio = engine.getAudioElement();
    Object.defineProperty(audio, 'error', {
      value: { message: 'Network decode error' },
      configurable: true,
    });

    audio.dispatchEvent(new Event('error'));
    expect(engine.getState().isPlaying).toBe(false);
    expect(engine.getState().error).toBe('Network decode error');
  });

  it('disposes the chunk controller and revokes its blob URL on destroy', async () => {
    const station = mockStations[0];
    const mockBlob = new Blob(['bytes'], { type: 'audio/mp3' });
    const cachedEngine = new RadioEngine({
      stations: mockStations,
      sfx: mockSFX,
      getChunkMeta: () => null,
      chunkStorage: {
        saveChunkBlob: async () => {},
        getChunkBlob: async () => mockBlob,
      },
    });

    await cachedEngine.playStation(station);
    expect(cachedEngine.getAudioElement().src).toContain('blob:');

    cachedEngine.destroy();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-uuid');
    expect(cachedEngine.getCurrentBlobUrl()).toBeNull();
  });

  it('keeps audio.loop false while chunked', async () => {
    await engine.playStation(mockStations[0]);
    expect(engine.getAudioElement().loop).toBe(false);
  });

  it('starts continuous static hiss when connecting and stops with fade on playback', async () => {
    const mockAudio = createFakeAudio();
    const hissSFX = new RadioSFX();
    vi.spyOn(hissSFX, 'startStaticHiss');
    vi.spyOn(hissSFX, 'stopStaticHiss');
    const hissEngine = new RadioEngine({
      audio: mockAudio,
      sfx: hissSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    await hissEngine.playStation(mockStations[0], true);
    expect(hissSFX.startStaticHiss).toHaveBeenCalled();

    mockAudio.dispatchEvent(new Event('playing'));
    expect(hissSFX.stopStaticHiss).toHaveBeenCalledWith(60);

    hissEngine.destroy();
  });

  it('stops continuous static hiss immediately on pause or error', async () => {
    const mockAudio = createFakeAudio();
    const hissSFX = new RadioSFX();
    vi.spyOn(hissSFX, 'startStaticHiss');
    vi.spyOn(hissSFX, 'stopStaticHiss');
    const hissEngine = new RadioEngine({
      audio: mockAudio,
      sfx: hissSFX,
      getChunkMeta: () => null,
      chunkStorage: emptyStorage,
    });

    await hissEngine.playStation(mockStations[0], true);
    expect(hissSFX.startStaticHiss).toHaveBeenCalled();

    hissEngine.pause();
    expect(hissSFX.stopStaticHiss).toHaveBeenCalledWith(0);

    hissEngine.destroy();
  });
});
