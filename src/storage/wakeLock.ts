export async function acquireWakeLock(): Promise<() => void> {
  let sentinel: any = null;
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock) {
    try {
      sentinel = await (navigator as any).wakeLock.request('screen');
    } catch (err) {
      console.warn('Screen Wake Lock error:', err);
    }
  }

  return () => {
    if (sentinel) {
      sentinel.release().catch(() => {});
      sentinel = null;
    }
  };
}

export async function isStoragePersistent(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}
