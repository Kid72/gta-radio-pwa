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
});
