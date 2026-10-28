import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Station, TrackCue } from '../../types/radio';
import { sfx } from '../../audio/sfx';
import { Radio, VolumeX, Disc3, Mic, Megaphone, ChevronLeft, ChevronRight } from 'lucide-react';

export interface GtaSaHorizontalReelProps {
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  coverArtUrl?: string | null;
  className?: string;
}

export type GameHudProps = GtaSaHorizontalReelProps;

export const ITEM_WIDTH = 88;

/**
 * Calculates the horizontal reel offset so the active station item is centered.
 */
export function calculateReelOffset(activeIndex: number, itemWidth: number = ITEM_WIDTH): number {
  return Math.max(0, activeIndex) * itemWidth + itemWidth / 2;
}

/**
 * Computes cyclic next/prev station index.
 */
export function getNextStationIndex(
  currentIndex: number,
  total: number,
  direction: 'next' | 'prev'
): number {
  if (total <= 0) return 0;
  if (currentIndex < 0) {
    return direction === 'next' ? 0 : total - 1;
  }
  if (direction === 'next') {
    return (currentIndex + 1) % total;
  }
  return (currentIndex - 1 + total) % total;
}

/**
 * Triggers subtle haptic feedback vibration tick.
 */
export function triggerHaptic(duration = 10): void {
  if (
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator &&
    typeof navigator.vibrate === 'function'
  ) {
    try {
      navigator.vibrate(duration);
    } catch {
      // Ignore vibration errors
    }
  }
}

export const GtaSaHorizontalReel: React.FC<GtaSaHorizontalReelProps> = ({
  stations,
  currentStation,
  onSelectStation,
  isPlaying = false,
  currentCue = null,
  coverArtUrl = null,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const lastWheelTimeRef = useRef<number>(0);
  const touchStartXRef = useRef<number | null>(null);

  const activeIndex = currentStation
    ? stations.findIndex((s) => s.id === currentStation.id)
    : -1;
  const effectiveIndex = activeIndex >= 0 ? activeIndex : 0;

  const handleSelect = useCallback(
    (station: Station, _index?: number) => {
      sfx.playClick();
      triggerHaptic(10);
      onSelectStation(station);
    },
    [onSelectStation]
  );

  const cycleStation = useCallback(
    (direction: 'next' | 'prev') => {
      if (stations.length === 0) return;
      const nextIdx = getNextStationIndex(activeIndex, stations.length, direction);
      const targetStation = stations[nextIdx];
      if (targetStation) {
        handleSelect(targetStation, nextIdx);
      }
    },
    [activeIndex, stations, handleSelect]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack keyboard inputs when typing
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'r':
        case 'R':
        case ']':
          e.preventDefault();
          cycleStation('next');
          break;
        case 'ArrowLeft':
        case '[':
          e.preventDefault();
          cycleStation('prev');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleStation]);

  // Mouse wheel scroll navigation (throttled)
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const now = Date.now();
      if (now - lastWheelTimeRef.current < 200) return;

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) > 20) {
        lastWheelTimeRef.current = now;
        if (delta > 0) {
          cycleStation('next');
        } else {
          cycleStation('prev');
        }
      }
    },
    [cycleStation]
  );

  // Mobile touch swipe gestures
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (touchStartXRef.current !== null && e.changedTouches.length > 0) {
        const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (deltaX < -30) {
          cycleStation('next');
        } else if (deltaX > 30) {
          cycleStation('prev');
        }
      }
    },
    [cycleStation]
  );

  const handleImageError = useCallback((id: string) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  }, []);

  const activeCover = coverArtUrl || currentCue?.coverArtUrl;

  return (
    <div
      ref={containerRef}
      data-testid="gtasa-reel-container"
      role="region"
      aria-label="GTA San Andreas Radio HUD"
      tabIndex={0}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full max-w-2xl mx-auto flex flex-col items-center select-none pt-2 pb-4 px-3 outline-none ${className}`}
    >
      {/* San Andreas Amber Strip HUD Backdrop */}
      <div className="w-full bg-gradient-to-b from-black/90 via-amber-950/20 to-black/85 backdrop-blur-md rounded-2xl border border-amber-500/30 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(245,158,11,0.15)] relative overflow-hidden">
        {/* Subtle decorative scanlines / vintage grid texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #f59e0b, #f59e0b 1px, transparent 1px, transparent 4px)',
          }}
        />

        {/* Top Header Row with quick cyclic arrows and title */}
        <div className="flex items-center justify-between px-2 pb-1 border-b border-amber-500/20 text-amber-500/80 text-xs font-mono tracking-wider">
          <button
            type="button"
            onClick={() => cycleStation('prev')}
            className="flex items-center gap-1 hover:text-amber-300 transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-amber-500/10"
            aria-label="Previous Station"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">[</span>
          </button>

          <div className="flex items-center gap-2">
            <Radio size={14} className="text-amber-400 animate-pulse" />
            <span className="uppercase tracking-widest font-bold text-amber-400">
              San Andreas Radio
            </span>
          </div>

          <button
            type="button"
            onClick={() => cycleStation('next')}
            className="flex items-center gap-1 hover:text-amber-300 transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-amber-500/10"
            aria-label="Next Station"
          >
            <span className="hidden sm:inline">]</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Filmstrip Viewport with edge gradient masking */}
        <div
          className="relative w-full h-24 sm:h-28 flex items-center justify-center overflow-hidden my-2"
          style={{
            maskImage:
              'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          }}
        >
          {/* Amber Selection Brackets [  ] Pinned at Center */}
          <div
            data-testid="gtasa-amber-brackets"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] flex items-center justify-between p-0.5 z-20"
            style={{
              filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.75))',
            }}
          >
            {/* Left Bracket [ */}
            <div className="relative w-3.5 h-full flex flex-col justify-between">
              <div className="w-full h-1 bg-amber-400 rounded-tl shadow-[0_0_8px_#f59e0b]" />
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-l shadow-[0_0_8px_#f59e0b]" />
              <div className="w-full h-1 bg-amber-400 rounded-bl shadow-[0_0_8px_#f59e0b]" />
            </div>

            {/* Right Bracket ] */}
            <div className="relative w-3.5 h-full flex flex-col justify-between">
              <div className="w-full h-1 bg-amber-400 rounded-tr shadow-[0_0_8px_#f59e0b]" />
              <div className="absolute right-0 top-0 bottom-0 w-1 bg-amber-400 rounded-r shadow-[0_0_8px_#f59e0b]" />
              <div className="w-full h-1 bg-amber-400 rounded-br shadow-[0_0_8px_#f59e0b]" />
            </div>
          </div>

          {/* Filmstrip Reel Track */}
          <div
            data-testid="gtasa-reel-track"
            className="flex items-center absolute left-0 top-0 h-full"
            style={{
              transform: `translateX(calc(50% - ${calculateReelOffset(
                effectiveIndex,
                ITEM_WIDTH
              )}px))`,
              transition: 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1)',
              willChange: 'transform',
            }}
          >
            {stations.map((station, index) => {
              const isActive = index === activeIndex;
              const isImageErrored = imgErrors[station.id];

              return (
                <button
                  key={station.id}
                  type="button"
                  data-testid={`gtasa-station-${station.id}`}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => handleSelect(station, index)}
                  className={`flex-shrink-0 flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none ${
                    isActive
                      ? 'scale-115 opacity-100 z-10 brightness-110 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                      : 'scale-85 opacity-50 contrast-75 brightness-75 hover:opacity-80'
                  }`}
                  style={{ width: `${ITEM_WIDTH}px`, height: '100%' }}
                  aria-label={`Select ${station.name}`}
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center overflow-hidden bg-black/60 border border-amber-500/20">
                    {!isImageErrored && station.logoUrl ? (
                      <img
                        src={station.logoUrl}
                        alt={station.name}
                        className="w-full h-full object-contain p-1"
                        onError={() => handleImageError(station.id)}
                      />
                    ) : (
                      <div
                        data-testid={`gtasa-fallback-icon-${station.id}`}
                        className="w-full h-full flex items-center justify-center text-amber-400 font-bold text-xs p-1 text-center bg-amber-950/40"
                      >
                        {station.name.slice(0, 3).toUpperCase()}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Station Title & Meta Section */}
        {currentStation ? (
          <div className="flex flex-col items-center justify-center text-center mt-1 mb-2">
            <h2
              data-testid="gtasa-station-title"
              className="text-2xl sm:text-3xl text-amber-400 tracking-wider uppercase font-['Pricedown'] font-normal"
              style={{
                fontFamily: "'Pricedown', 'Impact', sans-serif",
                textShadow:
                  '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000, 0 4px 10px rgba(0,0,0,0.95)',
              }}
            >
              {currentStation.name}
            </h2>

            <div className="flex items-center flex-wrap justify-center gap-2 mt-0.5 text-xs">
              {currentStation.frequency && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                  {currentStation.frequency}
                </span>
              )}
              {currentStation.genre && (
                <span className="text-amber-200/80 font-medium tracking-wide">
                  {currentStation.genre}
                </span>
              )}
              {currentStation.host && (
                <>
                  <span className="text-amber-500/40">•</span>
                  <span className="text-amber-300/80 italic">Host: {currentStation.host}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-950/40 border border-amber-500/30 text-amber-400 mb-2">
              <VolumeX size={22} />
            </div>
            <h2
              className="text-2xl sm:text-3xl text-amber-500 font-['Pricedown'] tracking-wider uppercase"
              style={{
                fontFamily: "'Pricedown', 'Impact', sans-serif",
                textShadow:
                  '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000, 0 4px 10px rgba(0,0,0,0.95)',
              }}
            >
              RADIO OFF
            </h2>
            <p className="text-xs text-amber-200/60 mt-1 uppercase tracking-widest font-mono">
              Select a station to tune in
            </p>
          </div>
        )}

        {/* Track Cue Banner */}
        {currentStation && currentCue && (
          <div
            data-testid="gtasa-track-cue-banner"
            className="mt-2 w-full flex items-center justify-between p-2.5 rounded-xl bg-black/60 border border-amber-500/20 backdrop-blur-sm"
          >
            <div className="flex items-center min-w-0 flex-1 mr-3">
              {activeCover ? (
                <img
                  data-testid="gtasa-cue-cover-art"
                  src={activeCover}
                  alt="Cover Art"
                  className="w-10 h-10 rounded-md object-cover border border-amber-500/40 mr-2.5 flex-shrink-0 shadow-md"
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-amber-950/50 border border-amber-500/30 mr-2.5 flex items-center justify-center text-amber-400 flex-shrink-0">
                  {currentCue.type === 'talk' ? (
                    <Mic size={18} />
                  ) : currentCue.type === 'ad' ? (
                    <Megaphone size={18} />
                  ) : (
                    <Disc3 size={18} className={isPlaying ? 'animate-spin' : ''} />
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {currentCue.type === 'talk'
                      ? 'TALK SHOW'
                      : currentCue.type === 'ad'
                      ? 'COMMERCIAL'
                      : 'MUSIC'}
                  </span>
                </div>
                <div className="font-bold text-white text-sm truncate leading-tight">
                  {currentCue.song}
                </div>
                <div className="text-xs text-amber-200/80 truncate leading-tight">
                  {currentCue.artist}
                </div>
              </div>
            </div>

            {/* Equalizer bars */}
            {isPlaying && (
              <div
                data-testid="gtasa-equalizer-bars"
                className="flex items-end gap-1 h-5 flex-shrink-0 pr-1"
                aria-label="Equalizer"
              >
                <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-4" />
                <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.9s_ease-in-out_infinite_0.15s] h-5" />
                <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.3s] h-3" />
                <span className="w-1 bg-amber-400 rounded-full animate-[pulse_1.0s_ease-in-out_infinite_0.1s] h-5" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GtaSaHorizontalReel;

