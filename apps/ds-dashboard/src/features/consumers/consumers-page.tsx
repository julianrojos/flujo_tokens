import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { AddConsumerModal } from './components/add-consumer-modal';
import { useDsFileKey } from '@/hooks/use-ds-file-key';
import { useDesignSystem } from '@/lib/design-system-context';
import { toSystemAdmin } from '@/lib/routes';
import { fetchReportByFile } from '@/lib/api';

export function ConsumersPage() {
  const navigate = useNavigate();
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

      {consumersPresenceQuery.data === true ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setAddModalOpen(true)}>
            Add Consumer File
          </Button>
        </div>
      ) : null}

      <ConsumerTabByFile
        dsFileKey={dsFileKey}
        reloadToken={reloadToken}
        onAddConsumer={() => setAddModalOpen(true)}
      />

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
