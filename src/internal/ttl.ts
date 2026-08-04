export interface StoredValue<T> {
  value: T;
  expiresAt?: number;
}

export function createStoredValue<T>(value: T, ttl?: number): string {
  const stored: StoredValue<T> = {
    value,
    expiresAt: ttl ? Date.now() + ttl : undefined,
  };
  return JSON.stringify(stored);
}

export function parseStoredValue<T>(raw: string): { value: T; expired: boolean } | null {
  try {
    const stored = JSON.parse(raw) as StoredValue<T>;

    if (stored.expiresAt !== undefined && Date.now() > stored.expiresAt) {
      return { value: stored.value, expired: true };
    }

    return { value: stored.value, expired: false };
  } catch {
    return null;
  }
}

export function isExpired(raw: string): boolean {
  try {
    const stored = JSON.parse(raw) as StoredValue<unknown>;
    if (stored.expiresAt === undefined) return false;
    return Date.now() > stored.expiresAt;
  } catch {
    return true;
  }
}

export function getRemainingTTL(raw: string): number | null {
  try {
    const stored = JSON.parse(raw) as StoredValue<unknown>;
    if (stored.expiresAt === undefined) return null;
    return Math.max(0, stored.expiresAt - Date.now());
  } catch {
    return null;
  }
}
