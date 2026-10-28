import { Station, EngineState } from '../types/radio';
import { getStationCurrentSecond } from './epochClock';
import { getCurrentCue } from '../utils/trackCues';
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

  // --- HTML5 Audio Event Handlers ---

  private onTimeUpdate = () => {
    if (!this.state.currentStation) return;
    const currentTime = this.audio.currentTime || 0;
    const currentCue = getCurrentCue(this.state.currentStation, currentTime);
    const duration = this.state.currentStation.duration || this.audio.duration || 0;

    this.state.currentTime = currentTime;
    this.state.currentCue = currentCue;
    this.state.duration = duration;
    this.notify();
  };

  private onPlaying = () => {
    this.state.isPlaying = true;
    this.state.isLoading = false;
    this.state.error = null;
    this.notify();
  };

  private onPause = () => {
    this.state.isPlaying = false;
    this.notify();
  };

  private onWaiting = () => {
    this.state.isLoading = true;
    this.notify();
  };

  private onCanPlay = () => {
    this.state.isLoading = false;
    this.notify();
  };

  private onError = () => {
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

  private getNextStation(): Station | null {
    if (this.stations.length === 0) return null;
    if (!this.state.currentStation) return this.stations[0];
    const currentIndex = this.stations.findIndex(
      (s) => s.id === this.state.currentStation!.id
    );
    if (currentIndex === -1) return this.stations[0];
    return this.stations[(currentIndex + 1) % this.stations.length];
  }

  private getPreviousStation(): Station | null {
    if (this.stations.length === 0) return null;
    if (!this.state.currentStation) return this.stations[this.stations.length - 1];
    const currentIndex = this.stations.findIndex(
      (s) => s.id === this.state.currentStation!.id
    );
    if (currentIndex === -1) return this.stations[this.stations.length - 1];
    return this.stations[
      (currentIndex - 1 + this.stations.length) % this.stations.length
    ];
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

    // Trigger authentic mechanical switch and static bursts
    this.sfxInstance.playClick();
    this.sfxInstance.playTuningStatic();

    this.ensureStationInList(station);

    const targetTime = instantLiveSync ? getStationCurrentSecond(station) : 0;

    // Set immediate UI state
    this.state.currentStation = station;
    this.state.currentTime = targetTime;
    this.state.duration = station.duration;
    this.state.currentCue = getCurrentCue(station, targetTime);
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

      // One-time seek fallback on metadata load
      let metadataHandled = false;
      const onMetadata = () => {
        if (!metadataHandled) {
          metadataHandled = true;
          try {
            this.audio.currentTime = targetTime;
          } catch {}
        }
        this.audio.removeEventListener('loadedmetadata', onMetadata);
      };
      this.audio.addEventListener('loadedmetadata', onMetadata);

      try {
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        if (reqId === this.requestId) {
          this.state.isPlaying = true;
          this.state.isLoading = false;
          this.notify();
        }
      } catch (err: any) {
        if (reqId === this.requestId) {
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

    this.sfxInstance.playClick();
    this.sfxInstance.playTuningStatic();

    this.ensureStationInList(station);

    const targetTime = getStationCurrentSecond(station);

    this.revokeCurrentBlob();

    this.state.currentStation = station;
    this.state.currentTime = targetTime;
    this.state.duration = station.duration;
    this.state.currentCue = getCurrentCue(station, targetTime);
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

      // One-time seek fallback on metadata load (WebKit live epoch sync)
      let metadataHandled = false;
      const onMetadata = () => {
        if (!metadataHandled) {
          metadataHandled = true;
          try {
            this.audio.currentTime = targetTime;
          } catch {}
        }
        this.audio.removeEventListener('loadedmetadata', onMetadata);
      };
      this.audio.addEventListener('loadedmetadata', onMetadata);

      try {
        const p = this.audio.play();
        if (p !== undefined) {
          p.then(() => {
            if (reqId === this.requestId) {
              this.state.isPlaying = true;
              this.state.isLoading = false;
              this.notify();
            }
          }).catch((err: any) => {
            if (reqId === this.requestId) {
              this.state.isPlaying = false;
              this.state.isLoading = false;
              this.state.error = err?.message || 'Playback failed';
              this.notify();
            }
          });
        } else {
          this.state.isPlaying = true;
          this.state.isLoading = false;
          this.notify();
        }
      } catch (err: any) {
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
    const liveTime = getStationCurrentSecond(this.state.currentStation);
    if (this.audio) {
      try {
        this.audio.currentTime = liveTime;
      } catch {}
    }
    this.state.currentTime = liveTime;
    this.state.currentCue = getCurrentCue(this.state.currentStation, liveTime);

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
