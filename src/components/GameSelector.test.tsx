import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameSelector } from './GameSelector';
import { GAMES } from '../data/catalog';

describe('GameSelector Component', () => {
  it('renders all three games with their titles', () => {
    const handleSelect = vi.fn();
    render(<GameSelector currentGame="gta5" onSelectGame={handleSelect} />);

    expect(screen.getByText(/GTA V/i)).toBeInTheDocument();
    expect(screen.getByText(/San Andreas/i)).toBeInTheDocument();
    expect(screen.getByText(/GTA IV/i)).toBeInTheDocument();
  });

  it('indicates active tab via aria-selected and active styling', () => {
    const handleSelect = vi.fn();
    const { rerender } = render(
      <GameSelector currentGame="gta5" onSelectGame={handleSelect} />
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    const gta5Tab = screen.getByRole('tab', { name: /Grand Theft Auto V|GTA V/i });
    const gtasaTab = screen.getByRole('tab', { name: /San Andreas/i });
    const gta4Tab = screen.getByRole('tab', { name: /GTA IV/i });

    expect(gta5Tab).toHaveAttribute('aria-selected', 'true');
    expect(gtasaTab).toHaveAttribute('aria-selected', 'false');
    expect(gta4Tab).toHaveAttribute('aria-selected', 'false');

    rerender(<GameSelector currentGame="gtasa" onSelectGame={handleSelect} />);
    expect(gta5Tab).toHaveAttribute('aria-selected', 'false');
    expect(gtasaTab).toHaveAttribute('aria-selected', 'true');
    expect(gta4Tab).toHaveAttribute('aria-selected', 'false');
  });

  it('triggers onSelectGame with correct game ID on click', () => {
    const handleSelect = vi.fn();
    render(<GameSelector currentGame="gta5" onSelectGame={handleSelect} />);

    const gtasaTab = screen.getByRole('tab', { name: /San Andreas/i });
    fireEvent.click(gtasaTab);
    expect(handleSelect).toHaveBeenCalledWith('gtasa');

    const gta4Tab = screen.getByRole('tab', { name: /GTA IV/i });
    fireEvent.click(gta4Tab);
    expect(handleSelect).toHaveBeenCalledWith('gta4');
  });

  it('accepts currentGame as GameMetadata object or string GameId', () => {
    const handleSelect = vi.fn();
    const { rerender } = render(
      <GameSelector currentGame={GAMES.gta4} onSelectGame={handleSelect} />
    );

    const gta4Tab = screen.getByRole('tab', { name: /GTA IV/i });
    expect(gta4Tab).toHaveAttribute('aria-selected', 'true');

    rerender(<GameSelector currentGame="gta5" onSelectGame={handleSelect} />);
    const gta5Tab = screen.getByRole('tab', { name: /Grand Theft Auto V|GTA V/i });
    expect(gta5Tab).toHaveAttribute('aria-selected', 'true');
  });

  it('displays station count and release year badges for each game', () => {
    render(<GameSelector currentGame="gta5" onSelectGame={vi.fn()} />);

    // Station counts from catalog
    expect(
      screen.getByText(new RegExp(`${GAMES.gta5.stations.length}\\s*Stations`, 'i'))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${GAMES.gtasa.stations.length}\\s*Stations`, 'i'))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${GAMES.gta4.stations.length}\\s*Stations`, 'i'))
    ).toBeInTheDocument();

    // Release years
    expect(screen.getByText('2013')).toBeInTheDocument();
    expect(screen.getByText('2004')).toBeInTheDocument();
    expect(screen.getByText('2008')).toBeInTheDocument();
  });

  it('has role="tablist" container for accessibility', () => {
    render(<GameSelector currentGame="gta5" onSelectGame={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
