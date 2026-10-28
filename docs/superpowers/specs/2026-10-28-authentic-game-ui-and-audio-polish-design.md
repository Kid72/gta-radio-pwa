# Technical Specification: Authentic Game UI/UX, Asset Resolution, & Audio Polish

**Document Date:** 2026-10-28  
**Status:** Approved by User  
**Target Architecture:** Progressive Web App (React 18, TypeScript, Tailwind CSS, Vite)  
**Deployment Target:** GitHub Pages (`https://kid72.github.io/gta-radio-pwa/`)

---

## 1. Executive Summary & Goals

This specification defines the architecture and implementation for resolving user feedback across 5 critical areas of the GTA Radio PWA:
1. **Station Loading Latency & Tuning Static:** Eliminate long buffering waits by implementing a 1.5-second fast-start fallback to byte 0 on stalled range requests, accompanied by an authentic analog radio tuning burst and continuous static hiss ("shhhhh") during connection.
2. **Missing Station Logos & Dynamic Song Covers:** Fix asset URL resolution for GitHub Pages subpath deployment (`base: './'`), and introduce `CoverArtService` to dynamically fetch 600x600 song album art from the public CORS iTunes Search API with offline fallback to station logos.
3. **Webfont Persistence (No Font Dropouts):** Bundle and embed authentic `@font-face` webfonts (`Pricedown` for San Andreas, `Bank Gothic` for GTA IV, and preloaded Google fonts) directly in the app so fonts never drop back to system fonts on mobile Safari or unrooted devices.
4. **Canonical Station Ordering:** Reorder all station lists (`gta5.json`, `gtasa.json`, `gta4.json`) to match their exact canonical in-game clock positions and vehicle rotation sequences.
5. **Authentic In-Game Station Selector UIs:** Introduce a polymorphic selector architecture (`GameRadioSelector`) providing pixel-authentic interfaces for each game:
   - **GTA V:** 360° SVG pie-wedge radial HUD with emerald neon slice lighting, central station emblem, and pointer drag selection.
   - **GTA San Andreas:** Horizontal sliding icon tape reel positioned at the top of the viewport with authentic 90s amber brackets.
   - **GTA IV:** Liberty City vertical scrolling tuner with gritty slate panels, yellow chevron accents, and industrial typography.

---

## 2. Component Architecture & UI Polymorphism

### 2.1 The Polymorphic Selector Container (`GameRadioSelector.tsx`)
Rather than forcing all games into a single generic circle, `GameRadioSelector` inspects the active `gameId` and delegates rendering to the appropriate authentic HUD component:

```tsx
interface GameRadioSelectorProps {
  gameId: GameId;
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying: boolean;
  currentCue: TrackCue | null;
  coverArtUrl?: string | null;
}
```

```
                       ┌─────────────────────────┐
                       │    GameRadioSelector    │
                       └────────────┬────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Gta5RadialWheel  │      │ GtaSaHorizontal  │      │ Gta4Vertical     │
│ (360° Pie HUD)   │      │ (Top Icon Reel)  │      │ (Liberty Tuner)  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

### 2.2 GTA V Radial Pie-Wedge HUD (`Gta5RadialWheel.tsx`)
- **Visuals:**
  - Renders true SVG annular slices (`<path d="M... A..." fill="..." stroke="...">`).
  - Active slice lights up in intense emerald neon (`#4ae891`) with glow filter and radial gradient fill.
  - Inactive slices render in dark translucent glass (`rgba(15, 23, 42, 0.8)`).
  - Center hub displays a 140px high-resolution station emblem, station name, frequency, and current track title.
- **Interactions:**
  - Mouse/Touch: Calculates angle relative to center using `Math.atan2(dx, -dy) * (180 / Math.PI)` normalized to `[0, 360)`.
  - Keyboard: `Q` / `Tab` activates HUD focus; arrow keys or number keys cycle sectors.
  - Mechanical click and tuning static sound effects trigger on every slice transition.

### 2.3 GTA San Andreas Top Horizontal Icon Reel (`GtaSaHorizontalReel.tsx`)
- **Visuals:**
  - Pinned to the top-center of the viewport, matching the classic vehicle HUD.
  - Stations sit in a horizontal filmstrip. Inactive station icons are semi-transparent and scaled down (0.8x).
  - Selected station is centered, scaled to 1.15x, and enclosed in an authentic amber/yellow bracket box: `[ ✦ STATION ✦ ]`.
  - Authentic `Pricedown` font displays the station name and frequency below the reel.
- **Interactions:**
  - Swipe left/right gesture with inertia damping.
  - Trackpad / mouse wheel horizontal scrolling.
  - Arrow Left / Arrow Right keyboard navigation.

### 2.4 GTA IV Liberty City Dashboard Tuner (`Gta4VerticalTuner.tsx`)
- **Visuals:**
  - Industrial slate-gray translucent vertical card (`rgba(15, 23, 42, 0.9)`).
  - Stations displayed with clean frequency callouts and station badges.
  - Active station highlighted with a solid caution yellow bar and chevron indicator (`►`), glowing in `#eab308`.
  - Authentic `Bank Gothic` and `Rajdhani` typography.
- **Interactions:**
  - Vertical flick/drag gesture with snap-to-station physics.
  - Arrow Up / Arrow Down keyboard navigation.

---

## 3. Audio Engine & Sound FX Polish

### 3.1 Tuning Static Burst ("shhhhh") in `RadioSFX`
- **Synthesis:**
  - Generated using the Web Audio API without requiring external audio files.
  - Uses an AudioBuffer filled with white noise, fed through a `BiquadFilterNode` configured as a bandpass filter (`frequency = 1250 Hz`, `Q = 2.8`).
  - Shaped by a `GainNode` with exponential decay: starts at gain 0.35 and ramps down over 280ms to create the signature GTA radio retuning "shhhhh" static burst.
  - Accompanied by a simultaneous mechanical detent switch click.
- **Continuous Buffer Masking:**
  - When a station is selected and `isLoading` is true, a soft ambient static noise floor (gain 0.05) is sustained.
  - The instant the audio stream connects and triggers `playing` / `canplay`, the static ramps to 0 in 60ms, transitioning cleanly into broadcast audio.

### 3.2 Fast-Start Playback Fallback (1.5s Threshold)
- **Problem:** When playing remote MP3 streams from Archive.org, seeking to a mid-epoch byte offset triggers HTTP 206 partial content negotiation. If Archive.org is under load or the mobile cellular connection is constrained, range-request seeks can stall for 4–8 seconds.
- **Solution:**
  - In `RadioEngine.playStation()`:
    1. Set `audio.src = sourceUrl`.
    2. Attempt to seek to live epoch: `audio.currentTime = targetTime`.
    3. Start a 1,500ms fallback timer.
    4. If `playing` or `canplay` fires before the timer expires, clear timer; playback proceeds at live simulated epoch.
    5. If 1,500ms elapses without playback starting:
       - Log fast-start fallback.
       - Reset `audio.currentTime = 0`.
       - Play immediately from the beginning of the broadcast file with 0ms buffering delay.
  - **IndexedDB Cached Audio:** Local Blob URLs continue to seek instantaneously (0ms delay), immune to network latency.

---

## 4. Asset URL Resolution & Webfonts

### 4.1 Asset URL Resolver (`resolveAssetUrl`)
- **Problem:** In `vite.config.ts`, `base: './'`. Absolute paths like `"/logos/gtasa/radio-los-santos.png"` bypass Vite's relative base on GitHub Pages, loading from root domain `kid72.github.io/logos/...` (404).
- **Solution:**
  - Implement `resolveAssetUrl(path: string): string` in `src/utils/assets.ts`:
    ```ts
    export function resolveAssetUrl(path: string): string {
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
      }
      const base = import.meta.env.BASE_URL || './';
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      const cleanBase = base.endsWith('/') ? base : `${base}/`;
      return `${cleanBase}${cleanPath}`;
    }
    ```
  - Map all `logoUrl` and `bgWallpaper` references in `catalog.ts` through `resolveAssetUrl()`.
  - Fix `<link rel="manifest">` and `<link rel="apple-touch-icon">` in `index.html`.

### 4.2 Webfonts (`Pricedown` and `Bank Gothic`)
- **Problem:** `Pricedown` (GTA SA) and `Bank Gothic` (GTA IV) drop to system default fonts because neither font is bundled nor declared as a webfont.
- **Solution:**
  - Place webfont files in `public/fonts/`:
    - `public/fonts/pricedown.woff2` (and `.ttf`)
    - `public/fonts/bankgothic.woff2` (and `.ttf`)
  - Declare `@font-face` rules in `src/index.css`:
    ```css
    @font-face {
      font-family: 'Pricedown';
      src: url('/fonts/pricedown.woff2') format('woff2'),
           url('/fonts/pricedown.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Bank Gothic';
      src: url('/fonts/bankgothic.woff2') format('woff2'),
           url('/fonts/bankgothic.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    ```
  - Preload Google Fonts in `index.html` for instant rendering:
    ```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
    ```

---

## 5. Dynamic Song Cover Art Service (`CoverArtService`)

### 5.1 Architecture & API Integration
- Uses the public, free, CORS-friendly iTunes Search API:
  `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + song)}&entity=song&limit=1`
- When a response is received, extract `artworkUrl100` and upscale to high-resolution `600x600`:
  `artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg')`
- **Caching Pipeline:**
  1. **L1 In-Memory Cache:** `Map<string, string>` keyed by `${artist.toLowerCase()}:${song.toLowerCase()}`.
  2. **L2 IndexedDB Cache:** Persisted in an `idb` object store `'cover_art'` so repeated songs load instantly with zero network traffic.
- **Fallback Hierarchy:**
  If offline, query returns 0 results, or track is DJ chatter/station ID:
  `Dynamic Cover Art` ➔ `Station FM Logo` ➔ `Game Default Logo`

### 5.2 CarPlay & MediaSession Integration
- Whenever `CoverArtService` resolves a cover art URL:
  - Updates the active HUD state in the React tree.
  - Updates `navigator.mediaSession.metadata` artwork array with the cover art URL, ensuring Apple CarPlay dashboard and iPhone lock screen display the genuine song album cover.

---

## 6. Canonical Station Ordering

Station JSON files are updated to match the official clockwise / in-game wheel sequences:

### GTA V (Clockwise from top)
1. Blaine County Talk Radio
2. The Blue Ark
3. Worldwide FM
4. FlyLo FM
5. The Lowdown 91.1
6. The Lab
7. Radio Mirror Park
8. Space 103.2
9. Vinewood Boulevard Radio
10. Blonded Los Santos 97.8 FM
11. Los Santos Underground Radio
12. iFruit Radio
13. Los Santos Rock Radio
14. Non-Stop-Pop FM
15. Radio Los Santos
16. Channel X
17. West Coast Talk Radio (WCTR)
18. Rebel Radio
19. Soulwax FM
20. East Los FM
21. West Coast Classics
22. MOTOMAMI Los Santos
23. The Music Locker
24. Kult FM
25. Still Slipping Los Santos
26. Radio Off (Bottom center)

### GTA San Andreas (In-Game Vehicle Reel)
1. Playback FM
2. K-Rose
3. K-DST
4. Bounce FM
5. SF-UR
6. Radio Los Santos
7. Radio X
8. CSR 103.2
9. K-JAH West
10. Master Sounds 98.3
11. WCTR
12. Radio Off

### GTA IV (Liberty City Order)
1. The Beat 102.7
2. The Classics 104.1
3. Electro-Choc
4. Fusion FM
5. IF99
6. Jazz Nation Radio 108.5
7. Liberty Rock Radio 97.8
8. Massive B 96.9
9. Radio Broker
10. San Juan Sounds
11. Tuff Gong
12. Vladivostok FM
13. K109 The Studio
14. WKTT Radio
15. Public Liberty Radio (PLR)
16. Integrity 2.0
17. Vice City FM
18. RamJam FM
19. Self-Actualization FM
20. Radio Off

---

## 7. Verification & Testing Plan

1. **Unit & Integration Tests:**
   - Test `resolveAssetUrl()` with absolute, relative, and remote URLs.
   - Test `RadioSFX` noise burst generation and static sustain/fade methods.
   - Test `CoverArtService` caching, iTunes API response parsing, and station logo fallback.
   - Test `GameRadioSelector` rendering appropriate child HUD based on `gameId`.
   - Test `Gta5RadialWheel`, `GtaSaHorizontalReel`, and `Gta4VerticalTuner` selection events and keyboard controls.
   - Test `RadioEngine` 1.5s fallback to stream start.
2. **Build & Type Check:**
   - Run `npm run test` (all tests passing).
   - Run `npm run build` (`tsc -b && vite build`) verifying 0 type errors.
3. **Live Deployment Verification:**
   - Push to `main` to trigger GitHub Actions deployment.
   - Verify station logos, webfonts, and album artwork load without 404s on `https://kid72.github.io/gta-radio-pwa/`.
