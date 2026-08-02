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
  private handler: ((e: StorageEvent) => void) | null = null;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  postMessage(msg: TabSyncMessage): void {
    const key = `${this.prefix}:${msg.key}`;
    writeStorageRaw(key, JSON.stringify(msg));
    // Dispatch custom event so same-tab listeners pick it up
    window.dispatchEvent(
      new CustomEvent('react-tabsync', { detail: msg })
    );
  }

  addEventListener(listener: (msg: TabSyncMessage) => void): void {
    this.listeners.add(listener);

    if (this.listeners.size === 1) {
      this.handler = (e: StorageEvent) => {
        if (e.key?.startsWith(this.prefix + ':') && e.newValue) {
          try {
            const msg = JSON.parse(e.newValue) as TabSyncMessage;
            this.listeners.forEach((fn) => fn(msg));
          } catch {
            // ignore malformed data
          }
        }
      };
      window.addEventListener('storage', this.handler);

      // Also listen to custom event for same-tab
      window.addEventListener('react-tabsync', ((e: CustomEvent) => {
        this.listeners.forEach((fn) => fn(e.detail));
      }) as EventListener);
    }
  }

  removeEventListener(listener: (msg: TabSyncMessage) => void): void {
    this.listeners.delete(listener);
    if (this.listeners.size === 0 && this.handler) {
      window.removeEventListener('storage', this.handler);
      this.handler = null;
    }
  }

  close(): void {
    this.listeners.clear();
    if (this.handler) {
      window.removeEventListener('storage', this.handler);
      this.handler = null;
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

// Channel cache to avoid creating duplicate channels
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
