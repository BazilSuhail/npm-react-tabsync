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
    // Keep the version with more array items
    return (local?.length ?? 0) > (remote?.length ?? 0) ? local : remote;
  }
});
```

**How it works:**
- Each update includes a timestamp + random tab order
- `lastWriteWins`: higher timestamp wins; ties broken by tab order
- `merge`: shallow merge remote into local
- Custom: your function decides which version to keep

## Features

- **Zero dependencies** — React only
- **Tree-shakable** — ESM + CJS
- **SSR-safe** — Next.js App Router compatible
- **TypeScript** — full generics
- **Functional updates** — `setState(prev => prev + 1)`
- **Self-loop prevention** — sender ignores own broadcasts
- **Conflict resolution** — lastWriteWins, merge, or custom

## How

1. `localStorage` for persistence
2. `BroadcastChannel` for instant sync
3. `storage` event fallback for older browsers
4. `useSyncExternalStore` for SSR safety

## License

MIT
