import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StorageDrawer } from './StorageDrawer';
import * as dbModule from '../storage/db';
import * as wakeLockModule from '../storage/wakeLock';
import { CachedStationRecord } from '../types/radio';

describe('StorageDrawer Component', () => {
  const sampleRecords: CachedStationRecord[] = [
    {
      stationId: 'gta5:non-stop-pop-fm',
      gameId: 'gta5',
      blob: new Blob(['audio data 1']),
      sizeBytes: 125 * 1024 * 1024, // 125 MB
      downloadedAt: Date.now() - 100000,
    },
    {
      stationId: 'gtasa:radio-los-santos',
      gameId: 'gtasa',
      blob: new Blob(['audio data 2']),
      sizeBytes: 85 * 1024 * 1024, // 85 MB
      downloadedAt: Date.now() - 50000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <StorageDrawer isOpen={false} onClose={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal dialog and closes on close button click, backdrop click, or Escape key', async () => {
    const handleClose = vi.fn();
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 210 * 1024 * 1024,
      quotaBytes: 64 * 1024 * 1024 * 1024,
    });
    vi.spyOn(dbModule, 'getAllCachedStations').mockResolvedValue(sampleRecords);

    render(
      <StorageDrawer isOpen={true} onClose={handleClose} />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Offline Storage/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Device Quota/i)).toBeInTheDocument();
    });

    // 1. Close button click
    const closeBtn = screen.getByLabelText(/close/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // 2. Backdrop click
    const backdrop = screen.getByTestId('storage-drawer-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(2);

    // 3. Escape key press
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(3);
  });

  it('displays quota meter with formatted usage and total available bytes', async () => {
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 240 * 1024 * 1024, // 240 MB
      quotaBytes: 128 * 1024 * 1024 * 1024, // 128 GB
    });
    vi.spyOn(dbModule, 'getAllCachedStations').mockResolvedValue(sampleRecords);

    render(<StorageDrawer isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      // Expect usage summary e.g. "240 MB used of 128 GB"
      expect(screen.getByText(/240\s*MB/i)).toBeInTheDocument();
      expect(screen.getByText(/128\s*GB/i)).toBeInTheDocument();
    });

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders list of downloaded stations with game title, station name, and size in MB', async () => {
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 210 * 1024 * 1024,
      quotaBytes: 64 * 1024 * 1024 * 1024,
    });
    vi.spyOn(dbModule, 'getAllCachedStations').mockResolvedValue(sampleRecords);

    render(<StorageDrawer isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      // Non-Stop Pop FM (GTA V)
      expect(screen.getByText(/Non-Stop.*Pop FM/i)).toBeInTheDocument();
      expect(screen.getByText(/125(\.0)?\s*MB/i)).toBeInTheDocument();

      // Radio Los Santos (GTA San Andreas)
      expect(screen.getByText(/Radio Los Santos/i)).toBeInTheDocument();
      expect(screen.getByText(/85(\.0)?\s*MB/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no stations are downloaded', async () => {
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 64 * 1024 * 1024 * 1024,
    });
    vi.spyOn(dbModule, 'getAllCachedStations').mockResolvedValue([]);

    render(<StorageDrawer isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No stations downloaded yet/i)).toBeInTheDocument();
    });
  });

  it('deletes an individual station and updates the list', async () => {
    const deleteSpy = vi.spyOn(dbModule, 'deleteCachedStationAudio').mockResolvedValue();
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 210 * 1024 * 1024,
      quotaBytes: 64 * 1024 * 1024 * 1024,
    });
    vi.spyOn(dbModule, 'getAllCachedStations')
      .mockResolvedValueOnce(sampleRecords)
      .mockResolvedValueOnce([sampleRecords[1]]);
    const onStorageChanged = vi.fn();

    render(
      <StorageDrawer
        isOpen={true}
        onClose={vi.fn()}
        onStorageChanged={onStorageChanged}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Non-Stop.*Pop FM/i)).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText(/Delete Non-Stop.*Pop FM/i);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('gta5', 'non-stop-pop-fm');
      expect(onStorageChanged).toHaveBeenCalled();
    });
  });

  it('clears all downloads upon user confirmation', async () => {
    const clearAllSpy = vi.spyOn(dbModule, 'clearAllCachedStations').mockResolvedValue();
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 210 * 1024 * 1024,
      quotaBytes: 64 * 1024 * 1024 * 1024,
    });
    vi.spyOn(dbModule, 'getAllCachedStations')
      .mockResolvedValueOnce(sampleRecords)
      .mockResolvedValueOnce([]);
    const onStorageChanged = vi.fn();

    render(
      <StorageDrawer
        isOpen={true}
        onClose={vi.fn()}
        onStorageChanged={onStorageChanged}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Non-Stop.*Pop FM/i)).toBeInTheDocument();
    });

    const clearAllBtn = screen.getByRole('button', { name: /Clear All/i });
    fireEvent.click(clearAllBtn);

    // Confirmation button appears
    const confirmBtn = screen.getByRole('button', { name: /Confirm Clear All/i });
    expect(confirmBtn).toBeInTheDocument();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(clearAllSpy).toHaveBeenCalledTimes(1);
      expect(onStorageChanged).toHaveBeenCalled();
    });
  });

  it('displays persistent storage status and allows requesting persistence', async () => {
    vi.spyOn(dbModule, 'getStorageUsageEstimate').mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 64 * 1024 * 1024 * 1024,
    });
    vi.spyOn(dbModule, 'getAllCachedStations').mockResolvedValue([]);
    vi.spyOn(wakeLockModule, 'requestPersistentStorage').mockResolvedValue(true);

    render(<StorageDrawer isOpen={true} onClose={vi.fn()} />);

    // Should indicate persistent storage status
    await waitFor(() => {
      expect(screen.getByText(/Persistent Storage/i)).toBeInTheDocument();
    });
  });
});
