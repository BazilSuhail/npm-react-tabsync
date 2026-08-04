import type { TabSyncChannel, TabSyncMessage } from '../types';

const isBrowser = typeof window !== 'undefined';

class BroadcastChannelAdapter implements TabSyncChannel {
  private channel: BroadcastChannel;
  private listeners = new Set<(msg: TabSyncMessage) => void>();

  constructor(name: string) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = (e: MessageEvent<TabSyncMessage>) => {
      this.listeners.forEach((fn) => fn(e.data));
    };
  }

  postMessage(msg: TabSyncMessage): void {
    this.channel.postMessage(msg);
  }

  addEventListener(listener: (msg: TabSyncMessage) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(listener: (msg: TabSyncMessage) => void): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.channel.close();
  }
}

class StorageEventAdapter implements TabSyncChannel {
  private prefix: string;
  private listeners = new Set<(msg: TabSyncMessage) => void>();
  private storageHandler: ((e: StorageEvent) => void) | null = null;
  private customHandler: ((e: Event) => void) | null = null;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  postMessage(msg: TabSyncMessage): void {
    const key = `${this.prefix}:${msg.key}`;
    writeStorageRaw(key, JSON.stringify(msg));
    window.dispatchEvent(
      new CustomEvent('react-tabsync', { detail: msg })
    );
  }

  addEventListener(listener: (msg: TabSyncMessage) => void): void {
    this.listeners.add(listener);

    if (this.listeners.size === 1) {
      this.storageHandler = (e: StorageEvent) => {
        if (e.key?.startsWith(this.prefix + ':') && e.newValue) {
          try {
            const msg = JSON.parse(e.newValue) as TabSyncMessage;
            this.listeners.forEach((fn) => fn(msg));
          } catch {
            // ignore malformed data
          }
        }
      };
      window.addEventListener('storage', this.storageHandler);

      this.customHandler = ((e: CustomEvent) => {
        this.listeners.forEach((fn) => fn(e.detail));
      }) as EventListener;
      window.addEventListener('react-tabsync', this.customHandler);
    }
  }

  removeEventListener(listener: (msg: TabSyncMessage) => void): void {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) {
      this.cleanup();
    }
  }

  close(): void {
    this.listeners.clear();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.storageHandler) {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = null;
    }
    if (this.customHandler) {
      window.removeEventListener('react-tabsync', this.customHandler);
      this.customHandler = null;
    }
  }
}

function writeStorageRaw(key: string, value: string): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // fail silently
  }
}

const channelCache = new Map<string, TabSyncChannel>();

export function getChannel(
  name: string,
  prefix: string
): TabSyncChannel {
  const cacheKey = `${name}:${prefix}`;
  if (channelCache.has(cacheKey)) {
    return channelCache.get(cacheKey)!;
  }

  let channel: TabSyncChannel;
  if (isBrowser && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannelAdapter(name);
  } else {
    channel = new StorageEventAdapter(prefix);
  }

  channelCache.set(cacheKey, channel);
  return channel;
}

export function closeChannel(name: string, prefix: string): void {
  const cacheKey = `${name}:${prefix}`;
  const channel = channelCache.get(cacheKey);
  if (channel) {
    channel.close();
    channelCache.delete(cacheKey);
  }
}
