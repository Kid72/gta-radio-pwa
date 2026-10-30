// Linear fade-in for a media element's volume on station switches.
//
// GTA never hard-cuts a newly tuned station: the static burst covers the gap and the
// station level rises over ~0.3 s. This helper is deliberately dumb (HTMLMediaElement
// volume only, no Web Audio graph) so it survives iOS/CarPlay and never fights the
// user's own volume slider or mute button.

export interface FadableMedia {
  volume: number;
  muted: boolean;
}

/** Default ramp for a freshly tuned station. */
export const SWITCH_FADE_IN_MS = 320;
const DEFAULT_STEPS = 8;

export class VolumeFader {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private target = 1;
  private muted = false;
  private readonly steps: number;

  constructor(
    private media: FadableMedia,
    steps: number = DEFAULT_STEPS
  ) {
    this.steps = Math.max(1, steps);
  }

  /** Current desired level (the user's volume, independent of any in-flight ramp). */
  getTarget(): number {
    return this.target;
  }

  isMuted(): boolean {
    return this.muted;
  }

  isFading(): boolean {
    return this.timer !== null;
  }

  /** Applies volume/mute immediately and cancels any ramp in progress. */
  apply(volume: number, muted: boolean): void {
    this.cancel();
    this.target = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    this.media.volume = this.target;
  }

  /** Silences the element immediately, keeping the target (the static burst covers the switch). */
  duck(): void {
    this.cancel();
    this.media.volume = 0;
  }

  /** Drops to silence and ramps linearly back to the target level. */
  fadeIn(ms: number = SWITCH_FADE_IN_MS): void {
    this.cancel();
    const target = this.target;
    if (this.muted || target <= 0 || ms <= 0) {
      this.media.volume = target;
      return;
    }

    this.media.volume = 0;
    const stepMs = Math.max(1, Math.round(ms / this.steps));
    let step = 0;

    const tick = () => {
      step++;
      if (this.muted) {
        // Unmuted state changed mid-ramp: never leave the element stuck at 0.
        this.media.volume = target;
        this.timer = null;
        return;
      }
      this.media.volume = step >= this.steps ? target : target * (step / this.steps);
      if (step >= this.steps) {
        this.timer = null;
        return;
      }
      this.timer = setTimeout(tick, stepMs);
    };

    this.timer = setTimeout(tick, stepMs);
  }

  /** Stops a ramp without changing the current level. */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
