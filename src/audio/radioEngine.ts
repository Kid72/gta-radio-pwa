import { Station, EngineState, ChunkStorage, GameId } from '../types/radio';
import { getStationSecondForDuration } from './epochClock';
import { getCurrentCue } from '../utils/trackCues';
import { getChunkBlob, saveChunkBlob } from '../storage/db';
import { getAllStations, getStationsForGame } from '../data/catalog';
import { getChunkMeta as getManifestChunkMeta, type ChunkMeta } from '../data/chunkManifest';
import { ChunkedPlayback } from './chunkedPlayback';
import { chunkUrl, locate, resolveTimeline, type StationTimeline } from './chunkedSource';
import { sfx, RadioSFX } from './sfx';

export type { EngineState };

export interface RadioEngineOptions {
  audio?: HTMLAudioElement;
  stations?: Station[];
  initialVolume?: number;
  sfx?: RadioSFX;
  /** Manifest geometry injection (tests use a stub; production reads `data/chunkManifest`). */
  getChunkMeta?: (gameId: GameId, stationId: string) => ChunkMeta | null;
  /** Offline chunk storage injection (tests use a stub; production reads IndexedDB). */
  chunkStorage?: ChunkStorage;
}

export class RadioEngine {
  private audio: HTMLAudioElement;
  private stations: Station[] = [];
  private requestId: number = 0;
  private isDestroyed: boolean = false;
  private sfxInstance: RadioSFX;
  private subscribers: Set<(state: EngineState) => void> = new Set();

  /** Chunk controller: owns `audio.src`, the current chunk and the position. */
  private controller: ChunkedPlayback | null = null;
  /** True while the chunked source drives playback; false after a one-time stream fallback. */
  private chunkMode: boolean = false;
  /** Request id that already spent its single `station.audioUrl` fallback. */
  private fallbackGeneration: number | null = null;

  private readonly getChunkMetaFn: (gameId: GameId, stationId: string) => ChunkMeta | null;
  private readonly chunkStorage: ChunkStorage;

  private state: EngineState = {
    currentStation: null,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isOffline: false,
    currentCue: null,
    coverArtUrl: null,
    error: null,
  };

  constructor(options?: RadioEngineOptions) {
    this.stations =
      options?.stations && options.stations.length > 0
        ? [...options.stations]
        : getAllStations();
    this.sfxInstance = options?.sfx || sfx;
    this.getChunkMetaFn = options?.getChunkMeta || getManifestChunkMeta;
    this.chunkStorage =
      options?.chunkStorage || {
        saveChunkBlob,
        getChunkBlob,
      };

    if (options?.audio) {
      this.audio = options.audio;
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.audio = document.createElement('audio');
    } else {
      // Fallback mock for non-DOM / SSR environments
      this.audio = {
        play: () => Promise.resolve(),
        pause: () => {},
        load: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        src: '',
      } as unknown as HTMLAudioElement;
    }

    if (this.audio && typeof this.audio.setAttribute === 'function') {
      // Native attributes required to preserve iOS background audio and inline playback
      this.audio.setAttribute('playsinline', '');
      this.audio.setAttribute('webkit-playsinline', '');
    }
    if (this.audio) {
      this.audio.preload = 'auto';
      // Looping is the job of the chunk controller (last chunk -> 000), never of the element.
      this.audio.loop = false;

      const initVol =
        options?.initialVolume !== undefined
          ? Math.max(0, Math.min(1, options.initialVolume))
          : 1;
      this.audio.volume = initVol;
      this.state.volume = initVol;
      this.state.isMuted = initVol === 0;

      this.attachAudioListeners();
    }

    this.controller = this.createController();
  }

  // --- Chunk controller wiring ---

  private createController(): ChunkedPlayback {
    return new ChunkedPlayback({
      audio: this.audio,
      storage: this.chunkStorage,
      getChunkMeta: this.getChunkMetaFn,
      prefetchChunks: 1,
      onLoadingChange: (loading) => {
        if (this.isDestroyed) return;
        this.state.isLoading = loading;
        this.notify();
      },
      onError: (message) => {
        this.handleChunkFailure(message);
      },
    });
  }

  private ensureController(): ChunkedPlayback {
    if (!this.controller) this.controller = this.createController();
    return this.controller;
  }

  private timelineFor(station: Station): StationTimeline {
    let meta: ChunkMeta | null = null;
    try {
      meta = this.getChunkMetaFn(station.gameId, station.id);
    } catch {
      meta = null;
    }
    return resolveTimeline(station, meta);
  }

  /** Absolute broadcast second: chunk start + chunk-local time, or the stream clock. */
  private currentAbsoluteSecond(): number {
    if (this.chunkMode && this.controller) {
      const absolute = this.controller.getAbsoluteSecond();
      if (Number.isFinite(absolute)) return absolute;
    }
    const local = this.audio?.currentTime || 0;
    return Number.isFinite(local) && local > 0 ? local : 0;
  }

  /**
   * One chunk failure = one switch to the full station stream at the same live
   * second. Never retried, never looped: the next tune gets a fresh chunk attempt.
   */
  private handleChunkFailure(message: string): void {
    if (this.isDestroyed || !this.chunkMode) return;

    const station = this.state.currentStation;
    if (!station) return;

    if (this.fallbackGeneration === this.requestId) {
      // The fallback itself is failing: surface it instead of spinning.
      this.state.isPlaying = false;
      this.state.isLoading = false;
      this.state.error = message;
      this.notify();
      return;
    }
    this.fallbackGeneration = this.requestId;
    void this.fallbackToStream(station, message);
  }

  /** Swap the chunked source for `station.audioUrl`, keeping the live offset. */
  private async fallbackToStream(station: Station, message: string | null): Promise<void> {
    if (this.isDestroyed || this.state.currentStation?.id !== station.id) return;

    const absolute = this.chunkMode && this.controller
      ? this.controller.getAbsoluteSecond()
      : this.state.currentTime;
    const streamDuration = station.duration > 0 ? station.duration : 0;
    const offset =
      streamDuration > 0
        ? ((absolute % streamDuration) + streamDuration) % streamDuration
        : Math.max(0, absolute);

    this.chunkMode = false;
    const controller = this.controller;
    this.controller = null;
    controller?.dispose();

    this.state.isOffline = false;
    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    if (!this.audio) return;

    try {
      this.audio.loop = true;
      this.audio.src = station.audioUrl;
      try {
        this.audio.currentTime = offset;
      } catch {}
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      if (this.isDestroyed) return;
      this.state.currentTime = offset;
      this.state.isPlaying = true;
      this.state.isLoading = false;
      this.state.error = null;
      this.notify();
    } catch (err: any) {
      if (this.isDestroyed) return;
      this.sfxInstance.stopStaticHiss(0);
      this.state.isPlaying = false;
      this.state.isLoading = false;
      this.state.error = err?.message || message || 'Playback failed';
      this.notify();
    }
  }

  // --- HTML5 Audio Event Handlers ---

  private onTimeUpdate = () => {
    if (!this.state.currentStation) return;

    // Absolute broadcast second, never the ~120 s chunk-local clock.
    const currentTime = this.currentAbsoluteSecond();
    const currentCue = getCurrentCue(this.state.currentStation, currentTime);

    this.state.currentTime = currentTime;
    this.state.currentCue = currentCue;
    if (this.chunkMode && this.controller) {
      this.state.isOffline = this.controller.isOfflineSource();
    }
    this.notify();
  };

  private onPlaying = () => {
    this.sfxInstance.stopStaticHiss(60);
    this.state.isPlaying = true;
    this.state.isLoading = false;
    this.state.error = null;
    if (this.chunkMode && this.controller) {
      this.state.isOffline = this.controller.isOfflineSource();
    }
    this.notify();
  };

  private onPause = () => {
    this.sfxInstance.stopStaticHiss(0);
    this.state.isPlaying = false;
    this.notify();
  };

  private onWaiting = () => {
    this.state.isLoading = true;
    this.notify();
  };

  private onCanPlay = () => {
    this.sfxInstance.stopStaticHiss(60);
    this.state.isLoading = false;
    this.notify();
  };

  private onError = () => {
    this.sfxInstance.stopStaticHiss(0);
    this.state.isPlaying = false;
    this.state.isLoading = false;

    if (this.chunkMode && this.controller) {
      // Chunk failures are owned by the controller: it reports them once and the
      // engine answers with a single stream fallback (never a retry loop).
      this.notify();
      return;
    }

    this.state.error = this.audio.error?.message || 'Audio playback error';
    this.notify();
  };

  private attachAudioListeners(): void {
    if (!this.audio || typeof this.audio.addEventListener !== 'function') return;
    this.audio.addEventListener('timeupdate', this.onTimeUpdate);
    this.audio.addEventListener('playing', this.onPlaying);
    this.audio.addEventListener('pause', this.onPause);
    this.audio.addEventListener('waiting', this.onWaiting);
    this.audio.addEventListener('canplay', this.onCanPlay);
    this.audio.addEventListener('error', this.onError);
  }

  private removeAudioListeners(): void {
    if (!this.audio || typeof this.audio.removeEventListener !== 'function') return;
    this.audio.removeEventListener('timeupdate', this.onTimeUpdate);
    this.audio.removeEventListener('playing', this.onPlaying);
    this.audio.removeEventListener('pause', this.onPause);
    this.audio.removeEventListener('waiting', this.onWaiting);
    this.audio.removeEventListener('canplay', this.onCanPlay);
    this.audio.removeEventListener('error', this.onError);
  }

  // --- Station Navigation Helpers ---

  private ensureStationInList(station: Station): void {
    if (!this.stations.some((s) => s.id === station.id)) {
      const gameStations = getStationsForGame(station.gameId);
      this.stations =
        gameStations.length > 0 ? [...gameStations] : [station, ...this.stations];
    }
  }

  private cachedKeys: Set<string> = new Set();

  setCachedKeys(keys: Set<string> | string[]): void {
    this.cachedKeys = new Set(keys);
  }

  private getPlayableStations(): Station[] {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline && this.cachedKeys.size > 0) {
      const offlinePlayable = this.stations.filter(
        (s) => this.cachedKeys.has(`${s.gameId}:${s.id}`) || this.cachedKeys.has(s.id)
      );
      if (offlinePlayable.length > 0) {
        return offlinePlayable;
      }
    }
    return this.stations;
  }

  private getNextStation(): Station | null {
    const list = this.getPlayableStations();
    if (list.length === 0) return null;
    if (!this.state.currentStation) return list[0];
    const currentIndex = list.findIndex(
      (s) => s.id === this.state.currentStation!.id
    );
    if (currentIndex === -1) return list[0];
    return list[(currentIndex + 1) % list.length];
  }

  private getPreviousStation(): Station | null {
    const list = this.getPlayableStations();
    if (list.length === 0) return null;
    if (!this.state.currentStation) return list[list.length - 1];
    const currentIndex = list.findIndex(
      (s) => s.id === this.state.currentStation!.id
    );
    if (currentIndex === -1) return list[list.length - 1];
    return list[(currentIndex - 1 + list.length) % list.length];
  }

  // --- Playback Engine ---

  /**
   * Primary station player.
   *
   * The live position is computed from the manifest timeline (real ffprobe duration,
   * not the catalog guess) and handed to the chunk controller, which owns `audio.src`
   * and the position. Nothing here ever resets the position: a seek that cannot be
   * applied yet stays pending inside the controller until metadata arrives.
   */
  async playStation(station: Station, instantLiveSync: boolean = true): Promise<void> {
    if (this.isDestroyed) return;

    const reqId = ++this.requestId;

    this.sfxInstance.stopStaticHiss(0);

    // Trigger authentic mechanical switch and static bursts
    this.sfxInstance.playClick();
    this.sfxInstance.playTuningStatic();

    this.ensureStationInList(station);

    const timeline = this.timelineFor(station);

    // If tuning to Radio Off or station has no audio source, pause cleanly without error
    if (!station.audioUrl || station.id === 'radio-off' || timeline.duration === 0) {
      this.pause();
      this.chunkMode = false;
      this.controller?.dispose();
      this.controller = this.createController();
      this.state.currentStation = station;
      this.state.isPlaying = false;
      this.state.isLoading = false;
      this.state.currentCue = null;
      this.state.isOffline = false;
      this.state.error = null;
      this.notify();
      return;
    }

    // Mask connection latency with continuous soft static hiss
    this.sfxInstance.startStaticHiss();

    const targetTime = instantLiveSync
      ? getStationSecondForDuration(station, timeline.duration)
      : 0;

    // Set immediate UI state
    this.state.currentStation = station;
    this.state.currentTime = targetTime;
    this.state.duration = timeline.duration;
    this.state.currentCue = getCurrentCue(station, targetTime);
    this.state.isLoading = true;
    this.state.isOffline = false;
    this.state.error = null;
    this.notify();

    this.chunkMode = true;
    const controller = this.ensureController();

    try {
      await controller.start(station, targetTime, reqId);
    } catch (err: any) {
      if (reqId !== this.requestId || this.isDestroyed) return;
      this.handleChunkFailure(err?.message || 'Chunk playback failed');
      return;
    }

    if (reqId !== this.requestId || this.isDestroyed) return;
    this.state.isOffline = controller.isOfflineSource();
    this.notify();
  }

  /**
   * Synchronous station switch specifically designed for Apple CarPlay and car steering wheel controls.
   *
   * `chunkUrl` is a pure function, so the chunk source and `play()` happen in the same
   * tick as the user activation. The controller then adopts the chunk that is already
   * on the element instead of reloading it.
   */
  private playStationSync(station: Station): void {
    if (this.isDestroyed) return;

    const reqId = ++this.requestId;

    this.sfxInstance.stopStaticHiss(0);

    this.sfxInstance.playClick();
    this.sfxInstance.playTuningStatic();

    this.ensureStationInList(station);

    const timeline = this.timelineFor(station);

    // If tuning to Radio Off or station has no audio source, pause cleanly without error
    if (!station.audioUrl || station.id === 'radio-off' || timeline.duration === 0) {
      this.pause();
      this.chunkMode = false;
      this.controller?.dispose();
      this.controller = this.createController();
      this.state.currentStation = station;
      this.state.isPlaying = false;
      this.state.isLoading = false;
      this.state.currentCue = null;
      this.state.isOffline = false;
      this.state.error = null;
      this.notify();
      return;
    }

    // Mask connection latency with continuous soft static hiss
    this.sfxInstance.startStaticHiss();

    const liveSecond = getStationSecondForDuration(station, timeline.duration);
    // Both calls are synchronous and pure — no await before play().
    const position = locate(timeline, liveSecond);
    const source = chunkUrl(station.gameId, station.id, position.index);

    this.state.currentStation = station;
    this.state.currentTime = liveSecond;
    this.state.duration = timeline.duration;
    this.state.currentCue = getCurrentCue(station, liveSecond);
    this.state.isLoading = true;
    this.state.isOffline = false;
    this.state.error = null;
    this.notify();

    if (!source) {
      this.chunkMode = true;
      this.handleChunkFailure(`No chunk URL for ${station.id} at ${Math.floor(liveSecond)} c`);
      return;
    }

    this.chunkMode = true;
    const controller = this.ensureController();

    // CarPlay contract: source and play() in this tick, before any async work.
    this.audio.loop = false;
    this.audio.src = source;

    let playPromise: Promise<void> | undefined;
    try {
      playPromise = this.audio.play() as Promise<void> | undefined;
    } catch (err: any) {
      this.handleChunkFailure(err?.message || 'Playback failed');
      return;
    }

    // Adopt the chunk that is already loading: no second `src` assignment, so the
    // synchronous start is not thrown away.
    controller.adopt(station, liveSecond, reqId);

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (reqId !== this.requestId || this.isDestroyed) return;
          this.state.isPlaying = true;
          this.state.isLoading = false;
          this.state.isOffline = controller.isOfflineSource();
          this.notify();
        })
        .catch((err: any) => {
          if (reqId !== this.requestId || this.isDestroyed) return;
          this.sfxInstance.stopStaticHiss(0);
          this.state.isPlaying = false;
          this.state.isLoading = false;
          this.state.error = err?.message || 'Playback failed';
          this.notify();
        });
    } else {
      this.state.isPlaying = true;
      this.state.isLoading = false;
      this.notify();
    }
  }

  nextStation(): void {
    const next = this.getNextStation();
    if (next) {
      this.playStation(next).catch(() => {});
    }
  }

  previousStation(): void {
    const prev = this.getPreviousStation();
    if (prev) {
      this.playStation(prev).catch(() => {});
    }
  }

  /**
   * Synchronous next-station handler for CarPlay steering wheel button presses.
   */
  nextStationSync(): void {
    const next = this.getNextStation();
    if (next) {
      this.playStationSync(next);
    }
  }

  /**
   * Synchronous previous-station handler for CarPlay steering wheel button presses.
   */
  previousStationSync(): void {
    const prev = this.getPreviousStation();
    if (prev) {
      this.playStationSync(prev);
    }
  }

  pause(): void {
    this.sfxInstance.stopStaticHiss(0);
    this.controller?.stop();
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {}
    }
    this.state.isPlaying = false;
    this.notify();
  }

  async resume(): Promise<void> {
    if (this.isDestroyed) return;

    if (!this.state.currentStation) {
      if (this.stations.length > 0) {
        await this.playStation(this.stations[0]);
      }
      return;
    }

    const station = this.state.currentStation;
    const timeline = this.timelineFor(station);

    // Re-lock to the simulated universal live broadcast epoch
    const liveTime = getStationSecondForDuration(station, timeline.duration);
    this.state.duration = timeline.duration;
    this.state.currentTime = liveTime;
    this.state.currentCue = getCurrentCue(station, liveTime);

    if (this.chunkMode) {
      const controller = this.ensureController();
      const generation = ++this.requestId;
      try {
        await controller.seek(liveTime, generation);
        if (generation !== this.requestId || this.isDestroyed) return;
        this.state.isOffline = controller.isOfflineSource();
        this.state.isPlaying = true;
        this.state.error = null;
        this.notify();
      } catch (err: any) {
        if (generation !== this.requestId) return;
        this.state.isPlaying = false;
        this.state.error = err?.message || 'Resume failed';
        this.notify();
      }
      return;
    }

    if (this.audio) {
      try {
        this.audio.currentTime = liveTime;
      } catch {}
      try {
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        this.state.isPlaying = true;
        this.state.error = null;
        this.notify();
      } catch (err: any) {
        this.state.isPlaying = false;
        this.state.error = err?.message || 'Resume failed';
        this.notify();
      }
    }
  }

  togglePlay(): void {
    if (this.state.isPlaying || (this.audio && !this.audio.paused && this.audio.currentTime > 0)) {
      this.pause();
    } else {
      this.resume().catch(() => {});
    }
  }

  seek(seconds: number): void {
    if (!this.state.currentStation) return;
    const clamped = Math.max(0, Math.min(this.state.duration, seconds));
    this.state.currentTime = clamped;
    this.state.currentCue = getCurrentCue(this.state.currentStation, clamped);
    this.notify();

    if (this.chunkMode) {
      // The controller decides whether the chunk has to change; the engine never
      // touches `audio.currentTime` while chunked.
      const controller = this.ensureController();
      void controller.seek(clamped, ++this.requestId);
      return;
    }

    if (this.audio) {
      try {
        this.audio.currentTime = clamped;
      } catch {}
    }
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = clamped;
    }
    this.state.volume = clamped;
    this.state.isMuted = clamped === 0;
    this.notify();
  }

  getVolume(): number {
    return this.state.volume;
  }

  setMuted(muted: boolean): void {
    if (this.audio) {
      this.audio.muted = muted;
    }
    this.state.isMuted = muted;
    this.notify();
  }

  toggleMute(): void {
    this.setMuted(!this.state.isMuted);
  }

  subscribe(callback: (state: EngineState) => void): () => void {
    this.subscribers.add(callback);
    try {
      callback({ ...this.state });
    } catch (err) {
      console.error('RadioEngine subscribe initial callback error:', err);
    }
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getState(): EngineState {
    return { ...this.state };
  }

  getStations(): Station[] {
    return [...this.stations];
  }

  setStations(stations: Station[]): void {
    this.stations = [...stations];
  }

  getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  /**
   * Legacy accessor kept for API compatibility. The engine no longer owns object
   * URLs — the chunk controller does, and it revokes them on `dispose()`.
   */
  getCurrentBlobUrl(): string | null {
    return null;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.sfxInstance.stopStaticHiss(0);
    this.chunkMode = false;
    const controller = this.controller;
    this.controller = null;
    // Revokes the prefetched blob URLs and clears every pending-seek timer.
    controller?.dispose();
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.src = '';
      } catch {}
    }
    this.removeAudioListeners();
    this.subscribers.clear();
  }

  private notify(): void {
    const snapshot: EngineState = { ...this.state };
    for (const callback of this.subscribers) {
      try {
        callback(snapshot);
      } catch (err) {
        console.error('RadioEngine notification error:', err);
      }
    }
  }
}

export const radioEngine = new RadioEngine();
