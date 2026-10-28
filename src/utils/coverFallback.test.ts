import { describe, it, expect } from 'vitest';
import { generateVinylCoverSvg } from './coverFallback';

describe('generateVinylCoverSvg', () => {
  it('generates a valid data:image/svg+xml URI with defaults', () => {
    const uri = generateVinylCoverSvg();
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(uri).toContain('STEREO');
    expect(uri).toContain('Now%20Playing');
  });

  it('safely escapes special XML characters in song and artist names', () => {
    const uri = generateVinylCoverSvg({
      song: 'Rock & Roll <Live> "Edition"',
      artist: "Guns N' Roses",
      stationName: 'Radio X & Co',
      accentColor: '#4ae891',
    });

    expect(uri).toContain('Rock%20%26amp%3B%20Roll');
    expect(uri).toContain('Guns%20N%26apos%3B%20Roses');
    expect(uri).toContain('%234ae891'); // #4ae891 URL encoded
  });

  it('truncates very long track names to fit label radius without overflowing', () => {
    const longSong = 'A'.repeat(50);
    const uri = generateVinylCoverSvg({ song: longSong });
    expect(decodeURIComponent(uri)).toContain('…');
  });
});
