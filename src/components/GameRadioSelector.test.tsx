import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameRadioSelector } from './GameRadioSelector';
import { Station, TrackCue } from '../types/radio';

const mockStation: Station = {
  id: 'test-station',
  gameId: 'gtasa',
  name: 'Test Station',
  genre: 'Classic Rock',
  logoUrl: '/logo.png',
  audioUrl: 'https://example.com/audio.mp3',
  duration: 120,
  initialOffset: 0,
  timestamps: [],
};

const mockCue: TrackCue = {
  start: 0,
  end: 60,
  song: 'Test Song',
  artist: 'Test Artist',
  type: 'music',
  coverArtUrl: 'https://example.com/cue-art.jpg',
};

describe('GameRadioSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof Element !== 'undefined') {
      Element.prototype.scrollIntoView = vi.fn();
    }
    if (typeof navigator !== 'undefined') {
      navigator.vibrate = vi.fn();
    }
  });

  it('renders Gta5RadialWheel when gameId is gta5', () => {
    render(
      <GameRadioSelector
        gameId="gta5"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
  });

  it('renders GtaSaHorizontalReel when gameId is gtasa', () => {
    render(
      <GameRadioSelector
        gameId="gtasa"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gtasa-reel-container')).toBeInTheDocument();
  });

  it('renders Gta4VerticalTuner when gameId is gta4', () => {
    render(
      <GameRadioSelector
        gameId="gta4"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta4-vertical-tuner')).toBeInTheDocument();
  });

  it('defaults to Gta5RadialWheel when unknown gameId is supplied', () => {
    render(
      <GameRadioSelector
        gameId={'unknown' as any}
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
      />
    );
    expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
  });

  it('passes onSelectStation callback down to active selector', () => {
    const handleSelect = vi.fn();
    render(
      <GameRadioSelector
        gameId="gtasa"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={handleSelect}
        isPlaying={true}
        currentCue={mockCue}
      />
    );

    const stationItem = screen.getByTestId('gtasa-station-test-station');
    fireEvent.click(stationItem);
    expect(handleSelect).toHaveBeenCalledWith(mockStation);
  });

  it('forwards coverArtUrl and currentCue properly to the rendered game UI', () => {
    render(
      <GameRadioSelector
        gameId="gta4"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={true}
        currentCue={mockCue}
        coverArtUrl="https://example.com/custom-cover.jpg"
      />
    );

    const cover = screen.getByTestId('gta4-cover-art');
    expect(cover).toBeInTheDocument();
    expect(cover).toHaveAttribute('src', 'https://example.com/custom-cover.jpg');
  });

  it('includes data-testid="radio-wheel" and data-testid="game-radio-selector" for test harness compatibility', () => {
    render(
      <GameRadioSelector
        gameId="gta5"
        stations={[mockStation]}
        currentStation={mockStation}
        onSelectStation={vi.fn()}
        isPlaying={false}
        className="custom-selector-class"
      />
    );

    expect(screen.getByTestId('radio-wheel')).toBeInTheDocument();
    expect(screen.getByTestId('game-radio-selector')).toBeInTheDocument();
    expect(screen.getByTestId('radio-wheel')).toHaveClass('custom-selector-class');
  });
});
