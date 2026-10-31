import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Gta5RadialWheel, getBadgePosition, getStationIndexFromPolarAngle } from './Gta5RadialWheel';
import { Station, TrackCue } from '../../types/radio';
import { sfx } from '../../audio/sfx';

vi.mock('../../audio/sfx', () => ({
  sfx: {
    playClick: vi.fn(),
    playTuningStaticBurst: vi.fn(),
    startStaticHiss: vi.fn(),
    stopStaticHiss: vi.fn(),
    setEnabled: vi.fn(),
    isEnabled: vi.fn(() => true),
  },
}));

const mockStations: Station[] = [
  {
    id: 'radio-los-santos',
    gameId: 'gta5',
    name: 'Radio Los Santos',
    genre: 'Hip Hop',
    frequency: '105.9 FM',
    logoUrl: '/logos/los-santos.png',
    audioUrl: 'https://example.com/los-santos.mp3',
    duration: 3600,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'west-coast-classics',
    gameId: 'gta5',
    name: 'West Coast Classics',
    genre: 'Classic Rap',
    frequency: '94.1 FM',
    logoUrl: '/logos/wcc.png',
    audioUrl: 'https://example.com/wcc.mp3',
    duration: 3600,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'flylo-fm',
    gameId: 'gta5',
    name: 'FlyLo FM',
    genre: 'Electronic',
    frequency: '102.3 FM',
    logoUrl: '/logos/flylo.png',
    audioUrl: 'https://example.com/flylo.mp3',
    duration: 3600,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'non-stop-pop-fm',
    gameId: 'gta5',
    name: 'Non-Stop-Pop FM',
    genre: 'Pop / Dance',
    frequency: '100.7 FM',
    logoUrl: '/logos/non-stop-pop.png',
    audioUrl: 'https://example.com/nonstoppop.mp3',
    duration: 3600,
    initialOffset: 0,
    timestamps: [],
  },
];

const mockCue: TrackCue = {
  start: 0,
  end: 200,
  song: 'Swimming Pools',
  artist: 'Kendrick Lamar',
  type: 'music',
  coverArtUrl: 'https://example.com/cover.jpg',
};

const discRect = {
  left: 0,
  top: 0,
  width: 500,
  height: 500,
  right: 500,
  bottom: 500,
  x: 0,
  y: 0,
  toJSON: () => {},
};

describe('Gta5RadialWheel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Geometry', () => {
    it('calculates the station index from a polar angle', () => {
      expect(getStationIndexFromPolarAngle(0, 4)).toBe(0);
      expect(getStationIndexFromPolarAngle(10, 4)).toBe(0);
      expect(getStationIndexFromPolarAngle(350, 4)).toBe(0);
      expect(getStationIndexFromPolarAngle(85, 4)).toBe(1);
      expect(getStationIndexFromPolarAngle(95, 4)).toBe(1);
      expect(getStationIndexFromPolarAngle(180, 4)).toBe(2);
      expect(getStationIndexFromPolarAngle(270, 4)).toBe(3);
    });

    it('places station 0 at twelve o clock and walks clockwise', () => {
      const first = getBadgePosition(0, 4);
      expect(first.x).toBeCloseTo(50, 5);
      expect(first.y).toBeCloseTo(6, 5);

      const second = getBadgePosition(1, 4);
      expect(second.x).toBeCloseTo(94, 5);
      expect(second.y).toBeCloseTo(50, 5);

      const third = getBadgePosition(2, 4);
      expect(third.x).toBeCloseTo(50, 5);
      expect(third.y).toBeCloseTo(94, 5);
    });

    it('keeps every badge on the ring and never emits NaN', () => {
      for (const total of [1, 4, 15, 26]) {
        for (let index = 0; index < total; index += 1) {
          const { x, y } = getBadgePosition(index, total);
          const radius = Math.hypot(x - 50, y - 50);
          expect(Number.isNaN(x)).toBe(false);
          expect(Number.isNaN(y)).toBe(false);
          expect(radius).toBeCloseTo(44, 5);
        }
      }
    });
  });

  describe('Rendering', () => {
    it('renders a circular badge for every station on the wheel ring', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
      mockStations.forEach((station) => {
        const badge = screen.getByTestId(`gta5-station-badge-${station.id}`);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('aria-label', station.name);
        expect(badge.style.left).toMatch(/%$/);
        expect(badge.style.top).toMatch(/%$/);
      });
    });

    it('marks only the tuned station as active and gives it the cyan ring', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
          isPlaying={true}
        />
      );

      const active = screen.getByTestId('gta5-station-badge-west-coast-classics');
      expect(active).toHaveAttribute('data-active', 'true');
      expect(active).toHaveAttribute('aria-pressed', 'true');
      expect(active.className).toContain('border-sky-300');
      expect(active.className).toContain('ring-sky-400/40');

      const inactive = screen.getByTestId('gta5-station-badge-radio-los-santos');
      expect(inactive).toHaveAttribute('data-active', 'false');
      expect(inactive).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows station name, frequency, artist and song in the center HUD', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
        />
      );

      expect(screen.getByTestId('gta5-center-hub')).toBeInTheDocument();
      expect(screen.getByTestId('gta5-station-name')).toHaveTextContent('Radio Los Santos');
      expect(screen.getByTestId('gta5-station-frequency')).toHaveTextContent('105.9 FM');
      expect(screen.getByTestId('gta5-track-title')).toHaveTextContent('Swimming Pools');
      expect(screen.getByTestId('gta5-track-artist')).toHaveTextContent('Kendrick Lamar');
    });

    it('falls back to the station genre when no frequency is published', () => {
      const station = { ...mockStations[0], frequency: undefined };
      render(
        <Gta5RadialWheel
          stations={[station]}
          currentStation={station}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-station-frequency')).toHaveTextContent('Hip Hop');
    });

    it('handles talk and commercial cue types appropriately', () => {
      const talkCue: TrackCue = {
        start: 0,
        end: 100,
        song: 'Chakra Attack',
        artist: 'Dr. Ray De Angelo Harris',
        type: 'talk',
      };

      const { rerender } = render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={talkCue}
        />
      );

      expect(screen.getByTestId('gta5-track-title')).toHaveTextContent('Chakra Attack');
      expect(screen.getByTestId('gta5-track-artist')).toHaveTextContent('Dr. Ray De Angelo Harris');

      const adCue: TrackCue = {
        start: 0,
        end: 60,
        song: 'Ammu-Nation Commercial',
        artist: '',
        type: 'ad',
      };

      rerender(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={adCue}
        />
      );

      expect(screen.getByTestId('gta5-track-title')).toHaveTextContent('Ammu-Nation Commercial');
      expect(screen.getByTestId('gta5-track-artist')).toHaveTextContent('Commercial Break');
    });

    it('renders controller-style hints under the wheel', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByTestId('gta5-hud-hint')).toHaveTextContent(/drag to select station/i);
      expect(screen.getByTestId('gta5-hud-hint')).toHaveTextContent(/release to tune/i);
    });

    it('handles single station and empty stations without crashing', () => {
      const { rerender } = render(
        <Gta5RadialWheel
          stations={[mockStations[0]]}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
      expect(screen.getByTestId('gta5-station-badge-radio-los-santos')).toBeInTheDocument();

      rerender(
        <Gta5RadialWheel
          stations={[]}
          currentStation={null}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-radial-svg')).toBeInTheDocument();
      expect(screen.getByText(/radio off/i)).toBeInTheDocument();
    });

    it('renders radio off state when currentStation is null', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={null}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-center-hub')).toBeInTheDocument();
      expect(screen.getByText(/radio off/i)).toBeInTheDocument();
      expect(screen.queryByTestId('gta5-share-prompt')).not.toBeInTheDocument();
    });
  });

  describe('Sharing', () => {
    it('shares the tuned station through the Web Share API', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });

      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
        />
      );

      fireEvent.click(screen.getByTestId('gta5-share-prompt'));

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const payload = share.mock.calls[0][0];
      expect(payload.title).toBe('Radio Los Santos');
      expect(payload.text).toContain('Swimming Pools');
    });

    it('hides the share prompt when radio is off', () => {
      const offStation: Station = {
        ...mockStations[0],
        id: 'radio-off',
        name: 'Radio Off',
      };

      render(
        <Gta5RadialWheel
          stations={[...mockStations, offStation]}
          currentStation={offStation}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.queryByTestId('gta5-share-prompt')).not.toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onSelectStation and plays click SFX when clicking a station badge', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.click(screen.getByTestId('gta5-station-badge-flylo-fm'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('navigates stations via Arrow keys and Tab/Q keyboard shortcuts', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const wheelRoot = screen.getByTestId('gta5-radial-wheel');

      fireEvent.keyDown(wheelRoot, { key: 'ArrowRight' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[1]);
      expect(sfx.playClick).toHaveBeenCalled();

      fireEvent.keyDown(wheelRoot, { key: 'ArrowLeft' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[3]);

      fireEvent.keyDown(wheelRoot, { key: 'Tab' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[1]);

      fireEvent.keyDown(wheelRoot, { key: 'q' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[1]);
    });

    it('highlights a station on hover and previews it in the center HUD', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      fireEvent.mouseEnter(screen.getByTestId('gta5-station-badge-west-coast-classics'));

      expect(sfx.playClick).toHaveBeenCalled();
      expect(screen.getByTestId('gta5-station-name')).toHaveTextContent('West Coast Classics');
    });

    it('tracks pointer move with polar angle dragging ignoring the deadzone', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const disc = screen.getByTestId('gta5-wheel-disc');
      vi.spyOn(disc, 'getBoundingClientRect').mockReturnValue(discRect);

      fireEvent.mouseMove(disc, { clientX: 260, clientY: 260 });
      expect(onSelect).not.toHaveBeenCalled();

      fireEvent.mouseMove(disc, { clientX: 400, clientY: 250 });
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('selects a station while pointer is dragging with buttons === 1', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const disc = screen.getByTestId('gta5-wheel-disc');
      vi.spyOn(disc, 'getBoundingClientRect').mockReturnValue(discRect);

      fireEvent.mouseMove(disc, { clientX: 250, clientY: 400, buttons: 1 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
    });

    it('supports mobile touch drag and triggers station selection', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const disc = screen.getByTestId('gta5-wheel-disc');
      vi.spyOn(disc, 'getBoundingClientRect').mockReturnValue(discRect);

      fireEvent.touchMove(disc, {
        touches: [{ clientX: 100, clientY: 250 }],
      });

      expect(onSelect).toHaveBeenCalledWith(mockStations[3]);
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('ignores keyboard shortcuts if the event originates inside an editable input', () => {
      const onSelect = vi.fn();
      render(
        <div>
          <input data-testid="search-box" />
          <Gta5RadialWheel
            stations={mockStations}
            currentStation={mockStations[0]}
            onSelectStation={onSelect}
            isPlaying={false}
          />
        </div>
      );

      const input = screen.getByTestId('search-box');
      fireEvent.keyDown(input, { key: 'ArrowRight' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('supports mouse wheel station cycling with throttled wheel events', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.wheel(screen.getByTestId('gta5-wheel-disc'), { deltaY: 20 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[1]);
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('triggers playTuningStaticBurst and click SFX when station is selected', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.click(screen.getByTestId('gta5-station-badge-flylo-fm'));

      expect(sfx.playClick).toHaveBeenCalled();
      expect(sfx.playTuningStaticBurst).toHaveBeenCalledWith(220);
    });

    it('renders Radio Off state in the center hub when the active station is radio-off', () => {
      const offStation: Station = {
        id: 'radio-off',
        gameId: 'gta5',
        name: 'Radio Off',
        genre: 'Off',
        logoUrl: '/logos/gta5/radio-off.png',
        audioUrl: '',
        duration: 0,
        initialOffset: 0,
        timestamps: [],
      };

      render(
        <Gta5RadialWheel
          stations={[...mockStations, offStation]}
          currentStation={offStation}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-center-hub')).toBeInTheDocument();
      expect(screen.getByText(/radio off/i)).toBeInTheDocument();
    });
  });
});
