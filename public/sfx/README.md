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

The shipped kit is built from Creative Commons 0 recordings of a radio tuner and
switches, trimmed to 0.05-0.6 s and normalised. To use the exact in-game sounds
instead, drop your own files with the same names here (or on the media host).

Extraction notes for GTA V (OpenIV): the frontend soundsets live in
`x64/audio/sfx/`; the radio wheel group is `Radio_Soundset` with entries such as
`change_station` and `Change_Station_Loud`. Export them to WAV, trim to taste,
encode to MP3 and rename to the table above.
