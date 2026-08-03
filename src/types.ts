export type SetValue<T> = T | ((prev: T) => T);

export type ConflictStrategy<T> = 'lastWriteWins' | 'merge' | ((local: T, remote: T) => T);

export type SyncDirection = 'send' | 'receive';

export interface SyncEvent<T> {
  key: string;
  value: T;
  direction: SyncDirection;
  tabId: string;
  timestamp: number;
}

export type OnSyncCallback<T> = (event: SyncEvent<T>) => void;

export interface TabSyncMessage {
  type: 'update';
  tabId: string;
  key: string;
  value: string;
  timestamp: number;
  tabOrder: number;
}

export interface Serializer<T> {
  serialize: (value: T) => string;
  deserialize: (raw: string) => T;
}

export interface UseTabSyncOptions<T> {
  /** BroadcastChannel name for namespace isolation. Default: 'use-tab-sync' */
  channel?: string;
  /** Storage key prefix. Default: 'rts:' */
  prefix?: string;
  /** Persist to localStorage. Default: true */
  persist?: boolean;
  /** Selective field sync — only sync these fields from objects */
  sync?: (keyof T)[];
  /** Custom serializer for non-JSON types */
  serializer?: Serializer<T>;
  /** Conflict resolution strategy. Default: 'lastWriteWins' */
  conflict?: ConflictStrategy<T>;
  /** Callback fired on every sync event (send/receive) */
  onSync?: OnSyncCallback<T>;
}

export interface UseTabSyncReducerOptions {
  /** BroadcastChannel name for namespace isolation. Default: 'use-tab-sync' */
  channel?: string;
  /** Storage key prefix. Default: 'rts:' */
  prefix?: string;
  /** Persist to localStorage. Default: true */
  persist?: boolean;
  /** Conflict resolution strategy. Default: 'lastWriteWins' */
  conflict?: ConflictStrategy<unknown>;
  /** Callback fired on every sync event (send/receive) */
  onSync?: OnSyncCallback<unknown>;
}

export interface TabSyncChannel {
  postMessage(msg: TabSyncMessage): void;
  addEventListener(listener: (msg: TabSyncMessage) => void): void;
  removeEventListener(listener: (msg: TabSyncMessage) => void): void;
  close(): void;
}
