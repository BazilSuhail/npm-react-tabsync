import type { ConflictStrategy } from '../types';

/**
 * Resolve conflict between local and remote state.
 * Uses timestamp + tabOrder for deterministic ordering.
 */
export function resolveConflict<T>(
  local: T,
  remote: T,
  localTimestamp: number,
  remoteTimestamp: number,
  localTabOrder: number,
  remoteTabOrder: number,
  strategy: ConflictStrategy<T> = 'lastWriteWins'
): T {
  if (strategy === 'lastWriteWins') {
    return lastWriteWins(local, remote, localTimestamp, remoteTimestamp, localTabOrder, remoteTabOrder);
  }

  if (strategy === 'merge') {
    return mergeObjects(local, remote);
  }

  // Custom resolver
  return strategy(local, remote);
}

function lastWriteWins<T>(
  local: T,
  remote: T,
  localTimestamp: number,
  remoteTimestamp: number,
  localTabOrder: number,
  remoteTabOrder: number
): T {
  // Compare timestamps first
  if (remoteTimestamp > localTimestamp) return remote;
  if (remoteTimestamp < localTimestamp) return local;

  // Same timestamp — use tabOrder as tiebreaker (higher order wins)
  if (remoteTabOrder > localTabOrder) return remote;
  return local;
}

function mergeObjects<T>(local: T, remote: T): T {
  if (typeof local !== 'object' || local === null) return remote;
  if (typeof remote !== 'object' || remote === null) return remote;

  const merged = { ...(local as Record<string, unknown>) };
  const remoteObj = remote as Record<string, unknown>;

  for (const key of Object.keys(remoteObj)) {
    if (remoteObj[key] !== undefined) {
      merged[key] = remoteObj[key];
    }
  }

  return merged as T;
}
