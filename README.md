# use-tab-sync

**Zero deps. Minimal. Cross-tab state sync for React.**

One hook. All tabs. Instant sync. No server. No boilerplate.

```bash
npm install use-tab-sync
```

```tsx
import { useTabSync } from 'use-tab-sync';

function Cart() {
  const [items, setItems] = useTabSync('cart', []);

  return (
    <button onClick={() => setItems(prev => [...prev, { id: Date.now() }])}>
      Add ({items.length})
    </button>
  );
}
```

Open two tabs. Click in one — the other updates instantly.

## Why

| Without | With |
|---------|------|
| BroadcastChannel setup | 1 line |
| localStorage fallback | 1 line |
| SSR hydration handling | 1 line |
| Self-loop prevention | Automatic |
| Functional updates | Built-in |

~50 lines of boilerplate → 1 hook call.

## Hooks

| Hook | Purpose |
|------|---------|
| `useTabSync` | Cross-tab state sync (BroadcastChannel + localStorage) |
| `useTabSyncReducer` | Cross-tab reducer pattern |
| `useTabStorage` | localStorage-only with TTL (no cross-tab sync) |

## API

### `useTabSync<T>(key, defaultValue, options?)`

Drop-in replacement for `useState` that syncs across tabs.

```tsx
const [state, setState] = useTabSync('key', defaultValue);
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channel` | `string` | `'use-tab-sync'` | BroadcastChannel namespace |
| `prefix` | `string` | `'rts:'` | localStorage key prefix |
| `persist` | `boolean` | `true` | Persist across page reloads |
| `sync` | `(keyof T)[]` | `undefined` | Selective field sync |
| `serializer` | `{ serialize, deserialize }` | JSON | Custom serialization |
| `conflict` | `'lastWriteWins' \| 'merge' \| (local, remote) => T` | `'lastWriteWins'` | Conflict resolution |
| `onSync` | `(event: SyncEvent<T>) => void` | `undefined` | Sync event callback |
| `ttl` | `number` | `undefined` | Time-to-live in ms |
| `onExpire` | `(key, value) => void` | `undefined` | Expiration callback |
| `maxSize` | `number` | `undefined` | Max payload size in bytes |
| `onSizeExceeded` | `(key, size, limit) => void` | `undefined` | Size exceeded callback |

### `useTabSyncReducer(reducer, initialState, key, options?)`

Cross-tab reducer pattern — dispatch actions that sync across all tabs.

```tsx
import { useTabSyncReducer } from 'use-tab-sync';

function reducer(state: string[], action: { type: string; item?: string }) {
  switch (action.type) {
    case 'add': return [...state, action.item!];
    case 'clear': return [];
    default: return state;
  }
}

function Cart() {
  const [items, dispatch] = useTabSyncReducer(reducer, [], 'cart');

  return (
    <button onClick={() => dispatch({ type: 'add', item: 'Shoe' })}>
      Add Item
    </button>
  );
}
```

### `useTabStorage<T>(key, defaultValue, options?)`

localStorage-only hook with TTL. No cross-tab sync — use for persistent local state.

```tsx
import { useTabStorage } from 'use-tab-sync';

function Preferences() {
  const [theme, setTheme, removeTheme] = useTabStorage('theme', 'light', {
    ttl: 24 * 60 * 60 * 1000 // 24 hours
  });

  return (
    <div>
      <p>Theme: {theme}</p>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={removeTheme}>Reset</button>
    </div>
  );
}
```

## Options

### Selective Sync

Only sync specific fields — other fields stay local.

```tsx
const [user, setUser] = useTabSync('user', { name: 'John', localPref: 'x' }, {
  sync: ['name'] // only 'name' syncs across tabs
});
```

Remote updates **merge** into local state — they don't replace it.

### Custom Serializer

Handle non-JSON types (Date, Map, Set, etc).

```tsx
const [date, setDate] = useTabSync('lastSeen', new Date(), {
  serializer: {
    serialize: (d) => d.toISOString(),
    deserialize: (s) => new Date(s)
  }
});
```

### Ephemeral State

Sync across tabs without persisting to localStorage.

```tsx
const [hovered, setHovered] = useTabSync<string | null>('hovered', null, {
  persist: false
});
```

### Channel Namespacing

Isolate different features to prevent cross-talk.

```tsx
const [theme, setTheme] = useTabSync('theme', 'light', { channel: 'settings' });
const [cart, setCart] = useTabSync('cart', [], { channel: 'shop' });
```

### Conflict Resolution

Control how simultaneous updates from multiple tabs are resolved.

```tsx
// Default: last write wins (timestamp + tab order)
const [state, setState] = useTabSync('key', value, {
  conflict: 'lastWriteWins'
});

// Shallow merge objects
const [settings, setSettings] = useTabSync('settings', defaults, {
  conflict: 'merge'
});

// Custom resolver
const [data, setData] = useTabSync('data', initial, {
  conflict: (local, remote) => {
    return (local?.length ?? 0) > (remote?.length ?? 0) ? local : remote;
  }
});
```

### TTL (Time-to-Live)

Auto-expire state after a duration.

```tsx
const [token, setToken] = useTabSync('auth_token', null, {
  ttl: 60 * 60 * 1000, // 1 hour
  onExpire: (key, value) => {
    console.log(`Token expired: ${key}`);
    // Redirect to login, etc.
  }
});
```

### Size Limits

Get notified when payloads exceed a threshold.

```tsx
const [data, setData] = useTabSync('large_data', [], {
  maxSize: 10 * 1024, // 10KB
  onSizeExceeded: (key, size, limit) => {
    console.warn(`${key} is ${(size/1024).toFixed(1)}KB, limit is ${(limit/1024).toFixed(1)}KB`);
  }
});
```

### Sync Events (onSync)

Monitor every sync event for analytics, debugging, or side effects.

```tsx
const [state, setState] = useTabSync('key', value, {
  onSync: ({ key, value, direction, tabId, timestamp }) => {
    console.log(`[${direction}] ${key}:`, value);
  }
});
```

## Features

- **Zero dependencies** — React only
- **Tree-shakable** — ESM + CJS
- **SSR-safe** — Next.js App Router compatible
- **TypeScript** — full generics
- **Functional updates** — `setState(prev => prev + 1)`
- **Self-loop prevention** — sender ignores own broadcasts
- **Conflict resolution** — lastWriteWins, merge, or custom
- **TTL/expiration** — auto-expire state
- **Size limits** — warn on large payloads
- **Sync events** — onSync callback
- **Dev warnings** — rapid updates, large payloads

## How

1. `localStorage` for persistence
2. `BroadcastChannel` for instant sync
3. `storage` event fallback for older browsers
4. `useSyncExternalStore` for SSR safety

## License

MIT
