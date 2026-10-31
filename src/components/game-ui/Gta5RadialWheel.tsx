import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Station, TrackCue } from '../../types/radio';
import { sfx } from '../../audio/sfx';
import { VolumeX } from 'lucide-react';

export interface Gta5RadialWheelProps {
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  coverArtUrl?: string | null;
  className?: string;
  size?: number; // maximum disc size in px; the disc never exceeds 86vmin
}

export type GameHudProps = Gta5RadialWheelProps;

export const GTA5_HUD_FONT =
  "'Chalet London 1960', 'Chalet Comprime 1960', 'Chalet', 'Oswald', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** Station badges sit on this ring, as a percentage of the disc half-size. */
export const BADGE_RING_RADIUS_PERCENT = 44;

/**
 * Polar geometry of the wheel: station 0 sits at 12 o'clock and the ring
 * walks clockwise. Returned values are percentages of the disc box.
 */
export function getBadgePosition(index: number, total: number): { x: number; y: number } {
  if (total <= 0) return { x: 50, y: 50 };
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: 50 + BADGE_RING_RADIUS_PERCENT * Math.cos(angle),
    y: 50 + BADGE_RING_RADIUS_PERCENT * Math.sin(angle),
  };
}

/** Badges shrink as the roster grows so the ring stays a ring, not a smear. */
export function getBadgeSizePercent(total: number): number {
  if (total > 22) return 8.8;
  if (total > 18) return 9.6;
  return 11.2;
}

/**
 * Normalizes polar angle [0, 360) (0 deg at 12 o'clock, clockwise)
 * to closest station sector index.
 */
export function getStationIndexFromPolarAngle(deg: number, totalStations: number): number {
  if (totalStations <= 0) return 0;
  const normalized = ((deg % 360) + 360) % 360;
  const sliceAngle = 360 / totalStations;
  return Math.round(normalized / sliceAngle) % totalStations;
}

/**
 * Computes clockwise angle in degrees [0, 360) from center offset dx, dy.
 */
export function getAngleFromPointer(dx: number, dy: number): number {
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
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

/** Fallback mark shown when a station logo is missing or fails to load. */
export function badgeInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/);
  if (words.length === 0 || words[0] === '') return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface StationNodeProps {
  station: Station;
  index: number;
  total: number;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}

const StationNode: React.FC<StationNodeProps> = ({
  station,
  index,
  total,
  isActive,
  onSelect,
  onHover,
  onHoverEnd,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const { x, y } = getBadgePosition(index, total);
  const size = getBadgeSizePercent(total);

  return (
    <button
      type="button"
      data-testid={`gta5-station-badge-${station.id}`}
      data-station-index={index}
      data-active={isActive ? 'true' : 'false'}
      aria-label={station.name}
      aria-pressed={isActive}
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      onBlur={onHoverEnd}
      style={{ left: `${x}%`, top: `${y}%`, width: `${size}%`, height: `${size}%` }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center overflow-hidden outline-none select-none cursor-pointer transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sky-300/70 ${
        isActive
          ? 'z-30 scale-[1.12] bg-black/95 border-2 border-sky-300 ring-2 ring-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.8),0_0_28px_rgba(56,189,248,0.75)]'
          : 'z-10 bg-black/60 border border-white/20 hover:bg-black/80 hover:border-white/60 hover:scale-105 shadow-[0_4px_14px_rgba(0,0,0,0.6)]'
      }`}
    >
      {/* Inner bezel that keeps every logo inside the same optical circle */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-[7%] rounded-full ${
          isActive ? 'bg-sky-400/5' : 'bg-white/[0.03]'
        }`}
      />
      {logoFailed && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(7px,1.6vmin,11px)] font-bold uppercase tracking-tight ${
            isActive ? 'text-sky-100' : 'text-zinc-300'
          }`}
        >
          {badgeInitials(station.name)}
        </span>
      )}
      {!logoFailed && (
        <img
          src={station.logoUrl}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setLogoFailed(true)}
          className="pointer-events-none relative z-10 w-[74%] h-[74%] object-contain"
          style={{
            mixBlendMode: 'screen',
            opacity: isActive ? 1 : 0.7,
            filter: isActive
              ? 'grayscale(0.1) brightness(1.15) contrast(1.05)'
              : 'grayscale(1) brightness(1.9) contrast(0.75)',
          }}
        />
      )}
    </button>
  );
};

export const Gta5RadialWheel: React.FC<Gta5RadialWheelProps> = ({
  stations,
  currentStation,
  onSelectStation,
  isPlaying = false,
  currentCue = null,
  coverArtUrl = null,
  className = '',
  size = 620,
}) => {
  const discRef = useRef<HTMLDivElement>(null);
  const lastHighlightedIndexRef = useRef<number | null>(null);
  const lastWheelTimeRef = useRef<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [discSize, setDiscSize] = useState<number>(size);

  // The design is a fixed 520px disc, but the HUD has to live between the app
  // header and the player bar: measure the bounded scroll area and shrink the
  // disc (never the badge geometry) so the whole ring stays on screen.
  useLayoutEffect(() => {
    const measure = () => {
      const disc = discRef.current;
      if (!disc || typeof window === 'undefined') return;
      const bounded = disc.closest('main') as HTMLElement | null;
      const availableWidth = Math.min(
        disc.parentElement?.clientWidth || size,
        window.innerWidth - 16,
        size
      );
      let availableHeight = window.innerHeight - 220;
      if (bounded) {
        const styles = window.getComputedStyle(bounded);
        const padY =
          (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
        // 46px = controller hint line + its top margin
        availableHeight = bounded.clientHeight - padY - 46;
      }
      const next = Math.max(240, Math.floor(Math.min(availableWidth, availableHeight, size)));
      setDiscSize(next);
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && discRef.current) {
      const bounded = discRef.current.closest('main');
      if (bounded) {
        observer = new ResizeObserver(measure);
        observer.observe(bounded);
      }
    }

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      observer?.disconnect();
    };
  }, [size]);

  const offIndex = stations.findIndex((s) => s.id === 'radio-off');
  const activeIndex = currentStation ? stations.findIndex((s) => s.id === currentStation.id) : -1;
  const total = stations.length;

  // Active or hovered station. When currentStation is null and no station hovered,
  // default display to the radio-off node if present in stations
  const displayIndex =
    hoveredIndex !== null
      ? hoveredIndex
      : activeIndex >= 0
      ? activeIndex
      : offIndex >= 0 && currentStation === null
      ? offIndex
      : -1;
  const activeStation = displayIndex >= 0 ? stations[displayIndex] : null;
  const isRadioOff = !activeStation || activeStation.id === 'radio-off';

  // Reset the share affordance when the previewed station changes
  const activeStationId = activeStation?.id;
  useEffect(() => {
    setShareState('idle');
  }, [activeStationId]);

  // Select station with SFX, tuning burst and haptics
  const handleSelectStation = useCallback(
    (station: Station) => {
      sfx.playClick();
      sfx.playTuningStaticBurst(220);
      triggerHaptic(12);
      onSelectStation(station);
    },
    [onSelectStation]
  );

  const highlightIndex = useCallback((index: number) => {
    if (lastHighlightedIndexRef.current === index) return;
    lastHighlightedIndexRef.current = index;
    setHoveredIndex(index);
    sfx.playClick();
    triggerHaptic(10);
  }, []);

  const clearHighlight = useCallback(() => {
    lastHighlightedIndexRef.current = null;
    setHoveredIndex(null);
  }, []);

  // Process pointer coordinates from clientX, clientY
  const processPointerInput = useCallback(
    (clientX: number, clientY: number, isDragging: boolean = false) => {
      if (!discRef.current || total === 0) return;
      const rect = discRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // Deadzone check (~35px at the 520px reference size)
      const scale = rect.width > 0 ? rect.width / 520 : 1;
      if (Math.hypot(dx, dy) < 35 * scale) {
        return;
      }

      const angle = getAngleFromPointer(dx, dy);
      const index = getStationIndexFromPolarAngle(angle, total);

      if (lastHighlightedIndexRef.current !== index) {
        highlightIndex(index);

        // If pointer is down / dragging, select immediately
        if (isDragging && stations[index]) {
          onSelectStation(stations[index]);
        }
      }
    },
    [highlightIndex, total, stations, onSelectStation]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
      const clientX =
        typeof e.clientX === 'number' && !isNaN(e.clientX)
          ? e.clientX
          : (e.nativeEvent as MouseEvent)?.clientX;
      const clientY =
        typeof e.clientY === 'number' && !isNaN(e.clientY)
          ? e.clientY
          : (e.nativeEvent as MouseEvent)?.clientY;

      if (typeof clientX === 'number' && typeof clientY === 'number' && !isNaN(clientX) && !isNaN(clientY)) {
        processPointerInput(
          clientX,
          clientY,
          e.buttons === 1 || (e.nativeEvent as MouseEvent)?.buttons === 1
        );
      }
    },
    [processPointerInput]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      if (touch) {
        processPointerInput(touch.clientX, touch.clientY, true);
      }
    },
    [processPointerInput]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      if (touch) {
        processPointerInput(touch.clientX, touch.clientY, true);
      }
    },
    [processPointerInput]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (total === 0) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % total : 0;
        handleSelectStation(stations[nextIndex]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = activeIndex >= 0 ? (activeIndex - 1 + total) % total : total - 1;
        handleSelectStation(stations[prevIndex]);
      } else if (e.key === 'Enter' && displayIndex >= 0) {
        e.preventDefault();
        handleSelectStation(stations[displayIndex]);
      }
    },
    [total, activeIndex, displayIndex, stations, handleSelectStation]
  );

  // Mouse wheel station scrolling — non-passive native listener so we can preventDefault
  useEffect(() => {
    const el = discRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTimeRef.current < 90 || total === 0) return;
      if (Math.abs(e.deltaY) < 5 && Math.abs(e.deltaX) < 5) return;
      lastWheelTimeRef.current = now;

      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta > 0) {
        const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % total : 0;
        handleSelectStation(stations[nextIndex]);
      } else {
        const prevIndex = activeIndex >= 0 ? (activeIndex - 1 + total) % total : total - 1;
        handleSelectStation(stations[prevIndex]);
      }
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [total, activeIndex, stations, handleSelectStation]);

  // Frequency badge: catalog frequency, else one parsed from the name, else genre
  const frequencyBadge =
    activeStation?.frequency ||
    activeStation?.name.match(/\b\d{2,3}(?:\.\d)?\s*(?:FM|AM)?\b/i)?.[0] ||
    activeStation?.genre ||
    '';

  // Track metadata for the center readout
  let songTitle = 'Live Broadcast';
  let artistOrInfo = activeStation?.host
    ? `Hosted by ${activeStation.host}`
    : activeStation?.genre || 'Broadcasting Live';
  if (currentCue) {
    if (currentCue.type === 'music') {
      songTitle = currentCue.song;
      artistOrInfo = currentCue.artist;
    } else if (currentCue.type === 'talk') {
      songTitle = currentCue.song;
      artistOrInfo = currentCue.artist || 'Talk Radio';
    } else if (currentCue.type === 'ad') {
      songTitle = currentCue.song || 'Commercial Break';
      artistOrInfo = 'Commercial Break';
    }
  }

  const handleShare = useCallback(async () => {
    if (!activeStation || isRadioOff) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    const url = `${origin}${path}#station=${activeStation.id}`;
    const text = `${songTitle} — ${artistOrInfo}`;

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: activeStation.name, text, url });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      }
    } catch {
      // Sharing was dismissed or blocked — keep the HUD silent.
    }
  }, [activeStation, isRadioOff, songTitle, artistOrInfo]);

  const effectiveCoverArt = coverArtUrl || currentCue?.coverArtUrl || null;

  return (
    <div
      data-testid="gta5-radial-wheel"
      role="region"
      aria-label="GTA V Radio Wheel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ fontFamily: GTA5_HUD_FONT }}
      className={`flex flex-col items-center select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 rounded-3xl ${className}`}
    >
      <div
        ref={discRef}
        data-testid="gta5-wheel-disc"
        onPointerMove={handlePointerMove}
        onMouseMove={handlePointerMove}
        onPointerLeave={clearHighlight}
        onMouseLeave={clearHighlight}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={clearHighlight}
        style={{ width: `${discSize}px`, height: `${discSize}px` }}
        className="relative aspect-square touch-none"
      >
        {/* ── Night-highway HUD backdrop: vignette + CRT scanlines ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 42%, rgba(30, 42, 56, 0.55) 0%, rgba(10, 16, 24, 0.78) 58%, rgba(0, 0, 0, 0.94) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full opacity-[0.08]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 4px)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[14%] bottom-[8%] h-[22%] blur-2xl opacity-30"
          style={{ background: 'radial-gradient(ellipse at 50% 100%, #38bdf8 0%, transparent 70%)' }}
        />

        {/* ── Implied ring the badges hang on ── */}
        <svg
          data-testid="gta5-radial-svg"
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <circle
            cx={50}
            cy={50}
            r={BADGE_RING_RADIUS_PERCENT}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={0.3}
            strokeDasharray="0.9 1.6"
          />
          <circle
            cx={50}
            cy={50}
            r={BADGE_RING_RADIUS_PERCENT - 7}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.25}
          />
        </svg>

        {/* ── Station badges on the ring ── */}
        {stations.map((station, index) => (
          <StationNode
            key={station.id}
            station={station}
            index={index}
            total={total}
            isActive={index === displayIndex}
            onSelect={() => handleSelectStation(station)}
            onHover={() => highlightIndex(index)}
            onHoverEnd={clearHighlight}
          />
        ))}

        {/* ── Center readout: station, artist, song, share ── */}
        <div
          data-testid="gta5-center-hub"
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-[10%] text-center"
        >
          {activeStation && !isRadioOff ? (
            <>
              {effectiveCoverArt && (
                <div className="pointer-events-none absolute inset-[18%] overflow-hidden rounded-full opacity-[0.18]">
                  <img
                    src={effectiveCoverArt}
                    alt=""
                    data-testid="gta5-cover-art"
                    className="h-full w-full scale-110 object-cover blur-md"
                  />
                  <div className="absolute inset-0 bg-black/50" />
                </div>
              )}

              <div className="relative z-10 mb-1.5 flex items-center gap-1.5">
                {frequencyBadge && (
                  <span
                    data-testid="gta5-station-frequency"
                    className="text-[clamp(9px,1.8vmin,12px)] font-mono font-semibold uppercase tracking-[0.28em] text-sky-300/90"
                  >
                    {frequencyBadge}
                  </span>
                )}
                <span
                  data-testid="gta5-playing-dot"
                  data-playing={isPlaying ? 'true' : 'false'}
                  aria-hidden="true"
                  className={`h-1 w-1 rounded-full ${
                    isPlaying ? 'bg-sky-400 animate-pulse' : 'bg-zinc-600'
                  }`}
                />
              </div>

              <h2
                data-testid="gta5-station-name"
                style={{ fontSize: 'clamp(15px, 3.4vmin, 27px)', lineHeight: 1.06 }}
                className="relative z-10 max-w-full font-bold uppercase tracking-tight text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]"
              >
                {activeStation.name}
              </h2>

              <p
                data-testid="gta5-track-artist"
                style={{ fontSize: 'clamp(12px, 2.5vmin, 19px)', lineHeight: 1.2 }}
                className="relative z-10 mt-2 max-w-full font-medium text-zinc-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] line-clamp-2"
              >
                {artistOrInfo}
              </p>

              <p
                data-testid="gta5-track-title"
                style={{ fontSize: 'clamp(10px, 2.1vmin, 16px)', lineHeight: 1.25 }}
                className="relative z-10 max-w-full tracking-wide text-zinc-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] line-clamp-2"
              >
                {songTitle}
              </p>

              <button
                type="button"
                onClick={handleShare}
                data-testid="gta5-share-prompt"
                aria-label={`Share ${activeStation.name}`}
                className="pointer-events-auto relative z-10 mt-2.5 flex items-center gap-1.5 rounded-sm text-[clamp(9px,1.7vmin,11px)] font-semibold uppercase tracking-[0.24em] text-zinc-200 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                <span>{shareState === 'copied' ? 'Copied' : 'Share'}</span>
                <span className="flex h-[clamp(14px,2.8vmin,18px)] w-[clamp(14px,2.8vmin,18px)] items-center justify-center rounded-full border border-zinc-400 bg-slate-900 text-[clamp(7px,1.5vmin,10px)] font-bold leading-none text-sky-400">
                  ✕
                </span>
              </button>
            </>
          ) : (
            <>
              <VolumeX className="mb-2 h-[clamp(18px,4.4vmin,30px)] w-[clamp(18px,4.4vmin,30px)] text-zinc-500" />
              <h2
                style={{ fontSize: 'clamp(15px, 3.4vmin, 27px)', lineHeight: 1.06 }}
                className="font-bold uppercase tracking-tight text-zinc-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]"
              >
                Radio Off
              </h2>
              <p className="mt-2 text-[clamp(9px,1.9vmin,12px)] uppercase tracking-[0.22em] text-zinc-500">
                Select a station
              </p>
            </>
          )}
        </div>
      </div>

      <p
        data-testid="gta5-hud-hint"
        className="mt-3 max-w-[92vw] text-center text-[9px] font-semibold uppercase leading-relaxed tracking-[0.22em] text-zinc-500 sm:text-[10px]"
      >
        Drag to select station • Release to tune •{' '}
        <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] normal-case tracking-normal text-zinc-300">
          Q
        </kbd>{' '}
        cycles
      </p>
    </div>
  );
};

export default Gta5RadialWheel;
