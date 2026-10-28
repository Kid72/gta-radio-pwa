import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Gta5RadialWheel, calculateAnnularSectorPath, getStationIndexFromPolarAngle } from './Gta5RadialWheel';
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
    frequency: '106.1 FM',
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
    frequency: '98.5 FM',
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

describe('Gta5RadialWheel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Geometry calculations', () => {
    it('calculates correct station index from polar angle', () => {
      // 4 stations -> 90 degrees each:
      // index 0: centered at 0 deg (315 to 45)
      // index 1: centered at 90 deg (45 to 135)
      // index 2: centered at 180 deg (135 to 225)
      // index 3: centered at 270 deg (225 to 315)
      expect(getStationIndexFromPolarAngle(0, 4)).toBe(0);
      expect(getStationIndexFromPolarAngle(10, 4)).toBe(0);
      expect(getStationIndexFromPolarAngle(350, 4)).toBe(0);
      expect(getStationIndexFromPolarAngle(85, 4)).toBe(1);
      expect(getStationIndexFromPolarAngle(95, 4)).toBe(1);
      expect(getStationIndexFromPolarAngle(180, 4)).toBe(2);
      expect(getStationIndexFromPolarAngle(270, 4)).toBe(3);
    });

    it('generates valid SVG annular sector path syntax without NaN', () => {
      const path = calculateAnnularSectorPath({
        cx: 260,
        cy: 260,
        rIn: 110,
        rOut: 215,
        startDeg: 10,
        endDeg: 80,
      });

      expect(path).toMatch(/^M\s+[\d.]+\s+[\d.]+\s+A\s+215\s+215\s+0\s+0\s+1\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+A\s+110\s+110\s+0\s+0\s+0\s+[\d.]+\s+[\d.]+\s+Z$/);
      expect(path).not.toContain('NaN');
    });
  });

  describe('Rendering', () => {
    it('renders SVG radial sectors for all stations', () => {
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
        expect(screen.getByTestId(`gta5-sector-${station.id}`)).toBeInTheDocument();
      });
    });

    it('highlights the active station wedge with emerald neon attributes and expanded radius', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
          isPlaying={true}
        />
      );

      const activeSector = screen.getByTestId('gta5-sector-west-coast-classics');
      expect(activeSector).toHaveAttribute('data-active', 'true');

      const inactiveSector = screen.getByTestId('gta5-sector-radio-los-santos');
      expect(inactiveSector).toHaveAttribute('data-active', 'false');
    });

    it('renders center hub with station emblem, name, frequency, and genre', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta5-center-hub')).toBeInTheDocument();
      expect(screen.getByTestId('gta5-station-emblem')).toHaveAttribute('src', mockStations[0].logoUrl);
      expect(screen.getByTestId('gta5-station-name')).toHaveTextContent('Radio Los Santos');
      expect(screen.getByTestId('gta5-station-frequency')).toHaveTextContent('106.1 FM');
    });

    it('displays track cues and optional cover art inside center hub', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
          coverArtUrl="https://example.com/itunes-600.jpg"
        />
      );

      expect(screen.getByTestId('gta5-track-title')).toHaveTextContent('Swimming Pools');
      expect(screen.getByTestId('gta5-track-artist')).toHaveTextContent('Kendrick Lamar');
      const cover = screen.getByTestId('gta5-cover-art');
      expect(cover).toHaveAttribute('src', 'https://example.com/itunes-600.jpg');
    });

    it('falls back to cue.coverArtUrl when coverArtUrl prop is omitted', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
        />
      );

      const cover = screen.getByTestId('gta5-cover-art');
      expect(cover).toHaveAttribute('src', 'https://example.com/cover.jpg');
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
      expect(screen.getByTestId('gta5-sector-radio-los-santos')).toBeInTheDocument();

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
    });
  });

  describe('Interactions', () => {
    it('calls onSelectStation and plays click SFX when clicking a sector slice', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const sector = screen.getByTestId('gta5-sector-flylo-fm');
      fireEvent.click(sector);

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

      // ArrowRight advances to next station (index 1: West Coast Classics)
      fireEvent.keyDown(wheelRoot, { key: 'ArrowRight' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[1]);
      expect(sfx.playClick).toHaveBeenCalled();

      // ArrowLeft retreats to previous station (index 3: Non-Stop-Pop FM)
      fireEvent.keyDown(wheelRoot, { key: 'ArrowLeft' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[3]);

      // Tab advances to next station (index 1)
      fireEvent.keyDown(wheelRoot, { key: 'Tab' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[1]);

      // 'Q' key cycles station
      fireEvent.keyDown(wheelRoot, { key: 'q' });
      expect(onSelect).toHaveBeenLastCalledWith(mockStations[1]);
    });

    it('handles mouse/pointer hover over sectors and triggers SFX on sector change', () => {
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      const sector = screen.getByTestId('gta5-sector-west-coast-classics');
      fireEvent.mouseEnter(sector);

      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('tracks pointer move with polar angle dragging ignoring deadzone < 35px', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const wheel = screen.getByTestId('gta5-radial-wheel');

      // Mock getBoundingClientRect: center is at x=250, y=250
      vi.spyOn(wheel, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 500,
        height: 500,
        right: 500,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer event inside deadzone (dx=10, dy=10, dist ~14px < 35px)
      fireEvent.mouseMove(wheel, { clientX: 260, clientY: 260 });
      expect(onSelect).not.toHaveBeenCalled();

      // Pointer event outside deadzone pointing right (dx=150, dy=0 -> 90 deg -> index 1: West Coast Classics)
      fireEvent.mouseMove(wheel, { clientX: 400, clientY: 250 });
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('selects station while pointer is dragging with buttons === 1', () => {
      const onSelect = vi.fn();
      render(
        <Gta5RadialWheel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const wheel = screen.getByTestId('gta5-radial-wheel');
      vi.spyOn(wheel, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 500,
        height: 500,
        right: 500,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Pointer event outside deadzone dragging downwards (dx=0, dy=150 -> 180 deg -> index 2: FlyLo FM)
      fireEvent.mouseMove(wheel, { clientX: 250, clientY: 400, buttons: 1 });
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

      const wheel = screen.getByTestId('gta5-radial-wheel');
      vi.spyOn(wheel, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 500,
        height: 500,
        right: 500,
        bottom: 500,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Touch drag left: dx=-150, dy=0 -> 270 deg -> index 3: Non-Stop-Pop FM
      fireEvent.touchMove(wheel, {
        touches: [{ clientX: 100, clientY: 250 }],
      });

      expect(onSelect).toHaveBeenCalledWith(mockStations[3]);
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('ignores keyboard shortcuts if event originates inside an editable input', () => {
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
  });
});
