#!/usr/bin/env node
/**
 * Pre-builds the album cover index for every unique (artist, song) music cue
 * in src/data/{gtasa,gta4,gta5}.json.
 *
 * Sources (both public, no API key):
 *   1. Deezer  https://api.deezer.com/search?q=...        -> album.cover_xl (1000px)
 *   2. iTunes  https://itunes.apple.com/search?term=...    -> artworkUrl100 bumped to 600x600
 *
 * Behaviour:
 *   - rate limited (COVER_DELAY_MS, default 300ms) between every HTTP request
 *   - idempotent: results (hits AND misses) are cached in .cache/cover-index.json,
 *     a repeat run only fetches the still-unknown keys (pass --retry-misses to
 *     re-attempt previous misses)
 *   - strict matching: a candidate is only accepted when both title and artist
 *     loosely agree, so we never ship a wrong album cover
 *   - no npm dependencies: fetch + node:fs only
 *
 * Usage:
 *   node scripts/build-cover-index.mjs                 # build / top up
 *   node scripts/build-cover-index.mjs --limit 25      # smoke test
 *   node scripts/build-cover-index.mjs --games gta5    # one or more games (csv)
 *   node scripts/build-cover-index.mjs --retry-misses  # re-attempt known misses
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const OUT_FILE = path.join(DATA_DIR, 'cover-index.json');
const CACHE_FILE = path.join(ROOT, '.cache', 'cover-index.json');
const DELAY_MS = Math.max(250, Number(process.env.COVER_DELAY_MS || 300));
const GAMES = ['gtasa', 'gta4', 'gta5'];

/* ------------------------------------------------------------------ args */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const LIMIT = Number(value('limit', '0')) || 0;
const ONLY_GAMES = value('games', '')
  ? value('games', '').split(',').map((g) => g.trim()).filter(Boolean)
  : GAMES;
const RETRY_MISSES = flag('retry-misses');

/* ------------------------------------------------- normalization (mirror)
 * MUST stay byte-for-byte equivalent to normalizeCoverPart() in
 * src/utils/coverKeys.ts — the runtime looks the index up with that function.
 */
export function normalizeCoverPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2018\u2019`\u00b4]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export const coverKey = (artist, song) => `${normalizeCoverPart(artist)}|${normalizeCoverPart(song)}`;

const stripFeatured = (artist) =>
  String(artist || '').replace(/\s*[([]?\s*(feat\.?|ft\.?|featuring|with)\s.*$/i, '').trim();

const compact = (value) => String(value || '').replace(/\s+/g, '');

const normTitle = (title) =>
  normalizeCoverPart(
    String(title || '')
      // drop "(feat. X)" / "(Remastered 2011)" / "[Live]" style suffixes
      .replace(/\s*[([][^)\]]*[)\]]/gi, ' ')
      .replace(/\s*[-\u2013]\s*(remaster(ed)?.*|.*remaster.*|\d{4} remaster|.*version)$/i, '')
      // drop a trailing "feat. X" that is not in brackets
      .replace(/\s+(feat\.?|ft\.?|featuring|with)\s.*$/i, ' ')
  );

const MIN_OVERLAP = 6;

function looseEqual(a, b) {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "zeze" vs "zeze remix": also compare without spaces so "n joi" == "njoi"
  if (compact(x) === compact(y)) return true;
  const [shortSide, longSide] = x.length <= y.length ? [x, y] : [y, x];
  return shortSide.length >= MIN_OVERLAP && longSide.includes(shortSide);
}

function artistMatches(want, got) {
  const a = normalizeCoverPart(stripFeatured(want));
  const b = normalizeCoverPart(stripFeatured(got));
  if (!a || !b) return false;
  if (a === b) return true;
  if (compact(a) === compact(b)) return true;
  const [shortSide, longSide] = a.length <= b.length ? [a, b] : [b, a];
  if (shortSide.length >= 4 && longSide.includes(shortSide)) return true;

  // Token containment: "Charles Wright & the Watts 103rd Street Band" vs
  // "Charles Wright & The Watts 103rd Street Rhythm Band" is the same artist.
  const tokens = (s) => s.split(' ').filter((t) => t && t !== 'the' && t !== 'and');
  const tShort = tokens(shortSide);
  const tLong = new Set(tokens(longSide));
  return tShort.length >= 3 && tShort.every((token) => tLong.has(token));
}

function pickBest(results, wantArtist, wantSong, read) {
  for (const item of results) {
    const { artist, title } = read(item);
    if (!artist || !title) continue;
    if (normTitle(title) === normTitle(wantSong) && artistMatches(wantArtist, artist)) {
      return { item, exact: true };
    }
  }
  for (const item of results) {
    const { artist, title } = read(item);
    if (!artist || !title) continue;
    if (looseEqual(wantSong, title) && artistMatches(wantArtist, artist)) {
      return { item, exact: false };
    }
  }
  return null;
}

/* ------------------------------------------------------------- transport */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
let requestCount = 0;

async function politeFetch(url, asJson = true) {
  const waitFor = DELAY_MS - (Date.now() - lastRequestAt);
  if (waitFor > 0) await sleep(waitFor);
  lastRequestAt = Date.now();
  requestCount += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'gta-radio-pwa cover-index builder (+https://github.com/)' },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: asJson ? await res.json() : null };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

async function searchDeezer(artist, song) {
  const q = encodeURIComponent(`${artist} ${song}`);
  const res = await politeFetch(`https://api.deezer.com/search?q=${q}&limit=8`);
  if (!res.ok) return { url: null, reason: `deezer-http-${res.status}` };
  const results = Array.isArray(res.data?.data) ? res.data.data : [];
  const best = pickBest(results, artist, song, (t) => ({
    artist: t?.artist?.name,
    title: t?.title,
  }));
  if (!best) return { url: null, reason: 'deezer-no-match' };
  const cover = best.item?.album?.cover_xl || best.item?.album?.cover_big || null;
  if (!cover) return { url: null, reason: 'deezer-no-cover' };
  return { url: String(cover), source: 'deezer', match: best.exact ? 'exact' : 'loose' };
}

async function searchItunes(artist, song, reversed = false) {
  const phrase = reversed ? `${song} ${artist}` : `${artist} ${song}`;
  const term = encodeURIComponent(phrase);
  const res = await politeFetch(
    `https://itunes.apple.com/search?term=${term}&entity=song&limit=10&media=music`
  );
  if (!res.ok) return { url: null, reason: `itunes-http-${res.status}` };
  const results = Array.isArray(res.data?.results) ? res.data.results : [];
  const best = pickBest(results, artist, song, (t) => ({
    artist: t?.artistName,
    title: t?.trackName,
  }));
  if (!best) return { url: null, reason: 'itunes-no-match' };
  const raw = best.item?.artworkUrl100 || best.item?.artworkUrl60;
  if (!raw) return { url: null, reason: 'itunes-no-cover' };
  const url = String(raw).replace(/\d+x\d+bb/, '600x600bb');
  return { url, source: 'itunes', match: best.exact ? 'exact' : 'loose' };
}

/* ------------------------------------------------------------ collection */
function collectTracks() {
  const seen = new Map();
  for (const game of ONLY_GAMES) {
    const file = path.join(DATA_DIR, `${game}.json`);
    if (!fs.existsSync(file)) continue;
    const stations = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const station of stations) {
      for (const cue of station.timestamps || []) {
        if (cue.type !== 'music') continue;
        const artist = String(cue.artist || '').trim();
        const song = String(cue.song || '').trim();
        if (!artist || !song) continue;
        const key = coverKey(artist, song);
        if (!seen.has(key)) {
          seen.set(key, { key, artist, song, games: new Set([game]), stations: new Set([station.id]) });
        } else {
          const entry = seen.get(key);
          entry.games.add(game);
          entry.stations.add(station.id);
        }
      }
    }
  }
  return [...seen.values()];
}

function readJson(file, dflt) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return dflt;
  }
}

/* ------------------------------------------------------------------- main */
async function main() {
  const tracks = collectTracks();
  const cache = readJson(CACHE_FILE, { entries: {} });
  const entries = cache.entries || {};

  const unknown = tracks.filter((t) => {
    const hit = entries[t.key];
    if (!hit) return true;
    if (hit.url) return false;
    return RETRY_MISSES;
  });
  const todo = LIMIT > 0 ? unknown.slice(0, LIMIT) : unknown;

  console.error(
    `cover-index: ${tracks.length} unique tracks, ${tracks.length - unknown.length} cached, ` +
      `${todo.length} to fetch (delay ${DELAY_MS}ms)`
  );

  let done = 0;
  for (const track of todo) {
    let result = await searchDeezer(track.artist, track.song);
    if (!result.url) {
      result = await searchItunes(track.artist, track.song);
    }
    if (!result.url) {
      // Third chance: providers rank "song artist" differently than "artist song".
      result = await searchItunes(track.artist, track.song, true);
    }

    entries[track.key] = {
      url: result.url || null,
      source: result.url ? result.source : 'none',
      match: result.match || null,
      artist: track.artist,
      song: track.song,
      reason: result.url ? undefined : result.reason,
      fetchedAt: new Date().toISOString(),
    };
    done += 1;

    if (done % 20 === 0 || done === todo.length) {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify({ version: 1, entries }, null, 0)
      );
      console.error(`  ... ${done}/${todo.length} (requests: ${requestCount})`);
    }
  }

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: 1, entries }, null, 0));

  // ---- emit the shipped index (hits only) --------------------------------
  const index = {};
  const sources = {};
  let covered = 0;
  for (const track of tracks) {
    const hit = entries[track.key];
    if (!hit || !hit.url) continue;
    index[track.key] = { url: hit.url, source: hit.source };
    sources[hit.source] = (sources[hit.source] || 0) + 1;
    covered += 1;
  }

  const payload = {
    _meta: {
      tracked: covered,
      total: tracks.length,
      missing: tracks.length - covered,
      sources,
      games: ONLY_GAMES,
      generatedAt: new Date().toISOString(),
      note: 'Pre-built album cover index. Key = normalize(artist)|normalize(song). Misses fall through to the live search + procedural vinyl cover at runtime.',
    },
    ...index,
  };
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 0)}\n`);

  console.error(
    `cover-index: wrote ${covered}/${tracks.length} covers -> ${path.relative(ROOT, OUT_FILE)} ` +
      `(${sources.deezer || 0} deezer, ${sources.itunes || 0} itunes, ${tracks.length - covered} misses)`
  );
}

await main();
