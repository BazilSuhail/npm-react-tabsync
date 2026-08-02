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

| Param | Type | Default |
|-------|------|---------|
| `key` | `string` | — |
| `defaultValue` | `T` | — |
| `options.channel` | `string` | `'use-tab-sync'` |
| `options.prefix` | `string` | `'rts:'` |

Returns `[state, setState]` — same as `useState`.

## Features

- **Zero dependencies** — React only
- **Tree-shakable** — ESM + CJS
- **SSR-safe** — Next.js App Router compatible
- **TypeScript** — full generics

## How

1. `localStorage` for persistence
2. `BroadcastChannel` for instant sync
3. `storage` event fallback for older browsers
4. `useSyncExternalStore` for SSR safety

## License

MIT
