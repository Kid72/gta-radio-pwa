import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeWrapper } from './ThemeWrapper';
import { GAMES } from '../data/catalog';

describe('ThemeWrapper Component', () => {
  it('renders children correctly', () => {
    render(
      <ThemeWrapper game="gta5">
        <div data-testid="child-element">GTA Content</div>
      </ThemeWrapper>
    );
    expect(screen.getByTestId('child-element')).toBeInTheDocument();
    expect(screen.getByText('GTA Content')).toBeInTheDocument();
  });

  it('applies the authentic theme class and data-theme attribute for GTA V', () => {
    render(
      <ThemeWrapper game="gta5">
        <div>Content</div>
      </ThemeWrapper>
    );
    const wrapper = screen.getByTestId('theme-wrapper');
    expect(wrapper).toHaveClass('theme-gta5');
    expect(wrapper).toHaveAttribute('data-theme', 'gta5');
    expect(wrapper.style.getPropertyValue('--accent-color')).toBe('#4ae891');
    expect(wrapper.style.getPropertyValue('--theme-font')).toContain('Oswald');
  });

  it('applies theme class and CSS variables for GTA San Andreas', () => {
    render(
      <ThemeWrapper game="gtasa">
        <div>Content</div>
      </ThemeWrapper>
    );
    const wrapper = screen.getByTestId('theme-wrapper');
    expect(wrapper).toHaveClass('theme-gtasa');
    expect(wrapper).toHaveAttribute('data-theme', 'gtasa');
    expect(wrapper.style.getPropertyValue('--accent-color')).toBe('#f59e0b');
    expect(wrapper.style.getPropertyValue('--theme-font')).toContain('Pricedown');
  });

  it('applies theme class and CSS variables for GTA IV', () => {
    render(
      <ThemeWrapper game="gta4">
        <div>Content</div>
      </ThemeWrapper>
    );
    const wrapper = screen.getByTestId('theme-wrapper');
    expect(wrapper).toHaveClass('theme-gta4');
    expect(wrapper).toHaveAttribute('data-theme', 'gta4');
    expect(wrapper.style.getPropertyValue('--accent-color')).toBe('#eab308');
    expect(wrapper.style.getPropertyValue('--theme-font')).toContain('Bank Gothic');
  });

  it('sets authentic font family custom property containing Pricedown for SA and Bank Gothic for IV', () => {
    const { rerender } = render(
      <ThemeWrapper game="gtasa">
        <div>SA</div>
      </ThemeWrapper>
    );
    let wrapper = screen.getByTestId('theme-wrapper');
    expect(wrapper.style.getPropertyValue('--theme-font')).toContain('Pricedown');

    rerender(
      <ThemeWrapper game="gta4">
        <div>GTA4</div>
      </ThemeWrapper>
    );
    wrapper = screen.getByTestId('theme-wrapper');
    expect(wrapper.style.getPropertyValue('--theme-font')).toContain('Bank Gothic');
  });

  it('accepts GameMetadata object as game prop', () => {
    render(
      <ThemeWrapper game={GAMES.gtasa}>
        <div>Content</div>
      </ThemeWrapper>
    );
    const wrapper = screen.getByTestId('theme-wrapper');
    expect(wrapper).toHaveClass('theme-gtasa');
  });

  it('renders wallpaper backdrop and dark overlay when showWallpaper is true', () => {
    render(
      <ThemeWrapper game="gta5" showWallpaper={true}>
        <div>Content</div>
      </ThemeWrapper>
    );
    const wallpaper = screen.getByTestId('theme-wallpaper');
    expect(wallpaper).toBeInTheDocument();
    expect(wallpaper.style.backgroundImage).toContain('/wallpapers/gta5.webp');

    const overlay = screen.getByTestId('theme-overlay');
    expect(overlay).toBeInTheDocument();
  });

  it('hides wallpaper backdrop when showWallpaper is false', () => {
    render(
      <ThemeWrapper game="gta5" showWallpaper={false}>
        <div>Content</div>
      </ThemeWrapper>
    );
    expect(screen.queryByTestId('theme-wallpaper')).not.toBeInTheDocument();
  });
});
