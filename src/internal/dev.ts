// Development mode detection - always enabled unless explicitly disabled
const isDev = typeof window !== 'undefined';

const warnedKeys = new Set<string>();
const updateTimestamps = new Map<string, number[]>();

const MAX_PAYLOAD_SIZE = 10 * 1024; // 10KB
const RAPID_UPDATE_THRESHOLD = 10;
const RAPID_UPDATE_WINDOW = 1000; // 1 second

export function warnDuplicateKey(key: string, channel: string): void {
  if (!isDev) return;
  const warningKey = `${channel}:${key}`;
  if (warnedKeys.has(warningKey)) return;
  warnedKeys.add(warningKey);
  console.warn(
    `[use-tab-sync] Key "${key}" is being used in multiple hooks. ` +
    `Consider using different channel names to avoid cross-talk.`
  );
}

export function warnLargePayload(key: string, size: number): void {
  if (!isDev) return;
  if (size > MAX_PAYLOAD_SIZE) {
    console.warn(
      `[use-tab-sync] Key "${key}" payload is ${(size / 1024).toFixed(1)}KB ` +
      `(>${MAX_PAYLOAD_SIZE / 1024}KB). Consider using selective sync or a smaller state.`
    );
  }
}

export function warnRapidUpdates(key: string): void {
  if (!isDev) return;

  const now = Date.now();
  const timestamps = updateTimestamps.get(key) ?? [];

  // Add current timestamp and filter to window
  timestamps.push(now);
  const recent = timestamps.filter((t) => now - t < RAPID_UPDATE_WINDOW);
  updateTimestamps.set(key, recent);

  if (recent.length > RAPID_UPDATE_THRESHOLD) {
    console.warn(
      `[use-tab-sync] Key "${key}" has ${recent.length} updates ` +
      `in the last ${RAPID_UPDATE_WINDOW / 1000}s. ` +
      `Consider debouncing or throttling.`
    );
    // Clear to avoid spam
    updateTimestamps.set(key, []);
  }
}

export function checkPayloadSize(key: string, value: unknown): number {
  if (!isDev) return 0;
  try {
    const size = new Blob([JSON.stringify(value)]).size;
    warnLargePayload(key, size);
    return size;
  } catch {
    return 0;
  }
}
