import React from 'react';
import { GameId, Station, TrackCue } from '../types/radio';
import { Gta5RadialWheel } from './game-ui/Gta5RadialWheel';
import { GtaSaHorizontalReel } from './game-ui/GtaSaHorizontalReel';
import { Gta4VerticalTuner } from './game-ui/Gta4VerticalTuner';

export interface GameRadioSelectorProps {
  gameId: GameId;
  stations: Station[];
  currentStation: Station | null;
  onSelectStation: (station: Station) => void;
  isPlaying?: boolean;
  currentCue?: TrackCue | null;
  coverArtUrl?: string | null;
  className?: string;
}

/**
 * Polymorphic radio station selector routing between game-authentic selector UIs:
 * - 'gtasa' ➔ GtaSaHorizontalReel (San Andreas 90s horizontal sliding reel)
 * - 'gta4'  ➔ Gta4VerticalTuner (GTA IV 2008 dark glass vertical dial)
 * - 'gta5'  ➔ Gta5RadialWheel (GTA V radial wheel: circular station badges on a ring, center readout)
 */
export const GameRadioSelector: React.FC<GameRadioSelectorProps> = ({
  gameId,
  stations,
  currentStation,
  onSelectStation,
  isPlaying = false,
  currentCue = null,
  coverArtUrl = null,
  className = '',
}) => {
  return (
    <div
      data-testid="radio-wheel"
      className={`w-full flex items-center justify-center ${className}`}
    >
      <div
        data-testid="game-radio-selector"
        data-game-id={gameId}
        className="w-full flex items-center justify-center"
      >
        {gameId === 'gtasa' ? (
          <GtaSaHorizontalReel
            stations={stations}
            currentStation={currentStation}
            onSelectStation={onSelectStation}
            isPlaying={isPlaying}
            currentCue={currentCue}
            coverArtUrl={coverArtUrl}
          />
        ) : gameId === 'gta4' ? (
          <Gta4VerticalTuner
            stations={stations}
            currentStation={currentStation}
            onSelectStation={onSelectStation}
            isPlaying={isPlaying}
            currentCue={currentCue}
            coverArtUrl={coverArtUrl}
          />
        ) : (
          <Gta5RadialWheel
            stations={stations}
            currentStation={currentStation}
            onSelectStation={onSelectStation}
            isPlaying={isPlaying}
            currentCue={currentCue}
            coverArtUrl={coverArtUrl}
          />
        )}
      </div>
    </div>
  );
};

export default GameRadioSelector;
