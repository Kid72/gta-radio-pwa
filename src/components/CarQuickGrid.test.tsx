import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CarQuickGrid } from './CarQuickGrid';
import { gta5Stations } from '../data/catalog';
import { Station, TrackCue } from '../types/radio';

describe('CarQuickGrid Component', () => {
  const sampleStations: Station[] = gta5Stations.slice(0, 4);
  const currentStation = sampleStations[0];

  beforeEach(() => {
    vi.clearAllMocks();
    navigator.vibrate = vi.fn();
  });

  it('renders all stations with logo, name, genre, and frequency badge', () => {
    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedKeys={new Set()}
        downloadingKeys={new Map()}
        onSelectStation={vi.fn()}
        onDownloadStation={vi.fn()}
      />
    );

    sampleStations.forEach((station) => {
      expect(screen.getByText(station.name)).toBeInTheDocument();
      const logo = screen.getByAltText(station.name);
      expect(logo).toHaveAttribute('src', station.logoUrl);
    });

    // Check frequency or genre rendering
    const genreElements = screen.getAllByText(sampleStations[0].genre, { exact: false });
    expect(genreElements.length).toBeGreaterThan(0);
  });

  it('has driver-friendly large touch targets (min height 72px)', () => {
    const { container } = render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedKeys={new Set()}
        downloadingKeys={new Map()}
        onSelectStation={vi.fn()}
        onDownloadStation={vi.fn()}
      />
    );

    const cards = container.querySelectorAll('[data-testid^="car-station-card-"]');
    expect(cards.length).toBe(sampleStations.length);
    cards.forEach((card) => {
      // Must contain driver-friendly min-h class
      const hasDriverHeight =
        card.className.includes('min-h-[72px]') ||
        card.className.includes('min-h-[80px]') ||
        card.className.includes('min-h-[88px]') ||
        card.className.includes('h-24') ||
        card.className.includes('h-28');
      expect(hasDriverHeight).toBe(true);
    });
  });

  it('tunes station on 1-tap card click and triggers haptic tick', () => {
    const handleSelect = vi.fn();
    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedKeys={new Set()}
        downloadingKeys={new Map()}
        onSelectStation={handleSelect}
        onDownloadStation={vi.fn()}
      />
    );

    const targetStation = sampleStations[1];
    const targetCard = screen.getByTestId(`car-station-card-${targetStation.id}`);

    fireEvent.click(targetCard);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(targetStation);
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('supports onSelect alias prop from brief', () => {
    const handleSelect = vi.fn();
    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={null}
        onSelect={handleSelect}
      />
    );

    const targetStation = sampleStations[2];
    const targetCard = screen.getByTestId(`car-station-card-${targetStation.id}`);

    fireEvent.click(targetCard);

    expect(handleSelect).toHaveBeenCalledWith(targetStation);
  });

  it('tunes station on keyboard Enter or Space press', () => {
    const handleSelect = vi.fn();
    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        onSelectStation={handleSelect}
      />
    );

    const targetStation = sampleStations[1];
    const targetCard = screen.getByTestId(`car-station-card-${targetStation.id}`);

    fireEvent.keyDown(targetCard, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledWith(targetStation);

    fireEvent.keyDown(targetCard, { key: ' ' });
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });

  it('highlights the active station and shows live track preview with equalizer when playing', () => {
    const activeCue: TrackCue = {
      start: 0,
      end: 200,
      song: 'Midnight City',
      artist: 'M83',
      type: 'music',
    };

    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        isPlaying={true}
        currentCue={activeCue}
        onSelectStation={vi.fn()}
      />
    );

    const activeCard = screen.getByTestId(`car-station-card-${currentStation.id}`);
    expect(activeCard).toHaveAttribute('data-active', 'true');

    // Live track preview
    expect(screen.getByText('Midnight City')).toBeInTheDocument();
    expect(screen.getByText(/M83/)).toBeInTheDocument();

    // Equalizer bars present
    const eqBars = activeCard.querySelectorAll('[data-testid="equalizer-bar"]');
    expect(eqBars.length).toBeGreaterThan(0);
  });

  it('shows download button and triggers download without tuning station (stopPropagation)', () => {
    const handleSelect = vi.fn();
    const handleDownload = vi.fn();

    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedKeys={new Set()}
        downloadingKeys={new Map()}
        onSelectStation={handleSelect}
        onDownloadStation={handleDownload}
      />
    );

    const targetStation = sampleStations[1];
    const downloadBtn = screen.getByTestId(`download-button-${targetStation.id}`);

    fireEvent.click(downloadBtn);

    expect(handleDownload).toHaveBeenCalledTimes(1);
    expect(handleDownload).toHaveBeenCalledWith(targetStation);
    // Crucial: clicking download must NOT tune the station!
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('shows progress spinner and percentage when station is downloading', () => {
    const downloadingMap = new Map<string, number>();
    downloadingMap.set(`${sampleStations[1].gameId}:${sampleStations[1].id}`, 68);

    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedKeys={new Set()}
        downloadingKeys={downloadingMap}
        onSelectStation={vi.fn()}
        onDownloadStation={vi.fn()}
      />
    );

    const progressEl = screen.getByTestId(`downloading-${sampleStations[1].id}`);
    expect(progressEl).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
  });

  it('shows cached badge when station is offline ready and allows deletion', () => {
    const cached = new Set<string>([`${sampleStations[1].gameId}:${sampleStations[1].id}`]);
    const handleDelete = vi.fn();
    const handleSelect = vi.fn();

    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedKeys={cached}
        onSelectStation={handleSelect}
        onDeleteStation={handleDelete}
      />
    );

    const cachedBadge = screen.getByTestId(`cached-badge-${sampleStations[1].id}`);
    expect(cachedBadge).toBeInTheDocument();

    // Clicking cached badge triggers delete without selecting station
    fireEvent.click(cachedBadge);

    expect(handleDelete).toHaveBeenCalledTimes(1);
    expect(handleDelete).toHaveBeenCalledWith(sampleStations[1]);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('supports cachedIds array and simple station id keys', () => {
    const cachedArray = [sampleStations[0].id];
    render(
      <CarQuickGrid
        stations={sampleStations}
        currentStation={currentStation}
        cachedIds={cachedArray}
        onSelectStation={vi.fn()}
      />
    );

    expect(screen.getByTestId(`cached-badge-${sampleStations[0].id}`)).toBeInTheDocument();
  });
});
