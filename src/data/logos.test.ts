import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gtasaRaw from './gtasa.json';
import gta4Raw from './gta4.json';
import gta5Raw from './gta5.json';

/**
 * Station logo audit gate.
 *
 * Every logoUrl shipped in the JSON must resolve to a real, non-empty image
 * file in public/ with an exact-case filename and matching magic bytes.
 * This is the permanent version of the "which stations have no logo?" audit:
 * if a logo disappears from disk or a path drifts, this test fails.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '../../public');

interface StationLike {
  id: string;
  gameId: string;
  name: string;
  logoUrl?: string;
}

const ALL_STATIONS: StationLike[] = [
  ...(gtasaRaw as StationLike[]),
  ...(gta4Raw as StationLike[]),
  ...(gta5Raw as StationLike[]),
];

const MAGIC: Record<string, (buf: Buffer) => boolean> = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) =>
    b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  svg: (b) => {
    const head = b.subarray(0, 400).toString('utf8').trim().toLowerCase();
    return head.startsWith('<svg') || head.startsWith('<?xml');
  },
};

const extOf = (file: string) => path.extname(file).slice(1).toLowerCase();

function resolveLogoFile(logoUrl: string): { absPath: string; relPath: string } {
  const clean = decodeURI(logoUrl).replace(/^\/+/, '');
  return { absPath: path.join(PUBLIC_DIR, clean), relPath: clean };
}

describe('station logo audit gate', () => {
  it('audits every station of every game (no station may be skipped)', () => {
    expect(ALL_STATIONS.length).toBe(56);
    expect(ALL_STATIONS.filter((s) => s.gameId === 'gtasa').length).toBe(11);
    expect(ALL_STATIONS.filter((s) => s.gameId === 'gta4').length).toBe(19);
    expect(ALL_STATIONS.filter((s) => s.gameId === 'gta5').length).toBe(26);
  });

  it('every station declares a local logoUrl under /logos/', () => {
    const broken = ALL_STATIONS.filter(
      (s) => !s.logoUrl || !s.logoUrl.startsWith('/logos/') || /^https?:/.test(s.logoUrl)
    ).map((s) => `${s.gameId}/${s.id} -> ${s.logoUrl ?? '(none)'}`);
    expect(broken).toEqual([]);
  });

  it('every logoUrl exists on disk with an exact-case filename', () => {
    const problems: string[] = [];
    for (const station of ALL_STATIONS) {
      const { absPath, relPath } = resolveLogoFile(station.logoUrl as string);
      if (!fs.existsSync(absPath)) {
        problems.push(`${station.gameId}/${station.id}: missing file public/${relPath}`);
        continue;
      }
      const dir = path.dirname(absPath);
      const base = path.basename(absPath);
      const onDisk = fs.readdirSync(dir);
      if (!onDisk.includes(base)) {
        const similar = onDisk.filter((f) => f.toLowerCase() === base.toLowerCase());
        problems.push(
          `${station.gameId}/${station.id}: case mismatch public/${relPath}` +
            (similar.length ? ` (found ${similar.join(', ')})` : '')
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('every logo file is a real image: non-empty, known extension, matching magic bytes', () => {
    const problems: string[] = [];
    for (const station of ALL_STATIONS) {
      const { absPath } = resolveLogoFile(station.logoUrl as string);
      if (!fs.existsSync(absPath)) continue; // covered by the test above
      const ext = extOf(absPath);
      const check = MAGIC[ext];
      if (!check) {
        problems.push(`${station.gameId}/${station.id}: unsupported extension .${ext}`);
        continue;
      }
      const stat = fs.statSync(absPath);
      if (stat.size < 512) {
        problems.push(`${station.gameId}/${station.id}: suspiciously small file (${stat.size} bytes)`);
        continue;
      }
      if (!check(fs.readFileSync(absPath))) {
        problems.push(`${station.gameId}/${station.id}: magic bytes do not match .${ext}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('no two stations share the same logo file', () => {
    const seen = new Map<string, string[]>();
    for (const station of ALL_STATIONS) {
      const key = resolveLogoFile(station.logoUrl as string).relPath;
      seen.set(key, [...(seen.get(key) || []), `${station.gameId}/${station.id}`]);
    }
    const dupes = [...seen.entries()].filter(([, owners]) => owners.length > 1);
    expect(dupes).toEqual([]);
  });
});
