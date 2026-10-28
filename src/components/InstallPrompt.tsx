import React, { useState, useEffect, useCallback } from 'react';
import { Share, PlusSquare, Download, X, Car, Sparkles } from 'lucide-react';

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

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
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
    const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
    return isIOSDevice() && !dismissed;
  });

  useEffect(() => {
    // If running already in standalone mode and not forced, hide prompt
    if (isStandaloneMode() && !forceShow) {
      setIsVisible(false);
      return;
    }

    const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
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

  return (
    <div
      data-testid="install-prompt"
      role="banner"
      aria-label="Install GTA Radio Application"
      className={`fixed bottom-20 sm:bottom-24 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-black/90 backdrop-blur-2xl border border-white/20 rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.85)] text-white animate-in fade-in slide-in-from-bottom-4 duration-300 ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-black border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(74,232,145,0.3)]">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold tracking-wide uppercase">Install GTA Radio</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold tracking-wider">
                CarPlay Ready
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Unlock lock screen controls & vehicle steering wheel buttons
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          data-testid="install-prompt-close"
          aria-label="Dismiss install prompt"
          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Platform Instructions */}
      {isIOS ? (
        <div data-testid="install-ios-instructions" className="mt-3 pt-3 border-t border-white/10 text-xs text-neutral-300 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px]">
              1
            </span>
            <span>
              Tap Safari's <Share className="inline w-3.5 h-3.5 text-sky-400 mx-1 align-baseline" /> <strong>Share</strong> button below
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px]">
              2
            </span>
            <span>
              Select <PlusSquare className="inline w-3.5 h-3.5 text-emerald-400 mx-1 align-baseline" /> <strong>Add to Home Screen</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>Enables background commute audio & full CarPlay integration</span>
          </div>
        </div>
      ) : (
        <div data-testid="install-android-instructions" className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2.5">
          <p className="text-xs text-neutral-300">
            Install to home screen for fullscreen driver dashboard and offline caching.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              data-testid="install-button"
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>Install PWA</span>
            </button>
            <button
              onClick={handleDismiss}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white text-xs font-semibold transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
