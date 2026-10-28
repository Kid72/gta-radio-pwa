import { describe, it, expect } from 'vitest';
import { getCurrentCue } from './trackCues';
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
});
