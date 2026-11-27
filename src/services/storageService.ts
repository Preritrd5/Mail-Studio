const STORAGE_KEYS = {
  SIDEBAR_COLLAPSED: 'snpsunexus_sidebar_collapsed',
};

const LEGACY_DEMO_STORAGE_KEYS = [
  'snpsunexus_mail_studio_templates',
  'snpsunexus_mail_studio_activity',
  'snpsunexus_mail_studio_campaigns',
  'snpsunexus_mail_studio_queue',
];

function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return defaultValue;
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage access errors in restricted contexts
  }
}

export const StorageService = {
  /**
   * Remove legacy client-side demo/cache keys from localStorage so stale sample
   * templates, campaigns, activity logs, or queue records never reappear.
   */
  clearLegacyDemoStorage: (): void => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    for (const key of LEGACY_DEMO_STORAGE_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore storage access errors in restricted contexts
      }
    }
  },

  // UI Preferences (non-data layout state only)
  getSidebarCollapsed: (): boolean => getFromStorage<boolean>(STORAGE_KEYS.SIDEBAR_COLLAPSED, false),
  saveSidebarCollapsed: (collapsed: boolean): void => saveToStorage<boolean>(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed),
};
