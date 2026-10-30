import type { ChunkStorage, GameId, Station } from '../types/radio';
import type { ChunkMeta } from '../data/chunkManifest';
import {
  CHUNK_END_GUARD,
  chunkBounds,
  chunkUrl,
  locate,
  resolveTimeline,
  type StationTimeline,
} from './chunkedSource';

/** One chunk switch, reported once the new chunk is actually audible. */
export interface ChunkTransition {
  from: number;
  to: number;
  gapMs: number;
}

export interface ChunkedPlaybackOptions {
  /** The single `<audio>` element shared with the engine (a second element breaks mediaSession). */
  audio: HTMLAudioElement;
  /** Offline branch: chunk blobs in IndexedDB. Optional — the network is the default. */
  storage?: ChunkStorage;
  getChunkMeta?: (gameId: GameId, stationId: string) => ChunkMeta | null;
  /** How many chunks ahead to warm. Default 1. */
  prefetchChunks?: number;
  onTransition?: (transition: ChunkTransition) => void;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (message: string) => void;
  onChunkChange?: (index: number) => void;
}

/**
 * Switch this far from the end of a chunk. Slightly wider than `CHUNK_END_GUARD`
 * (the clamp used when seeking) so the switch fires before playback hits EOF.
 */
export const CHUNK_TRANSITION_GUARD = Math.max(CHUNK_END_GUARD, 0.35);

/** Warm the next chunk when this many seconds are left in the current one. */
export const PREFETCH_LEAD_SECONDS = 20;

/**
 * A pending offset is re-applied on media events; this timer is belt and braces
 * for engines that never fire them. It only ever writes the *planned* position —
 * it can never fall back to 0. 12 attempts x 500 ms, then the events take over.
 */
const OFFSET_RETRY_INTERVAL_MS = 500;
const OFFSET_RETRY_LIMIT = 12;

interface ResolvedSource {
  url: string;
  /** True when `url` is a `blob:` object URL that must be revoked later. */
  objectUrl: boolean;
  /** True when the blob came from `ChunkStorage` (real offline playback). */
  offline: boolean;
}

interface Playhead {
  index: number;
  offset: number;
}

type AudioListener = EventListener | ((event: Event) => void);

/**
 * Owns chunk switching for one `<audio>` element: absolute second -> chunk index +
 * chunk-local offset, seamless switch at the chunk boundary, one-chunk prefetch,
 * offline blobs and a generation token so a stale async resolution can never
 * rewrite the source of the station that is playing now.
 *
 * Hard rule (the bug this replaces): playback position is never reset to 0 by a
 * timeout. A seek that cannot be applied yet is *pending* and is re-applied when
 * the metadata finally arrives — 3 s, 10 s or after the network comes back.
 */
export class ChunkedPlayback {
  private readonly audio: HTMLAudioElement;
  private readonly storage?: ChunkStorage;
  private readonly getChunkMeta?: (gameId: GameId, stationId: string) => ChunkMeta | null;
  private readonly prefetchDepth: number;
  private readonly onTransition?: (transition: ChunkTransition) => void;
  private readonly onLoadingChange?: (loading: boolean) => void;
  private readonly onError?: (message: string) => void;
  private readonly onChunkChange?: (index: number) => void;

  private station: Station | null = null;
  private timeline: StationTimeline | null = null;
  private generation = 0;
  private index = 0;
  private pendingOffset: number | null = null;
  private currentObjectUrl: string | null = null;
  private readonly prefetched = new Map<number, string>();
  private readonly prefetching = new Set<number>();
  private readonly prefetchFailed = new Set<number>();
  private offline = false;
  private loading = false;
  private disposed = false;
  private advancing = false;
  private errorReported = false;
  private offsetTimer: ReturnType<typeof setInterval> | null = null;
  private offsetAttempts = 0;
  private playhead: Playhead | null = null;
  private transition: { from: number; to: number; startedAt: number } | null = null;
  private readonly listeners: Array<[string, AudioListener]> = [];

  constructor(options: ChunkedPlaybackOptions) {
    this.audio = options.audio;
    this.storage = options.storage;
    this.getChunkMeta = options.getChunkMeta;
    this.prefetchDepth = Math.max(1, Math.floor(options.prefetchChunks ?? 1));
    this.onTransition = options.onTransition;
    this.onLoadingChange = options.onLoadingChange;
    this.onError = options.onError;
    this.onChunkChange = options.onChunkChange;

    this.attach();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Tune to `station` at the absolute second `absoluteSecond` (epoch/live time).
   * `generation` must be bumped by the caller for every new tune request; results
   * of a superseded call are dropped instead of touching the source.
   */
  async start(station: Station, absoluteSecond: number, generation: number): Promise<void> {
    if (this.disposed) return;

    this.generation = generation;
    this.station = station;
    const meta = this.getChunkMeta ? this.getChunkMeta(station.gameId, station.id) : null;
    this.timeline = resolveTimeline(station, meta);

    this.errorReported = false;
    this.transition = null;
    this.advancing = false;
    this.playhead = null;
    this.dropPrefetch();

    // A chunk must never loop on its own: looping the station is the job of the
    // "last chunk -> 000" transition.
    this.audio.loop = false;

    const position = locate(this.timeline, absoluteSecond);
    const applied = await this.setChunk(position.index, position.offset, generation);
    if (!applied || generation !== this.generation || this.disposed) return;

    this.audio.loop = false;
    await this.playCurrent(generation);
  }

  /** Jump to an absolute second, switching the chunk only when it is a different one. */
  async seek(absoluteSecond: number, generation: number): Promise<void> {
    if (this.disposed || !this.timeline || !this.station) return;

    this.generation = generation;
    this.transition = null;
    this.errorReported = false;

    const position = locate(this.timeline, absoluteSecond);
    if (position.index === this.index) {
      this.planOffset(position.offset);
      await this.playCurrent(generation);
      return;
    }

    const applied = await this.setChunk(position.index, position.offset, generation);
    if (!applied || generation !== this.generation || this.disposed) return;
    await this.playCurrent(generation);
  }

  /**
   * Take over a chunk the caller already put on the element.
   *
   * The CarPlay path has to call `play()` inside the user-activation tick, so the
   * engine resolves the chunk synchronously (`locate` + `chunkUrl` + `audio.src`)
   * before handing control here. Adopting only records the chunk and plans the
   * offset — it must never re-assign `audio.src`, which would discard the
   * synchronous start and reload the same chunk.
   */
  adopt(
    station: Station,
    absoluteSecond: number,
    generation: number,
    chunkIndex?: number,
  ): boolean {
    if (this.disposed) return false;

    const meta = this.getChunkMeta ? this.getChunkMeta(station.gameId, station.id) : null;
    const timeline = resolveTimeline(station, meta);
    const position = locate(timeline, absoluteSecond);
    const index =
      typeof chunkIndex === 'number' && Number.isInteger(chunkIndex) && chunkIndex >= 0
        ? chunkIndex
        : position.index;

    this.generation = generation;
    this.station = station;
    this.timeline = timeline;
    this.index = index;
    this.errorReported = false;
    this.transition = null;
    this.advancing = false;
    this.playhead = null;
    this.dropPrefetch();

    this.audio.loop = false;
    this.planOffset(index === position.index ? position.offset : 0);
    return true;
  }

  /** Pause without losing the position (no source, no offset change). */
  stop(): void {
    this.clearOffsetTimer();
    this.setLoading(false);
    try {
      this.audio.pause();
    } catch {
      // A detached element cannot be paused; the position is what matters.
    }
  }

  /** Revoke every object URL, drop timers and listeners. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearOffsetTimer();
    this.detach();
    this.dropPrefetch();
    this.revokeObjectUrl();
    this.pendingOffset = null;
    this.transition = null;
    this.station = null;
    this.timeline = null;
  }

  /** Index of the chunk being played. */
  getChunkIndex(): number {
    return this.index;
  }

  /** Current position as an absolute second (chunk offset + chunk start). */
  getAbsoluteSecond(): number {
    if (!this.timeline) return 0;
    const { start, end } = chunkBounds(this.timeline, this.index);
    const chunkLength = Math.max(0, end - start);
    const local = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    return start + Math.max(0, Math.min(local, chunkLength));
  }

  /** True when the current source is a chunk blob read from `ChunkStorage`. */
  isOfflineSource(): boolean {
    return this.offline;
  }

  // -------------------------------------------------------------------------
  // Media events
  // -------------------------------------------------------------------------

  private attach(): void {
    this.on('timeupdate', this.handleTimeUpdate);
    this.on('ended', this.handleEnded);
    this.on('loadedmetadata', this.handleMetadata);
    this.on('durationchange', this.handleMetadata);
    this.on('canplay', this.handleCanPlay);
    this.on('playing', this.handlePlaying);
    this.on('error', this.handleError);
  }

  private on(type: string, listener: AudioListener): void {
    if (typeof this.audio.addEventListener !== 'function') return;
    this.audio.addEventListener(type, listener);
    this.listeners.push([type, listener]);
  }

  private detach(): void {
    if (typeof this.audio.removeEventListener !== 'function') return;
    for (const [type, listener] of this.listeners) {
      try {
        this.audio.removeEventListener(type, listener);
      } catch {
        // Detached element: nothing to detach from.
      }
    }
    this.listeners.length = 0;
  }

  private handleTimeUpdate = (): void => {
    const timeline = this.timeline;
    if (!timeline || this.disposed) return;

    const local = this.localTime();
    this.playhead = { index: this.index, offset: local };
    this.resolveTransition(local);

    const { start, end } = chunkBounds(timeline, this.index);
    const chunkLength = Math.max(0, end - start);
    const remaining = chunkLength - local;

    if (remaining < CHUNK_TRANSITION_GUARD) {
      void this.advance();
      return;
    }
    if (remaining <= PREFETCH_LEAD_SECONDS) this.prefetchNext();
  };

  private handleEnded = (): void => {
    void this.advance();
  };

  private handleMetadata = (): void => {
    this.applyPendingOffset(true);
  };

  private handleCanPlay = (): void => {
    this.applyPendingOffset(true);
    this.setLoading(false);
  };

  private handlePlaying = (): void => {
    this.applyPendingOffset(true);
    this.setLoading(false);
    this.errorReported = false;
    this.resolveTransition();
  };

  private handleError = (): void => {
    if (this.disposed || !this.station) return;
    this.setLoading(false);

    // One report per failure: a broken chunk must not spin the listener into a
    // retry loop. The flag clears as soon as something plays again.
    if (this.errorReported) return;
    this.errorReported = true;

    const failed = this.index;
    const message =
      (this.audio.error && this.audio.error.message) || `Failed to play chunk ${failed}`;

    // Keep the chunk that was actually playing instead of leaving silence.
    const previous = this.playhead;
    this.transition = null;
    if (previous && previous.index !== failed) {
      void this.restoreChunk(previous);
    }

    this.onError?.(message);
  };

  // -------------------------------------------------------------------------
  // Chunk source
  // -------------------------------------------------------------------------

  private async setChunk(index: number, offset: number, generation: number): Promise<boolean> {
    const station = this.station;
    if (!station || !this.timeline) return false;

    this.setLoading(true);
    const source = await this.resolveSource(station, index);

    if (this.disposed || generation !== this.generation) {
      // Superseded request: drop the object URL we may have created, write nothing.
      if (source?.objectUrl) this.revokeUrl(source.url);
      return false;
    }
    if (!source) {
      this.reportOnce(`No source for chunk ${index} of ${station.id}`);
      return false;
    }

    this.applySource(source, index, offset);
    return true;
  }

  /** Storage first (offline), then the CDN. */
  private async resolveSource(station: Station, index: number): Promise<ResolvedSource | null> {
    if (this.storage) {
      try {
        const blob = await this.storage.getChunkBlob(station.gameId, station.id, index);
        if (blob) {
          const objectUrl = this.createObjectUrl(blob);
          if (objectUrl) return { url: objectUrl, objectUrl: true, offline: true };
        }
      } catch {
        // Storage unavailable (private mode, quota): fall through to the network.
      }
    }

    const url = chunkUrl(station.gameId, station.id, index);
    return url ? { url, objectUrl: false, offline: false } : null;
  }

  private applySource(source: ResolvedSource, index: number, offset: number): void {
    const previous = this.currentObjectUrl;
    this.currentObjectUrl = source.objectUrl ? source.url : null;
    this.offline = source.offline;
    this.index = index;

    this.audio.loop = false;
    this.audio.src = source.url;

    // Release the old object URL only after the element moved to the new source.
    this.revokeUrl(previous);

    this.onChunkChange?.(index);
    this.planOffset(offset);
  }

  /** Remember a target chunk-local second and apply it as soon as it sticks. */
  private planOffset(offset: number): void {
    const safe = Number.isFinite(offset) && offset > 0 ? offset : 0;
    this.pendingOffset = safe;
    this.offsetAttempts = 0;
    this.applyPendingOffset(false);
    if (this.pendingOffset !== null) this.startOffsetTimer();
    else this.clearOffsetTimer();
  }

  /**
   * Apply the planned position. Never substitutes 0 for a non-zero target: when
   * metadata is missing the target simply stays pending and is retried on the
   * next media event (and by the retry timer).
   */
  private applyPendingOffset(confirmed: boolean): void {
    const target = this.pendingOffset;
    if (target === null) return;

    const ready = this.isMetadataReady();
    if (!ready && target !== 0) {
      // Engines accept a write before metadata as the default start position, but
      // it is not authoritative yet — keep it pending and re-apply later.
      this.writeCurrentTime(target);
      return;
    }

    if (!this.writeCurrentTime(target)) return;
    if (ready || confirmed || target === 0) {
      this.pendingOffset = null;
      this.clearOffsetTimer();
    }
  }

  /**
   * The single place that assigns `audio.currentTime`. Every value written comes
   * from the caller's target or from the start of a freshly loaded chunk; there
   * is no timer anywhere that can decide "0 is good enough".
   */
  private writeCurrentTime(value: number): boolean {
    try {
      this.audio.currentTime = value;
      return true;
    } catch {
      return false;
    }
  }

  private isMetadataReady(): boolean {
    const readyState = (this.audio as { readyState?: number }).readyState;
    return typeof readyState === 'number' && readyState >= 1;
  }

  private startOffsetTimer(): void {
    this.clearOffsetTimer();
    this.offsetTimer = setInterval(() => {
      if (this.disposed) {
        this.clearOffsetTimer();
        return;
      }
      this.offsetAttempts += 1;
      this.applyPendingOffset(false);
      if (this.pendingOffset === null || this.offsetAttempts >= OFFSET_RETRY_LIMIT) {
        this.clearOffsetTimer();
      }
    }, OFFSET_RETRY_INTERVAL_MS);
  }

  private clearOffsetTimer(): void {
    if (this.offsetTimer !== null) {
      clearInterval(this.offsetTimer);
      this.offsetTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Chunk transitions
  // -------------------------------------------------------------------------

  private async advance(): Promise<void> {
    const station = this.station;
    const timeline = this.timeline;
    if (!station || !timeline || this.disposed || this.advancing) return;

    const from = this.index;
    const count = Math.max(1, timeline.count);
    const to = (from + 1) % count;
    const generation = this.generation;

    this.advancing = true;
    this.transition = { from, to, startedAt: Date.now() };
    this.setLoading(true);

    try {
      const prefetchedUrl = this.prefetched.get(to);
      if (prefetchedUrl) {
        this.prefetched.delete(to);
        this.applySource({ url: prefetchedUrl, objectUrl: true, offline: false }, to, 0);
      } else {
        const applied = await this.setChunk(to, 0, generation);
        if (!applied) {
          this.transition = null;
          return;
        }
      }
      if (generation !== this.generation || this.disposed) return;
      await this.playCurrent(generation);
    } finally {
      this.advancing = false;
    }
  }

  /** Put the last good chunk back after the next one failed (no retry loop). */
  private async restoreChunk(playhead: Playhead): Promise<void> {
    const station = this.station;
    if (!station || this.disposed) return;
    const generation = this.generation;
    const applied = await this.setChunk(playhead.index, playhead.offset, generation);
    if (!applied || generation !== this.generation || this.disposed) return;
    await this.playCurrent(generation);
  }

  private resolveTransition(local?: number): void {
    const transition = this.transition;
    if (!transition) return;
    if (local !== undefined && local <= 0) return;

    const gapMs = Math.max(0, Date.now() - transition.startedAt);
    this.transition = null;
    this.onTransition?.({ from: transition.from, to: transition.to, gapMs });
  }

  private async playCurrent(generation: number): Promise<void> {
    if (this.disposed) return;
    try {
      const result = this.audio.play() as Promise<void> | undefined;
      if (result && typeof result.then === 'function') await result;
    } catch {
      // Autoplay policy rejection: the planned position stays where it is; the
      // caller (engine) decides whether to surface a "tap to play" hint.
      return;
    }
    if (this.disposed || generation !== this.generation) return;
    this.setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Prefetch
  // -------------------------------------------------------------------------

  private prefetchNext(): void {
    const station = this.station;
    const timeline = this.timeline;
    if (!station || !timeline || this.offline || this.disposed) return;
    if (typeof fetch !== 'function') return;

    const count = Math.max(1, timeline.count);
    for (let ahead = 1; ahead <= this.prefetchDepth; ahead += 1) {
      const index = (this.index + ahead) % count;
      if (this.prefetched.has(index) || this.prefetching.has(index) || this.prefetchFailed.has(index)) {
        continue;
      }
      const url = chunkUrl(station.gameId, station.id, index);
      if (!url) continue;
      this.prefetching.add(index);
      void this.warmChunk(index, url);
    }
  }

  private async warmChunk(index: number, url: string): Promise<void> {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response || !response.ok) {
        this.prefetchFailed.add(index);
        return;
      }
      const blob = await response.blob();
      if (this.disposed) return;

      const objectUrl = this.createObjectUrl(blob);
      if (!objectUrl) return;
      if (this.index === index) {
        // Already switched while fetching: this warm copy is useless.
        this.revokeUrl(objectUrl);
        return;
      }
      this.prefetched.set(index, objectUrl);
    } catch {
      // A prefetch is speculative: a 404 or a network blip must never reach the
      // listener, the error state, or a retry loop.
      this.prefetchFailed.add(index);
    } finally {
      this.prefetching.delete(index);
    }
  }

  private dropPrefetch(): void {
    for (const url of this.prefetched.values()) this.revokeUrl(url);
    this.prefetched.clear();
    this.prefetching.clear();
    this.prefetchFailed.clear();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private localTime(): number {
    const value = this.audio.currentTime;
    if (!Number.isFinite(value) || value < 0) return 0;
    const timeline = this.timeline;
    if (!timeline) return value;
    const { start, end } = chunkBounds(timeline, this.index);
    return Math.min(value, Math.max(0, end - start));
  }

  private setLoading(loading: boolean): void {
    if (this.loading === loading) return;
    this.loading = loading;
    this.onLoadingChange?.(loading);
  }

  private reportOnce(message: string): void {
    if (this.errorReported) return;
    this.errorReported = true;
    this.onError?.(message);
  }

  private createObjectUrl(blob: Blob): string | null {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    try {
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  private revokeUrl(url: string | null): void {
    if (!url) return;
    if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Already revoked.
    }
  }

  private revokeObjectUrl(): void {
    const url = this.currentObjectUrl;
    this.currentObjectUrl = null;
    this.revokeUrl(url);
  }
}
