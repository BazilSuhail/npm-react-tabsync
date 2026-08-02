import { useCallback, useEffect, useRef, useState } from 'react';
import { getTabId } from './internal/id';
import { getChannel, closeChannel } from './internal/channel';
import { readStorage, writeStorage } from './internal/storage';
import type { SetValue, UseTabStateOptions, TabSyncMessage } from './types';

const DEFAULT_PREFIX = 'rts:';
const DEFAULT_CHANNEL = 'use-tab-sync';

export function useTabSync<T>(
  key: string,
  defaultValue: T,
  options: UseTabStateOptions = {}
): [T, (value: SetValue<T>) => void] {
  const { channel: channelName = DEFAULT_CHANNEL, prefix = DEFAULT_PREFIX } = options;
  const storageKey = `${prefix}${key}`;
  const tabId = useRef(getTabId());
  const isSender = useRef(false);

  // Initialize state from localStorage or defaultValue
  const [state, setState] = useState<T>(() => {
    const stored = readStorage(storageKey);
    if (stored !== null) {
      try {
        return JSON.parse(stored) as T;
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
      // Self-message loop prevention: skip messages from this tab
      if (msg.tabId === tabId.current) return;

      try {
        const parsed = JSON.parse(msg.value) as T;
        setState(parsed);
      } catch {
        // ignore malformed data
      }
    };

    ch.addEventListener(handleMessage);
    return () => {
      ch.removeEventListener(handleMessage);
    };
  }, [key, channelName, prefix]);

  // Clean up channel on unmount (only if no other hooks use it)
  useEffect(() => {
    return () => {
      closeChannel(channelName, prefix);
    };
  }, [channelName, prefix]);

  const setValue = useCallback(
    (value: SetValue<T>) => {
      const resolved =
        typeof value === 'function'
          ? (value as (prev: T) => T)(stateRef.current)
          : value;

      // Update local state
      setState(resolved);

      // Persist to localStorage
      const serialized = JSON.stringify(resolved);
      writeStorage(storageKey, serialized);

      // Broadcast to other tabs
      isSender.current = true;
      const ch = getChannel(channelName, prefix);
      const msg: TabSyncMessage = {
        type: 'update',
        tabId: tabId.current,
        key,
        value: serialized,
        timestamp: Date.now(),
      };
      ch.postMessage(msg);

      // Reset sender flag after a tick (for storage event fallback)
      setTimeout(() => {
        isSender.current = false;
      }, 0);
    },
    [key, storageKey, channelName, prefix]
  );

  return [state, setValue];
}
