import { describe, it, expect, vi, afterEach } from 'vitest';
import { VolumeFader, SWITCH_FADE_IN_MS } from './volumeFade';

function createMedia(volume = 1, muted = false) {
  return { volume, muted };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('VolumeFader station fade-in', () => {
  it('silences the element on a switch and ramps back to the user volume', () => {
    vi.useFakeTimers();
    const media = createMedia(0.8);
    const fader = new VolumeFader(media, 8);

    fader.apply(0.8, false);
    fader.duck();
    expect(media.volume).toBe(0);

    fader.fadeIn(SWITCH_FADE_IN_MS);
    expect(media.volume).toBe(0);
    expect(fader.isFading()).toBe(true);

    vi.advanceTimersByTime(SWITCH_FADE_IN_MS / 4);
    expect(media.volume).toBeGreaterThan(0);
    expect(media.volume).toBeLessThan(0.8);

    vi.advanceTimersByTime(SWITCH_FADE_IN_MS);
    expect(media.volume).toBe(0.8);
    expect(fader.isFading()).toBe(false);
  });

  it('finishes the ramp inside 250-400 ms of wall clock', () => {
    vi.useFakeTimers();
    const media = createMedia(1);
    const fader = new VolumeFader(media, 8);
    fader.apply(1, false);
    fader.fadeIn();

    expect(SWITCH_FADE_IN_MS).toBeGreaterThanOrEqual(250);
    expect(SWITCH_FADE_IN_MS).toBeLessThanOrEqual(400);

    vi.advanceTimersByTime(SWITCH_FADE_IN_MS);
    expect(media.volume).toBe(1);
  });

  it('does not ramp or overwrite the level while the user is muted', () => {
    vi.useFakeTimers();
    const media = createMedia(0.6, true);
    const fader = new VolumeFader(media, 8);

    fader.apply(0.6, true);
    fader.fadeIn();

    expect(media.volume).toBe(0.6); // untouched, silence comes from audio.muted
    expect(fader.isFading()).toBe(false);
    vi.advanceTimersByTime(SWITCH_FADE_IN_MS);
    expect(media.volume).toBe(0.6);
  });

  it('lets a mid-ramp volume change win immediately', () => {
    vi.useFakeTimers();
    const media = createMedia(0.5);
    const fader = new VolumeFader(media, 8);
    fader.apply(0.5, false);
    fader.fadeIn();
    vi.advanceTimersByTime(40);

    fader.apply(0.25, false);
    expect(media.volume).toBe(0.25);
    expect(fader.isFading()).toBe(false);

    vi.advanceTimersByTime(SWITCH_FADE_IN_MS);
    expect(media.volume).toBe(0.25); // the stale ramp target must not resurrect
  });

  it('never leaves the element stuck at silence if muted mid-ramp', () => {
    vi.useFakeTimers();
    const media = createMedia(0.7);
    const fader = new VolumeFader(media, 8);
    fader.apply(0.7, false);
    fader.fadeIn();
    vi.advanceTimersByTime(40);

    fader.apply(0.7, true);
    vi.advanceTimersByTime(SWITCH_FADE_IN_MS);
    expect(media.volume).toBe(0.7);
    expect(fader.isMuted()).toBe(true);
  });

  it('keeps a zero volume switch silent (no phantom fade to audible)', () => {
    vi.useFakeTimers();
    const media = createMedia(0);
    const fader = new VolumeFader(media, 8);
    fader.apply(0, true);
    fader.fadeIn();

    expect(fader.isFading()).toBe(false);
    expect(media.volume).toBe(0);
  });
});
