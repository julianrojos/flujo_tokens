import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/composites/page-header';
import { SystemTabsNav } from '@/components/composites/system-tabs-nav';
import {
  EmptyState,
  EmptyStateAction,
} from '@/components/composites/empty-state';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';
import { ConsumerTabByFile } from './components/consumer-tab-by-file';
import { ConsumerTabByComponent } from './components/consumer-tab-by-component';
import { ConsumerTabByVariable } from './components/consumer-tab-by-variable';
import { AddConsumerModal } from './components/add-consumer-modal';
import { useDsFileKey } from '@/hooks/use-ds-file-key';
import { useDesignSystem } from '@/lib/design-system-context';
import { toSystemAdmin } from '@/lib/routes';
import { fetchReportByFile } from '@/lib/api';

type TabKey = 'by-file' | 'by-component' | 'by-variable';
const TAB_KEYS: TabKey[] = ['by-file', 'by-component', 'by-variable'];

function resolveActiveTab(value: string | null): TabKey {
  if (value && TAB_KEYS.includes(value as TabKey)) {
    return value as TabKey;
  }
  return 'by-file';
}

export function ConsumersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const { dsFileKey, loading: resolvingDsFileKey } = useDsFileKey();
  const { activeSystem } = useDesignSystem();
  const consumersPresenceQuery = useQuery({
    queryKey: ['consumer-files-presence', dsFileKey, reloadToken],
    queryFn: async () => {
      const response = await fetchReportByFile(dsFileKey || '', {
        staleOnly: false,
      });
      return (response.data?.length ?? 0) > 0;
    },
    enabled: Boolean(dsFileKey),
  });

  const activeTab = resolveActiveTab(searchParams.get('tab'));

  const setActiveTab = (tab: TabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'by-file', label: 'By File' },
    { key: 'by-component', label: 'By Component' },
    { key: 'by-variable', label: 'By Variable' },
  ];

  if (resolvingDsFileKey) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumer Files"
          description="Cross-file usage tracking for design system tokens"
        />
        <SystemTabsNav />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Loading consumer context...
          </p>
        </div>
      </div>
    );
  }

  if (!dsFileKey) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumer Files"
          description="Cross-file usage tracking for design system tokens"
        />
        <SystemTabsNav />
        <EmptyState
          icon={Network}
          title="No Figma File ID configured"
          description="Set the Figma File ID in Design Systems Admin to enable consumer file tracking."
          action={
            <EmptyStateAction
              onClick={() =>
                navigate(activeSystem ? toSystemAdmin(activeSystem) : '/new')
              }
            >
              Go to Admin
            </EmptyStateAction>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consumer Files"
      />
      <SystemTabsNav />

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {consumersPresenceQuery.data !== false
            ? tabs.map((tab) => (
                <Button
                  key={tab.key}
                  variant={activeTab === tab.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </Button>
              ))
            : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddModalOpen(true)}
        >
          Add Consumer File
        </Button>
      </div>

      {activeTab === 'by-file' && (
        <ConsumerTabByFile
          dsFileKey={dsFileKey}
          reloadToken={reloadToken}
          onAddConsumer={() => setAddModalOpen(true)}
        />
      )}
      {activeTab === 'by-component' && (
        <ConsumerTabByComponent dsFileKey={dsFileKey} reloadToken={reloadToken} />
      )}
      {activeTab === 'by-variable' && (
        <ConsumerTabByVariable dsFileKey={dsFileKey} reloadToken={reloadToken} />
      )}

      <AddConsumerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        dsFileKey={dsFileKey}
        onSuccess={() => {
          setAddModalOpen(false);
          setReloadToken((value) => value + 1);
        }}
      />
    </div>
  );
}
