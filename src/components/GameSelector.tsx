import React from 'react';
import { GameId, GameMetadata } from '../types/radio';
import { GAME_LIST } from '../data/catalog';

export interface GameSelectorProps {
  currentGame: GameId | GameMetadata;
  onSelectGame: (gameId: GameId) => void;
  className?: string;
}

export const GameSelector: React.FC<GameSelectorProps> = ({
  currentGame,
  onSelectGame,
  className = '',
}) => {
  const activeGameId: GameId =
    typeof currentGame === 'string' ? currentGame : currentGame.id;

  return (
    <div
      role="tablist"
      aria-label="Select Grand Theft Auto Game"
      className={`w-full max-w-2xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2.5 p-1.5 sm:p-2 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl transition-all duration-300 ${className}`}
    >
      {GAME_LIST.map((game) => {
        const isSelected = game.id === activeGameId;
        const stationCount = game.stations.length;

        // Theme specific highlight colors and glow
        const themeActiveClasses =
          game.id === 'gta5'
            ? 'border-[#4ae891] text-white shadow-[0_0_20px_rgba(74,232,145,0.35)] bg-gradient-to-b from-[#4ae891]/20 via-[#4ae891]/10 to-black/60'
            : game.id === 'gtasa'
            ? 'border-[#f59e0b] text-white shadow-[0_0_20px_rgba(245,158,11,0.35)] bg-gradient-to-b from-[#f59e0b]/20 via-[#f59e0b]/10 to-black/60'
            : 'border-[#eab308] text-white shadow-[0_0_20px_rgba(234,179,8,0.35)] bg-gradient-to-b from-[#eab308]/20 via-[#eab308]/10 to-black/60';

        const themeAccentColor = game.theme.accentColor;

        return (
          <button
            key={game.id}
            role="tab"
            aria-selected={isSelected}
            aria-label={`${game.shortTitle} - ${game.title}`}
            onClick={() => onSelectGame(game.id)}
            className={`flex-1 relative group flex flex-col items-center justify-center py-2 px-2 sm:px-4 rounded-xl border transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
              isSelected
                ? `${themeActiveClasses} font-semibold`
                : 'border-white/5 bg-white/[0.03] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.07] hover:border-white/15'
            }`}
          >
            {/* Top active indicator bar */}
            {isSelected && (
              <span
                className="absolute -top-[1px] left-1/4 right-1/4 h-[2px] rounded-full"
                style={{
                  backgroundColor: themeAccentColor,
                  boxShadow: `0 0 8px ${themeAccentColor}`,
                }}
              />
            )}

            {/* Game Title */}
            <span
              className={`text-xs sm:text-sm font-bold tracking-wider uppercase transition-colors ${
                isSelected ? 'text-white' : 'text-neutral-300 group-hover:text-white'
              }`}
            >
              {game.shortTitle}
            </span>

            {/* Badges Row: Station count & Release year */}
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`text-[10px] sm:text-[11px] font-medium px-1.5 py-0.5 rounded-md transition-colors ${
                  isSelected
                    ? 'bg-black/50 text-white font-semibold'
                    : 'bg-white/5 text-neutral-400'
                }`}
                style={isSelected ? { color: themeAccentColor } : undefined}
              >
                {stationCount} Stations
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-neutral-400">
                {game.year}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
export default GameSelector;
