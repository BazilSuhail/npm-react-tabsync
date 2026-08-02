export type SetValue<T> = T | ((prev: T) => T);

export interface TabSyncMessage {
  type: 'update';
  tabId: string;
  key: string;
  value: string;
  timestamp: number;
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
}

export interface UseTabSyncReducerOptions {
  /** BroadcastChannel name for namespace isolation. Default: 'use-tab-sync' */
  channel?: string;
  /** Storage key prefix. Default: 'rts:' */
  prefix?: string;
  /** Persist to localStorage. Default: true */
  persist?: boolean;
}

export interface TabSyncChannel {
  postMessage(msg: TabSyncMessage): void;
  addEventListener(listener: (msg: TabSyncMessage) => void): void;
  removeEventListener(listener: (msg: TabSyncMessage) => void): void;
  close(): void;
}
