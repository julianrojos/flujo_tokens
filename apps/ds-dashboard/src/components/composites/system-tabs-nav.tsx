import { NavLink, useLocation, useParams } from 'react-router-dom';

import { resolveSystemTab } from '@/lib/resolve-system-tab';
import { toSystemAdmin, toSystemConsumers, toSystemOverview } from '@/lib/routes';
import { cn } from '@/lib/utils';

type SystemTab = {
  id: 'overview' | 'admin' | 'consumers';
  label: string;
  to: (systemId: string) => string;
};

const SYSTEM_TABS: SystemTab[] = [
  { id: 'overview', label: 'Overview', to: toSystemOverview },
  { id: 'admin', label: 'Admin', to: toSystemAdmin },
  { id: 'consumers', label: 'Consumer Files', to: toSystemConsumers },
];

export function SystemTabsNav() {
  const location = useLocation();
  const { systemId } = useParams<{ systemId: string }>();
  const normalizedSystemId = String(systemId || '').trim();
  const activeTab = resolveSystemTab(location.pathname);

  if (!normalizedSystemId) return null;

  return (
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
  );
}
