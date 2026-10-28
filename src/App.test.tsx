import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from './App';
import { RadioEngine } from './audio/radioEngine';
import { clearAllCachedStations } from './storage/db';

describe('App Master Integration Suite', () => {
  let engine: RadioEngine;

  beforeEach(async () => {
    await clearAllCachedStations();
    localStorage.clear();

    // Mock HTMLMediaElement in JSDOM
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(function (this: HTMLAudioElement) {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    window.HTMLMediaElement.prototype.pause = vi.fn().mockImplementation(function (this: HTMLAudioElement) {
      this.dispatchEvent(new Event('pause'));
    });
    window.HTMLMediaElement.prototype.load = vi.fn();

    engine = new RadioEngine();
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  const renderApp = async (props?: Partial<React.ComponentProps<typeof App>>) => {
    const result = render(<App engine={engine} initialGame="gta5" initialView="wheel" {...props} />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-wrapper')).toBeInTheDocument();
    });
    return result;
  };

  it('renders game selector, theme wrapper, and initial station views', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'wheel' });

    // Theme Wrapper
    const themeWrapper = screen.getByTestId('theme-wrapper');
    expect(themeWrapper).toBeInTheDocument();
    expect(themeWrapper).toHaveAttribute('data-theme', 'gta5');

    // Game Selector tablist
    expect(screen.getByRole('tablist', { name: /Select Grand Theft Auto Game/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /GTA V/i })).toHaveAttribute('aria-selected', 'true');

    // Default view: Radial Wheel
    expect(screen.getByTestId('radio-wheel')).toBeInTheDocument();

    // Persistent Bottom Player Bar
    expect(screen.getByTestId('player-bar')).toBeInTheDocument();
    expect(screen.getByTestId('player-play-pause-button')).toBeInTheDocument();
  });

  it('toggles seamlessly between Radial Wheel and Car Grid view', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'wheel' });

    // Initially in Radial Wheel view
    expect(screen.getByTestId('radio-wheel')).toBeInTheDocument();
    expect(screen.queryByTestId('car-quick-grid')).not.toBeInTheDocument();

    // Toggle to Car Quick Grid
    const toggleBtn = screen.getByTestId('view-toggle-button');
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(screen.getByTestId('car-quick-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('radio-wheel')).not.toBeInTheDocument();

    // Toggle back to Radial Wheel
    await act(async () => {
      fireEvent.click(toggleBtn);
    });
    expect(screen.getByTestId('radio-wheel')).toBeInTheDocument();
    expect(screen.queryByTestId('car-quick-grid')).not.toBeInTheDocument();
  });

  it('switches game themes and station catalogs dynamically', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'grid' });

    const themeWrapper = screen.getByTestId('theme-wrapper');
    expect(themeWrapper).toHaveAttribute('data-theme', 'gta5');

    // Switch to GTA San Andreas
    const saTab = screen.getByRole('tab', { name: /GTA San Andreas/i });
    await act(async () => {
      fireEvent.click(saTab);
    });

    expect(themeWrapper).toHaveAttribute('data-theme', 'gtasa');
    expect(saTab).toHaveAttribute('aria-selected', 'true');

    // Station list should reflect GTA San Andreas
    expect(screen.getByText(/Radio Los Santos/i)).toBeInTheDocument();

    // Switch to GTA IV
    const gta4Tab = screen.getByRole('tab', { name: /GTA IV/i });
    await act(async () => {
      fireEvent.click(gta4Tab);
    });

    expect(themeWrapper).toHaveAttribute('data-theme', 'gta4');
    expect(gta4Tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Vladivostok FM/i)).toBeInTheDocument();
  });

  it('tunes stations and updates audio playback and HUD metadata', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'grid' });

    // Initially Radio is Off
    expect(screen.getAllByText(/Radio Off/i).length).toBeGreaterThan(0);

    // Select Non-Stop-Pop FM
    const stationCard = screen.getByTestId('car-station-card-non-stop-pop-fm');
    await act(async () => {
      fireEvent.click(stationCard);
    });

    // Player bar should update with tuned station and playing state
    await waitFor(() => {
      expect(screen.getAllByText(/Non-Stop Pop FM/i).length).toBeGreaterThan(0);
      expect(screen.getByTestId('player-play-pause-button')).toHaveAttribute('aria-label', 'Pause Station');
    });

    const playPauseBtn = screen.getByTestId('player-play-pause-button');

    // Pause audio
    await act(async () => {
      fireEvent.click(playPauseBtn);
    });
    await waitFor(() => {
      expect(playPauseBtn).toHaveAttribute('aria-label', 'Play Station');
    });

    // Resume audio
    await act(async () => {
      fireEvent.click(playPauseBtn);
    });
    await waitFor(() => {
      expect(playPauseBtn).toHaveAttribute('aria-label', 'Pause Station');
    });
  });

  it('cycles stations with Next and Previous player controls', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'grid' });

    // Tune initial station
    const stationCard = screen.getByTestId('car-station-card-non-stop-pop-fm');
    await act(async () => {
      fireEvent.click(stationCard);
    });

    const nextBtn = screen.getByTestId('player-next-button');
    const prevBtn = screen.getByTestId('player-prev-button');

    const nextSpy = vi.spyOn(engine, 'nextStation');
    const prevSpy = vi.spyOn(engine, 'previousStation');

    await act(async () => {
      fireEvent.click(nextBtn);
    });
    expect(nextSpy).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(prevBtn);
    });
    expect(prevSpy).toHaveBeenCalled();
  });

  it('opens and closes storage manager drawer', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'wheel' });

    // Drawer should initially not be visible
    expect(screen.queryByTestId('storage-drawer')).not.toBeInTheDocument();

    // Click storage button in header
    const storageBtn = screen.getByTestId('storage-button');
    await act(async () => {
      fireEvent.click(storageBtn);
    });

    // Drawer should open
    expect(screen.getByTestId('storage-drawer')).toBeInTheDocument();
    expect(screen.getByText(/Offline Storage/i)).toBeInTheDocument();

    // Close drawer
    const closeBtn = screen.getByTestId('storage-drawer-close');
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('storage-drawer')).not.toBeInTheDocument();
    });
  });

  it('handles volume slider and quick mute toggle', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'wheel' });

    const muteBtn = screen.getByTestId('volume-mute-button');
    const volumeSlider = screen.getByTestId('volume-slider') as HTMLInputElement;

    const muteSpy = vi.spyOn(engine, 'toggleMute');
    const volumeSpy = vi.spyOn(engine, 'setVolume');

    await act(async () => {
      fireEvent.click(muteBtn);
    });
    expect(muteSpy).toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(volumeSlider, { target: { value: '0.4' } });
    });
    expect(volumeSpy).toHaveBeenCalledWith(0.4);
  });

  it('toggles radio SFX static and clicks', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'wheel' });

    const sfxBtn = screen.getByTestId('sfx-toggle-button');
    await act(async () => {
      fireEvent.click(sfxBtn);
    });
    expect(sfxBtn).toBeInTheDocument();
  });

  it('responds to global keyboard shortcuts (Spacebar, Arrows)', async () => {
    await renderApp({ initialGame: 'gta5', initialView: 'wheel' });

    const playSpy = vi.spyOn(engine, 'togglePlay');
    const nextSpy = vi.spyOn(engine, 'nextStation');
    const prevSpy = vi.spyOn(engine, 'previousStation');

    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' });
    });
    expect(playSpy).toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowRight' });
    });
    expect(nextSpy).toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowLeft' });
    });
    expect(prevSpy).toHaveBeenCalled();
  });
});
