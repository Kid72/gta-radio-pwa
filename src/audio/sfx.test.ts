import { describe, it, expect, vi, afterEach } from 'vitest';
import { RadioSFX, TUNING_SWITCH } from './sfx';

/** Minimal Web Audio mock: every create* call returns a fresh, inspectable node. */
function createMockAudioContext() {
  const created = {
    gains: [] as any[],
    filters: [] as any[],
    sources: [] as any[],
    oscillators: [] as any[],
    bufferSizes: [] as number[],
  };

  const makeParam = (initial = 0) => ({
    value: initial,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });

  const ctx = {
    sampleRate: 44100,
    currentTime: 5.0,
    state: 'running',
    destination: {},
    createBuffer: vi.fn((_channels: number, size: number, sampleRate: number) => {
      created.bufferSizes.push(size);
      return {
        getChannelData: () => new Float32Array(size),
        length: size,
        sampleRate,
      };
    }),
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null as any,
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      created.sources.push(node);
      return node;
    }),
    createBiquadFilter: vi.fn(() => {
      const node = {
        type: '',
        frequency: makeParam(0),
        Q: makeParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      created.filters.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = {
        gain: makeParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      created.gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node = {
        type: '',
        frequency: makeParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      created.oscillators.push(node);
      return node;
    }),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;

  return { ctx, ...created };
}

function valueOf(call: any[]): number {
  return call[0];
}

function timeOf(call: any[]): number {
  return call[1];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RadioSFX tuning switch burst', () => {
  it('builds a static burst with a frequency sweep inside 400 ms', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playTuningStaticBurst(260);

    const band = m.filters[0];
    expect(band.type).toBe('bandpass');
    expect(band.frequency.setValueAtTime).toHaveBeenCalledWith(TUNING_SWITCH.startHz, 5.0);

    const sweep = band.frequency.exponentialRampToValueAtTime.mock.calls;
    expect(sweep.length).toBeGreaterThanOrEqual(2);
    // sweeps up to the peak, then settles back down (a "searching" sweep, not a static hiss)
    expect(valueOf(sweep[0])).toBe(TUNING_SWITCH.peakHz);
    expect(valueOf(sweep[0])).toBeGreaterThan(TUNING_SWITCH.startHz);
    expect(valueOf(sweep[sweep.length - 1])).toBe(TUNING_SWITCH.endHz);
    expect(valueOf(sweep[sweep.length - 1])).toBeLessThan(TUNING_SWITCH.peakHz);
    expect(timeOf(sweep[sweep.length - 1])).toBeCloseTo(5.26, 5);

    // everything scheduled — including node stop — finishes well inside the 400 ms window
    for (const call of sweep) expect(timeOf(call)).toBeLessThanOrEqual(5.4);
    const burstSource = m.sources[0];
    expect(burstSource.stop.mock.calls[0][0]).toBeLessThanOrEqual(5.4);
    expect(burstSource.start).toHaveBeenCalled();
  });

  it('ramps static gain down to silence after the switch window', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playTuningStatic();

    const gain = m.gains[0].gain;
    const lastRamp = gain.exponentialRampToValueAtTime.mock.calls.at(-1)!;
    expect(valueOf(lastRamp)).toBeLessThanOrEqual(0.001);
    expect(timeOf(lastRamp)).toBeCloseTo(5.26, 5);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalled();
  });

  it('keeps peak gain below full scale to avoid clipping', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playTuningStaticBurst(360);
    sfx.playClick();

    const scheduled = m.gains.flatMap((g) => [
      ...g.gain.setValueAtTime.mock.calls,
      ...g.gain.linearRampToValueAtTime.mock.calls,
      ...g.gain.exponentialRampToValueAtTime.mock.calls,
    ]);
    expect(scheduled.length).toBeGreaterThan(0);
    for (const call of scheduled) {
      expect(valueOf(call)).toBeLessThan(1);
      expect(valueOf(call)).toBeGreaterThanOrEqual(0);
    }
    // headroom: the burst envelope peaks at 0.6 (-4.4 dBFS), never at 1.0
    expect(TUNING_SWITCH.peakGain).toBeLessThan(0.7);
  });

  it('clamps burst length into the 100-360 ms window', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playTuningStaticBurst(50);
    expect(m.bufferSizes[0]).toBe(Math.floor(44100 * (TUNING_SWITCH.minBurstMs / 1000)));

    const m2 = createMockAudioContext();
    const sfx2 = new RadioSFX(m2.ctx);
    sfx2.playTuningStaticBurst(2000);
    expect(m2.bufferSizes[0]).toBe(Math.floor(44100 * 0.36));
  });
});

describe('RadioSFX switch click', () => {
  it('plays a mechanical click shorter than 20 ms with a rapid pitch drop', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playClick();

    const osc = m.oscillators[0];
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(220, 5.0);
    const drop = osc.frequency.exponentialRampToValueAtTime.mock.calls[0];
    expect(valueOf(drop)).toBe(55);
    expect(timeOf(drop) - 5.0).toBeLessThanOrEqual(0.02);
    expect(osc.stop.mock.calls[0][0]).toBeLessThanOrEqual(5.02);
  });

  it('plays one click per switch gesture even when UI and engine both fire', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playClick();
    sfx.playClick();

    expect(m.oscillators).toHaveLength(1);
  });
});

describe('RadioSFX switch coalescing', () => {
  it('coalesces duplicate tuning bursts inside the gap window', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    // App wheel calls playTuningStaticBurst(220), then the engine calls playTuningStatic()
    sfx.playTuningStaticBurst(220);
    sfx.playTuningStatic();

    expect(m.sources).toHaveLength(1);
    expect(m.bufferSizes[0]).toBe(Math.floor(44100 * 0.22));
  });

  it('plays a new burst once the gap window has elapsed', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playTuningStaticBurst(220);
    vi.advanceTimersByTime(TUNING_SWITCH.minGapMs + 10);
    sfx.playTuningStaticBurst(220);

    expect(m.sources).toHaveLength(2);
  });
});

describe('RadioSFX early burst cutoff', () => {
  it('fades an in-flight burst out instead of hard-cutting it', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.playTuningStaticBurst(220);
    const burst = m.sources[0];
    expect(sfx.isBursting()).toBe(true);

    sfx.stopTuningBurst(40);

    const lastStop = burst.stop.mock.calls.at(-1)!;
    expect(lastStop[0]).toBeCloseTo(5.04, 5); // stopped after the 40 ms fade, not instantly
    expect(m.gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0005, 5.04);
    expect(sfx.isBursting()).toBe(false);
  });
});

describe('RadioSFX latency hiss', () => {
  it('starts a looping, softened hiss that ducks instead of droning', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.startStaticHiss();

    expect(sfx.isHissing()).toBe(true);
    expect(m.sources[0].loop).toBe(true);
    const band = m.filters[0];
    expect(band.type).toBe('bandpass');
    expect(band.frequency.value).toBe(1100);
    const gain = m.gains[0].gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 5.0);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.03, 5.05);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.012, 6.25);
  });

  it('does not stack a second hiss while one is running', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.startStaticHiss();
    sfx.startStaticHiss();

    expect(m.sources).toHaveLength(1);
  });

  it('fades the hiss to silence on stop and clamps the anchor to avoid pops', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.startStaticHiss();
    m.gains[0].gain.value = 1.0; // untracked spike
    sfx.stopStaticHiss(60);

    const gain = m.gains[0].gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.03, 5.0);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.0001, 5.06);
    expect(sfx.isHissing()).toBe(false);
  });

  it('stops the hiss when disabled via setEnabled(false)', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.startStaticHiss();
    sfx.setEnabled(false);

    expect(m.sources[0].stop).toHaveBeenCalled();
    expect(sfx.isHissing()).toBe(false);
  });
});

describe('RadioSFX degradation and flags', () => {
  it('does not throw when AudioContext is unavailable', () => {
    const sfx = new RadioSFX();
    sfx.setContext(null);

    expect(() => {
      sfx.playClick();
      sfx.playTuningStatic();
      sfx.playStationSwitch();
      sfx.startStaticHiss();
      sfx.stopStaticHiss(60);
      sfx.stopTuningBurst(0);
      sfx.dispose();
    }).not.toThrow();
    expect(sfx.isHissing()).toBe(false);
    expect(sfx.isBursting()).toBe(false);
  });

  it('respects the enabled flag', () => {
    const m = createMockAudioContext();
    const sfx = new RadioSFX(m.ctx);

    sfx.setEnabled(false);
    expect(sfx.isEnabled()).toBe(false);

    sfx.playClick();
    sfx.playTuningStatic();
    sfx.playStationSwitch(200);
    sfx.startStaticHiss();

    expect(m.oscillators).toHaveLength(0);
    expect(m.sources).toHaveLength(0);
    expect(m.bufferSizes).toHaveLength(0);
  });

  it('resumes a suspended AudioContext on trigger', () => {
    const m = createMockAudioContext();
    (m.ctx as any).state = 'suspended';
    const sfx = new RadioSFX(m.ctx);

    sfx.playClick();

    expect(m.ctx.resume).toHaveBeenCalled();
  });
});

describe('RadioSFX switch sample slot', () => {
  it('defaults to the synthesiser and accepts an injected recording', () => {
    const sfx = new RadioSFX();
    expect(sfx.hasSwitchSample()).toBe(false);
    const fake = { duration: 0.28, length: 12345, numberOfChannels: 2 } as unknown as AudioBuffer;
    sfx.setSwitchSample(fake);
    expect(sfx.hasSwitchSample()).toBe(true);
    sfx.setSwitchSample(null);
    expect(sfx.hasSwitchSample()).toBe(false);
  });
});
