import { Station, TrackCue } from '../types/radio';
import { getTimingsForLoop } from '../data/trackTimings';

/**
 * The cue table is authored against the catalog `station.duration`, while the
 * audio that actually plays has its own (measured) length. Two numbers decide
 * what we can trust:
 *
 * A station with measured timings (`src/data/track-timings.json`) skips all of
 * this: those boundaries already describe the shipped audio.
 *
 * - `CUE_EXACT_TOLERANCE`: table end and real loop are the same timeline.
 * - `CUE_SCALE_TOLERANCE`: same playlist, re-edited (fades, ad trims), so cue
 *   boundaries can be mapped linearly onto the real file.
 *
 * Anything wider cannot be repaired by scaling — `gta5:radio-los-santos` has a
 * 21384 s table for a 6691 s file (220% off), i.e. the file does not contain the
 * tracks the table names. There we show station-level info instead of a
 * confidently wrong song title.
 */
export const CUE_EXACT_TOLERANCE = 0.02;
export const CUE_SCALE_TOLERANCE = 0.12;

/** Where a cue table sits relative to the audio loop. */
export type CueTimelineSource = 'measured' | 'exact' | 'scaled' | 'partial' | 'untrusted';

export interface CueTimeline {
  /** Cues in *audio* seconds, ready to compare against `currentTime`. */
  cues: TrackCue[];
  /** Loop length the cues are expressed in. */
  duration: number;
  source: CueTimelineSource;
}

function stationLevelCue(station: Station, duration: number): TrackCue {
  return {
    start: 0,
    end: duration,
    song: station.name,
    artist: station.host || station.genre || 'GTA Live Radio',
    type: 'talk',
  };
}

function relativeGap(a: number, b: number): number {
  const base = Math.max(a, b);
  return base > 0 ? Math.abs(a - b) / base : 0;
}

/**
 * Maps a station's cue table onto the loop length of the audio being played.
 *
 * `partial` means the table does not describe the whole playlist (it ends well
 * before the catalog duration); such tables are used as-is against the catalog
 * timeline, which is the pre-existing behaviour for hand-made fixtures.
 */
export function resolveCueTimeline(
  station: Station,
  loopDuration: number = station.duration
): CueTimeline {
  const cues = station.timestamps ?? [];
  const loop = loopDuration > 0 ? loopDuration : 0;

  // Measured timings win: they are the only table that describes this audio.
  const measured = getTimingsForLoop(station.gameId, station.id, loop);
  if (measured) {
    return { cues: measured.cues, duration: loop, source: 'measured' };
  }

  const catalog = station.duration > 0 ? station.duration : 0;

  if (cues.length === 0 || loop <= 0) {
    return { cues: [], duration: loop, source: 'untrusted' };
  }

  const tableEnd = Math.max(...cues.map((cue) => cue.end));
  if (!(tableEnd > 0)) {
    return { cues: [], duration: loop, source: 'untrusted' };
  }

  // A table that stops long before the catalog duration is a partial list, not
  // a mismatched timeline — keep the legacy behaviour for it.
  if (catalog > 0 && relativeGap(tableEnd, catalog) > CUE_SCALE_TOLERANCE) {
    return { cues, duration: catalog, source: 'partial' };
  }

  const gap = relativeGap(tableEnd, loop);
  if (gap <= CUE_EXACT_TOLERANCE) {
    return { cues, duration: loop, source: 'exact' };
  }
  if (gap <= CUE_SCALE_TOLERANCE) {
    const factor = loop / tableEnd;
    return {
      cues: cues.map((cue) => ({
        ...cue,
        start: Math.min(loop, cue.start * factor),
        end: Math.min(loop, cue.end * factor),
      })),
      duration: loop,
      source: 'scaled',
    };
  }

  return { cues: [], duration: loop, source: 'untrusted' };
}

/**
 * Cue for the current second. `loopDuration` must be the length of the audio
 * actually playing (see `getStationLoopDuration`), otherwise the song title
 * drifts away from the audio by however wrong the catalog duration is.
 */
export function getCurrentCue(
  station: Station,
  currentSeconds: number,
  loopDuration: number = station.duration
): TrackCue {
  const timeline = resolveCueTimeline(station, loopDuration);
  const duration = timeline.duration;

  if (!(duration > 0)) {
    return stationLevelCue(station, 0);
  }

  const normalizedSeconds = ((currentSeconds % duration) + duration) % duration;

  const found = timeline.cues.find(
    (cue) => cue.start <= normalizedSeconds && normalizedSeconds <= cue.end
  );

  if (found) {
    return found;
  }

  return stationLevelCue(station, duration);
}
