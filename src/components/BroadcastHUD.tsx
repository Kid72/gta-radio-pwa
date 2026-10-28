import React from 'react';
import { Station, TrackCue } from '../types/radio';
import { Radio, Disc3, VolumeX } from 'lucide-react';

export interface BroadcastHUDProps {
  station: Station | null;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BroadcastHUD: React.FC<BroadcastHUDProps> = ({
  station,
  isPlaying = false,
  currentCue = null,
  className = '',
  size = 'md',
}) => {
  if (!station) {
    return (
      <div
        data-testid="broadcast-hud"
        className={`flex flex-col items-center justify-center p-4 text-center rounded-full bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl select-none ${
          size === 'sm' ? 'w-36 h-36' : size === 'lg' ? 'w-64 h-64' : 'w-48 h-48 sm:w-56 sm:h-56'
        } ${className}`}
      >
        <VolumeX className="w-8 h-8 text-neutral-500 mb-2 animate-pulse" />
        <span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-neutral-400">
          Radio Off
        </span>
        <span className="text-[10px] text-neutral-600 mt-1">Select Station</span>
      </div>
    );
  }

  // Derive frequency text (station.frequency or extracted from name)
  const frequencyMatch = station.frequency || station.name.match(/\b\d{2,3}(?:\.\d)?\s*(?:FM|AM)?\b/i)?.[0];
  const frequencyBadge = frequencyMatch ? frequencyMatch.trim() : null;

  // Format track cue metadata
  let songTitle = 'Live Broadcast';
  let artistOrInfo = station.genre || 'Broadcasting Live';

  if (currentCue) {
    if (currentCue.type === 'music') {
      songTitle = currentCue.song;
      artistOrInfo = currentCue.artist;
    } else if (currentCue.type === 'talk') {
      songTitle = currentCue.song;
      artistOrInfo = currentCue.artist ? currentCue.artist : 'Talk Radio';
    } else if (currentCue.type === 'ad') {
      songTitle = currentCue.song || 'Commercial Break';
      artistOrInfo = 'Commercial Break';
    }
  } else if (station.host) {
    artistOrInfo = `Hosted by ${station.host}`;
  }

  return (
    <div
      data-testid="broadcast-hud"
      className={`relative group flex flex-col items-center justify-center text-center rounded-full bg-neutral-950/90 backdrop-blur-2xl border border-white/20 shadow-[0_0_35px_rgba(0,0,0,0.85)] select-none transition-all duration-300 p-3 sm:p-4 overflow-hidden ${
        size === 'sm'
          ? 'w-36 h-36'
          : size === 'lg'
          ? 'w-64 h-64 sm:w-72 sm:h-72'
          : 'w-48 h-48 sm:w-56 sm:h-56'
      } ${className}`}
    >
      {/* Ambient background glow ring */}
      <div
        className="absolute inset-0 rounded-full opacity-20 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle, var(--accent-color, #4ae891) 0%, transparent 70%)`,
        }}
      />

      {/* Top row: Frequency Badge or Live indicator */}
      <div className="z-10 flex items-center gap-1.5 mb-1">
        {frequencyBadge && (
          <span
            data-testid="station-frequency"
            className="text-[9px] sm:text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-neutral-200 border border-white/10 shadow-sm"
          >
            {frequencyBadge}
          </span>
        )}
        <span
          className={`flex h-1.5 w-1.5 rounded-full ${
            isPlaying ? 'bg-[var(--accent-color,#4ae891)] animate-ping' : 'bg-neutral-600'
          }`}
        />
      </div>

      {/* Center: Station Logo & Name */}
      <div className="z-10 relative flex flex-col items-center justify-center max-w-[85%]">
        <div className="relative mb-1">
          <img
            src={station.logoUrl}
            alt={station.name}
            data-testid="station-logo"
            className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] transition-transform duration-200 group-hover:scale-105"
            onError={(e) => {
              // Graceful fallback to icon if image fails
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        </div>

        <h2 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-white truncate max-w-full drop-shadow">
          {station.name}
        </h2>
        <p className="text-[9px] sm:text-[10px] text-neutral-400 font-medium tracking-wider uppercase truncate max-w-full">
          {station.genre}
        </p>
      </div>

      {/* Now Playing: Song Title & Artist */}
      <div className="z-10 mt-1 max-w-[85%] flex flex-col items-center">
        <div className="flex items-center gap-1 max-w-full">
          {currentCue?.type === 'music' ? (
            <Disc3
              className={`w-3 h-3 text-[var(--accent-color,#4ae891)] shrink-0 ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '4s' }}
            />
          ) : (
            <Radio className="w-3 h-3 text-[var(--accent-color,#4ae891)] shrink-0" />
          )}
          <span
            data-testid="hud-song-title"
            className="text-[10px] sm:text-[11px] font-bold text-neutral-100 truncate tracking-tight"
          >
            {songTitle}
          </span>
        </div>
        <span
          data-testid="hud-artist"
          className="text-[9px] sm:text-[10px] text-neutral-400 font-medium truncate max-w-full"
        >
          {artistOrInfo}
        </span>
      </div>

      {/* Bottom: Animated Audio Equalizer */}
      <div
        data-testid="audio-equalizer"
        data-playing={isPlaying ? 'true' : 'false'}
        aria-label={isPlaying ? 'Audio playing' : 'Audio paused'}
        className="z-10 flex items-end justify-center gap-1 h-4 sm:h-5 mt-1"
      >
        {[1, 2, 3, 4, 5].map((bar) => (
          <span
            key={bar}
            data-testid="equalizer-bar"
            className={`w-1 rounded-full transition-all duration-200 ${
              isPlaying
                ? 'bg-[var(--accent-color,#4ae891)] animate-eq-bounce'
                : 'bg-neutral-600 h-1.5'
            }`}
            style={
              isPlaying
                ? {
                    animationDuration: `${0.45 + (bar % 3) * 0.18}s`,
                    animationDelay: `${bar * 0.08}s`,
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-in-out',
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
};

export default BroadcastHUD;
