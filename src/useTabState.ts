import { useCallback, useEffect, useRef, useState } from 'react';
import { getTabId } from './internal/id';
import { getChannel, closeChannel } from './internal/channel';
import { readStorage, writeStorage, removeStorage } from './internal/storage';
import { resolveConflict } from './internal/conflict';
import { warnRapidUpdates } from './internal/dev';
import { createStoredValue, parseStoredValue } from './internal/ttl';
import type { SetValue, UseTabSyncOptions, TabSyncMessage, ConflictStrategy } from './types';

const DEFAULT_PREFIX = 'rts:';
const DEFAULT_CHANNEL = 'use-tab-sync';

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
}

function defaultDeserialize<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function mergeFields<T extends Record<string, unknown>>(
  local: T,
  remote: Partial<T>,
  fields: (keyof T)[]
): T {
  const merged = { ...local };
  for (const field of fields) {
    if (field in remote) {
      (merged as Record<string, unknown>)[field as string] = remote[field];
    }
  }
  return merged;
}

export function useTabSync<T>(
  key: string,
  defaultValue: T,
  options: UseTabSyncOptions<T> = {}
): [T, (value: SetValue<T>) => void] {
  const {
    channel: channelName = DEFAULT_CHANNEL,
    prefix = DEFAULT_PREFIX,
    persist = true,
    sync: syncFields,
    serializer,
    conflict = 'lastWriteWins',
    onSync,
    ttl,
    onExpire,
    maxSize,
    onSizeExceeded,
  } = options;

  const storageKey = `${prefix}${key}`;
  const tabId = useRef(getTabId());
  const tabOrder = useRef(Math.floor(Math.random() * 1000000));
  const isSender = useRef(false);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onSizeExceededRef = useRef(onSizeExceeded);
  onSizeExceededRef.current = onSizeExceeded;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  const serialize = serializer?.serialize ?? defaultSerialize;
  const deserialize = serializer?.deserialize ?? defaultDeserialize;

  const localTimestamp = useRef(Date.now());

  // Initialize state from localStorage or defaultValue
  const [state, setState] = useState<T>(() => {
    if (!persist) return defaultValue;
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

  const stateRef = useRef(state);
  stateRef.current = state;

  // TTL expiration check
  useEffect(() => {
    if (!ttl || !persist) return;

    const checkExpiration = () => {
      const stored = readStorage(storageKey);
      if (stored !== null) {
        const parsed = parseStoredValue<T>(stored);
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
  }, [ttl, persist, storageKey, key]);

  // Subscribe to cross-tab updates via BroadcastChannel
  useEffect(() => {
    const ch = getChannel(channelName, prefix);

    const handleMessage = (msg: TabSyncMessage) => {
      if (msg.type !== 'update') return;
      if (msg.key !== key) return;
      if (msg.tabId === tabId.current) return;

      if (msg.expiresAt !== undefined && Date.now() > msg.expiresAt) {
        return;
      }

      try {
        const incoming = deserialize(msg.value) as T;

        let resolved: T;

        if (syncFields && typeof incoming === 'object' && incoming !== null && typeof stateRef.current === 'object' && stateRef.current !== null) {
          resolved = mergeFields(
            stateRef.current as Record<string, unknown>,
            incoming as Record<string, unknown>,
            syncFields as string[]
          ) as T;
        } else {
          resolved = resolveConflict(
            stateRef.current,
            incoming,
            localTimestamp.current,
            msg.timestamp,
            tabOrder.current,
            msg.tabOrder,
            conflict as ConflictStrategy<T>
          );
        }

        setState(resolved);
        localTimestamp.current = Date.now();

        onSyncRef.current?.({
          key,
          value: resolved,
          direction: 'receive',
          tabId: msg.tabId,
          timestamp: msg.timestamp,
        });
      } catch {
        // ignore malformed data
      }
    };

    ch.addEventListener(handleMessage);
    return () => {
      ch.removeEventListener(handleMessage);
    };
  }, [key, channelName, prefix, deserialize, syncFields, conflict]);

  useEffect(() => {
    return () => {
      closeChannel(channelName, prefix);
    };
  }, [channelName, prefix]);

  useEffect(() => {
    return () => {
      if (!persist) {
        removeStorage(storageKey);
      }
    };
  }, [persist, storageKey]);

  const setValue = useCallback(
    (value: SetValue<T>) => {
      const resolved =
        typeof value === 'function'
          ? (value as (prev: T) => T)(stateRef.current)
          : value;

      setState(resolved);
      localTimestamp.current = Date.now();

      warnRapidUpdates(key);

      if (maxSize !== undefined && onSizeExceededRef.current) {
        try {
          const size = new Blob([JSON.stringify(resolved)]).size;
          if (size > maxSize) {
            onSizeExceededRef.current(key, size, maxSize);
          }
        } catch {
          // ignore
        }
      }

      let broadcastValue: T;
      if (syncFields && typeof resolved === 'object' && resolved !== null) {
        const partial = {} as Record<string, unknown>;
        for (const field of syncFields) {
          partial[field as string] = (resolved as Record<string, unknown>)[field as string];
        }
        broadcastValue = partial as T;
      } else {
        broadcastValue = resolved;
      }

      if (persist) {
        const serialized = ttl ? createStoredValue(resolved, ttl) : serialize(resolved);
        writeStorage(storageKey, serialized);
      }

      isSender.current = true;
      const ch = getChannel(channelName, prefix);
      const msg: TabSyncMessage = {
        type: 'update',
        tabId: tabId.current,
        key,
        value: serialize(broadcastValue),
        timestamp: localTimestamp.current,
        tabOrder: tabOrder.current,
        expiresAt: ttl ? Date.now() + ttl : undefined,
      };
      ch.postMessage(msg);

      onSyncRef.current?.({
        key,
        value: resolved,
        direction: 'send',
        tabId: tabId.current,
        timestamp: localTimestamp.current,
      });

      setTimeout(() => {
        isSender.current = false;
      }, 0);
    },
    [key, storageKey, channelName, prefix, persist, serialize, syncFields, ttl, maxSize]
  );

  return [state, setValue];
}
