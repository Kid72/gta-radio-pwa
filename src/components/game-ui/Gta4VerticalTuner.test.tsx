import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  Gta4VerticalTuner,
  getNextStationIndex,
  formatFrequency,
  triggerHaptic,
} from './Gta4VerticalTuner';
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
    id: 'the-beat-102-7',
    gameId: 'gta4',
    name: 'The Beat 102.7',
    genre: 'Contemporary Hip-Hop & Rap',
    host: 'Mister Cee & DJ Green Lantern',
    frequency: '102.7 FM',
    logoUrl: '/logos/gta4/the-beat-102-7.png',
    audioUrl: 'https://example.com/the-beat.mp3',
    duration: 5667,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'electro-choc',
    gameId: 'gta4',
    name: 'Electro-Choc',
    genre: 'Electro-House & Dance',
    host: 'François K',
    frequency: '104.1 FM',
    logoUrl: '/logos/gta4/electro-choc.png',
    audioUrl: 'https://example.com/electro-choc.mp3',
    duration: 5200,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'liberty-rock-radio',
    gameId: 'gta4',
    name: 'Liberty Rock Radio 97.8',
    genre: 'Classic Rock',
    host: 'Iggy Pop',
    frequency: '97.8 FM',
    logoUrl: '/logos/gta4/liberty-rock-radio.png',
    audioUrl: 'https://example.com/liberty-rock.mp3',
    duration: 6100,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'vladivostok-fm',
    gameId: 'gta4',
    name: 'Vladivostok FM',
    genre: 'Eastern European & Pop',
    host: 'Ruslana',
    logoUrl: '/logos/gta4/vladivostok-fm.png',
    audioUrl: 'https://example.com/vladivostok.mp3',
    duration: 4800,
    initialOffset: 0,
    timestamps: [],
  },
];

const mockCue: TrackCue = {
  start: 0,
  end: 240,
  song: "What's the Problem",
  artist: 'Styles P',
  type: 'music',
  coverArtUrl: 'https://example.com/whats-the-problem.jpg',
};

describe('Gta4VerticalTuner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigator.vibrate = vi.fn();
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('Pure helper calculations', () => {
    it('calculates cyclic next and prev station indices correctly', () => {
      expect(getNextStationIndex(0, 4, 'next')).toBe(1);
      expect(getNextStationIndex(3, 4, 'next')).toBe(0);
      expect(getNextStationIndex(0, 4, 'prev')).toBe(3);
      expect(getNextStationIndex(2, 4, 'prev')).toBe(1);
      expect(getNextStationIndex(-1, 4, 'next')).toBe(0);
      expect(getNextStationIndex(-1, 4, 'prev')).toBe(3);
      expect(getNextStationIndex(0, 0, 'next')).toBe(0);
    });

    it('formats station frequency correctly with explicit frequency, regex match, or fallback', () => {
      expect(formatFrequency(mockStations[0])).toBe('102.7 FM');
      expect(formatFrequency(mockStations[1])).toBe('104.1 FM');
      // For station without frequency field, extracts from name if pattern exists
      const stationWithNameFreq: Station = {
        ...mockStations[3],
        name: 'Radio Broker 99.1 FM',
      };
      expect(formatFrequency(stationWithNameFreq)).toBe('99.1 FM');
      // Fallback when no frequency
      expect(formatFrequency(mockStations[3])).toBe('');
    });

    it('triggers haptic feedback safely', () => {
      triggerHaptic(10);
      expect(navigator.vibrate).toHaveBeenCalledWith(10);
    });
  });

  describe('Rendering and Visuals', () => {
    it('renders container with gta4-vertical-tuner testid', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );
      expect(screen.getByTestId('gta4-vertical-tuner')).toBeInTheDocument();
    });

    it('renders Liberty City header and all station items in the vertical list', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByText(/Liberty City/i)).toBeInTheDocument();
      const stationList = screen.getByTestId('gta4-station-list');
      expect(within(stationList).getByText('The Beat 102.7')).toBeInTheDocument();
      expect(within(stationList).getByText('Electro-Choc')).toBeInTheDocument();
      expect(within(stationList).getByText('Liberty Rock Radio 97.8')).toBeInTheDocument();
      expect(within(stationList).getByText('Vladivostok FM')).toBeInTheDocument();
    });

    it('highlights active station with yellow indicator bar, active chevron, and Bank Gothic styling', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      const activeItem = screen.getByTestId('gta4-station-item-the-beat-102-7');
      expect(activeItem).toHaveAttribute('data-active', 'true');
      expect(activeItem).toHaveAttribute('aria-selected', 'true');

      // Check for active chevron ►
      const chevron = screen.getByTestId('gta4-active-chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron.textContent).toContain('►');

      // Check inactive item
      const inactiveItem = screen.getByTestId('gta4-station-item-electro-choc');
      expect(inactiveItem).toHaveAttribute('data-active', 'false');
      expect(inactiveItem).toHaveAttribute('aria-selected', 'false');
    });

    it('renders frequency badges and uppercase genres', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      const stationList = screen.getByTestId('gta4-station-list');
      expect(within(stationList).getByText('102.7 FM')).toBeInTheDocument();
      expect(within(stationList).getByText('104.1 FM')).toBeInTheDocument();
      expect(within(stationList).getByText('97.8 FM')).toBeInTheDocument();
      expect(within(stationList).getByText('Contemporary Hip-Hop & Rap')).toBeInTheDocument();
    });

    it('renders track info banner with current song, artist, and cue badge', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
        />
      );

      const trackBanner = screen.getByTestId('gta4-track-banner');
      expect(trackBanner).toBeInTheDocument();
      expect(screen.getByText("What's the Problem")).toBeInTheDocument();
      expect(screen.getByText('Styles P')).toBeInTheDocument();
      expect(screen.getByTestId('gta4-cue-badge')).toHaveTextContent(/MUSIC/i);
    });

    it('renders animated equalizer bars when isPlaying is true', () => {
      const { rerender } = render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
        />
      );

      const eqBars = screen.getByTestId('gta4-equalizer-bars');
      expect(eqBars).toBeInTheDocument();
      expect(eqBars.children.length).toBe(4);

      rerender(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
          currentCue={mockCue}
        />
      );
      expect(screen.getByTestId('gta4-equalizer-bars')).toBeInTheDocument();
    });

    it('renders cover art thumbnail when coverArtUrl or cue coverArtUrl is provided', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          coverArtUrl="https://example.com/custom-art.jpg"
          currentCue={mockCue}
        />
      );

      const coverImg = screen.getByTestId('gta4-cover-art');
      expect(coverImg).toHaveAttribute('src', 'https://example.com/custom-art.jpg');
    });

    it('falls back to cue.coverArtUrl if coverArtUrl prop is omitted', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={mockCue}
        />
      );

      const coverImg = screen.getByTestId('gta4-cover-art');
      expect(coverImg).toHaveAttribute('src', 'https://example.com/whats-the-problem.jpg');
    });

    it('renders talk and commercial break cues properly', () => {
      const talkCue: TrackCue = {
        start: 0,
        end: 60,
        song: 'Public Service Announcement',
        artist: 'Liberty City Council',
        type: 'talk',
      };

      const { rerender } = render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={talkCue}
        />
      );
      expect(screen.getByTestId('gta4-cue-badge')).toHaveTextContent(/TALK/i);

      const adCue: TrackCue = {
        start: 60,
        end: 120,
        song: 'Sprunk Commercial',
        artist: 'Sprunk Beverage Corp',
        type: 'ad',
      };
      rerender(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={true}
          currentCue={adCue}
        />
      );
      expect(screen.getByTestId('gta4-cue-badge')).toHaveTextContent(/COMMERCIAL|AD/i);
    });

    it('renders Radio Off state when currentStation is null', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={null}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      expect(screen.getByTestId('gta4-radio-off')).toBeInTheDocument();
      expect(screen.getByText(/RADIO OFF/i)).toBeInTheDocument();
    });

    it('handles empty stations gracefully without crashing', () => {
      render(
        <Gta4VerticalTuner
          stations={[]}
          currentStation={null}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );
      expect(screen.getByTestId('gta4-vertical-tuner')).toBeInTheDocument();
    });
  });

  describe('Interaction, SFX & Controls', () => {
    it('selects station, plays click SFX, and triggers haptics on item click', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.click(screen.getByText('Electro-Choc'));
      expect(onSelect).toHaveBeenCalledWith(mockStations[1]);
      expect(sfx.playClick).toHaveBeenCalled();
      expect(navigator.vibrate).toHaveBeenCalledWith(10);
    });

    it('cycles to next station on ArrowDown key', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[1]);
      expect(sfx.playClick).toHaveBeenCalled();
      expect(navigator.vibrate).toHaveBeenCalledWith(10);
    });

    it('cycles to previous station on ArrowUp key', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[3]);
      expect(sfx.playClick).toHaveBeenCalled();
      expect(navigator.vibrate).toHaveBeenCalledWith(10);
    });

    it('cycles to next station on "r" or "R" (in-game GTA key)', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.keyDown(window, { key: 'r' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[1]);

      fireEvent.keyDown(window, { key: 'R' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[1]);
    });

    it('cycles stations on bracket keys [ and ]', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.keyDown(window, { key: ']' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      fireEvent.keyDown(window, { key: '[' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);
    });

    it('ignores keyboard shortcuts if event originates inside an editable input', () => {
      const onSelect = vi.fn();
      render(
        <div>
          <input data-testid="test-input" type="text" />
          <Gta4VerticalTuner
            stations={mockStations}
            currentStation={mockStations[0]}
            onSelectStation={onSelect}
            isPlaying={false}
          />
        </div>
      );

      const input = screen.getByTestId('test-input');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('handles mouse wheel vertical scroll to cycle stations', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const container = screen.getByTestId('gta4-vertical-tuner');

      // Scroll down (deltaY > 20) -> next station
      fireEvent.wheel(container, { deltaY: 50 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      // Fast immediate wheel should be throttled
      fireEvent.wheel(container, { deltaY: 50 });
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('stops propagation of mouse wheel over gta4-station-list to permit natural scrolling through all stations without cycling tuner', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const stationList = screen.getByTestId('gta4-station-list');

      // Wheel event on station list should have stopPropagation called and NOT trigger onSelectStation
      const wheelEvent = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
      const stopPropagationSpy = vi.spyOn(wheelEvent, 'stopPropagation');

      stationList.dispatchEvent(wheelEvent);

      expect(stopPropagationSpy).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('invokes scrollIntoView on mount and on explicit station cycle, without locking the list during scrolling', () => {
      const onSelect = vi.fn();
      const { rerender } = render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      // On initial mount, active station item scrollIntoView is called with auto behavior
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        behavior: 'auto',
      });

      vi.mocked(Element.prototype.scrollIntoView).mockClear();

      // Rerendering with same active station (e.g. while scrolling through stations) does NOT call scrollIntoView
      rerender(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
          isPlaying={true}
        />
      );
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

      // Explicitly cycling via ArrowDown triggers scrollIntoView on next selection
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[1]);

      // When parent updates currentStation after cycleStation
      rerender(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
          isPlaying={true}
        />
      );
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        behavior: 'smooth',
      });
    });

    it('renders all 19 real GTA IV stations with logos and frequencies', async () => {
      const realGta4Stations = (await import('../../data/gta4.json')).default as Station[];
      expect(realGta4Stations).toHaveLength(19);

      render(
        <Gta4VerticalTuner
          stations={realGta4Stations}
          currentStation={realGta4Stations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      const stationList = screen.getByTestId('gta4-station-list');
      realGta4Stations.forEach((station) => {
        const item = within(stationList).getByTestId(`gta4-station-item-${station.id}`);
        expect(item).toBeInTheDocument();
        const img = within(item).getByAltText(station.name);
        expect(img).toHaveAttribute('src', station.logoUrl);
      });
    });

    it('handles mobile touch swipe up and down gestures to navigate stations', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      const container = screen.getByTestId('gta4-vertical-tuner');

      // Swipe up: touchStartY = 200, touchEndY = 150 (deltaY = -50) -> next station
      fireEvent.touchStart(container, {
        touches: [{ clientY: 200 }],
      });
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientY: 150 }],
      });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      // Swipe down: touchStartY = 100, touchEndY = 160 (deltaY = +60) -> prev station
      fireEvent.touchStart(container, {
        touches: [{ clientY: 100 }],
      });
      fireEvent.touchEnd(container, {
        changedTouches: [{ clientY: 160 }],
      });
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);
    });

    it('navigates stations via header navigation buttons', () => {
      const onSelect = vi.fn();
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
          isPlaying={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Previous Station'));
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);

      fireEvent.click(screen.getByLabelText('Next Station'));
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
    });

    it('handles image error fallback for station logo', () => {
      render(
        <Gta4VerticalTuner
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
          isPlaying={false}
        />
      );

      const stationItem = screen.getByTestId('gta4-station-item-the-beat-102-7');
      const img = within(stationItem).getByAltText('The Beat 102.7');
      fireEvent.error(img);

      // Should now replace image with fallback icon without crashing
      expect(within(stationItem).queryByAltText('The Beat 102.7')).not.toBeInTheDocument();
    });
  });
});
