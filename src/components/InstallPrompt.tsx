import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Car } from 'lucide-react';

export interface InstallPromptProps {
  forceShow?: boolean;
  onClose?: () => void;
  className?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'gta-radio-install-dismissed';

function isDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMedia =
    typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isStandaloneMedia || isIosStandalone;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isApple = /iPhone|iPad|iPod/i.test(ua);
  const isMacWithTouch =
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  return isApple || isMacWithTouch;
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({
  forceShow = false,
  onClose,
  className = '',
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState<boolean>(() => isIOSDevice());
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (forceShow) return true;
    if (isStandaloneMode()) return false;
    const dismissed = isDismissed();
    return isIOSDevice() && !dismissed;
  });

  useEffect(() => {
    // If running already in standalone mode and not forced, hide prompt
    if (isStandaloneMode() && !forceShow) {
      setIsVisible(false);
      return;
    }

    const dismissed = isDismissed();
    const isIosUser = isIOSDevice();
    setIsIOS(isIosUser);

    if (forceShow) {
      setIsVisible(true);
      return;
    }

    if (isIosUser && !dismissed) {
      setIsVisible(true);
    }

    // Android / Chromium beforeinstallprompt handler
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [forceShow]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore localStorage write failures in private browsing
    }
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsVisible(false);
        try {
          localStorage.setItem(STORAGE_KEY, 'true');
        } catch {}
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
  }, [deferredPrompt]);

  if (!isVisible && !forceShow) {
    return null;
  }

  // Docked banner, not an overlay: it lives between the station viewport and
  // the player bar, so it can never cover the tuner/wheel on small screens.
  return (
    <div
      data-testid="install-prompt"
      role="region"
      aria-label="Install GTA Radio Application"
      className={`relative z-20 flex-shrink-0 w-full border-t border-white/10 bg-black/85 backdrop-blur-2xl text-white ${className}`}
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-6">
        <div className="hidden sm:flex flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-black border border-emerald-500/40 items-center justify-center text-emerald-400">
          <Car className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[11px] sm:text-sm font-bold tracking-wide uppercase truncate">
              Install GTA Radio
            </h3>
            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold tracking-wider whitespace-nowrap">
              CarPlay Ready
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 truncate">
            {isIOS
              ? 'Share → Add to Home Screen for lock screen & wheel controls'
              : 'Lock screen controls & steering wheel buttons'}
          </p>
        </div>

        {!isIOS && (
          <button
            onClick={handleInstallClick}
            data-testid="install-button"
            className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-[11px] uppercase tracking-wider transition-all active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>Install</span>
          </button>
        )}

        <button
          onClick={handleDismiss}
          data-testid="install-prompt-close"
          aria-label={isIOS ? 'Dismiss install prompt' : 'Later'}
          title="Later"
          className="flex-shrink-0 inline-flex items-center justify-center min-w-11 min-h-11 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Platform instructions stay available to assistive tech / larger screens */}
      {isIOS ? (
        <div data-testid="install-ios-instructions" className="hidden">
          Tap Safari's Share button, then Add to Home Screen.
        </div>
      ) : (
        <div data-testid="install-android-instructions" className="hidden">
          Install to home screen for fullscreen driver dashboard and offline caching.
        </div>
      )}
    </div>
  );
};
