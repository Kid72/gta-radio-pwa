import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  HardDrive,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Radio,
  RefreshCw,
  FolderDown,
} from 'lucide-react';
import {
  getStorageUsageEstimate,
  getAllCachedStations,
  deleteCachedStationAudio,
  clearAllCachedStations,
} from '../storage/db';
import {
  requestPersistentStorage,
  isStoragePersistent,
} from '../storage/wakeLock';
import { CachedStationRecord } from '../types/radio';
import { GAMES, getStation } from '../data/catalog';

export interface StorageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onStorageChanged?: () => void;
}

/**
 * Formats byte values into human-readable strings (e.g. "240 MB", "128 GB").
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${parseFloat(val.toFixed(1))} ${sizes[i]}`;
}

export const StorageDrawer: React.FC<StorageDrawerProps> = ({
  isOpen,
  onClose,
  onStorageChanged,
}) => {
  const [cachedStations, setCachedStations] = useState<CachedStationRecord[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ usedBytes: number; quotaBytes: number }>({
    usedBytes: 0,
    quotaBytes: 0,
  });
  const [isPersisted, setIsPersisted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Load storage details and cached stations
  const refreshStorageData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [records, estimate, persisted] = await Promise.all([
        getAllCachedStations(),
        getStorageUsageEstimate(),
        isStoragePersistent(),
      ]);

      setCachedStations(records || []);
      setStorageEstimate(estimate || { usedBytes: 0, quotaBytes: 0 });
      setIsPersisted(persisted);
    } catch (err) {
      console.error('Failed to load storage details:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshStorageData();
      setShowClearConfirm(false);
    }
  }, [isOpen, refreshStorageData]);

  // Handle ESC key listener to dismiss drawer
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Enable Persistent Storage
  const handleRequestPersistence = async () => {
    const granted = await requestPersistentStorage();
    setIsPersisted(granted);
  };

  // Delete individual station
  const handleDeleteStation = async (record: CachedStationRecord) => {
    const cleanId = record.stationId.replace(new RegExp(`^${record.gameId}:`), '');
    await deleteCachedStationAudio(record.gameId, cleanId);
    await refreshStorageData();
    onStorageChanged?.();
  };

  // Clear all cached downloads
  const handleClearAll = async () => {
    await clearAllCachedStations();
    setShowClearConfirm(false);
    await refreshStorageData();
    onStorageChanged?.();
  };

  if (!isOpen) {
    return null;
  }

  const { usedBytes, quotaBytes } = storageEstimate;
  const usagePercent =
    quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-drawer-title"
      className="fixed inset-0 z-50 flex justify-end animate-fadeIn select-none"
    >
      {/* Backdrop */}
      <div
        data-testid="storage-drawer-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-md sm:max-w-lg bg-neutral-950/95 border-l border-white/10 shadow-2xl flex flex-col h-full z-10 overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-color,#4ae891)]/10 border border-[var(--accent-color,#4ae891)]/30 flex items-center justify-center text-[var(--accent-color,#4ae891)]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="storage-drawer-title"
                className="text-lg font-black tracking-wide uppercase text-white"
              >
                Offline Storage
              </h2>
              <p className="text-xs text-neutral-400">
                100% offline in-car playback · 0 mobile data
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close offline storage drawer"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Quota Meter Section */}
          <div className="p-4 rounded-2xl bg-neutral-900/70 border border-white/10 space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-neutral-300">Device Quota</span>
              <span className="font-mono text-neutral-400">
                <strong className="text-white font-bold">{formatBytes(usedBytes)}</strong> used of{' '}
                <strong className="text-white font-bold">{formatBytes(quotaBytes)}</strong> available
              </span>
            </div>

            {/* Visual Quota Progress Bar */}
            <div
              role="progressbar"
              aria-valuenow={usagePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Storage quota usage"
              className="w-full h-3 rounded-full bg-white/10 overflow-hidden relative"
            >
              <div
                style={{ width: `${Math.max(usagePercent, usedBytes > 0 ? 2 : 0)}%` }}
                className="h-full bg-[var(--accent-color,#4ae891)] rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(var(--accent-rgb,74,232,145),0.5)]"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
              <span>{usagePercent}% utilized</span>
              <span>{cachedStations.length} station{cachedStations.length === 1 ? '' : 's'} cached</span>
            </div>
          </div>

          {/* Persistent Storage Status */}
          <div className="p-4 rounded-2xl bg-neutral-900/50 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck
                className={`w-5 h-5 ${
                  isPersisted ? 'text-emerald-400' : 'text-neutral-500'
                }`}
              />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                  Persistent Storage
                </div>
                <div className="text-[11px] text-neutral-400">
                  {isPersisted
                    ? 'Active · Audio won’t be evicted by OS'
                    : 'Standard · May be evicted under low disk space'}
                </div>
              </div>
            </div>

            {!isPersisted && (
              <button
                type="button"
                onClick={handleRequestPersistence}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                Enable
              </button>
            )}
          </div>

          {/* Cached Stations List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Downloaded Stations ({cachedStations.length})
              </h3>
              {cachedStations.length > 0 && (
                <button
                  type="button"
                  onClick={refreshStorageData}
                  aria-label="Refresh storage"
                  className="text-neutral-500 hover:text-neutral-300 text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-neutral-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                <span>Reading storage...</span>
              </div>
            ) : cachedStations.length === 0 ? (
              <div className="py-12 px-4 rounded-2xl border border-dashed border-white/10 text-center flex flex-col items-center justify-center bg-white/[0.02]">
                <FolderDown className="w-8 h-8 text-neutral-600 mb-3" />
                <p className="text-sm font-semibold text-neutral-300">
                  No stations downloaded yet
                </p>
                <p className="text-xs text-neutral-500 max-w-xs mt-1">
                  Tap the download icon on any station card to listen offline with zero mobile data.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cachedStations.map((record) => {
                  const cleanId = record.stationId.replace(
                    new RegExp(`^${record.gameId}:`),
                    ''
                  );
                  const station = getStation(cleanId, record.gameId);
                  const stationName = station?.name || cleanId;
                  const gameTitle =
                    GAMES[record.gameId]?.shortTitle ||
                    GAMES[record.gameId]?.title ||
                    record.gameId;

                  return (
                    <div
                      key={record.stationId}
                      className="p-3.5 rounded-xl bg-neutral-900/80 border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {station?.logoUrl ? (
                          <img
                            src={station.logoUrl}
                            alt={stationName}
                            className="w-10 h-10 rounded-lg object-contain bg-black/40 p-0.5 border border-white/10 flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-neutral-500">
                            <Radio className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {stationName}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-white/10 text-[10px] font-semibold text-neutral-300">
                              {gameTitle}
                            </span>
                            <span>{formatBytes(record.sizeBytes)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-label={`Delete ${stationName}`}
                        onClick={() => handleDeleteStation(record)}
                        className="p-2 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all flex-shrink-0 focus:outline-none"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer: Clear All Button */}
        {cachedStations.length > 0 && (
          <div className="p-4 border-t border-white/10 bg-neutral-900/50">
            {showClearConfirm ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold px-1">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Delete all offline audio? You’ll need internet to re-download.</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-colors focus:outline-none"
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors focus:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-neutral-400 hover:text-red-400 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 focus:outline-none"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All Downloads</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
