// Synthesizes short white-noise tuning burst and switch clicks via Web Audio API
export class RadioSFX {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor(ctx?: AudioContext) {
    if (ctx) {
      this.ctx = ctx;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
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

  playTuningStatic(durationMs: number = 160): void {
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
