import React from 'react';
import { Station, TrackCue } from '../types/radio';
import { Download, Check, Trash2, Loader2, Radio } from 'lucide-react';

export interface CarQuickGridProps {
  stations: Station[];
  currentStation: Station | null;
  cachedKeys?: Set<string> | string[];
  cachedIds?: Set<string> | string[];
  downloadingKeys?: Map<string, number> | Record<string, number>;
  onSelectStation?: (station: Station) => void;
  onSelect?: (station: Station) => void;
  onDownloadStation?: (station: Station) => void;
  onDownload?: (station: Station) => void;
  onDeleteStation?: (station: Station) => void;
  onDelete?: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  className?: string;
}

/**
 * Triggers driver-friendly haptic vibration tick on tap.
 */
function triggerHaptic(duration = 15): void {
  if (
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator &&
    typeof navigator.vibrate === 'function'
  ) {
    try {
      navigator.vibrate(duration);
    } catch {
      // Ignore vibration errors on unsupported platforms
    }
  }
}

/**
 * Checks whether a station is cached in offline storage.
 */
function isStationCached(
  station: Station,
  cachedKeys?: Set<string> | string[],
  cachedIds?: Set<string> | string[]
): boolean {
  const pool = cachedKeys ?? cachedIds;
  if (!pool) return false;
  const fullKey = `${station.gameId}:${station.id}`;
  if (pool instanceof Set) {
    return pool.has(fullKey) || pool.has(station.id);
  }
  return pool.includes(fullKey) || pool.includes(station.id);
}

/**
 * Retrieves the current download percentage if station is downloading.
 */
function getDownloadProgress(
  station: Station,
  downloadingKeys?: Map<string, number> | Record<string, number>
): number | null {
  if (!downloadingKeys) return null;
  const fullKey = `${station.gameId}:${station.id}`;
  if (downloadingKeys instanceof Map) {
    if (downloadingKeys.has(fullKey)) return downloadingKeys.get(fullKey)!;
    if (downloadingKeys.has(station.id)) return downloadingKeys.get(station.id)!;
    return null;
  }
  if (typeof downloadingKeys[fullKey] === 'number') return downloadingKeys[fullKey];
  if (typeof downloadingKeys[station.id] === 'number') return downloadingKeys[station.id];
  return null;
}

export const CarQuickGrid: React.FC<CarQuickGridProps> = ({
  stations,
  currentStation,
  cachedKeys,
  cachedIds,
  downloadingKeys,
  onSelectStation,
  onSelect,
  onDownloadStation,
  onDownload,
  onDeleteStation,
  onDelete,
  isPlaying = false,
  currentCue = null,
  className = '',
}) => {
  const handleSelect = (station: Station) => {
    triggerHaptic(15);
    if (onSelectStation) {
      onSelectStation(station);
    } else if (onSelect) {
      onSelect(station);
    }
  };

  const handleDownload = (e: React.MouseEvent, station: Station) => {
    e.stopPropagation();
    if (onDownloadStation) {
      onDownloadStation(station);
    } else if (onDownload) {
      onDownload(station);
    }
  };

  const handleDelete = (e: React.MouseEvent, station: Station) => {
    e.stopPropagation();
    if (onDeleteStation) {
      onDeleteStation(station);
    } else if (onDelete) {
      onDelete(station);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, station: Station) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(station);
    }
  };

  return (
    <div
      data-testid="car-quick-grid"
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 p-2 sm:p-4 max-w-7xl mx-auto w-full ${className}`}
    >
      {stations.map((station) => {
        const isCurrent =
          currentStation?.id === station.id &&
          (!currentStation?.gameId || currentStation.gameId === station.gameId);
        const cached = isStationCached(station, cachedKeys, cachedIds);
        const downloadProgress = getDownloadProgress(station, downloadingKeys);
        const isDownloading = downloadProgress !== null;

        // Derive frequency text
        const frequencyMatch =
          station.frequency ||
          station.name.match(/\b\d{2,3}(?:\.\d)?\s*(?:FM|AM)?\b/i)?.[0];
        const frequencyBadge = frequencyMatch ? frequencyMatch.trim() : null;

        return (
          <div
            key={`${station.gameId}:${station.id}`}
            data-testid={`car-station-card-${station.id}`}
            data-active={isCurrent ? 'true' : 'false'}
            role="button"
            tabIndex={0}
            aria-pressed={isCurrent}
            aria-label={`Tune to ${station.name}`}
            onClick={() => handleSelect(station)}
            onKeyDown={(e) => handleKeyDown(e, station)}
            className={`min-h-[80px] p-3.5 sm:p-4 rounded-2xl flex items-center gap-3.5 sm:gap-4 relative overflow-hidden transition-all duration-200 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color,#4ae891)] ${
              isCurrent
                ? 'bg-neutral-800/90 border-2 border-[var(--accent-color,#4ae891)] shadow-[0_0_20px_rgba(var(--accent-rgb,74,232,145),0.25)]'
                : 'bg-neutral-900/80 hover:bg-neutral-800/80 border border-white/10 hover:border-white/20 shadow-md'
            }`}
          >
            {/* Active Station Glow Bar */}
            {isCurrent && (
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 bg-[var(--accent-color,#4ae891)]"
                aria-hidden="true"
              />
            )}

            {/* Station Logo Badge */}
            <div className="relative flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center shadow-inner">
              <img
                src={station.logoUrl}
                alt={station.name}
                loading="lazy"
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  // Fallback to Radio icon placeholder if image missing
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <Radio className="w-6 h-6 text-neutral-600 absolute -z-10" />
            </div>

            {/* Station Metadata & Live Cue */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-base sm:text-lg font-black tracking-wide truncate ${
                    isCurrent ? 'text-white' : 'text-neutral-200'
                  }`}
                >
                  {station.name}
                </span>
                {isCurrent && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--accent-color,#4ae891)]/20 text-[var(--accent-color,#4ae891)] border border-[var(--accent-color,#4ae891)]/40">
                    On Air
                  </span>
                )}
              </div>

              {/* Live Track Preview when Active */}
              {isCurrent && currentCue && currentCue.song ? (
                <div className="flex items-center gap-2 mt-1">
                  <div className="text-xs sm:text-sm font-semibold truncate text-[var(--accent-color,#4ae891)] flex items-center gap-1.5">
                    <span>{currentCue.song}</span>
                    {currentCue.artist && (
                      <span className="text-white/60 font-normal">· {currentCue.artist}</span>
                    )}
                  </div>
                  {isPlaying && (
                    <div
                      className="flex items-end gap-0.5 h-3 ml-1 flex-shrink-0"
                      aria-label="Audio playing equalizer"
                    >
                      <span
                        data-testid="equalizer-bar"
                        className="w-0.5 h-3 bg-[var(--accent-color,#4ae891)] rounded-full animate-eq-bounce"
                      />
                      <span
                        data-testid="equalizer-bar"
                        className="w-0.5 h-2 bg-[var(--accent-color,#4ae891)] rounded-full animate-eq-bounce [animation-delay:0.2s]"
                      />
                      <span
                        data-testid="equalizer-bar"
                        className="w-0.5 h-3 bg-[var(--accent-color,#4ae891)] rounded-full animate-eq-bounce [animation-delay:0.4s]"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400 truncate">
                  {frequencyBadge && (
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-white tracking-wider">
                      {frequencyBadge}
                    </span>
                  )}
                  <span className="truncate">{station.genre}</span>
                </div>
              )}
            </div>

            {/* Offline Storage Status / Trigger (Driver Touch Friendly) */}
            <div className="flex-shrink-0 flex items-center justify-center">
              {isDownloading ? (
                <div
                  data-testid={`downloading-${station.id}`}
                  aria-label={`Downloading ${station.name}: ${downloadProgress}%`}
                  className="flex flex-col items-center justify-center w-11 h-11 text-xs font-mono font-bold text-[var(--accent-color,#4ae891)] bg-white/5 border border-[var(--accent-color,#4ae891)]/40 rounded-xl p-1"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-color,#4ae891)] mb-0.5" />
                  <span className="text-[10px]">{downloadProgress}%</span>
                </div>
              ) : cached ? (
                <button
                  type="button"
                  data-testid={`cached-badge-${station.id}`}
                  onClick={(e) => handleDelete(e, station)}
                  aria-label={`Remove ${station.name} from offline storage`}
                  title="Offline Ready - 0 mobile data (Click to delete)"
                  className="group/cached relative flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 transition-colors focus:outline-none"
                >
                  <Check className="w-5 h-5 group-hover/cached:hidden" />
                  <Trash2 className="w-5 h-5 hidden group-hover/cached:block" />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`download-button-${station.id}`}
                  onClick={(e) => handleDownload(e, station)}
                  aria-label={`Download ${station.name} for offline`}
                  title="Save for Offline"
                  className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/15 hover:border-white/30 transition-all active:scale-95 focus:outline-none"
                >
                  <Download className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
