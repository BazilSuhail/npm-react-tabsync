const isDev = typeof window !== 'undefined';

const updateTimestamps = new Map<string, number[]>();

const RAPID_UPDATE_THRESHOLD = 10;
const RAPID_UPDATE_WINDOW = 1000;

export function warnRapidUpdates(key: string): void {
  if (!isDev) return;

  const now = Date.now();
  const timestamps = updateTimestamps.get(key) ?? [];

  timestamps.push(now);
  const recent = timestamps.filter((t) => now - t < RAPID_UPDATE_WINDOW);
  updateTimestamps.set(key, recent);

  if (recent.length > RAPID_UPDATE_THRESHOLD) {
    console.warn(
      `[use-tab-sync] Key "${key}" has ${recent.length} updates ` +
      `in the last ${RAPID_UPDATE_WINDOW / 1000}s. ` +
      `Consider debouncing or throttling.`
    );
    updateTimestamps.set(key, []);
  }
}

export function warnLargePayload(key: string, size: number, limit: number): void {
  if (!isDev) return;
  if (size > limit) {
    console.warn(
      `[use-tab-sync] Key "${key}" payload is ${(size / 1024).toFixed(1)}KB ` +
      `(> ${(limit / 1024).toFixed(1)}KB limit).`
    );
  }
}
