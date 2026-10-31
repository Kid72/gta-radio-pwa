# Radio UI sound kit

The app plays four short recordings; each one falls back to the synthesiser in
`src/audio/sfx.ts` when the file is missing.

| File | Used for |
| --- | --- |
| `switch.mp3` | tuning noise when the station changes |
| `select.mp3` | knob tick while moving through the wheel |
| `radio-on.mp3` | power-on click when tuning in from Radio Off |
| `radio-off.mp3` | power-off click when the radio is turned off |

Lookup order: `public/sfx/<name>.mp3` (this directory, same origin) and then
`https://gta-media.pulsr.top/sfx/<name>.mp3` (the media host, CORS-enabled).

The shipped kit is cut from **extracted GTA V frontend sounds** (the in-game
`RESIDENT/frontend` bank, whose files are named by hash):

| File | Source file | Length |
| --- | --- | --- |
| `switch.mp3` | `0x1DCAE39B` (static burst, trimmed) | 0.55 s |
| `select.mp3` | `BLIP_10` (HUD blip) | 0.13 s |
| `radio-on.mp3` | `0x042FBD33` (short static pop) | 0.14 s |
| `radio-off.mp3` | `0x0D116469` (short click) | 0.04 s |

The bank does not publish names, so the exact `change_station` entry cannot be
matched by name; the files were chosen by spectral class (noise burst, blip,
click). Drop files with the names above to replace any of them.

Extraction notes for GTA V (OpenIV): the frontend soundsets live in
`x64/audio/sfx/`; the radio wheel group is `Radio_Soundset` with entries such as
`change_station` and `Change_Station_Loud`. Export them to WAV, trim to taste,
encode to MP3 and rename to the table above.
