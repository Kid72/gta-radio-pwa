// Synthesizes short white-noise tuning burst and switch clicks via Web Audio API
export class RadioSFX {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private hissSource: AudioBufferSourceNode | null = null;
  private hissGain: GainNode | null = null;

  constructor(ctx?: AudioContext) {
    if (ctx) {
      this.ctx = ctx;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopStaticHiss(0);
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

  private initCtx(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Synthesizes an authentic radio tuning "shhhhh" static burst using filtered white noise.
   */
  playTuningStaticBurst(durationMs: number = 280): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const sampleRate = this.ctx.sampleRate || 44100;
      const bufferSize = Math.max(1, Math.floor(sampleRate * (durationMs / 1000)));
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 3.0;

      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime || 0;
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + durationMs / 1000);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  /**
   * Alias to playTuningStaticBurst for backward compatibility with existing call sites.
   */
  playTuningStatic(durationMs: number = 280): void {
    this.playTuningStaticBurst(durationMs);
  }

  /**
   * Starts a continuous, soft radio static hiss (gain 0.04) to mask stream connection latency.
   */
  startStaticHiss(): void {
    if (!this.enabled) return;
    try {
      this.stopStaticHiss(0);
      this.initCtx();
      if (!this.ctx) return;

      const sampleRate = this.ctx.sampleRate || 44100;
      const bufferSize = sampleRate; // 1 second loop of white noise
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 2.0;

      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime || 0;
      gain.gain.setValueAtTime(0.04, now);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();

      this.hissSource = whiteNoise;
      this.hissGain = gain;
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  /**
   * Smoothly fades out and stops the continuous static hiss over fadeMs milliseconds.
   */
  stopStaticHiss(fadeMs: number = 60): void {
    const source = this.hissSource;
    const gain = this.hissGain;
    this.hissSource = null;
    this.hissGain = null;

    if (!source) return;

    try {
      if (!this.ctx || !gain) {
        if (typeof source.stop === 'function') source.stop();
        if (typeof source.disconnect === 'function') source.disconnect();
        return;
      }

      const now = this.ctx.currentTime || 0;
      const fadeSec = Math.max(0.001, fadeMs / 1000);

      if (gain.gain) {
        if (typeof gain.gain.cancelScheduledValues === 'function') {
          gain.gain.cancelScheduledValues(now);
        }
        if (typeof gain.gain.setValueAtTime === 'function') {
          gain.gain.setValueAtTime(Math.min(gain.gain.value ?? 0.04, 0.04), now);
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

  playClick(): void {
    if (!this.enabled) return;
    // Mechanical notch click
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime || 0;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.04);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.04);
    } catch {
      // AudioContext unavailable or blocked
    }
  }
}

export const sfx = new RadioSFX();
