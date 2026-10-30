import { describe, it, expect } from 'vitest';
import { getCurrentCue, resolveCueTimeline } from './trackCues';
import { Station } from '../types/radio';

describe('getCurrentCue', () => {
  const mockStation: Station = {
    id: 'test-station',
    gameId: 'gta5',
    name: 'Non-Stop Pop FM',
    genre: 'Pop',
    host: 'DJ Cara',
    logoUrl: '/logos/non-stop-pop.png',
    audioUrl: 'https://archive.org/test.mp3',
    duration: 1000,
    initialOffset: 0,
    timestamps: [
      { start: 0, end: 180, song: 'Music Sounds Better with You', artist: 'Stardust', type: 'music' },
      { start: 181, end: 240, song: 'DJ Banter & Ident', artist: 'DJ Cara', type: 'talk' },
      { start: 241, end: 400, song: 'Lady (Hear Me Tonight)', artist: 'Modjo', type: 'music' },
    ],
  };

  it('matches track when within range', () => {
    const cue = getCurrentCue(mockStation, 100);
    expect(cue.song).toBe('Music Sounds Better with You');
    expect(cue.artist).toBe('Stardust');
  });

  it('matches talk/DJ cue correctly', () => {
    const cue = getCurrentCue(mockStation, 200);
    expect(cue.type).toBe('talk');
    expect(cue.artist).toBe('DJ Cara');
  });

  it('falls back to default station cue when between indexed timestamps', () => {
    const cue = getCurrentCue(mockStation, 500);
    expect(cue.song).toBe('Non-Stop Pop FM');
    expect(cue.artist).toBe('DJ Cara');
    expect(cue.type).toBe('talk');
  });

  it('handles modulo wrap-around when currentSeconds exceeds station duration', () => {
    // 2100 seconds wraps around duration 1000 to normalized 100 seconds
    const cue = getCurrentCue(mockStation, 2100);
    expect(cue.song).toBe('Music Sounds Better with You');
    expect(cue.artist).toBe('Stardust');
    expect(cue.type).toBe('music');
  });

  it('handles stations with duration of zero or negative duration safely', () => {
    const zeroDurationStation: Station = { ...mockStation, duration: 0 };
    const cueZero = getCurrentCue(zeroDurationStation, 150);
    expect(cueZero.song).toBe('Non-Stop Pop FM');
    expect(cueZero.artist).toBe('DJ Cara');
    expect(cueZero.type).toBe('talk');
    expect(cueZero.start).toBe(0);
    expect(cueZero.end).toBe(0);

    const negDurationStation: Station = { ...mockStation, duration: -500 };
    const cueNeg = getCurrentCue(negDurationStation, 150);
    expect(cueNeg.song).toBe('Non-Stop Pop FM');
  });

  it('falls back to genre when host is undefined on zero duration', () => {
    const noHostStation: Station = { ...mockStation, duration: 0, host: undefined };
    const cue = getCurrentCue(noHostStation, 10);
    expect(cue.artist).toBe('Pop');
  });

  describe('cue timeline vs the real audio loop', () => {
    // A full-playlist table that ends exactly at the catalog duration
    const fullTableStation: Station = {
      ...mockStation,
      duration: 1000,
      timestamps: [
        { start: 0, end: 500, song: 'First', artist: 'A', type: 'music' },
        { start: 500, end: 1000, song: 'Second', artist: 'B', type: 'music' },
      ],
    };

    it('uses the table as-is when it matches the audio loop', () => {
      const timeline = resolveCueTimeline(fullTableStation, 1000);
      expect(timeline.source).toBe('exact');
      expect(getCurrentCue(fullTableStation, 250, 1000).song).toBe('First');
      expect(getCurrentCue(fullTableStation, 750, 1000).song).toBe('Second');
    });

    it('maps a re-edited table linearly onto a longer file (fades, ad trims)', () => {
      // catalog 1000 s, shipped file 1040 s (4% longer)
      const timeline = resolveCueTimeline(fullTableStation, 1040);
      expect(timeline.source).toBe('scaled');
      expect(timeline.duration).toBe(1040);
      expect(timeline.cues[1].start).toBeCloseTo(520, 5);
      // 520 is the real boundary: 519 is still the first track
      expect(getCurrentCue(fullTableStation, 519, 1040).song).toBe('First');
      expect(getCurrentCue(fullTableStation, 521, 1040).song).toBe('Second');
    });

    it('refuses to name a track when the table cannot describe the file', () => {
      // gta5:radio-los-santos shape: 1000 s table, 1500 s file (50% off)
      const timeline = resolveCueTimeline(fullTableStation, 1500);
      expect(timeline.source).toBe('untrusted');
      expect(timeline.cues).toHaveLength(0);

      const cue = getCurrentCue(fullTableStation, 700, 1500);
      expect(cue.song).toBe('Non-Stop Pop FM');
      expect(cue.type).toBe('talk');
    });

    it('keeps partial hand-made tables on the catalog timeline (legacy fixtures)', () => {
      // mockStation's table ends at 400 s while the catalog says 1000 s
      const timeline = resolveCueTimeline(mockStation, 1000);
      expect(timeline.source).toBe('partial');
      expect(timeline.duration).toBe(1000);
      expect(getCurrentCue(mockStation, 100, 1000).song).toBe('Music Sounds Better with You');
    });

    it('normalizes by the loop length of the audio, not the catalog duration', () => {
      // 1300 s in a 1040 s file is 260 s into the loop, i.e. still track one
      expect(getCurrentCue(fullTableStation, 1300, 1040).song).toBe('First');
    });
  });
});
