import rawIndex from './cover-index.json';
import { coverKey } from '../utils/coverKeys';

export type CoverSource = 'deezer' | 'itunes' | 'none' | string;

export interface CoverIndexEntry {
  url: string;
  source: CoverSource;
}

export interface CoverIndexMeta {
  tracked: number;
  total: number;
  missing?: number;
  sources?: Record<string, number>;
  games?: string[];
  generatedAt?: string;
  note?: string;
}

interface CoverIndexFile extends Record<string, unknown> {
  _meta?: CoverIndexMeta;
}

const INDEX = rawIndex as unknown as CoverIndexFile;

export const coverIndexMeta: CoverIndexMeta =
  INDEX._meta && typeof INDEX._meta === 'object'
    ? INDEX._meta
    : { tracked: 0, total: 0 };

export const coverIndexSize: number = Object.keys(INDEX).filter((key) => key !== '_meta').length;

/**
 * O(1) lookup of pre-downloaded album artwork.
 * Never throws, never returns a non-http(s) value.
 */
export function lookupCoverArt(artist: string, song: string): CoverIndexEntry | null {
  if (!artist || !song) return null;
  const hit = INDEX[coverKey(artist, song)];
  if (!hit || typeof hit !== 'object') return null;
  const entry = hit as CoverIndexEntry;
  if (typeof entry.url !== 'string' || !/^https?:\/\//.test(entry.url)) return null;
  return { url: entry.url, source: entry.source || 'unknown' };
}
