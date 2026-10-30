# Re-acquired audio: five GTA V stations

Five GTA V stations shipped a byte-identical copy of *another* station's file, because
their `audioUrl` pointed at the wrong archive.org item (`GTAVRadioStations` has no file
for them at all, so a placeholder was used):

| station | id | file it used to ship | ID3 owner |
|---|---|---|---|
| Kult FM | `kult-fm` | Radio Mirror Park.mp3 | Radio Mirror Park |
| The Lowdown 91.1 | `the-lowdown-911` | Space 103.2.mp3 | Space 103.2 |
| MOTOMAMI Los Santos | `motomami-los-santos` | East Los FM.mp3 | East Los FM |
| The Music Locker | `the-music-locker` | Los Santos Underground Radio.mp3 | Los Santos Underground Radio |
| Still Slipping Los Santos | `still-slipping-los-santos` | FlyLo FM.mp3 | FlyLo FM |

All five now ship their own station audio, taken from a public archive.org mirror of the
per-station "Full radio station" uploads:

**item:** `Radio-files-pause-menu` — <https://archive.org/details/Radio-files-pause-menu>
("Grand theft auto V Pause menu Radio files", uploaded by `mrclscg08@gmail.com`).

Provenance is not inferred: the SHA-256 of every installed file matches the md5 that
archive.org publishes for its item file, and the deployed URLs serve exactly those bytes.

## Installed files

`raw/gta5/<id>.mp3` (origin of the chunks), ffprobe values:

| station | bytes | md5 (archive.org) | sha256 | duration s | kbps | channels |
|---|---|---|---|---|---|---|
| kult-fm | 140935221 | `21a843f7c77e1fa16b984cc900c17abb` | `3c03dfba91389de4f4a866aba44bc6f929209d41a3c8d5cf541173e752dfbef8` | 8411.394 | 134 | 2 / 48 kHz |
| the-lowdown-911 | 144540405 | `71d3f82477a86283bd03b84b6b3b332b` | `b17375e7d7c9719fd5a9a44d47a99e7cb11f3635ae9e87a10fbf264616724224` | 8539.429 | 135 | 2 / 48 kHz |
| motomami-los-santos | 195770085 | `34aab19b40a0e481e5a4307676d648a4` | `ee5b090a7768504bd6e46a4aa9b840f881f0bd6f90e7273f89203b84ff1c38d7` | 11759.108 | 133 | 2 / 48 kHz |
| the-music-locker | 473807253 | `142a2861b3bd6497e9f89e069a6beddb` | `4668f1cfd23452708c9ad84a99e8c17adcdc0b0f4045b0c1cf61ea68192dba3f` | 27245.517 | 139 | 2 / 48 kHz |
| still-slipping-los-santos | 74951229 | `a2fecccc1c683a9d6dc1de5b112ae0ac` | `624b8e1a0f6e910260b292332e6f41b03b1ab968b707f2468ad1e2fe31b7e106` | 4364.179 | 137 | 2 / 48 kHz |

No ID3 tags (only `encoder=Lavf62.13.101`), so identity cannot come from metadata — it comes
from the audio itself (below). Nothing was re-encoded or upsampled.

## catalog `audioUrl`

`src/data/gta5.json` points at the direct archive.org file (curl-fetchable, so
`fetch-raw.py` still works):

```
https://archive.org/download/Radio-files-pause-menu/GTA%20Online%20%E2%80%94%20Kult%20FM%20%EF%BD%9C%20Full%20radio%20station.mp3
https://archive.org/download/Radio-files-pause-menu/GTA%20V%20%26%20GTA%20Online%20%E2%80%94%20The%20Lowdown%2091.1%20%EF%BD%9C%20Full%20radio%20station.mp3
https://archive.org/download/Radio-files-pause-menu/GTA%20Online%20%E2%80%94%20MOTOMAMI%20Los%20Santos%20%EF%BD%9C%20Full%20radio%20station.mp3
https://archive.org/download/Radio-files-pause-menu/GTA%20Online%20%E2%80%94%20Music%20Locker%20Radio%20%EF%BD%9C%20Full%20radio%20station.mp3
https://archive.org/download/Radio-files-pause-menu/GTA%20Online%20%E2%80%94%20Still%20Slipping%20Los%20Santos%20%EF%BD%9C%20Full%20radio%20station.mp3
```

`HEAD` on each returns `200`, `content-type: audio/mpeg`, `content-length` equal to the
byte count in the table above.

Catalog `duration` was deliberately **not** changed — it is only a hint; the chunk manifest
is the source of truth for loop length (see `DEPLOY.md`, "Грабли").

## Identity evidence

### 1. Transcripts (faster-whisper `small`, windows chosen by Silero VAD speech density)

| station | timestamp | quote |
|---|---|---|
| kult-fm | 0:00:00 | "This is low power DIY radio … this is Colt *[Kult]* 99.1 Beach Radio. Let's play another song" |
| kult-fm | 1:17:56 | "Just a reminder, we still have four tickets to give away for a live show at the Mirror Park Tavern" |
| kult-fm | 2:06:24 | "How's it going? You're listening to Co-FM *[KULT FM]* 99.1 on your dial" |
| the-lowdown-911 | 0:04:04 | "Some of the best music out there has been written in jail, baby … When you get low, turn on the low down … You getting the low down?" |
| the-lowdown-911 | 1:41:24 | "Now, if you want something to play with, go and find yourself a toy, baby, because this is the lowdown. I'm fully loaded, and I'm putting it down for you, baby" |
| motomami-los-santos | 0:03:23 | (Spanish) "…toca música de la reina suprema de Venezuela … Girl, you're a living Cleopatra" |
| motomami-los-santos | 2:53:43 | (Spanish) "…lo que estoy llevando es de Swap Meet … Daisy Megamall y esto es del thrift store en East LS. Glam and trash" |
| the-music-locker | 2:12:43 | "…We are here at the Diamond Casino Resort. Come on down … We live on a radio, that's ML radio for your motherfucking ass" |
| the-music-locker | 6:00:38 | "Yes, Los Santos, this is Music Locker Radio, that was a Paradise Garage classic by Shirley Lites, some West End Records, and up next, the dub mix of Shannon's Let the Music Play" |
| still-slipping-los-santos | 0:00:00 | "Please stand by. Still Slipping." |
| still-slipping-los-santos | 0:05:00 | "…here at the Mirror Park Tavern … Yes Los Santos, I'm tuned to myself, Joy Orbison … so I thought I'd set up this radio station … Still slipping" |

*Whisper mishears the station name in a couple of jingles ("Colt"/"Co-FM" for Kult); the rest of
the sentence and the 99.1 frequency pin it. Quotes are verbatim from the model output otherwise.*

### 2. Playlist cross-check (documented tracklists)

- **The Music Locker** — the DJ at 21638 s names *Shirley Lites* and then the *dub mix of
  Shannon's "Let the Music Play"*. The documented Palms Trax set on the station
  (<https://www.gtabase.com/grand-theft-auto-v/radio-stations/the-music-locker>) lists, in
  order: `6 Shirley Lites — Heat You Up (Melt You Down Mix)`, `7 Shannon — Let the Music
  Play (Dub Mix)`. Two consecutive documented entries, in the documented order.
- **Kult FM** — the ad read at 4676 s sells tickets for a show "at the Mirror Park Tavern";
  Kult FM is the Mirror Park station hosted by Julian Casablancas
  (<https://www.gtabase.com/grand-theft-auto-v/radio-stations/kult-fm-99-1>), and the
  station IDs say "Kult 99.1".
- **Still Slipping Los Santos** — the ident names Joy Orbison and Mirror Park, matching the
  documented host and the station's in-game transmitter plot
  (<https://www.gtabase.com/grand-theft-auto-v/radio-stations/still-slipping-los-santos>).
- **The Lowdown 91.1** — every sampled talk break is the station's own "low down" patter
  (Pam Grier), e.g. "You getting the low down? You picking up what I'm putting down?".

### 3. Waveform correlation against the public uploads

Each installed file was compared with a 60 s excerpt of the matching public YouTube upload
(`yt-dlp --download-sections`, decoded to 8 kHz mono, ±2 s lag search, normalised
cross-correlation). Same recording ⇒ ≈1.0; a different station ⇒ ≈0.

| station | reference video | offset | corr | lag |
|---|---|---|---|---|
| kult-fm | `9cL6IDCtuzs` "GTA Online — Kult FM \| Full radio station" (8412 s) | 600 s | **0.9953** | −152 samples (−19 ms) |
| kult-fm | same | 7000 s | **0.9900** | −152 |
| the-lowdown-911 | `RT9h-C24idQ` "… The Lowdown 91.1 \| Full radio station" (8540 s) | 600 s | **0.9951** | −152 |
| motomami-los-santos | `30uA_Hppzpc` "… MOTOMAMI Los Santos \| Full radio station" (11760 s) | 900 s | **0.9951** | −152 |
| the-music-locker | `dBvMBYbUZFc` "… Music Locker Radio \| Full radio station" (27246 s) | 1200 s | **0.9955** | −152 |
| still-slipping-los-santos | `P3qixldzDow` "… Still Slipping Los Santos \| Full radio station" (4365 s) | 600 s | **0.9957** | −152 |
| still-slipping-los-santos | same | 3500 s | **0.9938** | −152 |

Controls (same code, same window length): the replaced placeholder files against the same
references score **0.0100 / 0.0148 / 0.0145 / 0.0193**; a correct file against the *wrong*
reference scores **0.0199 / 0.0191**; the old `kult-fm` file (Radio Mirror Park) against
the Kult reference scores **0.0133**. The metric separates the two populations by ~50×.

Video durations also match the installed files to ≈0.5 s (8412/8540/11760/27246/4365 s),
and the identical −152-sample lag across all five is the codec-delay offset, not drift.

### 4. Uniqueness

Every installed file differs from every other `raw/gta5/*.mp3` (25 files, 25 distinct
SHA-256) and from the five files it replaced.

## Chunks and manifest

Re-cut with an unmodified `make-chunks.py` cut (`ffmpeg -c copy -f segment -segment_time
120`), stale files removed first:

| station | chunks before | chunks after | manifest duration before | after |
|---|---|---|---|---|
| kult-fm | 77 | **71** | 9160.218 | 8411.394 |
| the-lowdown-911 | 48 | **72** | 5653.316 | 8539.429 |
| motomami-los-santos | 21 | **98** | 2465.130 | 11759.108 |
| the-music-locker | 140 | **228** | 16730.548 | 27245.517 |
| still-slipping-los-santos | 36 | **37** | 4298.286 | 4364.179 |

`src/data/chunk-manifest.json`: 55 stations, 2592 chunks, 10.85 GB (was 2408 chunks).
The other 50 entries are byte-identical to `HEAD`; only these five keys changed. Per
station: `count` == number of `.mp3` files on disk, every `bytes[i]` == `stat` size of
`NNN.mp3`, no gaps in numbering, and Σ chunk durations equals the raw `ffprobe` duration
(delta ≤ 0.001 s).

## Publish verification

Origin (`gta-media` nginx, `hostPath` of `/home/rauf/gta-radio-media`): all **506** new
chunks answered `200`, `content-type: audio/mpeg`, `content-length` == local file size;
`Range: bytes=0-1023` → `206`, 1024 bytes.

Edge: the old URLs were cached `max-age=31536000, immutable`, so the replaced prefixes were
purged — 512 URLs (`gta5/<id>/000..max(old,new)`) in 18 batches of ≤30,
`POST /client/v4/zones/70c0b55fd0dc8493b683562d52bcfad4/purge_cache`; every batch returned
`"success": true`, `"errors": []`, `"result": {"id": "70c0b55fd0dc8493b683562d52bcfad4"}`.

After the purge, all 506 URLs answer `200` over HTTPS with matching sizes and
`cf-cache-status: MISS` (i.e. the edge fetched the new bytes). Three chunks downloaded from
the edge and hashed:

| url | sha256 (edge) | sha256 (local) | match |
|---|---|---|---|
| `chunks/gta5/kult-fm/000.mp3` | `14e2b8e8…415eb4543` | `14e2b8e8…415eb4543` | yes |
| `chunks/gta5/the-music-locker/139.mp3` | `61fa39a6…3285c9e27` | `61fa39a6…3285c9e27` | yes |
| `chunks/gta5/motomami-los-santos/050.mp3` | `bbe422f3…e4ff64abc` | `bbe422f3…e4ff64abc` | yes |

Chunks that no longer exist are gone from the edge too: `kult-fm/071.mp3` and
`kult-fm/075.mp3` return `404` (77 → 71 chunks).

## Data changes

- `src/data/audio-owners.json` is now `{}` — nothing ships another station's file. The
  override mechanism and `hasForeignAudio()` stay, and are still covered by tests
  (`src/data/trackTimings.test.ts`: empty map ⇒ no station is `untrusted`; a synthetic
  override ⇒ `untrusted` + station-level cue; removing it ⇒ cues resolve again).
- `src/data/chunkManifest.test.ts` / `src/audio/chunkedSource.test.ts` numbers follow the new
  geometry (Music Locker: catalog 24984 s understates the 27245.517 s loop, 228 chunks).
- `npx vitest run`: 29 files, 363 tests, all green.

## Caveats

1. **Bitrate.** These files are 133–139 kbps MP3, the archive.org originals were 320 kbps.
   They are the only public copies of these five stations; no re-encode, no upscale. The
   item is itself a mirror of the per-station "Full radio station" uploads (encoder tag
   `Lavf62.13.101`, no ID3), which is why the waveform check against those uploads is the
   identity proof.
2. **Catalog durations stay wrong on purpose** (`DEPLOY.md`): e.g. `the-music-locker` 24984 s
   vs 27245.517 s real, `the-lowdown-911` 4372 s vs 8539.429 s real. The manifest wins for
   playback, cues and chunk counts.
3. **Cue tables.** With the audio now correct, `resolveCueTimeline` grades these five as
   `scaled ×1.0258` (kult), `scaled ×1.0905` (music-locker), `exact` (still-slipping) — they
   show track titles again. `the-lowdown-911` (table ends 4372 s of an 8539 s loop) and
   `motomami-los-santos` (6906 s of 11759 s) stay `untrusted` → station-level info: their
   authored tables cover roughly half the loop, so naming a track would be a guess. Extending
   those two tables is a follow-up in the timings pipeline, not a media-pipeline defect.
4. **Loudness** sampled at 10/50/90 % (120 s windows): −7.3…−12.9 LUFS, in line with the
   files they replace (−9.4…−11.7 LUFS), so no audible level jump between stations.
