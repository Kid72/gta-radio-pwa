import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RadioEngine, EngineState } from './radioEngine';
import { RadioSFX } from './sfx';
import { Station } from '../types/radio';
import { saveStationAudio, clearAllCachedStations } from '../storage/db';

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

function createMockAudio(): HTMLAudioElement {
  const listeners: Record<string, EventListener[]> = {};
  let _currentTime = 0;
  let _volume = 1;
  let _muted = false;
  let _src = '';

  const audio = {
    get currentTime() {
      return _currentTime;
    },
    set currentTime(val: number) {
      _currentTime = val;
    },
    duration: 3600,
    get volume() {
      return _volume;
    },
    set volume(val: number) {
      _volume = val;
    },
    get muted() {
      return _muted;
    },
    set muted(val: boolean) {
      _muted = val;
    },
    get src() {
      return _src;
    },
    set src(val: string) {
      _src = val;
    },
    preload: '',
    loop: false,
    play: vi.fn().mockImplementation(() => Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn().mockReturnValue(''),
    addEventListener: vi.fn((event: string, cb: EventListener) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: EventListener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      const cbs = listeners[event.type] || [];
      cbs.forEach((cb) => cb(event));
      return true;
    }),
  } as unknown as HTMLAudioElement;

  return audio;
}

function createMockAudioContext() {
  const mockGain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      value: 1,
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockFilter = {
    type: '',
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    Q: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
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
  it('synthesizes a swept band-pass static burst with a self-terminating gain envelope', () => {
    const { ctx, mockFilter, mockGain, mockBufferSource } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.playTuningStatic(160);

    expect(ctx.createBuffer).toHaveBeenCalledWith(1, expect.any(Number), 44100);
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.createBiquadFilter).toHaveBeenCalled();
    expect(mockFilter.type).toBe('bandpass');
    // frequency sweep: 800 Hz -> 3200 Hz (45% in) -> 1200 Hz (end of the burst)
    expect(mockFilter.frequency.setValueAtTime).toHaveBeenCalledWith(800, 5.0);
    expect(mockFilter.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      3200,
      5.0 + 0.16 * 0.45
    );
    expect(mockFilter.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      1200,
      5.0 + 0.16
    );
    expect(mockGain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(mockGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0008, 5.16);
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
      55,
      5.0 + 0.012
    );
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.15, 5.0);
    expect(mockGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.001, 5.0 + 0.012);
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalledWith(5.0 + 0.012);
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

  beforeEach(async () => {
    await clearAllCachedStations();

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
    });
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  it('initializes native HTML5 audio element with playsinline and preload attributes', () => {
    const audio = engine.getAudioElement();
    expect(audio).toBeDefined();
    expect(audio.getAttribute('playsinline')).toBe('');
    expect(audio.getAttribute('webkit-playsinline')).toBe('');
    expect(audio.preload).toBe('auto');
    expect(audio.loop).toBe(true);
    expect(engine.getVolume()).toBe(0.8);
  });

  it('defaults to catalog stations if no custom station list is passed', () => {
    const defaultEngine = new RadioEngine();
    expect(defaultEngine.getStations().length).toBeGreaterThan(0);
    defaultEngine.destroy();
  });

  it('plays uncached station by streaming from audioUrl and sets epoch position', async () => {
    const station = mockStations[0];
    await engine.playStation(station, true);

    const audio = engine.getAudioElement();
    expect(mockSFX.playClick).toHaveBeenCalled();
    expect(mockSFX.playTuningStatic).toHaveBeenCalled();
    expect(audio.src).toBe(station.audioUrl);
    expect(audio.play).toHaveBeenCalled();

    const state = engine.getState();
    expect(state.currentStation?.id).toBe(station.id);
    expect(state.isPlaying).toBe(true);
    expect(state.isOffline).toBe(false);
    expect(state.currentTime).toBeGreaterThanOrEqual(0);
    expect(state.duration).toBe(station.duration);
    expect(state.currentCue).toBeDefined();
  });

  it('supports playing station from beginning when instantLiveSync is false', async () => {
    const station = mockStations[0];
    await engine.playStation(station, false);

    const audio = engine.getAudioElement();
    expect(audio.currentTime).toBe(0);
    expect(engine.getState().currentTime).toBe(0);
  });

  it('plays cached station using URL.createObjectURL and marks isOffline true', async () => {
    const station = mockStations[1];
    const mockBlob = new Blob(['sample-mp3-bytes'], { type: 'audio/mp3' });

    await saveStationAudio({
      gameId: station.gameId,
      stationId: station.id,
      blob: mockBlob,
      sizeBytes: mockBlob.size,
      downloadedAt: Date.now(),
    });

    await engine.playStation(station);

    const audio = engine.getAudioElement();
    expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
    expect(audio.src).toContain('blob:');
    expect(engine.getState().isOffline).toBe(true);
    expect(engine.getCurrentBlobUrl()).toBe('blob:mock-uuid');
  });

  it('revokes previous Blob URL when switching stations to prevent memory leaks', async () => {
    const station1 = mockStations[0];
    const station2 = mockStations[1];
    const mockBlob = new Blob(['bytes'], { type: 'audio/mp3' });

    await saveStationAudio({
      gameId: station1.gameId,
      stationId: station1.id,
      blob: mockBlob,
      sizeBytes: mockBlob.size,
      downloadedAt: Date.now(),
    });

    await engine.playStation(station1);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    // Switch to station 2 (uncached)
    await engine.playStation(station2);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-uuid');
    expect(engine.getCurrentBlobUrl()).toBeNull();
    expect(engine.getState().isOffline).toBe(false);
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

  it('seeks to target live epoch on loadedmetadata during nextStationSync', async () => {
    const audio = engine.getAudioElement();
    // Simulate initial zero currentTime before metadata loaded
    engine.nextStationSync();
    expect(engine.getState().currentStation?.id).toBe('radiox');

    // Simulate loadedmetadata event from audio element
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBeGreaterThanOrEqual(0);
  });

  it('upgrades nextStationSync to offline cached blob in the background', async () => {
    const station2 = mockStations[1];
    const mockBlob = new Blob(['audio-data'], { type: 'audio/mp3' });
    await saveStationAudio({
      gameId: station2.gameId,
      stationId: station2.id,
      blob: mockBlob,
      sizeBytes: mockBlob.size,
      downloadedAt: Date.now(),
    });

    await engine.playStation(mockStations[0]);
    engine.nextStationSync(); // tunes to station 2

    // Wait for async IndexedDB cache check to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
    expect(engine.getState().isOffline).toBe(true);
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

  it('ducks the old station and fades the new one in without overriding user volume or mute', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const audio = engine.getAudioElement();
    engine.setVolume(0.6);

    await engine.playStation(mockStations[0], false);
    expect(audio.volume).toBe(0); // silence under the static burst

    vi.advanceTimersByTime(400);
    expect(audio.volume).toBeCloseTo(0.6, 5); // ramps to the user's level, never to 1

    engine.setMuted(true);
    await engine.playStation(mockStations[1], false);
    vi.advanceTimersByTime(400);
    expect(audio.volume).toBeCloseTo(0.6, 5);
    expect(audio.muted).toBe(true);

    vi.useRealTimers();
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
    await engine.playStation(station);

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

  it('cleans up resources and revokes blob URL on destroy', async () => {
    const station = mockStations[0];
    const mockBlob = new Blob(['bytes'], { type: 'audio/mp3' });
    await saveStationAudio({
      gameId: station.gameId,
      stationId: station.id,
      blob: mockBlob,
      sizeBytes: mockBlob.size,
      downloadedAt: Date.now(),
    });

    await engine.playStation(station);
    expect(engine.getCurrentBlobUrl()).toBe('blob:mock-uuid');

    engine.destroy();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-uuid');
    expect(engine.getCurrentBlobUrl()).toBeNull();
  });

  it('falls back to stream start (currentTime = 0) if seeking stalls over 1500ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const mockAudio = createMockAudio();
    const engine = new RadioEngine({ audio: mockAudio });
    const sampleStation = mockStations[0];

    await engine.playStation(sampleStation, true);
    expect(mockAudio.currentTime).toBeGreaterThan(0);

    // Advance timer beyond 1500ms without firing 'canplay' or 'playing'
    vi.advanceTimersByTime(1600);
    expect(mockAudio.currentTime).toBe(0);
    expect(mockAudio.removeEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));

    engine.destroy();
    vi.useRealTimers();
  });

  it('does not reset currentTime to 0 if playback begins before 1500ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const mockAudio = createMockAudio();
    const engine = new RadioEngine({ audio: mockAudio });
    const sampleStation = mockStations[0];

    await engine.playStation(sampleStation, true);
    expect(mockAudio.currentTime).toBeGreaterThan(0);
    const initialTime = mockAudio.currentTime;

    // Stream connects within 800ms
    vi.advanceTimersByTime(800);
    mockAudio.dispatchEvent(new Event('playing'));

    // Advance past 1500ms
    vi.advanceTimersByTime(1000);
    expect(mockAudio.currentTime).toBe(initialTime);

    engine.destroy();
    vi.useRealTimers();
  });

  it('starts continuous static hiss when connecting and stops with fade on playback', async () => {
    const mockAudio = createMockAudio();
    const mockSFX = new RadioSFX();
    vi.spyOn(mockSFX, 'startStaticHiss');
    vi.spyOn(mockSFX, 'stopStaticHiss');
    const engine = new RadioEngine({ audio: mockAudio, sfx: mockSFX });
    const sampleStation = mockStations[0];

    await engine.playStation(sampleStation, true);
    expect(mockSFX.startStaticHiss).toHaveBeenCalled();

    mockAudio.dispatchEvent(new Event('playing'));
    expect(mockSFX.stopStaticHiss).toHaveBeenCalledWith(60);

    engine.destroy();
  });

  it('stops continuous static hiss immediately on pause or error', async () => {
    const mockAudio = createMockAudio();
    const mockSFX = new RadioSFX();
    vi.spyOn(mockSFX, 'startStaticHiss');
    vi.spyOn(mockSFX, 'stopStaticHiss');
    const engine = new RadioEngine({ audio: mockAudio, sfx: mockSFX });
    const sampleStation = mockStations[0];

    await engine.playStation(sampleStation, true);
    expect(mockSFX.startStaticHiss).toHaveBeenCalled();

    engine.pause();
    expect(mockSFX.stopStaticHiss).toHaveBeenCalledWith(0);

    engine.destroy();
  });
});
