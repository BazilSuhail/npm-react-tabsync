let tabId: string | null = null;

export function getTabId(): string {
  if (tabId) return tabId;

  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    tabId = crypto.randomUUID();
  } else {
    tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  return tabId;
}
