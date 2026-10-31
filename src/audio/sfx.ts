// GTA-style radio tuning SFX, synthesized with the Web Audio API only.
//
// Switch gesture (as heard in GTA IV/V): a mechanical knob "tick", a short burst of
// band-passed static whose centre frequency sweeps up then settles (the "searching
// for a frequency" sweep), a crackly tail, then the new station fades in on its own.
// Everything is self-terminating inside ~380 ms so the station is never masked.
//
// No dependencies. If AudioContext is missing/blocked every method degrades to a no-op.
//
// The burst is synthesised unless `public/sfx/tune-switch.mp3` is published: that slot
// takes a real recording (e.g. an extracted in-game switch) and is preferred when present.

/** Tunable shape of the switch sound. Frequencies in Hz, times in ms. */
export interface TuningSwitchParams {
  /** mechanical notch length */
  clickMs: number;
  /** static burst length (clamped to [minBurstMs, maxBurstMs]) */
  burstMs: number;
  minBurstMs: number;
  maxBurstMs: number;
  /** sweep: startHz -> peakHz at 45% of the burst -> endHz */
  startHz: number;
  peakHz: number;
  endHz: number;
  /** band-pass resonance */
  q: number;
  /** peak of the burst envelope, kept well below full scale */
  peakGain: number;
  /** continuous latency-mask hiss level */
  hissGain: number;
  /** identical switch requests inside this window are coalesced (UI + engine both fire) */
  minGapMs: number;
}

export const TUNING_SWITCH: TuningSwitchParams = {
  clickMs: 12,
  burstMs: 260,
  minBurstMs: 100,
  maxBurstMs: 360,
  startHz: 800,
  peakHz: 3200,
  endHz: 1200,
  q: 1.6,
  peakGain: 0.6,
  hissGain: 0.03,
  minGapMs: 100,
};

const HISS_ATTACK_S = 0.05;
const HISS_HOLD_S = 0.9;
const HISS_DUCK_S = 1.25;
const CLICK_HZ_END = 55;

type Maybe<T> = T | null;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Wall clock, so coalescing still works while an AudioContext is suspended (frozen currentTime). */
function wallClockMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export class RadioSFX {
  private ctx: Maybe<AudioContext> = null;
  private enabled = true;
  private hissSource: Maybe<AudioBufferSourceNode> = null;
  private hissGain: Maybe<GainNode> = null;
  private burstSource: Maybe<AudioBufferSourceNode> = null;
  private burstGain: Maybe<GainNode> = null;
  private burstTimer: Maybe<ReturnType<typeof setTimeout>> = null;
  private lastBurstAt = Number.NEGATIVE_INFINITY;
  private lastClickAt = Number.NEGATIVE_INFINITY;
  private params: TuningSwitchParams = { ...TUNING_SWITCH };
  private switchSample: Maybe<AudioBuffer> = null;
  private switchSampleTried = false;

  constructor(ctx?: AudioContext) {
    if (ctx) this.ctx = ctx;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopStaticHiss(0);
      this.stopTuningBurst(0);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setContext(ctx: AudioContext | null): void {
    this.ctx = ctx;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  isHissing(): boolean {
    return this.hissSource !== null;
  }

  isBursting(): boolean {
    return this.burstSource !== null;
  }

  /** Overrides the tuning shape (used by tests / future tuning menus). */
  setParams(partial: Partial<TuningSwitchParams>): void {
    this.params = { ...this.params, ...partial };
  }

  getParams(): TuningSwitchParams {
    return { ...this.params };
  }

  /**
   * Optional real recording of the in-game switch. If `public/sfx/tune-switch.mp3`
   * exists it replaces the synthesised burst (the synthesised one stays the
   * default because Rockstar's asset cannot be redistributed).
   */
  async loadSwitchSample(url?: string): Promise<void> {
    if (this.switchSampleTried) return;
    this.switchSampleTried = true;
    try {
      if (typeof fetch !== 'function') return;
      const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
      const base = env?.BASE_URL || '/';
      const src = url || `${base}${base.endsWith('/') ? '' : '/'}sfx/tune-switch.mp3`;
      const response = await fetch(src);
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      this.initCtx();
      if (!this.ctx) return;
      this.switchSample = await this.ctx.decodeAudioData(bytes.slice(0));
    } catch {
      // Nothing published at the slot: keep the synthesised burst.
    }
  }

  /** True when a real switch recording is loaded and used instead of the synth. */
  hasSwitchSample(): boolean {
    return this.switchSample !== null;
  }

  /** Inject a decoded sample (hosts/tests); `null` restores the synth. */
  setSwitchSample(buffer: AudioBuffer | null): void {
    this.switchSample = buffer;
  }

  private now(): number {
    return this.ctx?.currentTime || 0;
  }

  private initCtx(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        this.ctx.resume().catch(() => {});
      } catch {}
    }
  }

  /** Noisy buffer with sparse spikes so the hiss crackles instead of sounding like a fan. */
  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate || 44100;
    const size = Math.max(1, Math.floor(sampleRate * seconds));
    const buffer = ctx.createBuffer(1, size, sampleRate);
    const data = buffer.getChannelData(0);
    const spikeChance = 0.004;
    for (let i = 0; i < size; i++) {
      let sample = Math.random() * 2 - 1;
      if (Math.random() < spikeChance) sample = clamp(sample * 3.2, -1, 1);
      data[i] = sample;
    }
    return buffer;
  }

  /**
   * Short band-passed static burst with a swept centre frequency (800 -> 3200 -> 1200 Hz)
   * and a self-terminating envelope. Repeated calls inside `minGapMs` are coalesced so the
   * UI handler and the engine do not stack two bursts on one switch.
   */
  playTuningStaticBurst(durationMs: number = this.params.burstMs): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      const ctx = this.ctx;
      if (!ctx) return;

      const now = this.now();
      const startedAt = wallClockMs();
      if (startedAt - this.lastBurstAt < this.params.minGapMs) return;

      const durationSec =
        clamp(durationMs, this.params.minBurstMs, this.params.maxBurstMs) / 1000;

      const source = ctx.createBufferSource();
      const sample = this.switchSample;
      source.buffer = sample || this.createNoiseBuffer(ctx, durationSec);

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = this.params.q;
      band.frequency.setValueAtTime(this.params.startHz, now);
      band.frequency.exponentialRampToValueAtTime(
        this.params.peakHz,
        now + durationSec * 0.45
      );
      band.frequency.exponentialRampToValueAtTime(this.params.endHz, now + durationSec);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(this.params.peakGain, now + durationSec * 0.22);
      gain.gain.linearRampToValueAtTime(this.params.peakGain * 0.84, now + durationSec * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec);

      // A real recording already carries its own spectrum; only the synth is swept.
      if (sample) {
        source.connect(gain);
      } else {
        source.connect(band);
        band.connect(gain);
      }
      gain.connect(ctx.destination);

      const playFor = sample ? Math.min(sample.duration, durationSec) : durationSec;
      source.start(now);
      source.stop(now + playFor + 0.01);

      this.lastBurstAt = startedAt;
      this.burstSource = source;
      this.burstGain = gain;

      const previousTimer = this.burstTimer;
      if (previousTimer !== null) clearTimeout(previousTimer);
      this.burstTimer = setTimeout(
        () => {
          this.burstTimer = null;
          if (this.burstSource === source) {
            this.burstSource = null;
            this.burstGain = null;
          }
          try {
            source.disconnect();
            gain.disconnect();
          } catch {}
        },
        Math.round(durationSec * 1000) + 60
      );
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  /** Backwards-compatible alias used by the engine and UI call sites. */
  playTuningStatic(durationMs: number = this.params.burstMs): void {
    this.playTuningStaticBurst(durationMs);
  }

  /** Fades an in-flight burst out early (e.g. when the station starts before it ends). */
  stopTuningBurst(fadeMs: number = 40): void {
    const source = this.burstSource;
    const gain = this.burstGain;
    this.burstSource = null;
    this.burstGain = null;
    if (!source) return;
    try {
      const ctx = this.ctx;
      const now = this.now();
      const fadeSec = Math.max(0.001, fadeMs / 1000);
      if (ctx && gain) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(
          Math.min(gain.gain.value || this.params.peakGain, this.params.peakGain),
          now
        );
        gain.gain.exponentialRampToValueAtTime(0.0005, now + fadeSec);
      }
      if (typeof source.stop === 'function') source.stop(now + fadeSec);
      if (fadeMs <= 0) {
        if (typeof source.disconnect === 'function') source.disconnect();
        if (gain && typeof gain.disconnect === 'function') gain.disconnect();
      } else {
        setTimeout(() => {
          try {
            source.disconnect();
            gain?.disconnect();
          } catch {}
        }, fadeMs + 20);
      }
    } catch {}
  }

  /**
   * Continuous low hiss that masks stream connection latency. It ducks after ~1 s instead
   * of droning at a constant level, and is always stopped by the engine on 'playing'.
   */
  startStaticHiss(): void {
    if (!this.enabled) return;
    if (this.hissSource) return; // already masking
    try {
      this.initCtx();
      const ctx = this.ctx;
      if (!ctx) return;

      const source = ctx.createBufferSource();
      source.buffer = this.createNoiseBuffer(ctx, 1);
      source.loop = true;

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.9;
      band.frequency.value = 1100;

      const gain = ctx.createGain();
      const now = this.now();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(this.params.hissGain, now + HISS_ATTACK_S);
      gain.gain.setValueAtTime(this.params.hissGain, now + HISS_HOLD_S);
      gain.gain.linearRampToValueAtTime(this.params.hissGain * 0.4, now + HISS_DUCK_S);

      source.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);

      this.hissSource = source;
      this.hissGain = gain;
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  /** Smoothly fades out and stops the continuous static hiss over fadeMs milliseconds. */
  stopStaticHiss(fadeMs: number = 60): void {
    const source = this.hissSource;
    const gain = this.hissGain;
    this.hissSource = null;
    this.hissGain = null;

    if (!source) return;

    try {
      const ctx = this.ctx;
      if (!ctx || !gain) {
        if (typeof source.stop === 'function') source.stop();
        if (typeof source.disconnect === 'function') source.disconnect();
        return;
      }

      const now = this.now();
      const fadeSec = Math.max(0.001, fadeMs / 1000);

      if (gain.gain) {
        if (typeof gain.gain.cancelScheduledValues === 'function') {
          gain.gain.cancelScheduledValues(now);
        }
        if (typeof gain.gain.setValueAtTime === 'function') {
          gain.gain.setValueAtTime(
            Math.min(gain.gain.value ?? this.params.hissGain, this.params.hissGain),
            now
          );
        }
        if (typeof gain.gain.linearRampToValueAtTime === 'function') {
          gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        }
      }

      if (fadeMs <= 0) {
        if (typeof source.stop === 'function') source.stop();
        if (typeof source.disconnect === 'function') source.disconnect();
        if (typeof gain.disconnect === 'function') gain.disconnect();
      } else {
        setTimeout(() => {
          try {
            if (typeof source.stop === 'function') source.stop();
            if (typeof source.disconnect === 'function') source.disconnect();
            if (typeof gain.disconnect === 'function') gain.disconnect();
          } catch {}
        }, fadeMs + 20);
      }
    } catch {
      // AudioContext or node cleanup error
    }
  }

  /**
   * Mechanical knob notch: a 12 ms pitch-dropping body plus a 2 ms bright tick.
   * Coalesced over 40 ms so fast wheel scrubbing does not buzz.
   */
  playClick(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      const ctx = this.ctx;
      if (!ctx) return;

      const now = this.now();
      const clickedAt = wallClockMs();
      if (clickedAt - this.lastClickAt < 40) return;
      this.lastClickAt = clickedAt;

      const clickSec = this.params.clickMs / 1000;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(CLICK_HZ_END, now + clickSec);
      oscGain.gain.setValueAtTime(0.15, now);
      oscGain.gain.linearRampToValueAtTime(0.001, now + clickSec);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + clickSec);

      // bright transient that makes the notch read as metal, not as a bass tone
      const tick = ctx.createBufferSource();
      tick.buffer = this.createNoiseBuffer(ctx, 0.002);
      const tickFilter = ctx.createBiquadFilter();
      tickFilter.type = 'highpass';
      tickFilter.frequency.value = 1800;
      const tickGain = ctx.createGain();
      tickGain.gain.setValueAtTime(0.09, now);
      tickGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.006);
      tick.connect(tickFilter);
      tickFilter.connect(tickGain);
      tickGain.connect(ctx.destination);
      tick.start(now);
      tick.stop(now + 0.008);
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  /** One call = one GTA-style switch: knob notch, static sweep, nothing else. */
  playStationSwitch(durationMs: number = this.params.burstMs): void {
    if (!this.enabled) return;
    if (!this.switchSampleTried) void this.loadSwitchSample();
    this.playClick();
    this.playTuningStatic(durationMs);
  }

  /** Releases every live node (used on teardown / mute). */
  dispose(): void {
    this.stopStaticHiss(0);
    this.stopTuningBurst(0);
    if (this.burstTimer !== null) {
      clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }
}

export const sfx = new RadioSFX();
