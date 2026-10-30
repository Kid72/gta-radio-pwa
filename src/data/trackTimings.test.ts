import { describe, it, expect } from 'vitest';
import {
  TRACK_TIMINGS,
  getStationTimings,
  getTimingsForLoop,
  timingsKey,
} from './trackTimings';
import { getStationLoopDuration, getChunkMeta } from './chunkManifest';
import { GAMES } from './catalog';
import { AUDIO_OWNER_OVERRIDES, getAudioOwnerOverride, hasForeignAudio } from './audioOwners';
import { resolveCueTimeline, getCurrentCue } from '../utils/trackCues';
import type { Station } from '../types/radio';

const ALL_STATIONS: Station[] = Object.values(GAMES).flatMap((game) => game.stations);
const byKey = new Map(ALL_STATIONS.map((s) => [timingsKey(s.gameId, s.id), s]));

describe('shipped track timings', () => {
  it('only references stations that exist in the catalogs', () => {
    const unknown = Object.keys(TRACK_TIMINGS).filter((key) => !byKey.has(key));
    expect(unknown).toEqual([]);
  });

  it('closes every timeline exactly on the real audio loop', () => {
    const problems: string[] = [];
    for (const [key, entry] of Object.entries(TRACK_TIMINGS)) {
      const station = byKey.get(key)!;
      const loop = getStationLoopDuration(station);

      if (Math.abs(entry.duration - loop) / loop > 0.01) {
        problems.push(`${key}: duration ${entry.duration} vs file ${loop}`);
      }
      const last = entry.cues[entry.cues.length - 1];
      if (Math.abs(last.end - entry.duration) > 0.01) {
        problems.push(`${key}: last cue ends at ${last.end}, expected ${entry.duration}`);
      }
      if (Math.abs(entry.cues[0].start) > 0.001) {
        problems.push(`${key}: first cue starts at ${entry.cues[0].start}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps cues ordered, non-overlapping and non-empty', () => {
    const problems: string[] = [];
    for (const [key, entry] of Object.entries(TRACK_TIMINGS)) {
      for (let i = 0; i < entry.cues.length; i++) {
        const cue = entry.cues[i];
        if (!(cue.end > cue.start)) problems.push(`${key}: cue #${i} has no length`);
        if (i > 0 && cue.start < entry.cues[i - 1].end - 0.01) {
          problems.push(`${key}: cue #${i} overlaps #${i - 1}`);
        }
        if (!cue.song) problems.push(`${key}: cue #${i} has no song`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('ignores timings whose loop length no longer matches the audio', () => {
    const ww = byKey.get('gta5:worldwide-fm')!;
    const exact = getStationTimings('gta5', 'worldwide-fm')!;

    expect(getTimingsForLoop('gta5', 'worldwide-fm', exact.duration)).not.toBeNull();
    // 5% off = a different file, do not trust the boundaries
    expect(getTimingsForLoop('gta5', 'worldwide-fm', exact.duration * 1.05)).toBeNull();
    expect(getTimingsForLoop('gta5', 'worldwide-fm', 0)).toBeNull();
    // a station without measured timings stays null
    expect(getTimingsForLoop('gta5', 'the-blue-ark', 1000)).toBeNull();
    expect(getStationLoopDuration(ww)).toBeCloseTo(exact.duration, 3);
  });

  it('serves measured cues to the HUD instead of the authored table', () => {
    const ww = byKey.get('gta5:worldwide-fm')!;
    const measured = getStationTimings('gta5', 'worldwide-fm')!;
    const loop = getStationLoopDuration(ww);

    const timeline = resolveCueTimeline(ww, loop);
    expect(timeline.source).toBe('measured');
    expect(timeline.cues).toHaveLength(measured.cues.length);

    // the second half of the loop must name a different track than the first
    const first = getCurrentCue(ww, 30, loop);
    const mid = getCurrentCue(ww, measured.duration / 2, loop);
    expect(first.song).not.toBe(mid.song);

    // the boundary really moves the label
    const cue = measured.cues[1];
    const before = getCurrentCue(ww, cue.start - 1, loop);
    const after = getCurrentCue(ww, cue.start + 1, loop);
    expect(before.song).toBe(measured.cues[0].song);
    expect(after.song).toBe(cue.song);
  });

  it('leaves stations without measured timings to the fallback logic', () => {
    const talk = byKey.get('gta5:wctr')!;
    expect(getStationTimings('gta5', 'wctr')).toBeNull();
    const timeline = resolveCueTimeline(talk, getStationLoopDuration(talk));
    expect(timeline.source).not.toBe('measured');
  });

  it('covers the stations whose playlist could be verified against the audio', () => {
    // 17 of 55 stations passed the coverage/length gate; the rest keep station info
    expect(Object.keys(TRACK_TIMINGS).length).toBeGreaterThanOrEqual(15);
    expect(getChunkMeta('gta5', 'worldwide-fm')).not.toBeNull();
  });
});

describe('audio owner overrides', () => {
  it('ships no station whose file belongs to another station', () => {
    expect(Object.keys(AUDIO_OWNER_OVERRIDES)).toEqual([]);
    const foreign = ALL_STATIONS.filter((s) => hasForeignAudio(s.gameId, s.id)).map((s) =>
      timingsKey(s.gameId, s.id),
    );
    expect(foreign).toEqual([]);
  });

  it('still marks a station untrusted while an override names another owner', () => {
    const key = 'gta5:kult-fm';
    AUDIO_OWNER_OVERRIDES[key] = {
      owner: 'gta5:radio-mirror-park',
      ownerName: 'Radio Mirror Park',
      fileTitle: 'Radio Mirror Park',
    };
    try {
      const station = byKey.get(key)!;
      const loop = getStationLoopDuration(station);

      expect(hasForeignAudio(station.gameId, station.id)).toBe(true);
      expect(getAudioOwnerOverride(station.gameId, station.id)?.ownerName).toBe('Radio Mirror Park');

      const timeline = resolveCueTimeline(station, loop);
      expect(timeline.source).toBe('untrusted');
      expect(timeline.cues).toEqual([]);
      const cue = getCurrentCue(station, loop / 3, loop);
      expect(cue.song).toBe(station.name);
    } finally {
      delete AUDIO_OWNER_OVERRIDES[key];
    }
  });

  it('resolves cues again once the override is removed', () => {
    const station = byKey.get('gta5:kult-fm')!;
    const loop = getStationLoopDuration(station);

    expect(hasForeignAudio(station.gameId, station.id)).toBe(false);
    expect(resolveCueTimeline(station, loop).source).not.toBe('untrusted');
  });
});
