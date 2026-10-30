import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  GtaSaHorizontalReel,
  getNextStationIndex,
  calculateReelOffset,
  ITEM_WIDTH,
} from './GtaSaHorizontalReel';
import { Station, TrackCue } from '../../types/radio';
import { sfx } from '../../audio/sfx';

/**
 * jsdom does not implement PointerEvent, so `fireEvent.pointerDown` drops
 * clientX/pointerType. Dispatch a MouseEvent with the pointer type instead —
 * React's onPointer* handlers read exactly those fields, so this exercises the
 * same code path the browser uses.
 */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  props: { clientX: number; clientY?: number; pointerId?: number; pointerType?: string; button?: number }
) {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: props.clientX,
    clientY: props.clientY ?? 0,
    button: props.button ?? 0,
  });
  Object.assign(ev, {
    pointerId: props.pointerId ?? 1,
    pointerType: props.pointerType ?? 'mouse',
    isPrimary: true,
  });
  fireEvent(el, ev);
}


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
    id: 'playback-fm',
    gameId: 'gtasa',
    name: 'Playback FM',
    genre: 'East Coast Classic Hip-Hop',
    host: 'Forth Right MC',
    frequency: '101.5 FM',
    logoUrl: '/logos/gtasa/playback-fm.png',
    audioUrl: 'https://example.com/playback.mp3',
    duration: 2800,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'k-rose',
    gameId: 'gtasa',
    name: 'K-Rose',
    genre: 'Country & Western',
    host: 'Mary-Beth Maybell',
    frequency: '106.6 FM',
    logoUrl: '/logos/gtasa/k-rose.png',
    audioUrl: 'https://example.com/k-rose.mp3',
    duration: 2900,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'k-dst',
    gameId: 'gtasa',
    name: 'K-DST',
    genre: 'Classic Rock',
    host: 'Tommy "The Nightmare" Smith',
    frequency: '92.5 FM',
    logoUrl: '/logos/gtasa/k-dst.png',
    audioUrl: 'https://example.com/k-dst.mp3',
    duration: 3100,
    initialOffset: 0,
    timestamps: [],
  },
  {
    id: 'bounce-fm',
    gameId: 'gtasa',
    name: 'Bounce FM',
    genre: 'Funk & Disco',
    host: 'The Funktipus',
    frequency: '95.2 FM',
    logoUrl: '/logos/gtasa/bounce-fm.png',
    audioUrl: 'https://example.com/bounce-fm.mp3',
    duration: 3000,
    initialOffset: 0,
    timestamps: [],
  },
];

const mockCue: TrackCue = {
  start: 0,
  end: 240,
  song: 'Warm It Up, Kane',
  artist: 'Big Daddy Kane',
  type: 'music',
  coverArtUrl: 'https://example.com/warm-it-up.jpg',
};

describe('GtaSaHorizontalReel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigator.vibrate = vi.fn();
  });

  describe('Pure helper calculations', () => {
    it('calculates reel offset based on active index and item width', () => {
      expect(calculateReelOffset(0, ITEM_WIDTH)).toBe(ITEM_WIDTH / 2);
      expect(calculateReelOffset(1, ITEM_WIDTH)).toBe(1 * ITEM_WIDTH + ITEM_WIDTH / 2);
      expect(calculateReelOffset(2, ITEM_WIDTH)).toBe(2 * ITEM_WIDTH + ITEM_WIDTH / 2);
    });

    it('calculates cyclic next and prev station indices correctly', () => {
      expect(getNextStationIndex(0, 4, 'next')).toBe(1);
      expect(getNextStationIndex(3, 4, 'next')).toBe(0);
      expect(getNextStationIndex(0, 4, 'prev')).toBe(3);
      expect(getNextStationIndex(2, 4, 'prev')).toBe(1);
      expect(getNextStationIndex(-1, 4, 'next')).toBe(0);
      expect(getNextStationIndex(0, 0, 'next')).toBe(0);
    });
  });

  describe('Rendering and Visuals', () => {
    it('renders the reel container with gtasa-reel-container testid', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
        />
      );
      expect(screen.getByTestId('gtasa-reel-container')).toBeInTheDocument();
    });

    it('renders all station items and logos in the horizontal reel track', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
        />
      );

      mockStations.forEach((station) => {
        expect(screen.getByTestId(`gtasa-station-${station.id}`)).toBeInTheDocument();
        const img = screen.getByAltText(station.name);
        expect(img).toHaveAttribute('src', station.logoUrl);
      });
    });

    it('renders amber selection brackets around the active station', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
        />
      );

      const brackets = screen.getByTestId('gtasa-amber-brackets');
      expect(brackets).toBeInTheDocument();
    });

    it('marks active station with scale-110/115 and inactive with scale-85 and reduced opacity', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
        />
      );

      const activeItem = screen.getByTestId('gtasa-station-k-rose');
      expect(activeItem).toHaveAttribute('data-active', 'true');
      expect(activeItem.className).toMatch(/scale-115|scale-110/);

      const inactiveItem = screen.getByTestId('gtasa-station-playback-fm');
      expect(inactiveItem).toHaveAttribute('data-active', 'false');
      expect(inactiveItem.className).toMatch(/scale-85/);
      expect(inactiveItem.className).toMatch(/opacity-50/);
    });

    it('displays active station name in authentic Pricedown font styling, frequency, and host', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
        />
      );

      const stationTitle = screen.getByTestId('gtasa-station-title');
      expect(stationTitle).toHaveTextContent('K-Rose');
      expect(stationTitle.className).toMatch(/pricedown/i);
      expect(screen.getByText(/106.6 FM/)).toBeInTheDocument();
      expect(screen.getByText(/Mary-Beth Maybell/)).toBeInTheDocument();
    });

    it('renders track cue banner with song title, artist, and type badge', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          currentCue={mockCue}
          isPlaying={true}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByTestId('gtasa-track-cue-banner')).toBeInTheDocument();
      expect(screen.getByText('Warm It Up, Kane')).toBeInTheDocument();
      expect(screen.getByText('Big Daddy Kane')).toBeInTheDocument();
      expect(screen.getByText(/MUSIC/i)).toBeInTheDocument();
    });

    it('renders animated equalizer bars when isPlaying is true', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          currentCue={mockCue}
          isPlaying={true}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByTestId('gtasa-equalizer-bars')).toBeInTheDocument();
    });

    it('renders cover art thumbnail when coverArtUrl or cue coverArtUrl is provided', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          currentCue={mockCue}
          coverArtUrl="https://example.com/custom-cover.jpg"
          onSelectStation={vi.fn()}
        />
      );

      const coverImg = screen.getByTestId('gtasa-cue-cover-art');
      expect(coverImg).toHaveAttribute('src', 'https://example.com/custom-cover.jpg');
    });

    it('falls back to cue.coverArtUrl if coverArtUrl prop is omitted', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          currentCue={mockCue}
          onSelectStation={vi.fn()}
        />
      );

      const coverImg = screen.getByTestId('gtasa-cue-cover-art');
      expect(coverImg).toHaveAttribute('src', mockCue.coverArtUrl);
    });

    it('renders talk and commercial break cues properly', () => {
      const talkCue: TrackCue = {
        start: 0,
        end: 180,
        song: 'The Tight End Show',
        artist: 'Billy Dexter',
        type: 'talk',
      };

      const { rerender } = render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          currentCue={talkCue}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByText('TALK SHOW')).toBeInTheDocument();

      const adCue: TrackCue = {
        start: 0,
        end: 60,
        song: 'Ammu-Nation Spot',
        artist: 'San Andreas Sponsors',
        type: 'ad',
      };

      rerender(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          currentCue={adCue}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByText('COMMERCIAL')).toBeInTheDocument();
    });

    it('renders Radio Off state when currentStation is null', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={null}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByText(/RADIO OFF/i)).toBeInTheDocument();
      expect(screen.getByText(/Select a station to tune in/i)).toBeInTheDocument();
    });

    it('handles empty stations gracefully without crashing', () => {
      render(
        <GtaSaHorizontalReel
          stations={[]}
          currentStation={null}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByTestId('gtasa-reel-container')).toBeInTheDocument();
      expect(screen.getByText(/RADIO OFF/i)).toBeInTheDocument();
    });
  });

  describe('Interaction, SFX & Controls', () => {
    it('selects station, plays click SFX, and triggers haptics on station item click', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
        />
      );

      fireEvent.click(screen.getByTestId('gtasa-station-k-dst'));
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
      expect(sfx.playClick).toHaveBeenCalled();
      expect(navigator.vibrate).toHaveBeenCalledWith(10);
    });

    it('cycles to next station on ArrowRight key', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('cycles to previous station on ArrowLeft key', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);
      expect(sfx.playClick).toHaveBeenCalled();
    });

    it('cycles to next station on "r" or "R" (in-game GTA key)', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={onSelect}
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
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
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
          <GtaSaHorizontalReel
            stations={mockStations}
            currentStation={mockStations[0]}
            onSelectStation={onSelect}
          />
        </div>
      );

      const input = screen.getByTestId('test-input');
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      fireEvent.keyDown(input, { key: 'r' });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('handles mouse wheel scroll to cycle stations', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
        />
      );

      const container = screen.getByTestId('gtasa-reel-container');
      const nowSpy = vi.spyOn(Date, 'now');

      // Scroll down / right -> next station
      nowSpy.mockReturnValue(1000);
      fireEvent.wheel(container, { deltaY: 50, deltaX: 0 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      // Scroll up / left -> previous station
      nowSpy.mockReturnValue(2000);
      fireEvent.wheel(container, { deltaY: -50, deltaX: 0 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);

      nowSpy.mockRestore();
    });

    it('handles horizontal trackpad/mouse wheel (X-axis) scroll responsive navigation', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
        />
      );

      const container = screen.getByTestId('gtasa-reel-container');
      const nowSpy = vi.spyOn(Date, 'now');

      // Horizontal swipe right (deltaX > 5) -> next station
      nowSpy.mockReturnValue(1000);
      fireEvent.wheel(container, { deltaX: 40, deltaY: 0 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      // Horizontal swipe left (deltaX < -5) -> previous station
      nowSpy.mockReturnValue(2000);
      fireEvent.wheel(container, { deltaX: -40, deltaY: 0 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);

      // When deltaX > deltaY, deltaX takes precedence
      nowSpy.mockReturnValue(3000);
      fireEvent.wheel(container, { deltaX: 60, deltaY: 10 });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      // Throttling (< 90ms) ignores rapid wheel ticks
      nowSpy.mockReturnValue(3050);
      fireEvent.wheel(container, { deltaX: 60, deltaY: 0 });
      expect(onSelect).toHaveBeenCalledTimes(3);

      nowSpy.mockRestore();
    });

    describe('Pointer Drag Navigation (mouse / touch / pen)', () => {
      it('drags left to shift reel and cycle to next station on release', () => {
        const onSelect = vi.fn();
        render(
          <GtaSaHorizontalReel
            stations={mockStations}
            currentStation={mockStations[1]}
            onSelectStation={onSelect}
          />
        );

        const reelTrack = screen.getByTestId('gtasa-reel-track');
        const viewport = screen.getByTestId('gtasa-reel-viewport');

        // Pointer down to begin dragging at X=300
        firePointer(viewport, 'pointerdown', { button: 0, clientX: 300, pointerId: 1, pointerType: 'mouse' });

        // Drag to the left by 60px (diff = -60)
        firePointer(viewport, 'pointermove', { clientX: 240, pointerId: 1, pointerType: 'mouse' });

        // Verify reel track transform shifted by dragOffset
        expect(reelTrack.style.transform).toContain('-60px');
        expect(reelTrack.style.transition).toBe('none');

        // Release at X=240 (diff = -60 < -25 -> cycle next)
        firePointer(viewport, 'pointerup', { clientX: 240, pointerId: 1, pointerType: 'mouse' });

        expect(onSelect).toHaveBeenCalledWith(mockStations[2]);
        expect(sfx.playClick).toHaveBeenCalled();
        expect(navigator.vibrate).toHaveBeenCalledWith(10);
      });

      it('drags right to shift reel and cycle to previous station on release', () => {
        const onSelect = vi.fn();
        render(
          <GtaSaHorizontalReel
            stations={mockStations}
            currentStation={mockStations[1]}
            onSelectStation={onSelect}
          />
        );

        const reelTrack = screen.getByTestId('gtasa-reel-track');
        const viewport = screen.getByTestId('gtasa-reel-viewport');

        firePointer(viewport, 'pointerdown', { button: 0, clientX: 200, pointerId: 1, pointerType: 'mouse' });
        firePointer(viewport, 'pointermove', { clientX: 280, pointerId: 1, pointerType: 'mouse' });
        expect(reelTrack.style.transform).toContain('80px');

        firePointer(viewport, 'pointerup', { clientX: 280, pointerId: 1, pointerType: 'mouse' });

        expect(onSelect).toHaveBeenCalledWith(mockStations[0]);
      });

      it('does not cycle station if drag distance is below 25px threshold', () => {
        const onSelect = vi.fn();
        render(
          <GtaSaHorizontalReel
            stations={mockStations}
            currentStation={mockStations[1]}
            onSelectStation={onSelect}
          />
        );

        const viewport = screen.getByTestId('gtasa-reel-viewport');

        firePointer(viewport, 'pointerdown', { button: 0, clientX: 200, pointerId: 1, pointerType: 'mouse' });
        firePointer(viewport, 'pointermove', { clientX: 215, pointerId: 1, pointerType: 'mouse' }); // diff = +15
        firePointer(viewport, 'pointerup', { clientX: 215, pointerId: 1, pointerType: 'mouse' });

        expect(onSelect).not.toHaveBeenCalled();
      });

      it('ignores non-left pointer buttons (e.g. right click button 2)', () => {
        const onSelect = vi.fn();
        render(
          <GtaSaHorizontalReel
            stations={mockStations}
            currentStation={mockStations[1]}
            onSelectStation={onSelect}
          />
        );

        const viewport = screen.getByTestId('gtasa-reel-viewport');

        firePointer(viewport, 'pointerdown', { button: 2, clientX: 200, pointerId: 1, pointerType: 'mouse' });
        firePointer(viewport, 'pointermove', { clientX: 100, pointerId: 1, pointerType: 'mouse' });
        firePointer(viewport, 'pointerup', { clientX: 100, pointerId: 1, pointerType: 'mouse' });

        expect(onSelect).not.toHaveBeenCalled();
      });
    });

    it('renders all 11 real GTA SA stations without visual clipping or errors', async () => {
      const realSaStations = (await import('../../data/gtasa.json')).default as Station[];
      expect(realSaStations).toHaveLength(11);

      render(
        <GtaSaHorizontalReel
          stations={realSaStations}
          currentStation={realSaStations[0]}
          onSelectStation={vi.fn()}
        />
      );

      realSaStations.forEach((station) => {
        const item = screen.getByTestId(`gtasa-station-${station.id}`);
        expect(item).toBeInTheDocument();
        const img = within(item).getByAltText(station.name);
        expect(img).toHaveAttribute('src', station.logoUrl);
      });
    });

    it('handles mobile touch swipes through the same pointer pipeline', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
        />
      );

      const viewport = screen.getByTestId('gtasa-reel-viewport');

      // Swipe left -> next station
      firePointer(viewport, 'pointerdown', { clientX: 200, clientY: 50, pointerId: 11, pointerType: 'touch' });
      firePointer(viewport, 'pointermove', { clientX: 150, clientY: 50, pointerId: 11, pointerType: 'touch' });
      firePointer(viewport, 'pointerup', { clientX: 120, clientY: 50, pointerId: 11, pointerType: 'touch' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[2]);

      // Swipe right -> previous station
      firePointer(viewport, 'pointerdown', { clientX: 100, clientY: 50, pointerId: 12, pointerType: 'touch' });
      firePointer(viewport, 'pointermove', { clientX: 150, clientY: 50, pointerId: 12, pointerType: 'touch' });
      firePointer(viewport, 'pointerup', { clientX: 180, clientY: 50, pointerId: 12, pointerType: 'touch' });
      expect(onSelect).toHaveBeenCalledWith(mockStations[0]);
    });

    it('declares pan-y on the reel viewport so horizontal drags are never stolen by page scroll', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={vi.fn()}
        />
      );

      const viewport = screen.getByTestId('gtasa-reel-viewport');
      expect(viewport.style.touchAction).toBe('pan-y');
    });

    it('cancels an in-flight drag without retuning', () => {
      const onSelect = vi.fn();
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[1]}
          onSelectStation={onSelect}
        />
      );

      const viewport = screen.getByTestId('gtasa-reel-viewport');
      firePointer(viewport, 'pointerdown', { clientX: 300, pointerId: 3, pointerType: 'touch' });
      firePointer(viewport, 'pointermove', { clientX: 200, pointerId: 3, pointerType: 'touch' });
      firePointer(viewport, 'pointercancel', { clientX: 200, pointerId: 3, pointerType: 'touch' });
      firePointer(viewport, 'pointerup', { clientX: 200, pointerId: 3, pointerType: 'touch' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('handles image error fallback for station logo', () => {
      render(
        <GtaSaHorizontalReel
          stations={mockStations}
          currentStation={mockStations[0]}
          onSelectStation={vi.fn()}
        />
      );

      const img = screen.getByAltText(mockStations[0].name);
      fireEvent.error(img);
      // Fallback text or badge should render
      expect(screen.getByTestId('gtasa-fallback-icon-playback-fm')).toBeInTheDocument();
    });
  });
});
