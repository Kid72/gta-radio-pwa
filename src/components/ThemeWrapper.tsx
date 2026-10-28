import React from 'react';
import { GameId, GameMetadata } from '../types/radio';
import { getGame } from '../data/catalog';

export interface ThemeWrapperProps {
  game: GameId | GameMetadata;
  children: React.ReactNode;
  className?: string;
  showWallpaper?: boolean;
}

export const ThemeWrapper: React.FC<ThemeWrapperProps> = ({
  game,
  children,
  className = '',
  showWallpaper = true,
}) => {
  const gameMetadata: GameMetadata =
    (typeof game === 'string' ? getGame(game) : game) || getGame('gta5');

  const style = {
    '--accent-color': gameMetadata.theme.accentColor,
    '--theme-font': gameMetadata.theme.fontFamily,
    '--wallpaper-url': `url(${gameMetadata.theme.bgWallpaper})`,
    fontFamily: gameMetadata.theme.fontFamily,
  } as React.CSSProperties;

  return (
    <div
      data-testid="theme-wrapper"
      data-theme={gameMetadata.id}
      data-game={gameMetadata.id}
      className={`min-h-screen relative overflow-hidden bg-black text-white theme-${gameMetadata.id} ${className}`}
      style={style}
    >
      {/* Background authentic wallpaper backdrop */}
      {showWallpaper && (
        <>
          <div
            data-testid="theme-wallpaper"
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-700 ease-in-out -z-20 transform scale-105"
            style={{
              backgroundImage: `url(${gameMetadata.theme.bgWallpaper})`,
            }}
          />
          {/* Authentic ambient dark gradient overlay ensuring 100% legibility */}
          <div
            data-testid="theme-overlay"
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/75 to-neutral-950/95 backdrop-blur-[2px] pointer-events-none -z-10"
          />
        </>
      )}

      {/* Main app viewport content */}
      <div className="relative z-0 flex flex-col w-full h-full min-h-screen select-none">
        {children}
      </div>
    </div>
  );
};
export default ThemeWrapper;
