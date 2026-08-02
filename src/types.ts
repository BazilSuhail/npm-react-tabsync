export type SetValue<T> = T | ((prev: T) => T);

export interface TabSyncMessage {
  type: 'update';
  tabId: string;
  key: string;
  value: string;
  timestamp: number;
}

export interface UseTabStateOptions {
  /** Channel name for namespace isolation. Default: 'react-tabsync' */
  channel?: string;
  /** Storage key prefix. Default: 'rts:' */
  prefix?: string;
}

export interface TabSyncChannel {
  postMessage(msg: TabSyncMessage): void;
  addEventListener(listener: (msg: TabSyncMessage) => void): void;
  removeEventListener(listener: (msg: TabSyncMessage) => void): void;
  close(): void;
}
