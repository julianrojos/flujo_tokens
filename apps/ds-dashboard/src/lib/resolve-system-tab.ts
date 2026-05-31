const VALID_SYSTEM_TABS = ['overview', 'admin', 'consumers'] as const;
export type SystemTab = (typeof VALID_SYSTEM_TABS)[number];

/**
 * Resolve the current system tab from a pathname.
 * Expected format: /:systemId/:tab.
 * Returns 'overview' as fallback for bare system paths or unknown tabs.
 */
export function resolveSystemTab(pathname: string): SystemTab {
  const segments = pathname.split('/').filter(Boolean);
  const tab = segments[1] as SystemTab | undefined;
  if (tab && VALID_SYSTEM_TABS.includes(tab)) return tab;
  return 'overview';
}
