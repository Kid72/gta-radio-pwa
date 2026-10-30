import { describe, it, expect } from 'vitest';
import coverIndexRaw from './cover-index.json';
import { coverIndexMeta, coverIndexSize, lookupCoverArt } from './coverIndex';
import { coverKey, normalizeCoverPart } from '../utils/coverKeys';
import gtasaRaw from './gtasa.json';
import gta4Raw from './gta4.json';
import gta5Raw from './gta5.json';

/**
 * Guards the pre-built artwork index: it must stay internally consistent with
 * its own _meta block, lookups must hit for every stored key, and coverage of
 * the music cues must not silently collapse below the shipped floor.
 */

/**
 * Coverage floor for the shipped index: 0.70 — comfortably below the current
 * 0.82 so adding a few new stations will not fail the build, but a collapsed
 * or half-generated index will. Re-run `node scripts/build-cover-index.mjs`
 * after editing the station JSON.
 */
const COVERAGE_FLOOR = 0.7;

type StationLike = { id: string; timestamps?: { type?: string; artist?: string; song?: string }[] };

function musicKeys(stations: StationLike[]): Set<string> {
  const keys = new Set<string>();
  for (const station of stations) {
    for (const cue of station.timestamps || []) {
      if (cue.type !== 'music') continue;
      if (!cue.artist || !cue.song) continue;
      keys.add(coverKey(cue.artist, cue.song));
    }
  }
  return keys;
}

const gtasaKeys = musicKeys(gtasaRaw as StationLike[]);
const gta4Keys = musicKeys(gta4Raw as StationLike[]);
const gta5Keys = musicKeys(gta5Raw as StationLike[]);
const allKeys = new Set([...gtasaKeys, ...gta4Keys, ...gta5Keys]);

const INDEX = coverIndexRaw as Record<string, unknown>;
const ENTRY_KEYS = Object.keys(INDEX).filter((k) => k !== '_meta');

describe('cover index', () => {
  it('ships an index with a consistent _meta block', () => {
    expect(coverIndexMeta.total).toBe(allKeys.size);
    expect(coverIndexMeta.tracked).toBe(coverIndexSize);
    expect(coverIndexSize).toBe(ENTRY_KEYS.length);
    expect((coverIndexMeta.missing ?? 0) + coverIndexMeta.tracked).toBe(coverIndexMeta.total);
    expect(typeof coverIndexMeta.generatedAt).toBe('string');
  });

  it('every index key resolves through the public O(1) lookup', () => {
    const broken: string[] = [];
    for (const key of ENTRY_KEYS) {
      const [artist, song] = key.split('|');
      if (!artist || !song) {
        broken.push(`${key}: malformed key`);
        continue;
      }
      const hit = lookupCoverArt(artist, song);
      if (!hit) broken.push(`${key}: lookup miss`);
    }
    expect(broken).toEqual([]);
  });

  it('every entry is an https URL with a known source and no junk keys', () => {
    const bad = ENTRY_KEYS.filter((key) => {
      const entry = INDEX[key] as { url?: unknown; source?: unknown };
      return (
        typeof entry?.url !== 'string' ||
        !/^https:\/\//.test(entry.url as string) ||
        typeof entry?.source !== 'string' ||
        !entry.source
      );
    });
    expect(bad).toEqual([]);
  });

  it('only indexes keys that really exist as music cues in the station JSON', () => {
    const strangers = ENTRY_KEYS.filter((key) => !allKeys.has(key));
    expect(strangers).toEqual([]);
  });

  it(`covers at least ${Math.round(COVERAGE_FLOOR * 100)}% of all music cues`, () => {
    const ratio = coverIndexSize / Math.max(1, allKeys.size);
    expect(ratio).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });

  it('normalises keys so lookups survive case, punctuation and accents', () => {
    expect(normalizeCoverPart('  Dr. Dre  ')).toBe('dr dre');
    expect(normalizeCoverPart("Guns N' Roses")).toBe('guns n roses');
    expect(normalizeCoverPart('Beyoncé')).toBe('beyonce');
    expect(normalizeCoverPart('AC/DC & Friends')).toBe('ac dc and friends');
    expect(coverKey('The Greg Kihn Band', "The Breakup Song (They Don't Write 'Em)")).toBe(
      'the greg kihn band|the breakup song they dont write em'
    );
  });

  it('returns null instead of throwing for unknown tracks and bad input', () => {
    expect(lookupCoverArt('Totally Unknown Artist', 'Totally Unknown Song')).toBeNull();
    expect(lookupCoverArt('', '')).toBeNull();
    expect(lookupCoverArt('   ', '  ')).toBeNull();
  });

  it('keeps the coverArtService test fixtures out of the index (they exist to exercise the network path)', () => {
    const fixtures: [string, string][] = [
      ['Fixture Artist Alpha', 'Fixture Song Alpha'],
      ['Fixture Artist Beta', 'Fixture Song Beta'],
      ['Fixture Artist Gamma', 'Fixture Song Gamma'],
      ['Fixture Artist Delta', 'Fixture Song Delta'],
      ['Fixture Artist Epsilon', 'Fixture Song Epsilon'],
      ['Fixture Artist Zeta', 'Fixture Song Zeta'],
    ];
    for (const [artist, song] of fixtures) {
      expect(lookupCoverArt(artist, song)).toBeNull();
    }
  });
});
