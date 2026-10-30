import { Station, EngineState } from '../types/radio';
import { getStationSecondForDuration } from './epochClock';
import { getCurrentCue } from '../utils/trackCues';
import { getStationLoopDuration } from '../data/chunkManifest';
import { getCachedStationAudio } from '../storage/db';
import { getAllStations, getStationsForGame } from '../data/catalog';
import { sfx, RadioSFX } from './sfx';

export type { EngineState };

export interface RadioEngineOptions {
  audio?: HTMLAudioElement;
  stations?: Station[];
  initialVolume?: number;
  sfx?: RadioSFX;
}

export class RadioEngine {
  private audio: HTMLAudioElement;
  private stations: Station[] = [];
  private currentBlobUrl: string | null = null;
  private requestId: number = 0;
  private isDestroyed: boolean = false;
  private sfxInstance: RadioSFX;
  private subscribers: Set<(state: EngineState) => void> = new Set();
  /**
   * Planned broadcast position for the current tune. A seek can only be applied
   * once the element knows its duration, and network audio can take seconds —
   * so the target is kept here and re-applied until it sticks. It is NEVER
   * replaced by 0: falling back to the file start is what made every tune
   * restart the station from the beginning.
   */
  private pendingSeekTarget: number | null = null;
  private pendingSeekTimer: ReturnType<typeof setInterval> | null = null;
  private pendingSeekAttempts = 0;
  private seekWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.audio.loop = true;

      const initVol =
        options?.initialVolume !== undefined
          ? Math.max(0, Math.min(1, options.initialVolume))
          : 1;
      this.audio.volume = initVol;
      this.state.volume = initVol;
      this.state.isMuted = initVol === 0;

      this.attachAudioListeners();
    }
  }

  private clearSeekWatchdog(): void {
    if (this.seekWatchdogTimer !== null) {
      clearTimeout(this.seekWatchdogTimer);
      this.seekWatchdogTimer = null;
    }
  }

  /**
   * Applies the planned broadcast position once the element can seek.
   * Returns true when the target is now in effect (or there was none).
   */
  private applyPendingSeek(): boolean {
    if (this.pendingSeekTarget === null) return true;
    if (!this.audio) return false;
    const ready = typeof this.audio.readyState === 'number' ? this.audio.readyState : 1;
    if (ready < 1) return false; // duration still unknown
    try {
      this.audio.currentTime = this.pendingSeekTarget;
    } catch {
      return false;
    }
    this.pendingSeekTarget = null;
    this.clearPendingSeek();
    return true;
  }

  /** Belt and braces: re-applies the pending position for ~15 s of slow network. */
  private schedulePendingSeek(reqId: number): void {
    this.clearPendingSeek();
    if (this.pendingSeekTarget === null) return;
    this.pendingSeekAttempts = 0;
    this.pendingSeekTimer = setInterval(() => {
      if (reqId !== this.requestId || this.isDestroyed) {
        this.clearPendingSeek();
        return;
      }
      this.pendingSeekAttempts += 1;
      if (this.applyPendingSeek()) return;
      if (this.pendingSeekAttempts >= 30) this.clearPendingSeek();
    }, 500);
  }

  private clearPendingSeek(): void {
    if (this.pendingSeekTimer !== null) {
      clearInterval(this.pendingSeekTimer);
      this.pendingSeekTimer = null;
    }
  }

  // --- HTML5 Audio Event Handlers ---

  private onTimeUpdate = () => {
    if (!this.state.currentStation) return;
    const currentTime = this.audio.currentTime || 0;
    const loopDuration =
      getStationLoopDuration(this.state.currentStation) || this.audio.duration || 0;
    const currentCue = getCurrentCue(this.state.currentStation, currentTime, loopDuration);
    const duration = loopDuration || this.audio.duration || 0;

    this.state.currentTime = currentTime;
    this.state.currentCue = currentCue;
    this.state.duration = duration;
    this.notify();
  };

  private onPlaying = () => {
    this.clearSeekWatchdog();
    this.applyPendingSeek();
    this.sfxInstance.stopStaticHiss(60);
    this.state.isPlaying = true;
    this.state.isLoading = false;
    this.state.error = null;
    this.notify();
  };

  private onPause = () => {
    this.clearSeekWatchdog();
    this.sfxInstance.stopStaticHiss(0);
    this.state.isPlaying = false;
    this.notify();
  };

  private onWaiting = () => {
    this.state.isLoading = true;
    this.notify();
  };

  private onCanPlay = () => {
    this.clearSeekWatchdog();
    this.applyPendingSeek();
    this.sfxInstance.stopStaticHiss(60);
    this.state.isLoading = false;
    this.notify();
  };

  private onError = () => {
    this.clearSeekWatchdog();
    this.sfxInstance.stopStaticHiss(0);
    this.state.isPlaying = false;
    this.state.isLoading = false;
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

  // --- Memory Management ---

  private revokeCurrentBlob(): void {
    if (this.currentBlobUrl) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(this.currentBlobUrl);
        } catch {}
      }
      this.currentBlobUrl = null;
    }
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
   * Checks IndexedDB for cached offline blob; if cached, uses blob URL for zero data consumption.
   * Otherwise streams from station.audioUrl. Sets playback position deterministically to simulated live epoch.
   */
  async playStation(station: Station, instantLiveSync: boolean = true): Promise<void> {
    if (this.isDestroyed) return;

    const reqId = ++this.requestId;

    this.clearSeekWatchdog();
    this.sfxInstance.stopStaticHiss(0);

    // Trigger authentic mechanical switch and static bursts
    this.sfxInstance.playClick();
    this.sfxInstance.playTuningStatic();

    this.ensureStationInList(station);

    // If tuning to Radio Off or station has no audio source, pause cleanly without error
    if (!station.audioUrl || station.id === 'radio-off' || station.duration === 0) {
      this.pause();
      this.revokeCurrentBlob();
      this.state.currentStation = station;
      this.state.isPlaying = false;
      this.state.isLoading = false;
      this.state.currentCue = null;
      this.state.error = null;
      this.notify();
      return;
    }

    // Mask connection latency with continuous soft static hiss
    this.sfxInstance.startStaticHiss();

    const loopDuration = getStationLoopDuration(station) || station.duration;
    const targetTime = instantLiveSync ? getStationSecondForDuration(station, loopDuration) : 0;

    // One-time seek fallback on metadata load
    let metadataHandled = false;
    const onMetadata = () => {
      if (reqId !== this.requestId) {
        if (this.audio && typeof this.audio.removeEventListener === 'function') {
          this.audio.removeEventListener('loadedmetadata', onMetadata);
        }
        return;
      }
      if (!metadataHandled) {
        metadataHandled = true;
        try {
          this.audio.currentTime = targetTime;
        } catch {}
      }
      if (this.audio && typeof this.audio.removeEventListener === 'function') {
        this.audio.removeEventListener('loadedmetadata', onMetadata);
      }
    };

    // Hold the planned broadcast position until the element can seek. There is
    // deliberately no "fall back to 0" timer: restarting the station from the
    // beginning is the exact bug this replaces.
    this.pendingSeekTarget = targetTime > 0 ? targetTime : null;
    this.schedulePendingSeek(reqId);

    // Set immediate UI state
    this.state.currentStation = station;
    this.state.currentTime = targetTime;
    this.state.duration = loopDuration;
    this.state.currentCue = getCurrentCue(station, targetTime, loopDuration);
    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    // Check IndexedDB offline cache
    let sourceUrl = station.audioUrl;
    let isOffline = false;
    let cachedBlob: Blob | null = null;

    try {
      cachedBlob = await getCachedStationAudio(station.gameId, station.id);
    } catch {
      cachedBlob = null;
    }

    if (reqId !== this.requestId || this.isDestroyed) {
      return;
    }

    // Revoke previous blob URL to prevent memory leaks
    this.revokeCurrentBlob();

    if (cachedBlob) {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        this.currentBlobUrl = URL.createObjectURL(cachedBlob);
        sourceUrl = this.currentBlobUrl;
        isOffline = true;
      }
    }

    this.state.isOffline = isOffline;

    if (this.audio) {
      this.audio.src = sourceUrl;
      this.audio.loop = true;

      try {
        this.audio.currentTime = targetTime;
      } catch {}

      this.audio.addEventListener('loadedmetadata', onMetadata);

      try {
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        if (reqId === this.requestId) {
          this.state.isPlaying = true;
          if (!this.seekWatchdogTimer) {
            this.state.isLoading = false;
          }
          this.notify();
        }
      } catch (err: any) {
        if (reqId === this.requestId) {
          this.clearSeekWatchdog();
          this.sfxInstance.stopStaticHiss(0);
          this.state.isPlaying = false;
          this.state.isLoading = false;
          this.state.error = err?.message || 'Playback failed';
          this.notify();
        }
      }
    }
  }

  /**
   * Synchronous station switch specifically designed for Apple CarPlay and car steering wheel controls.
   * Invokes audio.play() synchronously in the user activation window, then seamlessly switches to offline
   * blob if cached in IndexedDB.
   */
  private playStationSync(station: Station): void {
    if (this.isDestroyed) return;

    const reqId = ++this.requestId;

    this.clearSeekWatchdog();
    this.sfxInstance.stopStaticHiss(0);

    this.sfxInstance.playClick();
    this.sfxInstance.playTuningStatic();

    this.ensureStationInList(station);

    // If tuning to Radio Off or station has no audio source, pause cleanly without error
    if (!station.audioUrl || station.id === 'radio-off' || station.duration === 0) {
      this.pause();
      this.revokeCurrentBlob();
      this.state.currentStation = station;
      this.state.isPlaying = false;
      this.state.isLoading = false;
      this.state.currentCue = null;
      this.state.error = null;
      this.notify();
      return;
    }

    // Mask connection latency with continuous soft static hiss
    this.sfxInstance.startStaticHiss();

    const loopDuration = getStationLoopDuration(station) || station.duration;
    const targetTime = getStationSecondForDuration(station, loopDuration);

    // One-time seek fallback on metadata load (WebKit live epoch sync)
    let metadataHandled = false;
    const onMetadata = () => {
      if (reqId !== this.requestId) {
        if (this.audio && typeof this.audio.removeEventListener === 'function') {
          this.audio.removeEventListener('loadedmetadata', onMetadata);
        }
        return;
      }
      if (!metadataHandled) {
        metadataHandled = true;
        try {
          this.audio.currentTime = targetTime;
        } catch {}
      }
      if (this.audio && typeof this.audio.removeEventListener === 'function') {
        this.audio.removeEventListener('loadedmetadata', onMetadata);
      }
    };

    // Hold the planned broadcast position until the element can seek. There is
    // deliberately no "fall back to 0" timer: restarting the station from the
    // beginning is the exact bug this replaces.
    this.pendingSeekTarget = targetTime > 0 ? targetTime : null;
    this.schedulePendingSeek(reqId);

    this.revokeCurrentBlob();

    this.state.currentStation = station;
    this.state.currentTime = targetTime;
    this.state.duration = loopDuration;
    this.state.currentCue = getCurrentCue(station, targetTime, loopDuration);
    this.state.isLoading = true;
    this.state.isOffline = false;
    this.state.error = null;
    this.notify();

    if (this.audio) {
      this.audio.src = station.audioUrl;
      this.audio.loop = true;

      try {
        this.audio.currentTime = targetTime;
      } catch {}

      this.audio.addEventListener('loadedmetadata', onMetadata);

      try {
        const p = this.audio.play();
        if (p !== undefined) {
          p.then(() => {
            if (reqId === this.requestId) {
              this.state.isPlaying = true;
              if (!this.seekWatchdogTimer) {
                this.state.isLoading = false;
              }
              this.notify();
            }
          }).catch((err: any) => {
            if (reqId === this.requestId) {
              this.clearSeekWatchdog();
              this.sfxInstance.stopStaticHiss(0);
              this.state.isPlaying = false;
              this.state.isLoading = false;
              this.state.error = err?.message || 'Playback failed';
              this.notify();
            }
          });
        } else {
          this.state.isPlaying = true;
          if (!this.seekWatchdogTimer) {
            this.state.isLoading = false;
          }
          this.notify();
        }
      } catch (err: any) {
        this.clearSeekWatchdog();
        this.sfxInstance.stopStaticHiss(0);
        this.state.isPlaying = false;
        this.state.isLoading = false;
        this.state.error = err?.message || 'Playback failed';
        this.notify();
      }
    }

    // In the background, check if this station is cached in IndexedDB
    getCachedStationAudio(station.gameId, station.id)
      .then((blob) => {
        if (reqId !== this.requestId || this.isDestroyed) return;
        if (blob && this.audio && this.state.currentStation?.id === station.id) {
          if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const blobUrl = URL.createObjectURL(blob);
            this.revokeCurrentBlob();
            this.currentBlobUrl = blobUrl;
            const currentSecond = this.audio.currentTime || targetTime;
            this.audio.src = blobUrl;
            try {
              this.audio.currentTime = currentSecond;
            } catch {}
            this.state.isOffline = true;
            const p2 = this.audio.play();
            if (p2 !== undefined) p2.catch(() => {});
            this.notify();
          }
        }
      })
      .catch(() => {});
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
    this.clearSeekWatchdog();
    this.sfxInstance.stopStaticHiss(0);
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

    // Re-lock to the simulated universal live broadcast epoch
    const loopDuration =
      getStationLoopDuration(this.state.currentStation) || this.state.currentStation.duration;
    const liveTime = getStationSecondForDuration(this.state.currentStation, loopDuration);
    if (this.audio) {
      try {
        this.audio.currentTime = liveTime;
      } catch {}
    }
    this.state.currentTime = liveTime;
    this.state.currentCue = getCurrentCue(this.state.currentStation, liveTime, loopDuration);
    this.state.duration = loopDuration;

    if (this.audio) {
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
    if (this.audio) {
      try {
        this.audio.currentTime = clamped;
      } catch {}
    }
    this.state.currentTime = clamped;
    this.state.currentCue = getCurrentCue(this.state.currentStation, clamped);
    this.notify();
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

  getCurrentBlobUrl(): string | null {
    return this.currentBlobUrl;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.clearSeekWatchdog();
    this.sfxInstance.stopStaticHiss(0);
    this.revokeCurrentBlob();
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
