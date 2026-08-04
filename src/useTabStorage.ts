import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorage, writeStorage, removeStorage } from './internal/storage';
import type { SetValue, UseTabStorageOptions } from './types';

const DEFAULT_PREFIX = 'rts:';

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultDeserialize(raw: string): any {
  return JSON.parse(raw);
}

interface StoredEnvelope {
  value: string;
  expiresAt?: number;
}

function wrapWithTTL<T>(value: T, ttl: number, serialize: (v: T) => string): string {
  const envelope: StoredEnvelope = {
    value: serialize(value),
    expiresAt: Date.now() + ttl,
  };
  return JSON.stringify(envelope);
}

function unwrapWithTTL<T>(raw: string, deserialize: (s: string) => T): { value: T; expired: boolean } | null {
  try {
    const envelope = JSON.parse(raw) as StoredEnvelope;
    if (envelope.expiresAt !== undefined && Date.now() > envelope.expiresAt) {
      return { value: deserialize(envelope.value), expired: true };
    }
    return { value: deserialize(envelope.value), expired: false };
  } catch {
    return null;
  }
}

/**
 * localStorage-only hook with TTL support.
 * Does NOT sync across tabs — use for persistent local state.
 */
export function useTabStorage<T>(
  key: string,
  defaultValue: T,
  options: UseTabStorageOptions<T> = {}
): [T, (value: SetValue<T>) => void, () => void] {
  const {
    prefix = DEFAULT_PREFIX,
    serializer,
    ttl,
    onExpire,
  } = options;

  const storageKey = `${prefix}${key}`;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  const serialize = serializer?.serialize ?? defaultSerialize;
  const deserialize = serializer?.deserialize ?? defaultDeserialize;

  // Initialize state from localStorage or defaultValue
  const [state, setState] = useState<T>(() => {
    const stored = readStorage(storageKey);
    if (stored !== null) {
      if (ttl) {
        const parsed = unwrapWithTTL<T>(stored, deserialize);
        if (parsed) {
          if (parsed.expired) {
            removeStorage(storageKey);
            return defaultValue;
          }
          return parsed.value;
        }
      } else {
        try {
          return deserialize(stored);
        } catch {
          return defaultValue;
        }
      }
    }
    return defaultValue;
  });

  // Keep a ref to current state
  const stateRef = useRef(state);
  stateRef.current = state;

  // TTL expiration check
  useEffect(() => {
    if (!ttl) return;

    const checkExpiration = () => {
      const stored = readStorage(storageKey);
      if (stored !== null) {
        const parsed = unwrapWithTTL<T>(stored, deserialize);
        if (parsed?.expired) {
          removeStorage(storageKey);
          setState(defaultValueRef.current);
          onExpireRef.current?.(key, parsed.value);
        }
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, Math.min(ttl, 60000));
    return () => clearInterval(interval);
  }, [ttl, storageKey, key, deserialize]);

  const setValue = useCallback(
    (value: SetValue<T>) => {
      const resolved =
        typeof value === 'function'
          ? (value as (prev: T) => T)(stateRef.current)
          : value;

      setState(resolved);

      if (ttl) {
        writeStorage(storageKey, wrapWithTTL(resolved, ttl, serialize));
      } else {
        writeStorage(storageKey, serialize(resolved));
      }
    },
    [storageKey, ttl, serialize]
  );

  const removeValue = useCallback(() => {
    setState(defaultValue);
    removeStorage(storageKey);
  }, [defaultValue, storageKey]);

  return [state, setValue, removeValue];
}
