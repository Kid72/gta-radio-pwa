import React, { useState, useRef, useCallback } from 'react';
import { Station, TrackCue } from '../../types/radio';
import { sfx } from '../../audio/sfx';
import { Radio, Disc3, VolumeX } from 'lucide-react';

export interface Gta5RadialWheelProps {
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  coverArtUrl?: string | null;
  className?: string;
  size?: number; // default 520
}

export type GameHudProps = Gta5RadialWheelProps;

export interface AnnularSectorParams {
  cx: number;
  cy: number;
  rIn: number;
  rOut: number;
  startDeg: number;
  endDeg: number;
}

export const GTA5_HUD_FONT =
  "'Chalet London 1960', 'Chalet Comprime 1960', 'Chalet', 'Oswald', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Computes SVG arc path for an annular pie wedge.
 * Uses formula:
 * M outerX1 outerY1 A outerR outerR 0 0 1 outerX2 outerY2 L innerX2 innerY2 A innerR innerR 0 0 0 innerX1 innerY1 Z
 */
export function calculateAnnularSectorPath({
  cx,
  cy,
  rIn,
  rOut,
  startDeg,
  endDeg,
}: AnnularSectorParams): string {
  const degToRad = (deg: number) => (deg * Math.PI) / 180;
  const rad1 = degToRad(startDeg);
  const rad2 = degToRad(endDeg);

  const outerX1 = Number((cx + rOut * Math.sin(rad1)).toFixed(3));
  const outerY1 = Number((cy - rOut * Math.cos(rad1)).toFixed(3));
  const outerX2 = Number((cx + rOut * Math.sin(rad2)).toFixed(3));
  const outerY2 = Number((cy - rOut * Math.cos(rad2)).toFixed(3));

  const innerX2 = Number((cx + rIn * Math.sin(rad2)).toFixed(3));
  const innerY2 = Number((cy - rIn * Math.cos(rad2)).toFixed(3));
  const innerX1 = Number((cx + rIn * Math.sin(rad1)).toFixed(3));
  const innerY1 = Number((cy - rIn * Math.cos(rad1)).toFixed(3));

  const diff = ((endDeg - startDeg) % 360 + 360) % 360;
  const largeArcFlag = diff > 180 ? 1 : 0;

  return `M ${outerX1} ${outerY1} A ${rOut} ${rOut} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2} L ${innerX2} ${innerY2} A ${rIn} ${rIn} 0 ${largeArcFlag} 0 ${innerX1} ${innerY1} Z`;
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

export const Gta5RadialWheel: React.FC<Gta5RadialWheelProps> = ({
  stations,
  currentStation,
  onSelectStation,
  isPlaying = false,
  currentCue = null,
  coverArtUrl = null,
  className = '',
  size = 520,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHighlightedIndexRef = useRef<number | null>(null);
  const lastWheelTimeRef = useRef<number>(0);

  const offIndex = stations.findIndex((s) => s.id === 'radio-off');
  const activeIndex = currentStation ? stations.findIndex((s) => s.id === currentStation.id) : -1;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Active or hovered station. When currentStation is null and no station hovered,
  // default display to radio-off sector if present in stations
  const displayIndex =
    hoveredIndex !== null
      ? hoveredIndex
      : activeIndex >= 0
      ? activeIndex
      : offIndex >= 0 && currentStation === null
      ? offIndex
      : -1;
  const activeStation = displayIndex >= 0 ? stations[displayIndex] : null;

  // Geometry configuration
  const scale = size / 520;
  const cx = size / 2;
  const cy = size / 2;
  const rIn = 110 * scale;
  const rOutBase = 215 * scale;
  const rOutActive = (215 + 14) * scale;
  const total = stations.length;
  const sliceAngle = total > 0 ? 360 / total : 360;

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

  // Process pointer coordinates from clientX, clientY
  const processPointerInput = useCallback(
    (clientX: number, clientY: number, isDragging: boolean = false) => {
      if (!containerRef.current || total === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      // Deadzone check (~35px scaled)
      if (dist < 35 * scale) {
        return;
      }

      const angle = getAngleFromPointer(dx, dy);
      const index = getStationIndexFromPolarAngle(angle, total);

      if (lastHighlightedIndexRef.current !== index) {
        lastHighlightedIndexRef.current = index;
        setHoveredIndex(index);
        sfx.playClick();
        triggerHaptic(10);

        // If pointer is down / dragging, select immediately
        if (isDragging && stations[index]) {
          onSelectStation(stations[index]);
        }
      }
    },
    [scale, total, stations, onSelectStation]
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

  const handlePointerLeave = useCallback(() => {
    lastHighlightedIndexRef.current = null;
    setHoveredIndex(null);
  }, []);

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

  const handleTouchEnd = useCallback(() => {
    lastHighlightedIndexRef.current = null;
    setHoveredIndex(null);
  }, []);

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
      }
    },
    [total, activeIndex, stations, handleSelectStation]
  );

  // Mouse wheel station scrolling
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
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
    },
    [total, activeIndex, stations, handleSelectStation]
  );

  // Frequency and Cue metadata resolution
  const isRadioOff = activeStation?.id === 'radio-off' || activeStation === null;

  const frequencyBadge =
    activeStation?.frequency ||
    activeStation?.name.match(/\b\d{2,3}(?:\.\d)?\s*(?:FM|AM)?\b/i)?.[0] ||
    null;

  let songTitle = 'Live Broadcast';
  let artistOrInfo = activeStation?.genre || 'Broadcasting Live';
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
  } else if (activeStation?.host) {
    artistOrInfo = `Hosted by ${activeStation.host}`;
  }

  const effectiveCoverArt = coverArtUrl || currentCue?.coverArtUrl || null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="GTA V Radio Wheel"
      data-testid="gta5-radial-wheel"
      onPointerMove={handlePointerMove}
      onMouseMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onMouseLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontFamily: GTA5_HUD_FONT,
      }}
      className={`relative mx-auto flex items-center justify-center select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-full ${className}`}
    >
      {/* Authentic HUD Ambient Radial Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-24 rounded-full opacity-60 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(circle, rgba(0,0,0,0) 45%, rgba(0,0,0,0.65) 80%, rgba(0,0,0,0.92) 100%)',
        }}
      />

      {/* SVG Annular Radial Wheel */}
      <svg
        data-testid="gta5-radial-svg"
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 w-full h-full overflow-visible pointer-events-auto"
      >
        <defs>
          {/* Authentic HUD soft glow filter for active wedge */}
          <filter id="gta5-emerald-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ffffff" floodOpacity="0.6" />
          </filter>

          {/* Active wedge authentic GTA V translucent white gradient */}
          <linearGradient id="gta5-active-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.55)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.32)" />
          </linearGradient>

          {/* Inactive wedge dark slate HUD glass */}
          <linearGradient id="gta5-inactive-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(18, 25, 38, 0.88)" />
            <stop offset="100%" stopColor="rgba(8, 12, 20, 0.84)" />
          </linearGradient>
        </defs>

        {/* Outer subtle guide ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rOutBase + 4}
          fill="none"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Inner hairline guide ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rIn - 2}
          fill="none"
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="1"
        />

        {/* Annular Sectors for each station */}
        {stations.map((station, index) => {
          const isActive = index === displayIndex;
          const rOut = isActive ? rOutActive : rOutBase;

          // Angular coordinates (gap of ~1.2 deg between slices)
          const midDeg = index * sliceAngle;
          const gap = total > 1 ? Math.min(1.2, sliceAngle * 0.05) : 0;
          const startDeg = midDeg - sliceAngle / 2 + gap / 2;
          const endDeg = midDeg + sliceAngle / 2 - gap / 2;

          const pathD = calculateAnnularSectorPath({
            cx,
            cy,
            rIn,
            rOut,
            startDeg,
            endDeg,
          });

          // Station icon position at bisector radius
          const rIcon = (rIn + rOut) / 2;
          const radMid = (midDeg * Math.PI) / 180;
          const iconX = cx + rIcon * Math.sin(radMid);
          const iconY = cy - rIcon * Math.cos(radMid);
          const iconSize = Math.max(30, 42 * scale);

          return (
            <g
              key={station.id}
              data-testid={`gta5-sector-${station.id}`}
              data-active={isActive ? 'true' : 'false'}
              data-station-index={index}
              onClick={() => handleSelectStation(station)}
              onMouseEnter={() => {
                if (lastHighlightedIndexRef.current !== index) {
                  lastHighlightedIndexRef.current = index;
                  setHoveredIndex(index);
                  sfx.playClick();
                  triggerHaptic(10);
                }
              }}
              className="cursor-pointer transition-all duration-150"
            >
              {/* Sector slice path */}
              <path
                d={pathD}
                fill={isActive ? 'url(#gta5-active-gradient)' : 'url(#gta5-inactive-gradient)'}
                stroke={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.16)'}
                strokeWidth={isActive ? 2.5 : 1}
                filter={isActive ? 'url(#gta5-emerald-glow)' : undefined}
                className="transition-all duration-200"
              />

              {/* Station logo icon */}
              <image
                href={station.logoUrl}
                x={iconX - iconSize / 2}
                y={iconY - iconSize / 2}
                width={iconSize}
                height={iconSize}
                preserveAspectRatio="xMidYMid meet"
                className={`pointer-events-none transition-all duration-200 ${
                  isActive
                    ? 'opacity-100 filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.6)] scale-110'
                    : 'opacity-48 hover:opacity-80'
                }`}
                style={{
                  transformOrigin: `${iconX}px ${iconY}px`,
                }}
              />
            </g>
          );
        })}

        {/* Authentic GTA V selector needle pointer */}
        {displayIndex >= 0 && (
          <g data-testid="gta5-needle-pointer" className="pointer-events-none transition-all duration-150">
            {/* Backward-compatible line and circle for existing tests */}
            <line
              x1={cx}
              y1={cy}
              x2={cx + (rIn - 6) * Math.sin((displayIndex * sliceAngle * Math.PI) / 180)}
              y2={cy - (rIn - 6) * Math.cos((displayIndex * sliceAngle * Math.PI) / 180)}
              stroke="#ffffff"
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.95}
            />
            <circle cx={cx} cy={cy} r={3.5} fill="#ffffff" />

            {/* Authentic Outer HUD Pointer Arrowhead bridging center hub to active sector */}
            <polygon
              points={`
                ${cx + (rIn - 1) * Math.sin((displayIndex * sliceAngle * Math.PI) / 180)},
                ${cy - (rIn - 1) * Math.cos((displayIndex * sliceAngle * Math.PI) / 180)}
                ${cx + (rIn + 14 * scale) * Math.sin(((displayIndex * sliceAngle - 3.5) * Math.PI) / 180)},
                ${cy - (rIn + 14 * scale) * Math.cos(((displayIndex * sliceAngle - 3.5) * Math.PI) / 180)}
                ${cx + (rIn + 14 * scale) * Math.sin(((displayIndex * sliceAngle + 3.5) * Math.PI) / 180)},
                ${cy - (rIn + 14 * scale) * Math.cos(((displayIndex * sliceAngle + 3.5) * Math.PI) / 180)}
              `}
              fill="#ffffff"
              filter="url(#gta5-emerald-glow)"
              opacity={0.95}
            />
          </g>
        )}
      </svg>

      {/* Center Hub */}
      {activeStation && !isRadioOff ? (
        <div
          data-testid="gta5-center-hub"
          style={{
            width: `${(rIn - 6) * 2}px`,
            height: `${(rIn - 6) * 2}px`,
          }}
          className="absolute inset-0 m-auto rounded-full flex flex-col items-center justify-center p-3 text-center bg-slate-950/94 backdrop-blur-2xl border border-white/20 shadow-[0_0_35px_rgba(0,0,0,0.95)] overflow-hidden select-none z-20 pointer-events-auto"
        >
          {/* Subtle vignette backdrop glow */}
          <div
            className="absolute inset-0 rounded-full opacity-20 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
            }}
          />

          {/* Optional Track Artwork backdrop */}
          {effectiveCoverArt && (
            <div className="absolute inset-0 rounded-full overflow-hidden opacity-30 pointer-events-none">
              <img
                src={effectiveCoverArt}
                alt="Track Artwork"
                data-testid="gta5-cover-art"
                className="w-full h-full object-cover blur-[2px] scale-110"
              />
              <div className="absolute inset-0 bg-black/60" />
            </div>
          )}

          {/* Frequency Badge */}
          <div className="z-10 flex items-center gap-1.5 mb-1">
            {frequencyBadge && (
              <span
                data-testid="gta5-station-frequency"
                className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-neutral-200 border border-white/15 shadow-sm"
              >
                {frequencyBadge}
              </span>
            )}
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPlaying ? 'bg-white animate-ping' : 'bg-neutral-600'
              }`}
            />
          </div>

          {/* Station Logo Emblem */}
          <div className="z-10 relative mb-1">
            <img
              src={activeStation.logoUrl}
              alt={activeStation.name}
              data-testid="gta5-station-emblem"
              className="w-12 h-12 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] transition-transform duration-200"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '0.5';
              }}
            />
          </div>

          {/* Station Name & Genre in Chalet Style */}
          <h2
            data-testid="gta5-station-name"
            className="z-10 text-xs font-black tracking-wide uppercase text-white truncate max-w-[90%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]"
          >
            {activeStation.name}
          </h2>
          <p className="z-10 text-[9px] text-neutral-400 font-semibold tracking-wider uppercase truncate max-w-[85%]">
            {activeStation.genre}
          </p>

          {/* Track Title & Artist */}
          <div className="z-10 mt-1 max-w-[90%] flex flex-col items-center">
            <div className="flex items-center gap-1 max-w-full">
              {currentCue?.type === 'music' ? (
                <Disc3
                  className={`w-3 h-3 text-white shrink-0 ${
                    isPlaying ? 'animate-spin' : ''
                  }`}
                  style={{ animationDuration: '4s' }}
                />
              ) : (
                <Radio className="w-3 h-3 text-white shrink-0" />
              )}
              <span
                data-testid="gta5-track-title"
                className="text-[10px] font-bold text-neutral-100 truncate tracking-tight"
              >
                {songTitle}
              </span>
            </div>
            <span
              data-testid="gta5-track-artist"
              className="text-[9px] text-neutral-300 font-medium truncate max-w-full"
            >
              {artistOrInfo}
            </span>
          </div>

          {/* Equalizer */}
          <div
            data-testid="gta5-equalizer"
            data-playing={isPlaying ? 'true' : 'false'}
            className="z-10 flex items-end justify-center gap-1 h-3 mt-1"
          >
            {[1, 2, 3, 4, 5].map((bar) => (
              <span
                key={bar}
                className={`w-0.5 rounded-full transition-all duration-200 ${
                  isPlaying ? 'bg-white animate-pulse h-2.5' : 'bg-neutral-600 h-1'
                }`}
                style={
                  isPlaying
                    ? {
                        animationDuration: `${0.4 + (bar % 3) * 0.15}s`,
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          data-testid="gta5-center-hub"
          style={{
            width: `${(rIn - 6) * 2}px`,
            height: `${(rIn - 6) * 2}px`,
          }}
          className="absolute inset-0 m-auto rounded-full flex flex-col items-center justify-center p-3 text-center bg-slate-950/94 backdrop-blur-2xl border border-white/20 shadow-2xl z-20 pointer-events-auto select-none"
        >
          {activeStation?.logoUrl ? (
            <img
              src={activeStation.logoUrl}
              alt="Radio Off"
              data-testid="gta5-station-emblem"
              className="w-10 h-10 object-contain mb-1.5 opacity-80 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
            />
          ) : (
            <VolumeX className="w-8 h-8 text-neutral-400 mb-2 animate-pulse" />
          )}
          <span className="text-xs font-bold tracking-widest uppercase text-neutral-200">
            Radio Off
          </span>
          <span className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wider">
            Select Station
          </span>
        </div>
      )}
    </div>
  );
};

export default Gta5RadialWheel;
