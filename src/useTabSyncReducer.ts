import { useCallback, useEffect, useRef, useReducer } from 'react';
import { getTabId } from './internal/id';
import { getChannel, closeChannel } from './internal/channel';
import { readStorage, writeStorage, removeStorage } from './internal/storage';
import { resolveConflict } from './internal/conflict';
import { warnRapidUpdates } from './internal/dev';
import { createStoredValue, parseStoredValue } from './internal/ttl';
import type { UseTabSyncReducerOptions, TabSyncMessage, ConflictStrategy } from './types';

const DEFAULT_PREFIX = 'rts:';
const DEFAULT_CHANNEL = 'use-tab-sync';

type ReducerAction<A> = { type: '__SYNC_TAB'; payload: A } | { type: '__INIT_TAB'; state: unknown };

function createSyncReducer<S, A>(
  reducer: React.Reducer<S, A>
): React.Reducer<S, ReducerAction<A>> {
  return (state: S, action: ReducerAction<A>): S => {
    if (action.type === '__INIT_TAB') {
      return action.state as S;
    }
    if (action.type === '__SYNC_TAB') {
      return reducer(state, action.payload);
    }
    return reducer(state, action);
  };
}

export function useTabSyncReducer<S, A>(
  reducer: React.Reducer<S, A>,
  initialState: S,
  key: string,
  options: UseTabSyncReducerOptions = {}
): [S, React.Dispatch<A>] {
  const {
    channel: channelName = DEFAULT_CHANNEL,
    prefix = DEFAULT_PREFIX,
    persist = true,
    conflict = 'lastWriteWins',
    onSync,
    ttl,
    onExpire,
    maxSize,
    onSizeExceeded,
  } = options;

  const storageKey = `${prefix}${key}`;
  const tabIdRef = useRef(getTabId());
  const tabOrderRef = useRef(Math.floor(Math.random() * 1000000));
  const isSender = useRef(false);
  const localTimestamp = useRef(Date.now());
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onSizeExceededRef = useRef(onSizeExceeded);
  onSizeExceededRef.current = onSizeExceeded;
  const initialStateRef = useRef(initialState);
  initialStateRef.current = initialState;

  const initState = (): S => {
    if (!persist) return initialState;
    const stored = readStorage(storageKey);
    if (stored !== null) {
      const parsed = parseStoredValue<S>(stored);
      if (parsed) {
        if (parsed.expired) {
          removeStorage(storageKey);
          return initialState;
        }
        return parsed.value;
      }
    }
    return initialState;
  };

  const wrappedReducer = createSyncReducer(reducer);
  const [state, dispatch] = useReducer(wrappedReducer, initialState, initState);

  const stateRef = useRef(state);
  stateRef.current = state;

  // TTL expiration check
  useEffect(() => {
    if (!ttl || !persist) return;

    const checkExpiration = () => {
      const stored = readStorage(storageKey);
      if (stored !== null) {
        const parsed = parseStoredValue<S>(stored);
        if (parsed?.expired) {
          removeStorage(storageKey);
          dispatch({ type: '__INIT_TAB', state: initialStateRef.current });
          onExpireRef.current?.(key, parsed.value);
        }
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, Math.min(ttl, 60000));
    return () => clearInterval(interval);
  }, [ttl, persist, storageKey, key]);

  useEffect(() => {
    const ch = getChannel(channelName, prefix);

    const handleMessage = (msg: TabSyncMessage) => {
      if (msg.type !== 'update') return;
      if (msg.key !== key) return;
      if (msg.tabId === tabIdRef.current) return;

      if (msg.expiresAt !== undefined && Date.now() > msg.expiresAt) {
        return;
      }

      try {
        const incoming = JSON.parse(msg.value) as S;

        const resolved = resolveConflict(
          stateRef.current,
          incoming,
          localTimestamp.current,
          msg.timestamp,
          tabOrderRef.current,
          msg.tabOrder,
          conflict as ConflictStrategy<S>
        );

        dispatch({ type: '__INIT_TAB', state: resolved });
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
  }, [key, channelName, prefix, conflict]);

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

  const syncDispatch = useCallback(
    (action: A) => {
      const newState = reducer(stateRef.current, action);

      dispatch({ type: '__SYNC_TAB', payload: action });
      localTimestamp.current = Date.now();

      warnRapidUpdates(key);

      if (maxSize !== undefined && onSizeExceededRef.current) {
        try {
          const size = new Blob([JSON.stringify(newState)]).size;
          if (size > maxSize) {
            onSizeExceededRef.current(key, size, maxSize);
          }
        } catch {
          // ignore
        }
      }

      if (persist) {
        const serialized = ttl ? createStoredValue(newState, ttl) : JSON.stringify(newState);
        writeStorage(storageKey, serialized);
      }

      isSender.current = true;
      const ch = getChannel(channelName, prefix);
      const msg: TabSyncMessage = {
        type: 'update',
        tabId: tabIdRef.current,
        key,
        value: JSON.stringify(newState),
        timestamp: localTimestamp.current,
        tabOrder: tabOrderRef.current,
        expiresAt: ttl ? Date.now() + ttl : undefined,
      };
      ch.postMessage(msg);

      onSyncRef.current?.({
        key,
        value: newState,
        direction: 'send',
        tabId: tabIdRef.current,
        timestamp: localTimestamp.current,
      });

      setTimeout(() => {
        isSender.current = false;
      }, 0);
    },
    [reducer, key, storageKey, channelName, prefix, persist, ttl, maxSize]
  );

  return [state, syncDispatch];
}
