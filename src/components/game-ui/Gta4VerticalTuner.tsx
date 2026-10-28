import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Station, TrackCue } from '../../types/radio';
import { sfx } from '../../audio/sfx';
import { Radio, VolumeX, Disc3, Mic, Megaphone, ChevronUp, ChevronDown } from 'lucide-react';

export interface Gta4VerticalTunerProps {
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  coverArtUrl?: string | null;
  className?: string;
}

export type GameHudProps = Gta4VerticalTunerProps;

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
 * Formats station frequency with explicit frequency field,
 * regex extraction from name, or fallback.
 */
export function formatFrequency(station: Station): string {
  if (station.frequency) return station.frequency;
  const match = station.name.match(/(\d+(?:\.\d+)?)\s*(FM|AM)?/i);
  if (match) {
    const num = match[1];
    const band = match[2] ? match[2].toUpperCase() : 'FM';
    return `${num} ${band}`;
  }
  return '';
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

/**
 * Resolves a fallback icon for stations when image fails to load.
 */
function getGenreIcon(genre: string) {
  const g = genre.toLowerCase();
  if (g.includes('talk') || g.includes('news')) return <Megaphone size={18} className="text-yellow-500/80" />;
  if (g.includes('hip-hop') || g.includes('rap')) return <Mic size={18} className="text-yellow-500/80" />;
  if (g.includes('electro') || g.includes('dance') || g.includes('club')) return <Disc3 size={18} className="text-yellow-500/80" />;
  return <Radio size={18} className="text-yellow-500/80" />;
}

export const Gta4VerticalTuner: React.FC<Gta4VerticalTunerProps> = ({
  stations,
  currentStation,
  onSelectStation,
  isPlaying = false,
  currentCue = null,
  coverArtUrl = null,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const lastWheelTimeRef = useRef<number>(0);
  const touchStartYRef = useRef<number | null>(null);

  const activeIndex = currentStation
    ? stations.findIndex((s) => s.id === currentStation.id)
    : -1;

  // Scroll active item into view on station change
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeIndex]);

  const handleSelect = useCallback(
    (station: Station) => {
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
        handleSelect(targetStation);
      }
    },
    [activeIndex, stations, handleSelect]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack keyboard inputs when typing in inputs/textareas
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
        case 'ArrowDown':
        case 's':
        case 'S':
        case 'r':
        case 'R':
        case ']':
          e.preventDefault();
          cycleStation('next');
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
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

      const delta = e.deltaY;
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

  // Mobile touch swipe gestures (vertical drag)
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (touchStartYRef.current !== null && e.changedTouches.length > 0) {
        const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
        touchStartYRef.current = null;
        if (deltaY < -30) {
          cycleStation('next');
        } else if (deltaY > 30) {
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

  const getCueBadgeText = (type: 'music' | 'talk' | 'ad') => {
    switch (type) {
      case 'music':
        return 'MUSIC';
      case 'talk':
        return 'TALK';
      case 'ad':
        return 'COMMERCIAL';
      default:
        return 'ON AIR';
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="gta4-vertical-tuner"
      role="region"
      aria-label="GTA IV Liberty City Radio Tuner"
      tabIndex={0}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full max-w-xl mx-auto flex flex-col select-none outline-none ${className}`}
    >
      {/* Industrial Dark Slate Container with Liberty City Gritty Styling */}
      <div
        className="w-full bg-slate-900/95 backdrop-blur-md border border-yellow-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.92),0_0_24px_rgba(234,179,8,0.12)] relative overflow-hidden"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
        }}
      >
        {/* Gritty Hazard / Carbon Grid Background Texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #eab308, #eab308 1px, transparent 1px, transparent 6px)',
          }}
        />

        {/* Industrial Header Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-950/80 border-b border-yellow-500/30 text-xs">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-yellow-400 animate-pulse" />
            <span className="font-['Bank_Gothic','Rajdhani',sans-serif] font-bold tracking-widest text-yellow-400 uppercase text-xs sm:text-sm">
              Liberty City Tuner
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">
              [ {activeIndex >= 0 ? (activeIndex + 1).toString().padStart(2, '0') : '--'} / {stations.length.toString().padStart(2, '0')} ]
            </span>
            <div className="flex items-center gap-1 border-l border-slate-700/80 pl-2">
              <button
                type="button"
                onClick={() => cycleStation('prev')}
                className="p-1 text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors cursor-pointer"
                aria-label="Previous Station"
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                onClick={() => cycleStation('next')}
                className="p-1 text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors cursor-pointer"
                aria-label="Next Station"
              >
                <ChevronDown size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Track Info Banner / Radio Off Banner */}
        {currentStation === null ? (
          <div
            data-testid="gta4-radio-off"
            className="flex items-center gap-3 px-4 py-3 bg-black/60 border-b border-slate-800"
          >
            <div className="w-10 h-10 bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
              <VolumeX size={20} />
            </div>
            <div>
              <div className="font-['Bank_Gothic','Rajdhani',sans-serif] font-bold text-sm text-slate-300 tracking-wider">
                RADIO OFF
              </div>
              <div className="text-[11px] font-mono text-slate-500 uppercase">
                Liberty City Audio Standby
              </div>
            </div>
          </div>
        ) : (
          <div
            data-testid="gta4-track-banner"
            className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/50 border-b border-yellow-500/20"
          >
            {/* Artwork / Logo Thumbnail */}
            <div className="flex items-center gap-2.5 min-w-0">
              {activeCover ? (
                <img
                  data-testid="gta4-cover-art"
                  src={activeCover}
                  alt={currentCue?.song || currentStation.name}
                  className="w-11 h-11 object-cover bg-black border border-yellow-500/30 flex-shrink-0"
                />
              ) : currentStation.logoUrl && !imgErrors[`banner-${currentStation.id}`] ? (
                <img
                  data-testid="gta4-banner-logo"
                  src={currentStation.logoUrl}
                  alt={currentCue?.song || `${currentStation.name} banner`}
                  onError={() => handleImageError(`banner-${currentStation.id}`)}
                  className="w-11 h-11 object-contain p-1 bg-black/60 border border-slate-700 flex-shrink-0"
                />
              ) : (
                <div className="w-11 h-11 bg-slate-800/80 border border-slate-700 flex items-center justify-center flex-shrink-0">
                  {getGenreIcon(currentStation.genre)}
                </div>
              )}

              {/* Cue / Station Track Details */}
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <span
                    data-testid="gta4-song-title"
                    className="font-['Bank_Gothic','Rajdhani',sans-serif] font-bold text-sm text-white truncate tracking-wide"
                  >
                    {currentCue?.song || currentStation.name}
                  </span>
                  {currentCue && (
                    <span
                      data-testid="gta4-cue-badge"
                      className={`text-[9px] font-mono px-1 py-0.2 font-bold uppercase tracking-wider ${
                        currentCue.type === 'music'
                          ? 'bg-yellow-500 text-black'
                          : currentCue.type === 'talk'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      {getCueBadgeText(currentCue.type)}
                    </span>
                  )}
                </div>

                <div
                  data-testid="gta4-artist-name"
                  className="text-xs font-mono text-yellow-400/90 truncate uppercase"
                >
                  {currentCue?.artist || currentStation.genre}
                </div>
              </div>
            </div>

            {/* 4-Bar Equalizer Display */}
            <div
              data-testid="gta4-equalizer-bars"
              className="flex items-end gap-1 h-6 px-1 flex-shrink-0"
            >
              {[
                { activeH: 'h-5', delay: '0ms' },
                { activeH: 'h-3', delay: '150ms' },
                { activeH: 'h-6', delay: '300ms' },
                { activeH: 'h-4', delay: '75ms' },
              ].map((bar, i) => (
                <div
                  key={i}
                  className={`w-1 transition-all duration-200 ${
                    isPlaying
                      ? `${bar.activeH} bg-yellow-400 animate-pulse`
                      : 'h-1.5 bg-slate-700'
                  }`}
                  style={{ animationDelay: isPlaying ? bar.delay : undefined }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Scrollable Vertical Station List */}
        <div
          data-testid="gta4-station-list"
          className="max-h-80 sm:max-h-96 overflow-y-auto divide-y divide-slate-800/80 scrollbar-thin scrollbar-thumb-yellow-500/20 scrollbar-track-transparent"
        >
          {stations.map((station) => {
            const isActive = currentStation?.id === station.id;
            const freq = formatFrequency(station);

            return (
              <button
                key={station.id}
                ref={isActive ? activeItemRef : null}
                type="button"
                data-testid={`gta4-station-item-${station.id}`}
                data-active={isActive ? 'true' : 'false'}
                aria-selected={isActive}
                onClick={() => handleSelect(station)}
                className={`w-full text-left flex items-center justify-between p-2.5 transition-colors cursor-pointer group ${
                  isActive
                    ? 'bg-yellow-500/15 border-l-4 border-yellow-500'
                    : 'bg-slate-900/40 hover:bg-slate-800/60 border-l-4 border-transparent'
                }`}
                style={
                  isActive
                    ? {
                        borderLeft: '4px solid #eab308',
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                      }
                    : undefined
                }
              >
                {/* Left section: active chevron + station logo + details */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  {/* Active Chevron Indicator */}
                  <div className="w-4 flex items-center justify-center flex-shrink-0">
                    {isActive ? (
                      <span
                        data-testid="gta4-active-chevron"
                        className="text-yellow-400 font-bold text-sm animate-pulse"
                      >
                        ►
                      </span>
                    ) : (
                      <span className="opacity-0">►</span>
                    )}
                  </div>

                  {/* Station Logo Emblem */}
                  <div className="w-9 h-9 bg-black/60 border border-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {!imgErrors[station.id] && station.logoUrl ? (
                      <img
                        src={station.logoUrl}
                        alt={station.name}
                        onError={() => handleImageError(station.id)}
                        className="w-full h-full object-contain p-0.5"
                      />
                    ) : (
                      getGenreIcon(station.genre)
                    )}
                  </div>

                  {/* Station Name & Genre */}
                  <div className="min-w-0">
                    <div
                      className={`font-['Bank_Gothic','Rajdhani',sans-serif] text-sm tracking-wide truncate ${
                        isActive
                          ? 'font-bold text-white'
                          : 'text-slate-300 group-hover:text-white'
                      }`}
                    >
                      {station.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 uppercase truncate">
                      {station.genre}
                    </div>
                  </div>
                </div>

                {/* Right section: Frequency badge */}
                {freq && (
                  <div className="flex-shrink-0 pl-2">
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 tracking-wider ${
                        isActive
                          ? 'bg-yellow-500 text-black font-bold'
                          : 'bg-slate-800 text-yellow-400/80 font-medium'
                      }`}
                    >
                      {freq}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
