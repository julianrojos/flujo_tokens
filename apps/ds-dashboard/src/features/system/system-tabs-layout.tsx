import { useEffect, useMemo } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useMatch,
  useParams,
} from 'react-router-dom';

import { useDesignSystem } from '@/lib/design-system-context';
import {
  ROUTE_PATTERNS,
  toSystemOverview,
  toSystemAdmin,
  toSystemOperations,
} from '@/lib/routes';
import { resolveSystemTab } from '@/lib/resolve-system-tab';
import { cn } from '@/lib/utils';

type SystemTab = {
  id: 'overview' | 'admin' | 'operations';
  label: string;
  to: (systemId: string) => string;
};

const SYSTEM_TABS: SystemTab[] = [
  { id: 'overview', label: 'Overview', to: toSystemOverview },
  { id: 'admin', label: 'Admin', to: toSystemAdmin },
  { id: 'operations', label: 'Operations', to: toSystemOperations },
];

/**
 * SystemTabsLayout — per-system tabbed layout.
 *
 * URL-first sync rule:
 * - The URL :systemId is the single source of truth.
 * - This layout synchronizes activeSystem one-way: URL → context/localStorage.
 * - Callers (e.g. SystemSwitcher) must navigate only; they must not call setActiveSystem directly.
 */
export function SystemTabsLayout() {
  const { systemId } = useParams<{ systemId: string }>();
  const location = useLocation();
  const bareSystemMatch = useMatch('/system/:systemId');
  const { systems, activeSystem, setActiveSystem } = useDesignSystem();

  const normalizedSystemId = String(systemId || '').trim();
  const systemExists = useMemo(
    () => systems.some((s) => s.id === normalizedSystemId),
    [systems, normalizedSystemId],
  );

  // One-way sync: URL → context/localStorage
  useEffect(() => {
    if (
      normalizedSystemId &&
      systemExists &&
      normalizedSystemId !== activeSystem
    ) {
      setActiveSystem(normalizedSystemId);
    }
  }, [normalizedSystemId, systemExists, activeSystem, setActiveSystem]);

  // Derive active tab from URL
  const activeTab = useMemo(() => {
    if (!normalizedSystemId) return null;
    return resolveSystemTab(location.pathname);
  }, [location.pathname, normalizedSystemId]);

  // Redirect guards
  if (!systems.length) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }

  if (!normalizedSystemId || !systemExists) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }

  // Bare /system/:systemId (no tab) → redirect to overview
  if (bareSystemMatch?.params.systemId === normalizedSystemId) {
    return <Navigate to={toSystemOverview(normalizedSystemId)} replace />;
  }

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-border" role="tablist">
        {SYSTEM_TABS.map((tab) => {
          const href = tab.to(normalizedSystemId);
          const isActive = activeTab === tab.id;
          return (
            <NavLink
              key={tab.id}
              to={href}
              role="tab"
              aria-selected={isActive}
              className={({ isActive: isMatch }) =>
                cn(
                  'rounded-t-md px-3 py-2 text-sm font-medium transition',
                  isMatch
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
