import { useEffect, useMemo } from 'react';
import {
  Navigate,
  Outlet,
  useMatch,
  useParams,
} from 'react-router-dom';

import { useDesignSystem } from '@/lib/design-system-context';
import {
  ROUTE_PATTERNS,
  toSystemOverview,
} from '@/lib/routes';

/**
 * SystemTabsLayout — per-system tabbed layout.
 *
 * URL-first sync rule:
 * - The URL :systemId is the single source of truth.
 * - This layout synchronizes activeSystem one-way: URL → context/localStorage.
 * - Callers (e.g. SystemSwitcher) must navigate only; they must not call setActiveSystem directly.
 * - This layout is a guard/sync shell only. Most child routes under /:systemId/*
 *   render <SystemTabsNav /> directly below their <PageHeader />, but route-specific
 *   sections may intentionally replace that secondary navigation when they need a
 *   different UX contract.
 */
export function SystemTabsLayout() {
  const { systemId } = useParams<{ systemId: string }>();
  const bareSystemMatch = useMatch('/:systemId');
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

  // Redirect guards
  if (!systems.length) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }

  if (!normalizedSystemId || !systemExists) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }

  // Bare /:systemId (no tab) → redirect to overview
  if (bareSystemMatch?.params.systemId === normalizedSystemId) {
    return <Navigate to={toSystemOverview(normalizedSystemId)} replace />;
  }

  return <Outlet />;
}
