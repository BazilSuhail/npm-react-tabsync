# react-tabsync

React hook for real-time cross-tab state synchronization. Keeps state perfectly synced across all browser tabs using BroadcastChannel API with localStorage fallback.

## Install

```bash
npm install react-tabsync
```

## Usage

```tsx
import { useTabState } from 'react-tabsync';

function Cart() {
  const [items, setItems] = useTabState('cart', []);

  return (
    <button onClick={() => setItems(prev => [...prev, { id: Date.now() }])}>
      Add Item ({items.length})
    </button>
  );
}
```

Open two tabs. Click "Add Item" in one — the other updates instantly.

## API

### `useTabState<T>(key, defaultValue, options?)`

Drop-in replacement for `useState` that syncs across tabs.

| Param | Type | Description |
|-------|------|-------------|
| `key` | `string` | Unique state identifier across tabs |
| `defaultValue` | `T` | Initial value if nothing stored |
| `options` | `object` | Optional config |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channel` | `string` | `'react-tabsync'` | BroadcastChannel name for isolation |
| `prefix` | `string` | `'rts:'` | localStorage key prefix |

**Returns:** `[state, setState]` — identical to `useState`.

## Features

- **Zero dependencies** — only React as peer dependency
- **Tree-shakable** — ESM + CJS output
- **SSR-safe** — works with Next.js App Router via `useSyncExternalStore`
- **Functional updates** — `setState(prev => prev + 1)` works
- **Self-loop prevention** — sender tab ignores its own broadcasts
- **TypeScript** — full generic support

## How It Works

1. State is stored in `localStorage` (persists across reloads)
2. Changes are broadcast via `BroadcastChannel` (instant, same-origin)
3. Fallback to `storage` events for older browsers
4. Server renders a safe default, client hydrates from storage

## License

MIT
