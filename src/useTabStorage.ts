import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorage, writeStorage, removeStorage } from './internal/storage';
import { createStoredValue, parseStoredValue } from './internal/ttl';
import type { SetValue, UseTabStorageOptions } from './types';

const DEFAULT_PREFIX = 'rts:';

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
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

  const serialize = serializer?.serialize ?? defaultSerialize;

  // Initialize state from localStorage or defaultValue
  const [state, setState] = useState<T>(() => {
    const stored = readStorage(storageKey);
    if (stored !== null) {
      const parsed = parseStoredValue<T>(stored);
      if (parsed) {
        if (parsed.expired) {
          removeStorage(storageKey);
          return defaultValue;
        }
        return parsed.value;
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
        const parsed = parseStoredValue<T>(stored);
        if (parsed?.expired) {
          removeStorage(storageKey);
          setState(defaultValue);
          onExpireRef.current?.(key, parsed.value);
        }
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, Math.min(ttl, 60000));
    return () => clearInterval(interval);
  }, [ttl, storageKey, defaultValue, key]);

  const setValue = useCallback(
    (value: SetValue<T>) => {
      const resolved =
        typeof value === 'function'
          ? (value as (prev: T) => T)(stateRef.current)
          : value;

      setState(resolved);

      if (ttl) {
        writeStorage(storageKey, createStoredValue(resolved, ttl));
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
