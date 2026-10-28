# Authentic Game UI/UX, Asset Resolution, & Audio Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement authentic in-game radio station selectors for GTA V, GTA San Andreas, and GTA IV; fix GitHub Pages asset 404s and font dropouts; eliminate audio stream buffering latency with 1.5s fast-start fallback; add authentic radio tuning "shhhhh" static; and introduce dynamic song cover art.

**Architecture:** Polymorphic `GameRadioSelector` container delegating to `Gta5RadialWheel` (360° SVG pie HUD), `GtaSaHorizontalReel` (top horizontal amber reel), and `Gta4VerticalTuner` (Liberty City slate tuner). Centralized `resolveAssetUrl()` for relative base asset loading. `CoverArtService` with iTunes Search API querying and IndexedDB caching. AudioEngine 1.5s range-seek watchdog and Web Audio continuous static hiss generator.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Web Audio API, W3C Media Session API, IndexedDB (`idb`), Vitest, React Testing Library.

## Global Constraints
- Pure client-side PWA: 0 backend server infrastructure or runtime costs.
- Preserve 100% background audio playback on iOS Safari with native HTML5 `<audio playsinline>`.
- Synchronous CarPlay MediaSession action handling without `async/await` interruptions.
- Relative asset paths compatible with GitHub Pages subpath deployment (`base: './'`).
- TDD: Every component and utility has accompanying Vitest unit tests with 100% pass rate.

---

### Task 1: Asset URL Resolution & Canonical Station Reordering

**Files:**
- Create: `src/utils/assets.ts`
- Create: `src/utils/assets.test.ts`
- Modify: `src/data/catalog.ts:1-75`
- Modify: `src/data/gta5.json`
- Modify: `src/data/gtasa.json`
- Modify: `src/data/gta4.json`
- Modify: `index.html:10-15`

**Interfaces:**
- Produces: `resolveAssetUrl(path: string): string` in `src/utils/assets.ts`.

- [ ] **Step 1: Write failing tests for `resolveAssetUrl`**

```ts
// src/utils/assets.test.ts
import { describe, it, expect } from 'vitest';
import { resolveAssetUrl } from './assets';

describe('resolveAssetUrl', () => {
  it('returns empty string for empty input', () => {
    expect(resolveAssetUrl('')).toBe('');
  });

  it('preserves external http and https urls', () => {
    expect(resolveAssetUrl('https://archive.org/audio.mp3')).toBe('https://archive.org/audio.mp3');
    expect(resolveAssetUrl('http://example.com/logo.png')).toBe('http://example.com/logo.png');
  });

  it('preserves blob and data urls', () => {
    expect(resolveAssetUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(resolveAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('resolves absolute path to base-relative url', () => {
    const resolved = resolveAssetUrl('/logos/gta5/radio-los-santos.png');
    expect(resolved).not.startsWith('//');
    expect(resolved).toContain('logos/gta5/radio-los-santos.png');
  });

  it('resolves relative path without double slashes', () => {
    const resolved = resolveAssetUrl('logos/gtasa/k-dst.png');
    expect(resolved).not.toContain('//logos');
    expect(resolved).toContain('logos/gtasa/k-dst.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/utils/assets.test.ts`  
Expected: FAIL with "Cannot find module './assets'"

- [ ] **Step 3: Implement `resolveAssetUrl`**

```ts
// src/utils/assets.ts
/**
 * Resolves a local or remote asset path against Vite's import.meta.env.BASE_URL.
 * Preserves remote, blob, and data URIs untouched.
 */
export function resolveAssetUrl(path: string): string {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  const base =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? import.meta.env.BASE_URL
      : './';

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const cleanBase = base.endsWith('/') ? base : `${base}/`;

  return `${cleanBase}${cleanPath}`;
}
```

- [ ] **Step 4: Update `catalog.ts` and `index.html` to use `resolveAssetUrl`**

In `src/data/catalog.ts`, wrap all `station.logoUrl` and `game.theme.bgWallpaper` values with `resolveAssetUrl()`.
In `index.html`, ensure `<link rel="manifest" href="./manifest.json" />` and `<link rel="apple-touch-icon" href="./icons/icon-192.png" />`.

- [ ] **Step 5: Reorder stations in `gta5.json`, `gtasa.json`, and `gta4.json` to canonical sequences**

Order `gta5.json` clockwise:
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
26. Radio Off

Order `gtasa.json` canonical in-game reel:
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
12. Radio Off (if present)

Order `gta4.json` canonical Liberty City sequence:
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

- [ ] **Step 6: Run tests and commit**

Run: `npm run test`  
Verify: PASS across all catalog and asset tests.  
Commit:
```bash
git add src/utils/assets.ts src/utils/assets.test.ts src/data/catalog.ts src/data/*.json index.html
git commit -m "feat: add resolveAssetUrl and reorder stations to canonical game sequences"
```

---

### Task 2: Authentic Webfonts & Font Dropout Guard

**Files:**
- Create: `public/fonts/` with authentic fonts (or inline base64/woff2 fallbacks)
- Modify: `src/index.css:1-50`
- Modify: `index.html:1-25`
- Test: `src/components/ThemeWrapper.test.tsx`

**Interfaces:**
- Produces: Persistent `@font-face` definitions for `Pricedown` and `Bank Gothic` with preloaded Google fonts.

- [ ] **Step 1: Write test verifying CSS custom properties & font family integrity**

In `src/components/ThemeWrapper.test.tsx`:
Add assertions that `gtasa` theme sets `--theme-font` containing `Pricedown`, and `gta4` theme sets `--theme-font` containing `Bank Gothic`.

- [ ] **Step 2: Add webfont declarations to `src/index.css`**

Add `@font-face` rules for `Pricedown` and `Bank Gothic` using webfont packages/woff2 assets in `public/fonts/` with high-quality fallback font stacks:
```css
@font-face {
  font-family: 'Pricedown';
  src: url('./fonts/pricedown.woff2') format('woff2'),
       url('./fonts/pricedown.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Bank Gothic';
  src: url('./fonts/bankgothic.woff2') format('woff2'),
       url('./fonts/bankgothic.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 3: Update `index.html` with preconnect & Google font stylesheets**

Add preconnect and font preloads for `Oswald`, `Rajdhani`, and `Roboto Condensed` directly in the `<head>` of `index.html` to eliminate FOUT (flash of unstyled text).

- [ ] **Step 4: Verify font rendering and commit**

Run: `npm run test -- src/components/ThemeWrapper.test.tsx`  
Commit:
```bash
git add public/fonts/ src/index.css index.html src/components/ThemeWrapper.test.tsx
git commit -m "feat: embed authentic webfonts for Pricedown and Bank Gothic with preload guards"
```

---

### Task 3: RadioSFX Static "shhhhh" Burst & Fast-Start 1.5s AudioEngine Fallback

**Files:**
- Modify: `src/audio/sfx.ts:1-109`
- Modify: `src/audio/radioEngine.ts:215-350`
- Modify: `src/audio/sfx.test.ts`
- Modify: `src/audio/radioEngine.test.ts`

**Interfaces:**
- Consumes: `RadioSFX` methods in `RadioEngine`.
- Produces:
  - `sfx.playTuningStaticBurst(durationMs?: number): void`
  - `sfx.startStaticHiss(): void`
  - `sfx.stopStaticHiss(fadeMs?: number): void`
  - `RadioEngine` 1,500ms seek fallback mechanism.

- [ ] **Step 1: Write failing tests for `playTuningStaticBurst` and static hiss controls**

```ts
// In src/audio/sfx.test.ts
describe('RadioSFX enhanced static effects', () => {
  it('triggers playTuningStaticBurst without throwing error', () => {
    const sfxInstance = new RadioSFX();
    expect(() => sfxInstance.playTuningStaticBurst(280)).not.toThrow();
  });

  it('starts and stops continuous static hiss', () => {
    const sfxInstance = new RadioSFX();
    expect(() => sfxInstance.startStaticHiss()).not.toThrow();
    expect(() => sfxInstance.stopStaticHiss(50)).not.toThrow();
  });
});
```

- [ ] **Step 2: Write failing tests for 1.5s fast-start fallback in `radioEngine.test.ts`**

```ts
// In src/audio/radioEngine.test.ts
it('falls back to stream start (currentTime = 0) if seeking stalls over 1500ms', async () => {
  vi.useFakeTimers();
  const mockAudio = createMockAudio();
  const engine = new RadioEngine({ audio: mockAudio });
  
  await engine.playStation(sampleStation, true);
  expect(mockAudio.currentTime).toBeGreaterThan(0);
  
  // Advance timer beyond 1500ms without firing 'canplay' or 'playing'
  vi.advanceTimersByTime(1600);
  expect(mockAudio.currentTime).toBe(0);
  
  vi.useRealTimers();
});
```

- [ ] **Step 3: Implement `playTuningStaticBurst`, `startStaticHiss`, and `stopStaticHiss` in `src/audio/sfx.ts`**

Enhance `RadioSFX`:
- `playTuningStaticBurst(durationMs = 280)`: Synthesizes filtered white noise with 1250Hz bandpass and exponential decay.
- `startStaticHiss()`: Creates looping white noise source with gain 0.04 to mask connection silence.
- `stopStaticHiss(fadeMs = 60)`: Smoothly ramps gain down to 0 in `fadeMs` milliseconds.

- [ ] **Step 4: Implement 1.5s fast-start watchdog and static hiss integration in `src/audio/radioEngine.ts`**

In `playStation()`:
1. Start static hiss: `this.sfxInstance.startStaticHiss()`.
2. Schedule a 1500ms fallback timeout. If `onPlaying` or `onCanPlay` fires, clear timeout and call `this.sfxInstance.stopStaticHiss(60)`.
3. If timeout fires before stream plays, set `this.audio.currentTime = 0`.
4. On `onError`, `pause()`, or station switch, cleanly clear timeout and stop hiss.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- src/audio/sfx.test.ts src/audio/radioEngine.test.ts`  
Commit:
```bash
git add src/audio/sfx.ts src/audio/radioEngine.ts src/audio/sfx.test.ts src/audio/radioEngine.test.ts
git commit -m "feat: add authentic tuning static burst, continuous hiss masking, and 1.5s fast-start fallback"
```

---

### Task 4: Dynamic CoverArtService & MediaSession Integration

**Files:**
- Create: `src/services/coverArtService.ts`
- Create: `src/services/coverArtService.test.ts`
- Modify: `src/audio/mediaSession.ts:1-120`
- Modify: `src/audio/mediaSession.test.ts`
- Modify: `src/types/radio.ts`

**Interfaces:**
- Produces: `CoverArtService.getCoverArt(artist: string, song: string, fallbackUrl?: string): Promise<string>`
- Consumes: iTunes Search API `https://itunes.apple.com/search`.

- [ ] **Step 1: Write failing tests for `CoverArtService`**

```ts
// src/services/coverArtService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverArtService } from './coverArtService';

describe('CoverArtService', () => {
  let service: CoverArtService;

  beforeEach(() => {
    service = new CoverArtService();
    vi.restoreAllMocks();
  });

  it('returns fallback URL for empty song or artist', async () => {
    const art = await service.getCoverArt('', '', 'fallback.png');
    expect(art).toBe('fallback.png');
  });

  it('fetches cover art from iTunes API and replaces with 600x600', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' }
        ]
      })
    });

    const art = await service.getCoverArt('2Pac', 'Ambitionz Az a Ridah', 'fallback.png');
    expect(art).toBe('https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg');
  });

  it('uses in-memory cache for repeated calls without re-fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg' }]
      })
    });
    global.fetch = fetchMock;

    await service.getCoverArt('Dr. Dre', 'Nuthin But A G Thang', 'fallback.png');
    await service.getCoverArt('Dr. Dre', 'Nuthin But A G Thang', 'fallback.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/coverArtService.test.ts`  
Expected: FAIL with "Cannot find module './coverArtService'"

- [ ] **Step 3: Implement `CoverArtService`**

Implement `src/services/coverArtService.ts` with:
- In-memory cache `Map<string, string>`.
- Public iTunes API call with 2.5s AbortController timeout.
- IndexedDB persistent store caching under `'cover_art'`.
- Fallback to provided station logo on any error or empty result.

- [ ] **Step 4: Update `mediaSession.ts` to accept optional `coverArtUrl`**

In `src/audio/mediaSession.ts`:
When updating `navigator.mediaSession.metadata`, prefer `coverArtUrl` over `station.logoUrl` in the artwork array, while keeping `station.logoUrl` as fallback sizes (96x96, 128x128).

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- src/services/coverArtService.test.ts src/audio/mediaSession.test.ts`  
Commit:
```bash
git add src/services/coverArtService.ts src/services/coverArtService.test.ts src/audio/mediaSession.ts src/audio/mediaSession.test.ts
git commit -m "feat: add CoverArtService with iTunes API queries and MediaSession cover art integration"
```

---

### Task 5: GTA V 360° Pie-Wedge Radial HUD (`Gta5RadialWheel`)

**Files:**
- Create: `src/components/game-ui/Gta5RadialWheel.tsx`
- Create: `src/components/game-ui/Gta5RadialWheel.test.tsx`

**Interfaces:**
- Produces: `Gta5RadialWheel: React.FC<GameHudProps>`
- Handles: SVG annular pie-wedge sectors, emerald neon highlight wedge, polar angle pointer dragging, central station emblem, Q/Tab/Arrow keys.

- [ ] **Step 1: Write failing tests for `Gta5RadialWheel`**

```tsx
// src/components/game-ui/Gta5RadialWheel.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Gta5RadialWheel } from './Gta5RadialWheel';
import { Station } from '../../types/radio';

const mockStations: Station[] = [
  { id: 'radio-los-santos', gameId: 'gta5', name: 'Radio Los Santos', genre: 'Hip Hop', logoUrl: '/logo1.png', audioUrl: 'u1', duration: 100 },
  { id: 'west-coast-classics', gameId: 'gta5', name: 'West Coast Classics', genre: 'Classic Rap', logoUrl: '/logo2.png', audioUrl: 'u2', duration: 100 },
];

describe('Gta5RadialWheel', () => {
  it('renders SVG radial sectors for all stations', () => {
    render(
      <Gta5RadialWheel
        stations={mockStations}
        currentStation={mockStations[0]}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
  });

  it('calls onSelectStation when clicking a sector slice', () => {
    const onSelect = vi.fn();
    render(
      <Gta5RadialWheel
        stations={mockStations}
        currentStation={mockStations[0]}
        onSelectStation={onSelect}
        isPlaying={false}
      />
    );
    const sector = screen.getByTestId('gta5-sector-west-coast-classics');
    fireEvent.click(sector);
    expect(onSelect).toHaveBeenCalledWith(mockStations[1]);
  });
});
```

- [ ] **Step 2: Implement `Gta5RadialWheel.tsx`**

- Calculate annular sector paths using SVG arc commands:
  `M outerX1 outerY1 A outerR outerR 0 0 1 outerX2 outerY2 L innerX2 innerY2 A innerR innerR 0 0 0 innerX1 innerY1 Z`
- Selected wedge rendered with emerald neon gradient (`#4ae891`), glowing border, and drop-shadow filter.
- Center display with high-res station emblem, frequency, and current song/artist cue.
- Pointer move listener computing angle with `Math.atan2(dx, -dy)`.
- Keyboard support (`ArrowLeft`, `ArrowRight`, `Q`, `Tab`).

- [ ] **Step 3: Run tests and commit**

Run: `npm run test -- src/components/game-ui/Gta5RadialWheel.test.tsx`  
Commit:
```bash
git add src/components/game-ui/Gta5RadialWheel.tsx src/components/game-ui/Gta5RadialWheel.test.tsx
git commit -m "feat: implement authentic GTA V 360-degree SVG pie-wedge radial HUD"
```

---

### Task 6: GTA San Andreas Top Horizontal Icon Reel (`GtaSaHorizontalReel`)

**Files:**
- Create: `src/components/game-ui/GtaSaHorizontalReel.tsx`
- Create: `src/components/game-ui/GtaSaHorizontalReel.test.tsx`

**Interfaces:**
- Produces: `GtaSaHorizontalReel: React.FC<GameHudProps>`
- Handles: Pinned top horizontal icon reel, amber selection brackets `[ ✦ STATION ✦ ]`, Pricedown typography, touch swipe, wheel scroll, and arrow keys.

- [ ] **Step 1: Write failing tests for `GtaSaHorizontalReel`**

```tsx
// src/components/game-ui/GtaSaHorizontalReel.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GtaSaHorizontalReel } from './GtaSaHorizontalReel';
import { Station } from '../../types/radio';

const mockStations: Station[] = [
  { id: 'playback-fm', gameId: 'gtasa', name: 'Playback FM', genre: 'East Coast', logoUrl: '/logo1.png', audioUrl: 'u1', duration: 100 },
  { id: 'k-rose', gameId: 'gtasa', name: 'K-Rose', genre: 'Country', logoUrl: '/logo2.png', audioUrl: 'u2', duration: 100 },
  { id: 'k-dst', gameId: 'gtasa', name: 'K-DST', genre: 'Classic Rock', logoUrl: '/logo3.png', audioUrl: 'u3', duration: 100 },
];

describe('GtaSaHorizontalReel', () => {
  it('renders station icons and brackets for selected station', () => {
    render(
      <GtaSaHorizontalReel
        stations={mockStations}
        currentStation={mockStations[1]}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gtasa-reel-container')).toBeInTheDocument();
    expect(screen.getByText('K-Rose')).toBeInTheDocument();
  });

  it('cycles to next station on right arrow key', () => {
    const onSelect = vi.fn();
    render(
      <GtaSaHorizontalReel
        stations={mockStations}
        currentStation={mockStations[1]}
        onSelectStation={onSelect}
        isPlaying={false}
      />
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
  });
});
```

- [ ] **Step 2: Implement `GtaSaHorizontalReel.tsx`**

- Pinned horizontal container near top of screen with dark glass strip backdrop.
- Flex/transform row with smooth centering animation on active index.
- Amber/yellow bracket frames (`border-amber-500`, glow, retro corner cuts).
- Inactive icons slightly desaturated and scaled down.
- Station title and track cue banner rendered below in `font-pricedown` with amber accent.
- Touch swipe left/right, wheel scroll, and arrow key listeners.

- [ ] **Step 3: Run tests and commit**

Run: `npm run test -- src/components/game-ui/GtaSaHorizontalReel.test.tsx`  
Commit:
```bash
git add src/components/game-ui/GtaSaHorizontalReel.tsx src/components/game-ui/GtaSaHorizontalReel.test.tsx
git commit -m "feat: implement authentic GTA San Andreas top horizontal icon reel HUD"
```

---

### Task 7: GTA IV Liberty City Dashboard Tuner (`Gta4VerticalTuner`)

**Files:**
- Create: `src/components/game-ui/Gta4VerticalTuner.tsx`
- Create: `src/components/game-ui/Gta4VerticalTuner.test.tsx`

**Interfaces:**
- Produces: `Gta4VerticalTuner: React.FC<GameHudProps>`
- Handles: Liberty City industrial slate vertical card, caution yellow chevrons (`►`), Bank Gothic typography, vertical swipe/drag, arrow navigation.

- [ ] **Step 1: Write failing tests for `Gta4VerticalTuner`**

```tsx
// src/components/game-ui/Gta4VerticalTuner.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Gta4VerticalTuner } from './Gta4VerticalTuner';
import { Station } from '../../types/radio';

const mockStations: Station[] = [
  { id: 'the-beat', gameId: 'gta4', name: 'The Beat 102.7', genre: 'Hip Hop', logoUrl: '/logo1.png', audioUrl: 'u1', duration: 100 },
  { id: 'electro-choc', gameId: 'gta4', name: 'Electro-Choc', genre: 'Electro', logoUrl: '/logo2.png', audioUrl: 'u2', duration: 100 },
];

describe('Gta4VerticalTuner', () => {
  it('renders vertical list with active indicator', () => {
    render(
      <Gta4VerticalTuner
        stations={mockStations}
        currentStation={mockStations[0]}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta4-vertical-tuner')).toBeInTheDocument();
  });

  it('selects station on item click', () => {
    const onSelect = vi.fn();
    render(
      <Gta4VerticalTuner
        stations={mockStations}
        currentStation={mockStations[0]}
        onSelectStation={onSelect}
        isPlaying={false}
      />
    );
    fireEvent.click(screen.getByText('Electro-Choc'));
    expect(onSelect).toHaveBeenCalledWith(mockStations[1]);
  });
});
```

- [ ] **Step 2: Implement `Gta4VerticalTuner.tsx`**

- Dark industrial slate card (`rgba(15, 23, 42, 0.85)`) with subtle yellow borders.
- Vertical scrolling list of stations with frequency tags (e.g. `102.7 FM`, `97.8 FM`).
- Selected item highlighted with yellow background accent, bold white text in `Bank Gothic`, and arrow chevron `►`.
- Vertical flick/scroll gestures and ArrowUp/ArrowDown navigation.

- [ ] **Step 3: Run tests and commit**

Run: `npm run test -- src/components/game-ui/Gta4VerticalTuner.test.tsx`  
Commit:
```bash
git add src/components/game-ui/Gta4VerticalTuner.tsx src/components/game-ui/Gta4VerticalTuner.test.tsx
git commit -m "feat: implement authentic GTA IV Liberty City vertical tuner HUD"
```

---

### Task 8: Polymorphic GameRadioSelector & Main App Integration

**Files:**
- Create: `src/components/GameRadioSelector.tsx`
- Create: `src/components/GameRadioSelector.test.tsx`
- Modify: `src/App.tsx:1-250`
- Modify: `src/components/BroadcastHUD.tsx`
- Modify: `src/types/radio.ts`

**Interfaces:**
- Produces: `GameRadioSelector` routing between `Gta5RadialWheel`, `GtaSaHorizontalReel`, and `Gta4VerticalTuner`.
- Consumes: `coverArtUrl` from `CoverArtService` and supplies it to the active HUD and CarPlay metadata.

- [ ] **Step 1: Write failing tests for `GameRadioSelector`**

```tsx
// src/components/GameRadioSelector.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameRadioSelector } from './GameRadioSelector';
import { Station } from '../types/radio';

const mockStation: Station = {
  id: 'test', gameId: 'gtasa', name: 'Test Station', genre: 'Rock', logoUrl: '/logo.png', audioUrl: 'u', duration: 100
};

describe('GameRadioSelector', () => {
  it('renders Gta5RadialWheel when gameId is gta5', () => {
    render(
      <GameRadioSelector
        gameId="gta5"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
  });

  it('renders GtaSaHorizontalReel when gameId is gtasa', () => {
    render(
      <GameRadioSelector
        gameId="gtasa"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gtasa-reel-container')).toBeInTheDocument();
  });

  it('renders Gta4VerticalTuner when gameId is gta4', () => {
    render(
      <GameRadioSelector
        gameId="gta4"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta4-vertical-tuner')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `GameRadioSelector.tsx`**

Implement routing logic:
- If `gameId === 'gtasa'` ➔ render `<GtaSaHorizontalReel ... />`
- If `gameId === 'gta4'` ➔ render `<Gta4VerticalTuner ... />`
- Otherwise (default / `gta5`) ➔ render `<Gta5RadialWheel ... />`

- [ ] **Step 3: Update `App.tsx` and `BroadcastHUD.tsx`**

- In `App.tsx`, instantiate `CoverArtService`.
- On cue or station change, fetch cover art asynchronously:
  `coverArtService.getCoverArt(cue.artist, cue.song, station.logoUrl).then(setCoverArtUrl)`
- Pass `coverArtUrl` into `updateMediaSession(station, cue, coverArtUrl)` and `GameRadioSelector`.
- In `BroadcastHUD.tsx`, display dynamic song cover art with fallback to station logo and vinyl badge.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test`  
Commit:
```bash
git add src/components/GameRadioSelector.tsx src/components/GameRadioSelector.test.tsx src/App.tsx src/components/BroadcastHUD.tsx
git commit -m "feat: wire GameRadioSelector and dynamic cover art into App and BroadcastHUD"
```

---

### Task 9: Full Suite Verification, Build Check & GitHub Pages Deployment

**Files:**
- Entire repository

- [ ] **Step 1: Run complete Vitest suite**

Run: `npm run test`  
Expected: All test suites (17+) pass with 100% success rate.

- [ ] **Step 2: Run production TypeScript build**

Run: `npm run build`  
Expected: `tsc -b && vite build` completes in <2s with 0 errors.

- [ ] **Step 3: Push to GitHub to trigger Pages deployment**

```bash
git push origin main
```
Verify GitHub Actions workflow executes successfully at `https://github.com/Kid72/gta-radio-pwa/actions`.

- [ ] **Step 4: Live verification**

Verify with `curl -I https://kid72.github.io/gta-radio-pwa/` returning `HTTP/2 200`.  
Verify station logos, webfonts, and album artwork load properly in browser.
