import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Station, TrackCue } from '../types/radio';
import { BroadcastHUD } from './BroadcastHUD';

export interface RadioWheelProps {
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  coverArtUrl?: string | null;
  className?: string;
  radius?: number;
  badgeSize?: number;
}

/**
 * Computes polar angle in degrees for station at index, with index 0 at 0 degrees (12 o'clock).
 */
export function calculateStationAngle(index: number, totalStations: number): number {
  if (totalStations <= 0) return 0;
  return (360 / totalStations) * index;
}

/**
 * Computes 2D Cartesian coordinates (x, y) relative to the wheel center (0, 0),
 * where index 0 is at (0, -radius) [12 o'clock] and rotates clockwise.
 */
export function getStationCoordinates(
  index: number,
  totalStations: number,
  radius: number
): { x: number; y: number } {
  if (totalStations <= 0) return { x: 0, y: -radius };
  const angle = calculateStationAngle(index, totalStations);
  const rad = (angle * Math.PI) / 180;
  const rawX = Math.sin(rad) * radius;
  const rawY = -Math.cos(rad) * radius;
  const x = Math.abs(rawX) < 1e-10 ? 0 : rawX;
  const y = Math.abs(rawY) < 1e-10 ? 0 : rawY;
  return { x, y };
}

/**
 * Normalizes any angle [0, 360) and finds the closest station index slice.
 */
export function getStationIndexFromAngle(deg: number, totalStations: number): number {
  if (totalStations <= 0) return 0;
  const normalized = ((deg % 360) + 360) % 360;
  const slice = 360 / totalStations;
  return Math.round(normalized / slice) % totalStations;
}

/**
 * Computes station index from pointer offset dx, dy relative to center.
 * Uses Math.atan2(dx, -dy) so (0, -dy) is 0 degrees (Top) clockwise.
 */
export function getStationIndexFromPointer(
  dx: number,
  dy: number,
  totalStations: number
): number {
  if (totalStations <= 0) return 0;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return getStationIndexFromAngle(deg, totalStations);
}

/**
 * Triggers subtle haptic feedback vibration tick (10ms).
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
      // Ignore vibration errors on unsupported/restricted platforms
    }
  }
}

export const RadioWheel: React.FC<RadioWheelProps> = ({
  stations,
  currentStation,
  onSelectStation,
  isPlaying = false,
  currentCue = null,
  coverArtUrl = null,
  className = '',
  radius: radiusProp,
  badgeSize: badgeSizeProp,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const isQActiveRef = useRef<boolean>(false);
  const activeSectorRef = useRef<number | null>(null);

  const [isQActive, setIsQActive] = useState<boolean>(false);
  const [previewStation, setPreviewStation] = useState<Station | null>(null);

  // Responsive radius & badge sizing
  const [dimensions, setDimensions] = useState<{ radius: number; badgeSize: number }>(() => {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
    return {
      radius:
        radiusProp ??
        (isMobile ? (stations.length > 20 ? 128 : 115) : stations.length > 20 ? 175 : 160),
      badgeSize:
        badgeSizeProp ??
        (isMobile ? (stations.length > 20 ? 32 : 40) : stations.length > 20 ? 42 : 50),
    };
  });

  useEffect(() => {
    const updateDimensions = () => {
      const isMobile = window.innerWidth < 640;
      setDimensions({
        radius:
          radiusProp ??
          (isMobile ? (stations.length > 20 ? 128 : 115) : stations.length > 20 ? 175 : 160),
        badgeSize:
          badgeSizeProp ??
          (isMobile ? (stations.length > 20 ? 32 : 40) : stations.length > 20 ? 42 : 50),
      });
    };

    if (radiusProp === undefined || badgeSizeProp === undefined) {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, [radiusProp, badgeSizeProp, stations.length]);

  const effectiveRadius = radiusProp ?? dimensions.radius;
  const effectiveBadgeSize = badgeSizeProp ?? dimensions.badgeSize;

  // Process pointer coordinates from event clientX/clientY
  const processPointerInput = useCallback(
    (clientX: number, clientY: number) => {
      if (!wheelRef.current || stations.length === 0) return;
      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      // Deadzone threshold (ignore touches right at center hub)
      if (dist > 15) {
        const index = getStationIndexFromPointer(dx, dy, stations.length);
        if (index >= 0 && index < stations.length) {
          const targetStation = stations[index];
          if (activeSectorRef.current !== index) {
            activeSectorRef.current = index;
            triggerHaptic(10);
            setPreviewStation(targetStation);
            onSelectStation(targetStation);
          }
        }
      }
    },
    [stations, onSelectStation]
  );

  // Desktop Keyboard 'Q' hold listener & mouse tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'q' || e.key === 'Q') {
        if (e.repeat) return;
        isQActiveRef.current = true;
        setIsQActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') {
        isQActiveRef.current = false;
        setIsQActive(false);
        if (activeSectorRef.current !== null && stations[activeSectorRef.current]) {
          onSelectStation(stations[activeSectorRef.current]);
        }
        activeSectorRef.current = null;
        setPreviewStation(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isQActiveRef.current) {
        processPointerInput(e.clientX, e.clientY);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [stations, onSelectStation, processPointerInput]);

  // Touch drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      processPointerInput(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      processPointerInput(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = () => {
    if (activeSectorRef.current !== null && stations[activeSectorRef.current]) {
      onSelectStation(stations[activeSectorRef.current]);
    }
    activeSectorRef.current = null;
    setPreviewStation(null);
  };

  // Station currently active (or previewed during drag/Q-hold)
  const activeStation = previewStation || currentStation;
  const activeIndex = stations.findIndex((s) => s.id === activeStation?.id);

  // Overall container size accommodating wheel radius and badges
  const containerSize = (effectiveRadius + effectiveBadgeSize) * 2 + 20;

  return (
    <div
      ref={wheelRef}
      data-testid="radio-wheel"
      data-q-active={isQActive ? 'true' : 'false'}
      role="region"
      aria-label="GTA Radio Station Selector Wheel"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        width: `${containerSize}px`,
        height: `${containerSize}px`,
      }}
      className={`relative mx-auto flex items-center justify-center select-none touch-none ${className}`}
    >
      {/* Outer subtle circular track guide */}
      <div
        className="absolute inset-0 m-auto rounded-full pointer-events-none transition-all duration-300 opacity-20 border border-white/30"
        style={{
          width: `${effectiveRadius * 2}px`,
          height: `${effectiveRadius * 2}px`,
        }}
      />

      {/* Center BroadcastHUD */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <div className="pointer-events-auto">
          <BroadcastHUD
            station={activeStation}
            isPlaying={isPlaying}
            currentCue={activeStation?.id === currentStation?.id ? currentCue : null}
            coverArtUrl={activeStation?.id === currentStation?.id ? coverArtUrl : null}
            size={effectiveRadius < 140 ? 'sm' : 'md'}
          />
        </div>
      </div>

      {/* Radial Station Badges */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {stations.map((station, index) => {
          const isSelected = activeIndex === index;
          const { x, y } = getStationCoordinates(index, stations.length, effectiveRadius);

          return (
            <button
              key={station.id}
              role="button"
              aria-selected={isSelected}
              aria-label={station.name}
              data-testid={`station-badge-${station.id}`}
              data-station-index={index}
              onClick={() => onSelectStation(station)}
              style={{
                left: '50%',
                top: '50%',
                width: `${effectiveBadgeSize}px`,
                height: `${effectiveBadgeSize}px`,
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              }}
              className={`pointer-events-auto absolute flex items-center justify-center rounded-full p-1.5 transition-all duration-200 cursor-pointer shadow-lg active:scale-95 ${
                isSelected
                  ? 'bg-black/90 ring-2 ring-[var(--accent-color,#4ae891)] shadow-[0_0_18px_var(--accent-color,#4ae891)] scale-110 z-30'
                  : 'bg-black/60 hover:bg-black/80 hover:ring-1 hover:ring-white/40 ring-1 ring-white/15 backdrop-blur-md opacity-85 hover:opacity-100 z-10'
              }`}
            >
              <img
                src={station.logoUrl}
                alt={station.name}
                className="w-full h-full object-contain pointer-events-none drop-shadow"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '0.5';
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RadioWheel;
