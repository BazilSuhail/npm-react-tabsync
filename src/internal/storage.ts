const isBrowser = typeof window !== 'undefined';

export function readStorage(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked — fail silently
  }
}

export function removeStorage(key: string): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // fail silently
  }
}
