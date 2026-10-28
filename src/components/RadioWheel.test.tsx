import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  RadioWheel,
  calculateStationAngle,
  getStationCoordinates,
  getStationIndexFromAngle,
  getStationIndexFromPointer,
} from './RadioWheel';
import { BroadcastHUD } from './BroadcastHUD';
import { gta5Stations, gtasaStations, gta4Stations } from '../data/catalog';
import { Station, TrackCue } from '../types/radio';

describe('RadioWheel Mathematical Helpers', () => {
  it('calculateStationAngle computes uniform angles around 360 degrees', () => {
    // 26 stations (GTA V): ~13.846 degrees per slice
    expect(calculateStationAngle(0, 26)).toBe(0);
    expect(calculateStationAngle(13, 26)).toBe(180);
    expect(calculateStationAngle(26, 26)).toBe(360);

    // 11 stations (GTA SA): ~32.727 degrees per slice
    expect(calculateStationAngle(0, 11)).toBe(0);
    expect(calculateStationAngle(1, 11)).toBeCloseTo(32.727, 2);

    // 19 stations (GTA IV): ~18.947 degrees per slice
    expect(calculateStationAngle(0, 19)).toBe(0);
    expect(calculateStationAngle(1, 19)).toBeCloseTo(18.947, 2);
  });

  it('getStationCoordinates places index 0 at top (0, -radius) and rotates clockwise', () => {
    const radius = 100;
    // 4 stations test for exact cardinal directions
    // Index 0: 0 deg (Top: x=0, y=-100)
    const pos0 = getStationCoordinates(0, 4, radius);
    expect(pos0.x).toBeCloseTo(0, 4);
    expect(pos0.y).toBeCloseTo(-100, 4);

    // Index 1: 90 deg (Right: x=100, y=0)
    const pos1 = getStationCoordinates(1, 4, radius);
    expect(pos1.x).toBeCloseTo(100, 4);
    expect(pos1.y).toBeCloseTo(0, 4);

    // Index 2: 180 deg (Bottom: x=0, y=100)
    const pos2 = getStationCoordinates(2, 4, radius);
    expect(pos2.x).toBeCloseTo(0, 4);
    expect(pos2.y).toBeCloseTo(100, 4);

    // Index 3: 270 deg (Left: x=-100, y=0)
    const pos3 = getStationCoordinates(3, 4, radius);
    expect(pos3.x).toBeCloseTo(-100, 4);
    expect(pos3.y).toBeCloseTo(0, 4);
  });

  it('getStationIndexFromAngle and getStationIndexFromPointer map pointer coordinates correctly', () => {
    // For 4 stations: slices are centered at 0 (top), 90 (right), 180 (bottom), 270 (left)
    // Pointer at Top: dx=0, dy=-100 -> angle 0 -> index 0
    expect(getStationIndexFromPointer(0, -100, 4)).toBe(0);
    // Pointer at Right: dx=100, dy=0 -> angle 90 -> index 1
    expect(getStationIndexFromPointer(100, 0, 4)).toBe(1);
    // Pointer at Bottom: dx=0, dy=100 -> angle 180 -> index 2
    expect(getStationIndexFromPointer(0, 100, 4)).toBe(2);
    // Pointer at Left: dx=-100, dy=0 -> angle 270 -> index 3
    expect(getStationIndexFromPointer(-100, 0, 4)).toBe(3);

    // Angle mappings with wrapping
    expect(getStationIndexFromAngle(355, 4)).toBe(0);
    expect(getStationIndexFromAngle(5, 4)).toBe(0);
    expect(getStationIndexFromAngle(85, 4)).toBe(1);
    expect(getStationIndexFromAngle(95, 4)).toBe(1);
  });
});

describe('BroadcastHUD Component', () => {
  const sampleStation: Station = gta5Stations[0];
  const sampleCue: TrackCue = {
    start: 0,
    end: 200,
    song: 'The Plan',
    artist: 'Am$trad Billionaire',
    type: 'music',
  };

  it('renders station name, logo, genre tagline and frequency badge', () => {
    render(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={true}
        currentCue={sampleCue}
      />
    );

    expect(screen.getByText(sampleStation.name)).toBeInTheDocument();
    expect(screen.getByText(sampleStation.genre)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: sampleStation.name })).toHaveAttribute(
      'src',
      sampleStation.logoUrl
    );
  });

  it('renders song and artist cue when provided', () => {
    render(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={true}
        currentCue={sampleCue}
      />
    );

    expect(screen.getByText('The Plan')).toBeInTheDocument();
    expect(screen.getByText(/Am\$trad Billionaire/i)).toBeInTheDocument();
  });

  it('renders DJ show or commercial cue appropriately', () => {
    const adCue: TrackCue = {
      start: 10,
      end: 40,
      song: 'Ammu-Nation Commercial',
      artist: 'Commercial',
      type: 'ad',
    };

    const { rerender } = render(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={true}
        currentCue={adCue}
      />
    );

    expect(screen.getByText('Commercial Break')).toBeInTheDocument();

    const talkCue: TrackCue = {
      start: 50,
      end: 120,
      song: 'Chakra Attack Live',
      artist: 'Dr. Ray De Angelo Harris',
      type: 'talk',
    };

    rerender(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={true}
        currentCue={talkCue}
      />
    );

    expect(screen.getByText('Chakra Attack Live')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Ray De Angelo Harris/i)).toBeInTheDocument();
  });

  it('renders animated equalizer bars when isPlaying is true and idle when false', () => {
    const { rerender } = render(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={true}
        currentCue={sampleCue}
      />
    );

    const eq = screen.getByTestId('audio-equalizer');
    expect(eq).toHaveAttribute('data-playing', 'true');

    rerender(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={false}
        currentCue={sampleCue}
      />
    );

    expect(eq).toHaveAttribute('data-playing', 'false');
  });

  it('displays radio off state gracefully when station is null', () => {
    render(
      <BroadcastHUD
        station={null}
        isPlaying={false}
        currentCue={null}
      />
    );

    expect(screen.getByText('Radio Off')).toBeInTheDocument();
    expect(screen.getByText('Select Station')).toBeInTheDocument();
  });

  it('renders dynamic cover art alongside station logo when coverArtUrl is provided', () => {
    render(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={true}
        currentCue={sampleCue}
        coverArtUrl="https://example.com/hud-artwork.jpg"
      />
    );

    const stationLogo = screen.getByTestId('station-logo');
    expect(stationLogo).toBeInTheDocument();

    const hudCover = screen.getByTestId('hud-cover-art');
    expect(hudCover).toBeInTheDocument();
    expect(hudCover).toHaveAttribute('src', 'https://example.com/hud-artwork.jpg');

    const vinylBadge = screen.getByTestId('hud-vinyl-badge');
    expect(vinylBadge).toBeInTheDocument();
  });

  it('falls back to cue.coverArtUrl when coverArtUrl prop is omitted', () => {
    const cueWithCover: TrackCue = {
      ...sampleCue,
      coverArtUrl: 'https://example.com/cue-artwork.jpg',
    };

    render(
      <BroadcastHUD
        station={sampleStation}
        isPlaying={false}
        currentCue={cueWithCover}
      />
    );

    const hudCover = screen.getByTestId('hud-cover-art');
    expect(hudCover).toBeInTheDocument();
    expect(hudCover).toHaveAttribute('src', 'https://example.com/cue-artwork.jpg');
  });
});

describe('RadioWheel Component', () => {
  beforeEach(() => {
    if (typeof navigator !== 'undefined') {
      (navigator as any).vibrate = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 26 station badges for GTA V', () => {
    const handleSelect = vi.fn();
    render(
      <RadioWheel
        stations={gta5Stations}
        currentStation={gta5Stations[0]}
        onSelectStation={handleSelect}
        isPlaying={true}
      />
    );

    const badges = screen.getAllByRole('button');
    expect(badges.length).toBe(26);

    // Verify first station badge
    const firstBadge = screen.getByRole('button', { name: gta5Stations[0].name });
    expect(firstBadge).toHaveAttribute('aria-selected', 'true');

    // Verify other stations are rendered
    expect(screen.getByRole('button', { name: gta5Stations[1].name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: gta5Stations[25].name })).toBeInTheDocument();
  });

  it('renders all 11 station badges for GTA San Andreas', () => {
    const handleSelect = vi.fn();
    render(
      <RadioWheel
        stations={gtasaStations}
        currentStation={gtasaStations[0]}
        onSelectStation={handleSelect}
      />
    );

    const badges = screen.getAllByRole('button');
    expect(badges.length).toBe(11);
    expect(screen.getByRole('button', { name: gtasaStations[0].name })).toBeInTheDocument();
  });

  it('renders all 19 station badges for GTA IV', () => {
    const handleSelect = vi.fn();
    render(
      <RadioWheel
        stations={gta4Stations}
        currentStation={gta4Stations[0]}
        onSelectStation={handleSelect}
      />
    );

    const badges = screen.getAllByRole('button');
    expect(badges.length).toBe(19);
    expect(screen.getByRole('button', { name: gta4Stations[0].name })).toBeInTheDocument();
  });

  it('selects station on badge direct click', () => {
    const handleSelect = vi.fn();
    render(
      <RadioWheel
        stations={gta5Stations}
        currentStation={gta5Stations[0]}
        onSelectStation={handleSelect}
      />
    );

    const targetStation = gta5Stations[3];
    const targetBadge = screen.getByRole('button', { name: targetStation.name });
    fireEvent.click(targetBadge);

    expect(handleSelect).toHaveBeenCalledWith(targetStation);
  });

  it('supports desktop keyboard Q key hold and mousemove angle calculation', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <RadioWheel
        stations={gta5Stations}
        currentStation={gta5Stations[0]}
        onSelectStation={handleSelect}
      />
    );

    const wheelElement = container.querySelector('[data-testid="radio-wheel"]')!;
    expect(wheelElement).toBeInTheDocument();

    // Mock bounding client rect: center at (200, 200), width=400, height=400
    vi.spyOn(wheelElement, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Press 'Q' key down to enter hold mode
    fireEvent.keyDown(window, { key: 'q' });
    expect(wheelElement).toHaveAttribute('data-q-active', 'true');

    // Move mouse to right (dx=150, dy=0 relative to center 200, 200) -> clientX=350, clientY=200
    // Angle: Math.atan2(150, 0) = 90 deg. For 26 stations: slice = 360/26 = 13.846 deg -> index ~ 6.5 -> 7
    fireEvent.mouseMove(window, { clientX: 350, clientY: 200 });

    expect(handleSelect).toHaveBeenCalled();
    const selectedStation = handleSelect.mock.calls[0][0];
    expect(selectedStation).toBeDefined();

    // Releasing 'Q' exits Q mode
    fireEvent.keyUp(window, { key: 'q' });
    expect(wheelElement).toHaveAttribute('data-q-active', 'false');
  });

  it('ignores Q keydown when target is an input or textarea', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <div>
        <input data-testid="test-input" />
        <textarea data-testid="test-textarea" />
        <RadioWheel
          stations={gta5Stations}
          currentStation={gta5Stations[0]}
          onSelectStation={handleSelect}
        />
      </div>
    );

    const wheelElement = container.querySelector('[data-testid="radio-wheel"]')!;
    const inputElement = screen.getByTestId('test-input');
    const textareaElement = screen.getByTestId('test-textarea');

    // Press 'q' while focused on input
    fireEvent.keyDown(inputElement, { key: 'q' });
    expect(wheelElement).toHaveAttribute('data-q-active', 'false');

    // Press 'Q' while focused on textarea
    fireEvent.keyDown(textareaElement, { key: 'Q' });
    expect(wheelElement).toHaveAttribute('data-q-active', 'false');
  });

  it('supports mobile touch drag and triggers haptic tick feedback', () => {
    const handleSelect = vi.fn();
    const vibrateMock = vi.fn();
    navigator.vibrate = vibrateMock;

    const { container } = render(
      <RadioWheel
        stations={gta5Stations}
        currentStation={gta5Stations[0]}
        onSelectStation={handleSelect}
      />
    );

    const wheelElement = container.querySelector('[data-testid="radio-wheel"]')!;

    vi.spyOn(wheelElement, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 500,
      bottom: 500,
      width: 400,
      height: 400,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Center is (300, 300).
    // Touch start at Top: (300, 150) -> dx=0, dy=-150 -> index 0
    fireEvent.touchStart(wheelElement, {
      touches: [{ clientX: 300, clientY: 150 }],
    });

    // Touch drag to Bottom: (300, 450) -> dx=0, dy=150 -> angle 180 -> index 13
    fireEvent.touchMove(wheelElement, {
      touches: [{ clientX: 300, clientY: 450 }],
    });

    expect(handleSelect).toHaveBeenCalledWith(gta5Stations[13]);
    expect(vibrateMock).toHaveBeenCalledWith(10);

    // Touch end finishes drag
    fireEvent.touchEnd(wheelElement);
  });

  it('renders center BroadcastHUD inside the wheel', () => {
    render(
      <RadioWheel
        stations={gta5Stations}
        currentStation={gta5Stations[0]}
        onSelectStation={vi.fn()}
        isPlaying={true}
      />
    );

    expect(screen.getByTestId('broadcast-hud')).toBeInTheDocument();
    expect(screen.getByTestId('audio-equalizer')).toBeInTheDocument();
  });

  it('applies custom radius and badgeSize props when specified', () => {
    const { container } = render(
      <RadioWheel
        stations={gta5Stations}
        currentStation={gta5Stations[0]}
        onSelectStation={vi.fn()}
        radius={220}
        badgeSize={56}
      />
    );

    const firstBadge = container.querySelector('[data-station-index="0"]') as HTMLElement;
    expect(firstBadge).toBeInTheDocument();
    // Index 0 with radius 220 has y = -220
    expect(firstBadge.style.transform).toContain('-220px');
  });
});
