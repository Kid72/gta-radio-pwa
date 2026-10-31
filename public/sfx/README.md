# Station-switch sound

Optional slot for the radio tuning noise played when the station changes.

- Put a real recording at `tune-switch.mp3` (200-400 ms, mono or stereo, MP3/AAC).
- If the file is absent (404), the app falls back to the synthesised tuning burst in
  `src/audio/sfx.ts` — click + band-passed static sweep.
- Nothing is shipped here by default: the in-game asset is Rockstar's copyright, so the
  repository carries only the synthesiser and this documented slot.
