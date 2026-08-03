import { useCallback, useEffect, useRef, useReducer } from 'react';
import { getTabId } from './internal/id';
import { getChannel, closeChannel } from './internal/channel';
import { readStorage, writeStorage, removeStorage } from './internal/storage';
import { resolveConflict } from './internal/conflict';
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
  } = options;

  const storageKey = `${prefix}${key}`;
  const tabIdRef = useRef(getTabId());
  const tabOrderRef = useRef(Math.floor(Math.random() * 1000000));
  const isSender = useRef(false);
  const localTimestamp = useRef(Date.now());

  // Initialize state from localStorage or initialState
  const initState = (): S => {
    if (!persist) return initialState;
    const stored = readStorage(storageKey);
    if (stored !== null) {
      try {
        return JSON.parse(stored) as S;
      } catch {
        return initialState;
      }
    }
    return initialState;
  };

  const wrappedReducer = createSyncReducer(reducer);
  const [state, dispatch] = useReducer(wrappedReducer, initialState, initState);

  // Keep a ref to current state
  const stateRef = useRef(state);
  stateRef.current = state;

  // Subscribe to cross-tab updates via BroadcastChannel
  useEffect(() => {
    const ch = getChannel(channelName, prefix);

    const handleMessage = (msg: TabSyncMessage) => {
      if (msg.type !== 'update') return;
      if (msg.key !== key) return;
      if (msg.tabId === tabIdRef.current) return;

      try {
        const incoming = JSON.parse(msg.value) as S;

        // Apply conflict resolution
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
      } catch {
        // ignore malformed data
      }
    };

    ch.addEventListener(handleMessage);
    return () => {
      ch.removeEventListener(handleMessage);
    };
  }, [key, channelName, prefix, conflict]);

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

  const syncDispatch = useCallback(
    (action: A) => {
      // Apply reducer locally
      const newState = reducer(stateRef.current, action);

      // Update local state
      dispatch({ type: '__SYNC_TAB', payload: action });
      localTimestamp.current = Date.now();

      // Persist to localStorage (if enabled)
      if (persist) {
        const serialized = JSON.stringify(newState);
        writeStorage(storageKey, serialized);
      }

      // Broadcast to other tabs
      isSender.current = true;
      const ch = getChannel(channelName, prefix);
      const msg: TabSyncMessage = {
        type: 'update',
        tabId: tabIdRef.current,
        key,
        value: JSON.stringify(newState),
        timestamp: localTimestamp.current,
        tabOrder: tabOrderRef.current,
      };
      ch.postMessage(msg);

      // Reset sender flag after a tick
      setTimeout(() => {
        isSender.current = false;
      }, 0);
    },
    [reducer, key, storageKey, channelName, prefix, persist]
  );

  return [state, syncDispatch];
}
