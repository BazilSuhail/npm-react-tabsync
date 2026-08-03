import { useCallback, useEffect, useRef, useState } from 'react';
import { getTabId } from './internal/id';
import { getChannel, closeChannel } from './internal/channel';
import { readStorage, writeStorage, removeStorage } from './internal/storage';
import { resolveConflict } from './internal/conflict';
import { warnRapidUpdates, checkPayloadSize } from './internal/dev';
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
  } = options;

  const storageKey = `${prefix}${key}`;
  const tabId = useRef(getTabId());
  const tabOrder = useRef(Math.floor(Math.random() * 1000000));
  const isSender = useRef(false);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const serialize = serializer?.serialize ?? defaultSerialize;
  const deserialize = serializer?.deserialize ?? defaultDeserialize;

  // Track local timestamp for conflict resolution
  const localTimestamp = useRef(Date.now());

  // Initialize state from localStorage or defaultValue
  const [state, setState] = useState<T>(() => {
    if (!persist) return defaultValue;
    const stored = readStorage(storageKey);
    if (stored !== null) {
      try {
        return deserialize(stored);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  });

  // Keep a ref to current state for functional updates
  const stateRef = useRef(state);
  stateRef.current = state;

  // Subscribe to cross-tab updates via BroadcastChannel
  useEffect(() => {
    const ch = getChannel(channelName, prefix);

    const handleMessage = (msg: TabSyncMessage) => {
      if (msg.type !== 'update') return;
      if (msg.key !== key) return;
      if (msg.tabId === tabId.current) return;

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

        // Fire onSync callback
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

  // Clean up channel on unmount
  useEffect(() => {
    return () => {
      closeChannel(channelName, prefix);
    };
  }, [channelName, prefix]);

  // Clean up localStorage if persist is false on unmount
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

      // Update local state
      setState(resolved);
      localTimestamp.current = Date.now();

      // Dev warnings
      warnRapidUpdates(key);
      checkPayloadSize(key, resolved);

      // Determine what to broadcast and persist
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

      // Persist to localStorage (if enabled)
      if (persist) {
        const serialized = serialize(resolved);
        writeStorage(storageKey, serialized);
      }

      // Broadcast to other tabs
      isSender.current = true;
      const ch = getChannel(channelName, prefix);
      const msg: TabSyncMessage = {
        type: 'update',
        tabId: tabId.current,
        key,
        value: serialize(broadcastValue),
        timestamp: localTimestamp.current,
        tabOrder: tabOrder.current,
      };
      ch.postMessage(msg);

      // Fire onSync callback
      onSyncRef.current?.({
        key,
        value: resolved,
        direction: 'send',
        tabId: tabId.current,
        timestamp: localTimestamp.current,
      });

      // Reset sender flag after a tick
      setTimeout(() => {
        isSender.current = false;
      }, 0);
    },
    [key, storageKey, channelName, prefix, persist, serialize, syncFields]
  );

  return [state, setValue];
}
