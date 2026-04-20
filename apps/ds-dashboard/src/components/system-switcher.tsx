import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDesignSystem } from '@/lib/design-system-context';
import { APP_TITLE } from '@/lib/app-title';
import {
  ROUTE_PATTERNS,
  toSystemOverview,
  toSystemAdmin,
  toSystemConsumers,
  toSystemOperations,
} from '@/lib/routes';
import { resolveSystemTab } from '@/lib/resolve-system-tab';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * SystemSwitcher — navigates to the same tab on the newly selected system.
 *
 * URL-first sync rule:
 * - This component only navigates; it does NOT call setActiveSystem.
 * - The SystemTabsLayout handles one-way URL → context sync.
 */
export function SystemSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { systems, activeSystem } = useDesignSystem();
  const navigate = useNavigate();
  const location = useLocation();
  const hasSystems = systems.length > 0;
  const selectValue = hasSystems ? activeSystem : '';

  const handleSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'new-system') {
      navigate(ROUTE_PATTERNS.newSystem);
      return;
    }
    // Preserve current tab when switching systems
    const currentTab = resolveSystemTab(location.pathname);
    if (currentTab === 'admin') {
      navigate(toSystemAdmin(value));
    } else if (currentTab === 'consumers') {
      navigate(toSystemConsumers(value));
    } else if (currentTab === 'operations') {
      navigate(toSystemOperations(value));
    } else {
      navigate(toSystemOverview(value));
    }
  };

  return (
    <div className={cn('mt-2 flex flex-col gap-2', collapsed && 'sr-only')}>
      <h1 className="flex w-full flex-nowrap items-center justify-center gap-2 whitespace-nowrap text-center text-2xl font-titles font-semibold tracking-tight">
        <img
          src="/branding/logo_DS_Graph.svg"
          alt=""
          aria-hidden="true"
          className="block h-7 w-7 shrink-0"
        />
        <span>{APP_TITLE}</span>
      </h1>

      <div className="mt-1">
        <Select
          value={selectValue}
          onChange={handleSystemChange}
          className="w-full text-sm font-medium h-9"
        >
          {!hasSystems ? (
            <>
              <option value="" disabled>
                No design systems configured
              </option>
              <option value="new-system">+ Add New Design System</option>
            </>
          ) : (
            <>
              {systems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.name}
                </option>
              ))}
              <option disabled>──────────</option>
              <option value="new-system">+ Add new system...</option>
            </>
          )}
        </Select>
      </div>
    </div>
  );
}
