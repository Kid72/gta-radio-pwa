import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InstallPrompt } from './InstallPrompt';

describe('InstallPrompt Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders nothing by default if not iOS and no beforeinstallprompt event fired', () => {
    const { container } = render(<InstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when forceShow is true', () => {
    render(<InstallPrompt forceShow={true} />);
    expect(screen.getByTestId('install-prompt')).toBeInTheDocument();
    expect(screen.getByText(/Install GTA Radio/i)).toBeInTheDocument();
  });

  it('renders iOS instructions when running on iOS device', () => {
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });

    render(<InstallPrompt forceShow={true} />);
    expect(screen.getByTestId('install-ios-instructions')).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();

    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
  });

  it('handles beforeinstallprompt event on Android/Desktop', async () => {
    render(<InstallPrompt />);

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt') as any;
    event.prompt = promptMock;
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    act(() => {
      window.dispatchEvent(event);
    });

    const installBtn = await screen.findByTestId('install-button');
    expect(installBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(promptMock).toHaveBeenCalled();
  });

  it('dismisses when close button is clicked and remembers dismissal', () => {
    const onClose = vi.fn();
    render(<InstallPrompt forceShow={true} onClose={onClose} />);

    const closeBtn = screen.getByTestId('install-prompt-close');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem('gta-radio-install-dismissed')).toBe('true');
  });
});
