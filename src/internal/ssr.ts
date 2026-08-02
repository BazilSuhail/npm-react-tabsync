import { useSyncExternalStore, useCallback } from 'react';

const isBrowser = typeof window !== 'undefined';

export function subscribe(
  callback: () => void,
  onStorageMessage?: (e: StorageEvent) => void
): () => void {
  if (!isBrowser) return () => {};

  const handler = (e: StorageEvent) => {
    if (onStorageMessage) onStorageMessage(e);
    callback();
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function getSnapshot(storageKey: string): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function getServerSnapshot(): string | null {
  return null;
}

/**
 * SSR-safe wrapper around useSyncExternalStore for localStorage.
 */
export function useSyncedStorage(
  key: string,
  prefix: string
): [string | null, (raw: string | null) => void] {
  const storageKey = `${prefix}${key}`;

  const raw = useSyncExternalStore(
    useCallback(
      (callback: () => void) => subscribe(callback),
      [key]
    ),
    useCallback(() => getSnapshot(storageKey), [storageKey]),
    getServerSnapshot
  );

  return [raw, useCallback((val: string | null) => {
    if (!isBrowser) return;
    try {
      if (val === null) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, val);
      }
    } catch {
      // fail silently
    }
  }, [storageKey])];
}
