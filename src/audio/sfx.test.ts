import { describe, it, expect, vi } from 'vitest';
import { RadioSFX } from './sfx';

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
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockBufferSource = {
    buffer: null as any,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  const mockOscillator = {
    type: '',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
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

describe('RadioSFX enhanced static effects', () => {
  it('triggers playTuningStaticBurst without throwing error', () => {
    const sfxInstance = new RadioSFX();
    expect(() => sfxInstance.playTuningStaticBurst(280)).not.toThrow();
  });

  it('starts and stops continuous static hiss', () => {
    const sfxInstance = new RadioSFX();
    expect(() => sfxInstance.startStaticHiss()).not.toThrow();
    expect(() => sfxInstance.stopStaticHiss(50)).not.toThrow();
  });

  it('synthesizes white noise static burst via Web Audio API bandpass filter and gain envelope', () => {
    const { ctx, mockFilter, mockGain, mockBufferSource } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.playTuningStaticBurst(280);

    expect(ctx.createBuffer).toHaveBeenCalledWith(1, expect.any(Number), 44100);
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.createBiquadFilter).toHaveBeenCalled();
    expect(mockFilter.type).toBe('bandpass');
    expect(mockFilter.frequency.value).toBe(1200);
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.2, 5.0);
    expect(mockGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.01,
      5.0 + 0.28
    );
    expect(mockBufferSource.start).toHaveBeenCalled();
  });

  it('configures looping white noise source with gain 0.04 when starting static hiss', () => {
    const { ctx, mockFilter, mockGain, mockBufferSource } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.startStaticHiss();

    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(mockBufferSource.loop).toBe(true);
    expect(mockFilter.type).toBe('bandpass');
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.04, 5.0);
    expect(mockBufferSource.start).toHaveBeenCalled();
  });

  it('smoothly ramps gain down to 0 on stopStaticHiss', () => {
    const { ctx, mockGain } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.startStaticHiss();
    sfx.stopStaticHiss(60);

    expect(mockGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.0001,
      5.0 + 0.06
    );
  });

  it('stops static hiss when disabled via setEnabled(false)', () => {
    const { ctx, mockBufferSource } = createMockAudioContext();
    const sfx = new RadioSFX(ctx);

    sfx.startStaticHiss();
    sfx.setEnabled(false);

    expect(mockBufferSource.stop).toHaveBeenCalled();
  });
});
