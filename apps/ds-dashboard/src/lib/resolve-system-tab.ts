const VALID_SYSTEM_TABS = ['overview', 'admin', 'consumers', 'operations'] as const;
export type SystemTab = (typeof VALID_SYSTEM_TABS)[number];

/**
 * Resolve the current system tab from a pathname.
 * Expected format: /system/:systemId/:tab
 * Returns 'overview' as fallback for bare system paths or unknown tabs.
 */
export function resolveSystemTab(pathname: string): SystemTab {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'system' && segments.length >= 3) {
    const tab = segments[2] as SystemTab;
    if (VALID_SYSTEM_TABS.includes(tab)) return tab;
  }
  return 'overview';
}
