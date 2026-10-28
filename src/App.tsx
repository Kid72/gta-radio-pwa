import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GameId, Station, EngineState } from './types/radio';
import { getGame, getStationsForGame } from './data/catalog';
import { RadioEngine, radioEngine } from './audio/radioEngine';
import { setupMediaSession, updateMediaSessionMetadata } from './audio/mediaSession';
import { sfx } from './audio/sfx';
import { listCachedStationKeys, deleteCachedStationAudio } from './storage/db';
import { downloadStationWithProgress } from './storage/downloadManager';
import { ThemeWrapper } from './components/ThemeWrapper';
import { GameSelector } from './components/GameSelector';
import { RadioWheel } from './components/RadioWheel';
import { CarQuickGrid } from './components/CarQuickGrid';
import { StorageDrawer } from './components/StorageDrawer';
import { InstallPrompt } from './components/InstallPrompt';
import {
  Disc3,
  LayoutGrid,
  HardDrive,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Radio,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';

export interface AppProps {
  engine?: RadioEngine;
  initialGame?: GameId;
  initialView?: 'wheel' | 'grid';
}

export default function App({
  engine,
  initialGame = 'gta5',
  initialView = 'wheel',
}: AppProps) {
  const activeEngine = useMemo(() => engine || radioEngine, [engine]);

  // Subsystem States
  const [currentGameId, setCurrentGameId] = useState<GameId>(initialGame);
  const [viewMode, setViewMode] = useState<'wheel' | 'grid'>(initialView);
  const [isStorageOpen, setIsStorageOpen] = useState<boolean>(false);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => sfx.isEnabled());
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set());
  const [downloadingKeys, setDownloadingKeys] = useState<Map<string, number>>(new Map());

  // Engine state mirror
  const [engineState, setEngineState] = useState<EngineState>(() => activeEngine.getState());

  const currentStations = useMemo(() => getStationsForGame(currentGameId), [currentGameId]);

  // Subscribe to radio engine state transitions
  useEffect(() => {
    let isInitial = true;
    const unsubscribe = activeEngine.subscribe((newState) => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      setEngineState(newState);
    });
    return () => {
      unsubscribe();
    };
  }, [activeEngine]);

  // Synchronize stations on game switch
  useEffect(() => {
    const stations = getStationsForGame(currentGameId);
    activeEngine.setStations(stations);
  }, [currentGameId, activeEngine]);

  // Synchronize Apple CarPlay MediaSession handlers and lock screen metadata
  useEffect(() => {
    const cleanupMediaSession = setupMediaSession(activeEngine);
    return () => {
      cleanupMediaSession();
    };
  }, [activeEngine]);

  useEffect(() => {
    if (engineState.currentStation) {
      updateMediaSessionMetadata(engineState.currentStation, engineState.currentCue);
    }
  }, [engineState.currentStation, engineState.currentCue]);

  // Refresh cached stations list from IndexedDB
  const refreshCachedKeys = useCallback(async () => {
    try {
      const keys = await listCachedStationKeys();
      setCachedKeys(new Set(keys));
    } catch (err) {
      console.warn('Failed to list cached station keys:', err);
    }
  }, []);

  useEffect(() => {
    refreshCachedKeys();
  }, [refreshCachedKeys]);

  // In-Car steering wheel & desktop keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        activeEngine.togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        activeEngine.nextStation();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        activeEngine.previousStation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeEngine]);

  // Station Tuning & Audio Handlers
  const handleSelectGame = useCallback((gameId: GameId) => {
    setCurrentGameId(gameId);
  }, []);

  const handleSelectStation = useCallback(
    (station: Station) => {
      activeEngine.playStation(station).catch((err) => {
        console.warn('Failed to tune station:', err);
      });
    },
    [activeEngine]
  );

  const handleTogglePlay = useCallback(() => {
    activeEngine.togglePlay();
  }, [activeEngine]);

  const handlePrevStation = useCallback(() => {
    activeEngine.previousStation();
  }, [activeEngine]);

  const handleNextStation = useCallback(() => {
    activeEngine.nextStation();
  }, [activeEngine]);

  const handleToggleMute = useCallback(() => {
    activeEngine.toggleMute();
  }, [activeEngine]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      activeEngine.setVolume(val);
    },
    [activeEngine]
  );

  const handleToggleSFX = useCallback(() => {
    const next = !sfxEnabled;
    sfx.setEnabled(next);
    setSfxEnabled(next);
  }, [sfxEnabled]);

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === 'wheel' ? 'grid' : 'wheel'));
  }, []);

  // Offline Download & Delete handlers for CarQuickGrid
  const handleDownloadStation = useCallback(
    async (station: Station) => {
      const fullKey = `${station.gameId}:${station.id}`;
      setDownloadingKeys((prev) => new Map(prev).set(fullKey, 0));

      try {
        await downloadStationWithProgress(station, (progress) => {
          setDownloadingKeys((prev) => new Map(prev).set(fullKey, progress.percent));
        });
        await refreshCachedKeys();
      } catch (err) {
        console.error(`Download failed for ${station.name}:`, err);
      } finally {
        setDownloadingKeys((prev) => {
          const next = new Map(prev);
          next.delete(fullKey);
          return next;
        });
      }
    },
    [refreshCachedKeys]
  );

  const handleDeleteStation = useCallback(
    async (station: Station) => {
      try {
        await deleteCachedStationAudio(station.gameId, station.id);
        await refreshCachedKeys();
      } catch (err) {
        console.error(`Failed to delete cached audio for ${station.name}:`, err);
      }
    },
    [refreshCachedKeys]
  );

  // Derive active game metadata & theme
  const activeGame = getGame(currentGameId);
  const currentStation = engineState.currentStation;
  const currentCue = engineState.currentCue;
  const isPlaying = engineState.isPlaying;

  // Cached count for header badge
  const cachedCount = cachedKeys.size;

  return (
    <ThemeWrapper
      game={currentGameId}
      className="flex flex-col h-screen max-h-screen overflow-hidden select-none"
    >
      {/* ── Top Header Bar ── */}
      <header
        role="banner"
        className="relative z-20 flex-shrink-0 w-full border-b border-white/10 bg-black/60 backdrop-blur-2xl px-3 py-2.5 sm:px-6 sm:py-3 transition-colors duration-500"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Game Selector Tabs */}
          <div className="w-full md:w-auto flex-1 max-w-xl">
            <GameSelector currentGame={currentGameId} onSelectGame={handleSelectGame} />
          </div>

          {/* Quick Action Utilities */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* View Mode Toggle (Radial Wheel vs Car Grid) */}
            <button
              onClick={handleToggleView}
              data-testid="view-toggle-button"
              aria-label={viewMode === 'wheel' ? 'Switch to Car Grid view' : 'Switch to Radial Wheel view'}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-semibold tracking-wider uppercase text-neutral-300 hover:text-white transition-all active:scale-[0.98]"
            >
              {viewMode === 'wheel' ? (
                <>
                  <LayoutGrid className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">Car Grid</span>
                </>
              ) : (
                <>
                  <Disc3 className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">Radial Wheel</span>
                </>
              )}
            </button>

            {/* Audio Tuning SFX Toggle */}
            <button
              onClick={handleToggleSFX}
              data-testid="sfx-toggle-button"
              aria-label={sfxEnabled ? 'Disable Radio Tuning SFX' : 'Enable Radio Tuning SFX'}
              title={sfxEnabled ? 'Tuning static enabled' : 'Tuning static disabled'}
              className={`p-2 rounded-xl border transition-all active:scale-[0.98] ${
                sfxEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(74,232,145,0.2)]'
                  : 'bg-white/5 border-white/10 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Storage Manager Drawer Button */}
            <button
              onClick={() => setIsStorageOpen(true)}
              data-testid="storage-button"
              aria-label="Open Offline Commute Storage Manager"
              className="relative flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-semibold tracking-wider text-neutral-300 hover:text-white transition-all active:scale-[0.98]"
            >
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Offline</span>
              {cachedCount > 0 && (
                <span
                  data-testid="storage-badge-count"
                  className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold"
                >
                  {cachedCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Body Station Viewport ── */}
      <main
        role="main"
        className="relative z-10 flex-1 flex flex-col items-center justify-center overflow-y-auto w-full px-2 py-4 sm:p-6"
      >
        {viewMode === 'wheel' ? (
          <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto my-auto py-2">
            <RadioWheel
              stations={currentStations}
              currentStation={currentStation}
              onSelectStation={handleSelectStation}
              isPlaying={isPlaying}
              currentCue={currentCue}
            />
            <div className="mt-4 text-center">
              <span className="text-[11px] text-neutral-500 tracking-wider uppercase">
                Tap or drag wheel to tune • Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-neutral-300 font-mono text-[10px]">Q</kbd> for quick select
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-6xl mx-auto h-full flex flex-col justify-start">
            <CarQuickGrid
              stations={currentStations}
              currentStation={currentStation}
              cachedKeys={cachedKeys}
              downloadingKeys={downloadingKeys}
              onSelectStation={handleSelectStation}
              onDownloadStation={handleDownloadStation}
              onDeleteStation={handleDeleteStation}
              isPlaying={isPlaying}
              currentCue={currentCue}
            />
          </div>
        )}
      </main>

      {/* ── Persistent Bottom CarPlay Player Bar ── */}
      <footer
        role="region"
        aria-label="Audio Playback Bar"
        data-testid="player-bar"
        className="relative z-20 flex-shrink-0 w-full bg-black/85 backdrop-blur-2xl border-t border-white/15 px-3 py-2.5 sm:px-6 sm:py-3.5 shadow-[0_-10px_35px_rgba(0,0,0,0.85)]"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-6">
          {/* Current Station Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial sm:w-72">
            <div className="relative flex-shrink-0 w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-black/60 border border-white/15 overflow-hidden flex items-center justify-center shadow-lg">
              {currentStation?.logoUrl ? (
                <img
                  src={currentStation.logoUrl}
                  alt={currentStation.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <Radio className="w-6 h-6 text-neutral-500" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                  {currentStation ? currentStation.name : 'Radio Off'}
                </span>
                {currentStation && (
                  <span
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase"
                    style={{
                      backgroundColor: engineState.isOffline ? 'rgba(74,232,145,0.2)' : 'rgba(255,255,255,0.1)',
                      color: engineState.isOffline ? '#4ae891' : '#9ca3af',
                    }}
                  >
                    {engineState.isOffline ? (
                      <>
                        <WifiOff className="w-3 h-3 text-emerald-400" />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3 h-3 text-neutral-400" />
                        <span>Live</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              <p className="text-xs text-neutral-400 truncate mt-0.5">
                {currentCue?.type === 'music'
                  ? `${currentCue.song} — ${currentCue.artist}`
                  : currentStation?.genre || activeGame.title}
              </p>
            </div>
          </div>

          {/* Central Playback Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handlePrevStation}
              data-testid="player-prev-button"
              aria-label="Previous Station"
              className="p-2 sm:p-2.5 rounded-full bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all active:scale-95"
            >
              <SkipBack className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={handleTogglePlay}
              data-testid="player-play-pause-button"
              aria-label={isPlaying ? 'Pause Station' : 'Play Station'}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-200 transform active:scale-95 shadow-xl"
              style={{
                backgroundColor: activeGame.theme.accentColor,
                color: '#000',
                boxShadow: `0 0 25px ${activeGame.theme.accentColor}55`,
              }}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
              ) : (
                <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current translate-x-0.5" />
              )}
            </button>

            <button
              onClick={handleNextStation}
              data-testid="player-next-button"
              aria-label="Next Station"
              className="p-2 sm:p-2.5 rounded-full bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all active:scale-95"
            >
              <SkipForward className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Right Volume / Mute Controls */}
          <div className="hidden sm:flex items-center gap-2.5 w-44 justify-end">
            <button
              onClick={handleToggleMute}
              data-testid="volume-mute-button"
              aria-label={engineState.isMuted ? 'Unmute Audio' : 'Mute Audio'}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {engineState.isMuted || engineState.volume === 0 ? (
                <VolumeX className="w-5 h-5 text-red-400" />
              ) : (
                <Volume2 className="w-5 h-5 text-neutral-300" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={engineState.isMuted ? 0 : engineState.volume}
              onChange={handleVolumeChange}
              data-testid="volume-slider"
              aria-label="Volume Slider"
              className="w-24 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>
      </footer>

      {/* ── Offline Storage Manager Drawer ── */}
      <StorageDrawer
        isOpen={isStorageOpen}
        onClose={() => setIsStorageOpen(false)}
        onStorageChanged={refreshCachedKeys}
      />

      {/* ── Standalone Apple CarPlay & PWA Install Prompt ── */}
      <InstallPrompt />
    </ThemeWrapper>
  );
}
