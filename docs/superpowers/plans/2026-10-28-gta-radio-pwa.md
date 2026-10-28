# GTA Multi-Game Radio PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-fidelity, standalone, publicly deployable Progressive Web App (PWA) replicating the radio experience of GTA San Andreas, GTA IV, and GTA V, with first-class Apple CarPlay "Now Playing" integration, steering wheel station controls, and 0-mobile-data offline pre-download caching via IndexedDB.

**Architecture:** Client-side SPA built with React 19, TypeScript, and Vite. Core playback uses a single HTML5 `<audio playsinline>` element combined with an Epoch Broadcast Clock to simulate continuous live 24/7 radio. CarPlay synchronization is managed via the W3C Media Session API with square 512×512 station logos and live second-by-second track cue tracking. Offline audio is stored as binary Blobs in IndexedDB with Screen Wake Lock protection during Wi-Fi pre-downloads.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS, idb (IndexedDB wrapper), Lucide React, Vitest, Testing Library.

## Global Constraints

- Never use hidden YouTube iframes for audio (violates iOS background policies, breaks CarPlay, and prevents offline caching).
- Primary audio driver must be native HTML5 `<audio playsinline preload="auto">` to preserve iOS `AVAudioSessionCategoryPlayback`.
- CarPlay steering wheel actions (`nexttrack`, `previoustrack`) must trigger `.play()` synchronously without awaiting asynchronous network promises.
- Pre-downloaded audio must be saved as binary `Blob`s in IndexedDB (`idb`) and played via `URL.createObjectURL()`, avoiding iOS Safari HTTP 206 cache errors.
- Target directory: `/Users/raufaliyev/PersonalProjects/gta-radio-pwa`.

---

### Task 1: Project Scaffolding & Tooling Setup

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `public/manifest.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: Initial buildable, testable Vite React 19 + TypeScript + Tailwind project with Vitest setup.

- [ ] **Step 1: Create package.json and project configuration files**

```json
{
  "name": "gta-radio-pwa",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "idb": "^8.0.2",
    "lucide-react": "^1.16.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3",
    "vite": "^6.2.0",
    "vitest": "^3.0.7"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/raufaliyev/PersonalProjects/gta-radio-pwa && npm install`
Expected: `added ... packages in ...s`

- [ ] **Step 3: Create vite.config.ts and tsconfig files**

```typescript
// vite.config.ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

```json
// tsconfig.app.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create setup.ts, index.html, public/manifest.json, and src/App.test.tsx**

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="GTA Radio" />
    <meta name="theme-color" content="#0a0a0c" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <title>GTA Radio Player</title>
  </head>
  <body class="bg-black text-white antialiased select-none overflow-hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```json
// public/manifest.json
{
  "name": "Grand Theft Auto Radio Player",
  "short_name": "GTA Radio",
  "description": "Authentic GTA radio with CarPlay support and offline commute caching",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0a0a0c",
  "theme_color": "#0a0a0c",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

```typescript
// src/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App Smoke Test', () => {
  it('renders GTA Radio title', () => {
    render(<App />);
    expect(screen.getByText(/GTA Radio/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement minimal App.tsx and main.tsx to pass the test**

```tsx
// src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-black tracking-wider text-emerald-400">GTA Radio</h1>
      <p className="text-neutral-400 text-sm mt-2">CarPlay & Offline Radio</p>
    </div>
  );
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test`
Expected: `1 passed`

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: setup project scaffolding with vite, react 19, tailwind, vitest and pwa manifest"
```

---

### Task 2: Data Models & Multi-Game Station Catalog

**Files:**
- Create: `src/types/radio.ts`
- Create: `src/data/gtasa.json`
- Create: `src/data/gta4.json`
- Create: `src/data/gta5.json`
- Create: `src/data/catalog.ts`
- Create: `src/utils/trackCues.ts`
- Test: `src/utils/trackCues.test.ts`

**Interfaces:**
- Produces: `GameId`, `TrackCue`, `Station`, `GameMetadata`, `getCurrentCue(station, seconds): TrackCue`

- [ ] **Step 1: Define TypeScript models in src/types/radio.ts**

```typescript
export type GameId = 'gtasa' | 'gta4' | 'gta5';

export interface TrackCue {
  start: number;
  end: number;
  song: string;
  artist: string;
  type: 'music' | 'talk' | 'ad';
}

export interface Station {
  id: string;
  gameId: GameId;
  name: string;
  genre: string;
  host?: string;
  frequency?: string;
  logoUrl: string;
  audioUrl: string;
  duration: number; // total loop seconds
  initialOffset: number;
  timestamps: TrackCue[];
}

export interface GameMetadata {
  id: GameId;
  title: string;
  shortTitle: string;
  year: number;
  theme: {
    accentColor: string;
    bgWallpaper: string;
    fontFamily: string;
  };
  stations: Station[];
}

export interface CachedStationRecord {
  stationId: string;
  gameId: GameId;
  blob: Blob;
  sizeBytes: number;
  downloadedAt: number;
}
```

- [ ] **Step 2: Write failing test for getCurrentCue utility in src/utils/trackCues.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { getCurrentCue } from './trackCues';
import { Station } from '../types/radio';

describe('getCurrentCue', () => {
  const mockStation: Station = {
    id: 'test-station',
    gameId: 'gta5',
    name: 'Non-Stop Pop FM',
    genre: 'Pop',
    host: 'DJ Cara',
    logoUrl: '/logos/non-stop-pop.png',
    audioUrl: 'https://archive.org/test.mp3',
    duration: 1000,
    initialOffset: 0,
    timestamps: [
      { start: 0, end: 180, song: 'Music Sounds Better with You', artist: 'Stardust', type: 'music' },
      { start: 181, end: 240, song: 'DJ Banter & Ident', artist: 'DJ Cara', type: 'talk' },
      { start: 241, end: 400, song: 'Lady (Hear Me Tonight)', artist: 'Modjo', type: 'music' },
    ],
  };

  it('matches track when within range', () => {
    const cue = getCurrentCue(mockStation, 100);
    expect(cue.song).toBe('Music Sounds Better with You');
    expect(cue.artist).toBe('Stardust');
  });

  it('matches talk/DJ cue correctly', () => {
    const cue = getCurrentCue(mockStation, 200);
    expect(cue.type).toBe('talk');
    expect(cue.artist).toBe('DJ Cara');
  });

  it('falls back to default station cue when between indexed timestamps', () => {
    const cue = getCurrentCue(mockStation, 500);
    expect(cue.song).toBe('Non-Stop Pop FM');
    expect(cue.artist).toBe('DJ Cara');
    expect(cue.type).toBe('talk');
  });
});
```

- [ ] **Step 3: Implement getCurrentCue in src/utils/trackCues.ts**

```typescript
import { Station, TrackCue } from '../types/radio';

export function getCurrentCue(station: Station, currentSeconds: number): TrackCue {
  const normalizedSeconds = ((currentSeconds % station.duration) + station.duration) % station.duration;
  
  const found = station.timestamps.find(
    (cue) => cue.start <= normalizedSeconds && normalizedSeconds <= cue.end
  );

  if (found) {
    return found;
  }

  return {
    start: 0,
    end: station.duration,
    song: station.name,
    artist: station.host || station.genre || 'GTA Live Radio',
    type: 'talk',
  };
}
```

- [ ] **Step 4: Populate station catalog data for GTA SA, GTA IV, and GTA V**

Create `src/data/gta5.json`, `src/data/gtasa.json`, `src/data/gta4.json`, and index them in `src/data/catalog.ts` mapping all stations (including high-resolution logos, audio streams from Archive.org/CDN, and cue lists).

- [ ] **Step 5: Run tests to verify track cue utility passes**

Run: `npm run test`
Expected: `PASS src/utils/trackCues.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/types/radio.ts src/data/ src/utils/trackCues.ts src/utils/trackCues.test.ts
git commit -m "feat: define radio types, station catalog data for SA, IV, V, and cue resolver"
```

---

### Task 3: Epoch Broadcast Clock & Synchronization

**Files:**
- Create: `src/audio/epochClock.ts`
- Test: `src/audio/epochClock.test.ts`

**Interfaces:**
- Produces: `getStationCurrentSecond(station: Station, masterEpochMs?: number): number`

- [ ] **Step 1: Write failing test in src/audio/epochClock.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { getStationCurrentSecond, MASTER_BROADCAST_EPOCH } from './epochClock';
import { Station } from '../types/radio';

describe('epochClock', () => {
  const station: Station = {
    id: 'k-dst',
    gameId: 'gtasa',
    name: 'K-DST',
    genre: 'Classic Rock',
    logoUrl: '/logos/k-dst.png',
    audioUrl: 'https://archive.org/kdst.mp3',
    duration: 3600, // 1 hour
    initialOffset: 600, // 10 min offset
    timestamps: [],
  };

  it('calculates deterministic station second based on master epoch', () => {
    // 500 seconds after epoch start
    const testNowMs = MASTER_BROADCAST_EPOCH + 500 * 1000;
    const second = getStationCurrentSecond(station, testNowMs);
    // (500 + 600) % 3600 = 1100
    expect(second).toBe(1100);
  });

  it('wraps around duration cleanly after multiple cycles', () => {
    // 2.5 cycles (9000 seconds)
    const testNowMs = MASTER_BROADCAST_EPOCH + 9000 * 1000;
    const second = getStationCurrentSecond(station, testNowMs);
    // (9000 + 600) % 3600 = 9600 % 3600 = 2400
    expect(second).toBe(2400);
  });
});
```

- [ ] **Step 2: Implement getStationCurrentSecond in src/audio/epochClock.ts**

```typescript
import { Station } from '../types/radio';

// Universal fixed epoch (Jan 1, 2026 00:00:00 UTC) ensures all listeners are synced
export const MASTER_BROADCAST_EPOCH = 1767225600000;

export function getStationCurrentSecond(
  station: Station,
  masterEpochMs: number = Date.now()
): number {
  if (!station.duration || station.duration <= 0) return 0;
  
  const elapsedSeconds = Math.max(0, Math.floor((masterEpochMs - MASTER_BROADCAST_EPOCH) / 1000));
  const offset = station.initialOffset || 0;
  
  return ((elapsedSeconds + offset) % station.duration + station.duration) % station.duration;
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test src/audio/epochClock.test.ts`
Expected: `PASS src/audio/epochClock.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/audio/epochClock.ts src/audio/epochClock.test.ts
git commit -m "feat: add deterministic epoch broadcast clock for simulated live radio"
```

---

### Task 4: IndexedDB Offline Storage & Screen Wake Lock Manager

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/wakeLock.ts`
- Create: `src/storage/downloadManager.ts`
- Test: `src/storage/downloadManager.test.ts`

**Interfaces:**
- Produces: `saveStationAudio(record: CachedStationRecord): Promise<void>`
- Produces: `getCachedStationAudio(gameId: GameId, stationId: string): Promise<Blob | null>`
- Produces: `deleteCachedStationAudio(gameId: GameId, stationId: string): Promise<void>`
- Produces: `listCachedStationIds(): Promise<string[]>`
- Produces: `getStorageUsageEstimate(): Promise<{ usedBytes: number; quotaBytes: number }>`
- Produces: `acquireWakeLock(): Promise<() => void>`

- [ ] **Step 1: Implement IndexedDB wrapper in src/storage/db.ts**

```typescript
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CachedStationRecord, GameId } from '../types/radio';

interface GTARadioDB extends DBSchema {
  stations: {
    key: string; // `${gameId}:${stationId}`
    value: CachedStationRecord;
    indexes: { 'by-game': GameId };
  };
}

const DB_NAME = 'gta-radio-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GTARadioDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<GTARadioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('stations', { keyPath: 'stationId' });
        store.createIndex('by-game', 'gameId');
      },
    });
  }
  return dbPromise;
}

export async function saveStationAudio(record: CachedStationRecord): Promise<void> {
  const db = await getDB();
  await db.put('stations', record);
}

export async function getCachedStationAudio(gameId: GameId, stationId: string): Promise<Blob | null> {
  const db = await getDB();
  const key = `${gameId}:${stationId}`;
  const record = await db.get('stations', key);
  return record ? record.blob : null;
}

export async function deleteCachedStationAudio(gameId: GameId, stationId: string): Promise<void> {
  const db = await getDB();
  const key = `${gameId}:${stationId}`;
  await db.delete('stations', key);
}

export async function listCachedStationKeys(): Promise<string[]> {
  const db = await getDB();
  return (await db.getAllKeys('stations')) as string[];
}

export async function clearAllCachedStations(): Promise<void> {
  const db = await getDB();
  await db.clear('stations');
}
```

- [ ] **Step 2: Implement Screen Wake Lock manager in src/storage/wakeLock.ts**

```typescript
export async function acquireWakeLock(): Promise<() => void> {
  let sentinel: any = null;
  if ('wakeLock' in navigator && (navigator as any).wakeLock) {
    try {
      sentinel = await (navigator as any).wakeLock.request('screen');
    } catch (err) {
      console.warn('Screen Wake Lock error:', err);
    }
  }

  return () => {
    if (sentinel) {
      sentinel.release().catch(() => {});
      sentinel = null;
    }
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      return await navigator.storage.persist();
    }
    return isPersisted;
  }
  return false;
}
```

- [ ] **Step 3: Implement downloadStationWithProgress in src/storage/downloadManager.ts**

Handles fetch with stream reader to calculate percentage progress and calls `acquireWakeLock()` during download.

- [ ] **Step 4: Write test verifying storage and download manager in src/storage/downloadManager.test.ts**

- [ ] **Step 5: Run tests to verify storage tasks pass**

Run: `npm run test src/storage/downloadManager.test.ts`
Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/storage/
git commit -m "feat: add indexeddb binary audio caching and screen wake lock manager"
```

---

### Task 5: Audio Core Engine & Tuning Sound Effects

**Files:**
- Create: `src/audio/radioEngine.ts`
- Create: `src/audio/sfx.ts`
- Test: `src/audio/radioEngine.test.ts`

**Interfaces:**
- Produces: `RadioEngine`:
  - `playStation(station: Station, instantLiveSync?: boolean): Promise<void>`
  - `nextStation(): void`
  - `previousStation(): void`
  - `setVolume(volume: number): void`
  - `togglePlay(): void`
  - `subscribe(callback: (state: EngineState) => void): () => void`

- [ ] **Step 1: Implement authentic tuning SFX in src/audio/sfx.ts**

```typescript
// Synthesizes short white-noise tuning burst and switch clicks via Web Audio API
export class RadioSFX {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playTuningStatic(durationMs: number = 160) {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const bufferSize = this.ctx.sampleRate * (durationMs / 1000);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 3.0;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + durationMs / 1000);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  playClick() {
    // Mechanical notch click
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {}
  }
}

export const sfx = new RadioSFX();
```

- [ ] **Step 2: Implement RadioEngine in src/audio/radioEngine.ts**

Handles HTML5 `<audio>` playback lifecycle, offline Blob URL resolution, epoch calculation, and state subscriptions.

- [ ] **Step 3: Write unit tests in src/audio/radioEngine.test.ts**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test src/audio/radioEngine.test.ts`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/audio/radioEngine.ts src/audio/sfx.ts src/audio/radioEngine.test.ts
git commit -m "feat: implement radio audio engine and authentic tuning sound effects"
```

---

### Task 6: CarPlay & W3C Media Session API Controller

**Files:**
- Create: `src/audio/mediaSession.ts`
- Test: `src/audio/mediaSession.test.ts`

**Interfaces:**
- Produces: `setupMediaSession(engine: RadioEngine): () => void`
- Produces: `updateMediaSessionMetadata(station: Station, cue: TrackCue): void`

- [ ] **Step 1: Write failing test in src/audio/mediaSession.test.ts**

Verify that `updateMediaSessionMetadata` properly formats `navigator.mediaSession.metadata` with 512x512 artwork, song title, and artist name.

- [ ] **Step 2: Implement MediaSession manager in src/audio/mediaSession.ts**

```typescript
import { Station, TrackCue } from '../types/radio';
import { RadioEngine } from './radioEngine';

export function setupMediaSession(engine: RadioEngine): () => void {
  if (!('mediaSession' in navigator)) return () => {};

  navigator.mediaSession.setActionHandler('play', () => {
    engine.resume();
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    engine.pause();
  });

  // Synchronous station switching for Apple CarPlay & Steering wheel buttons
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    engine.nextStationSync();
  });

  navigator.mediaSession.setActionHandler('previoustrack', () => {
    engine.previousStationSync();
  });

  return () => {
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
  };
}

export function updateMediaSessionMetadata(station: Station, cue: TrackCue): void {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;

  const isSong = cue.type === 'music';
  const title = isSong ? cue.song : station.name;
  const artist = isSong ? cue.artist : (station.host || 'Live Radio');
  const album = isSong ? station.name : (station.genre || 'Grand Theft Auto');

  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album,
    artwork: [
      { src: station.logoUrl, sizes: '96x96', type: 'image/png' },
      { src: station.logoUrl, sizes: '256x256', type: 'image/png' },
      { src: station.logoUrl, sizes: '512x512', type: 'image/png' },
    ],
  });
}
```

- [ ] **Step 3: Run test to verify MediaSession manager passes**

Run: `npm run test src/audio/mediaSession.test.ts`
Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add src/audio/mediaSession.ts src/audio/mediaSession.test.ts
git commit -m "feat: implement carplay and media session controller with synchronous steering wheel switching"
```

---

### Task 7: Game Switcher & Authentic Theme Styling

**Files:**
- Create: `src/components/GameSelector.tsx`
- Create: `src/components/ThemeWrapper.tsx`
- Modify: `src/index.css`
- Test: `src/components/GameSelector.test.tsx`

**Interfaces:**
- Produces: `<GameSelector currentGame={game} onSelectGame={setGame} />`
- Produces: Theme styles for GTA SA, GTA IV, and GTA V

- [ ] **Step 1: Write test for GameSelector in src/components/GameSelector.test.tsx**

- [ ] **Step 2: Implement GameSelector and Theme styling**

- [ ] **Step 3: Run tests to verify GameSelector passes**

Run: `npm run test src/components/GameSelector.test.tsx`
Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add src/components/GameSelector.tsx src/components/ThemeWrapper.tsx src/index.css src/components/GameSelector.test.tsx
git commit -m "feat: implement game switcher and authentic themes for SA, IV, and V"
```

---

### Task 8: Interactive Radial Wheel & Mobile Touch Drag Controller

**Files:**
- Create: `src/components/RadioWheel.tsx`
- Create: `src/components/BroadcastHUD.tsx`
- Test: `src/components/RadioWheel.test.tsx`

**Interfaces:**
- Produces: `<RadioWheel stations={stations} currentStation={station} onSelectStation={select} />`
- Supports touch drag around circle, desktop keyboard 'Q' key hold, click selection, and haptic feedback.

- [ ] **Step 1: Write test for RadioWheel angle calculation and selection**

- [ ] **Step 2: Implement RadioWheel with touch drag & BroadcastHUD**

- [ ] **Step 3: Run test to verify RadioWheel passes**

Run: `npm run test src/components/RadioWheel.test.tsx`
Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add src/components/RadioWheel.tsx src/components/BroadcastHUD.tsx src/components/RadioWheel.test.tsx
git commit -m "feat: implement interactive radial wheel with mobile touch drag, desktop Q-key, and haptics"
```

---

### Task 9: Car Quick-Switch Grid & Offline Storage Drawer

**Files:**
- Create: `src/components/CarQuickGrid.tsx`
- Create: `src/components/StorageDrawer.tsx`
- Test: `src/components/CarQuickGrid.test.tsx`

**Interfaces:**
- Produces: `<CarQuickGrid stations={stations} currentStation={station} cachedIds={cachedIds} onSelect={tune} onDownload={dl} />`
- Produces: `<StorageDrawer isOpen={open} onClose={close} />`

- [ ] **Step 1: Write test for CarQuickGrid station tuning and download triggers**

- [ ] **Step 2: Implement CarQuickGrid with large driver-friendly buttons**

- [ ] **Step 3: Implement StorageDrawer with quota meter and clear-all button**

- [ ] **Step 4: Run test to verify CarQuickGrid passes**

Run: `npm run test src/components/CarQuickGrid.test.tsx`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/components/CarQuickGrid.tsx src/components/StorageDrawer.tsx src/components/CarQuickGrid.test.tsx
git commit -m "feat: implement car quick-switch grid and offline storage manager drawer"
```

---

### Task 10: App Integration, Service Worker & Public Deployment Verification

**Files:**
- Modify: `src/App.tsx`
- Create: `public/sw.js`
- Create: `src/components/InstallPrompt.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: Complete end-to-end PWA wiring audio engine, CarPlay media session, storage, wheel/grid view toggle, and service worker.

- [ ] **Step 1: Create minimal PWA Service Worker in public/sw.js for offline app shell caching**

```javascript
const CACHE_NAME = 'gta-radio-shell-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests for static app shell; audio streams are handled via IndexedDB
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.aac')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 2: Wire complete App.tsx integration**

Connects game switcher, audio engine, MediaSession listener, Radial Wheel, Car Quick Grid, Storage Drawer, Volume controls, and iOS "Add to Home Screen" install prompt.

- [ ] **Step 3: Run comprehensive test suite**

Run: `npm run test`
Expected: All test suites PASS.

- [ ] **Step 4: Run production build verification**

Run: `npm run build`
Expected: Clean build into `dist/` with no TypeScript or asset errors.

- [ ] **Step 5: Final Commit**

```bash
git add .
git commit -m "feat: complete GTA Radio PWA with multi-game selection, CarPlay integration, and offline caching"
```
