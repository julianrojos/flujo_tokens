import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Network } from 'lucide-react';

import { EmptyState, EmptyStateAction, PageHeader } from '@/components/composites';
import { SystemTabsNav } from '@/components/composites/system-tabs-nav';
import { useDsFileKey } from '@/hooks/use-ds-file-key';
import { useDesignSystem } from '@/lib/design-system-context';
import { toSystemAdmin } from '@/lib/routes';
import { AddConsumerModal } from './components/add-consumer-modal';
import { ConsumerTabByFile } from './components/consumer-tab-by-file';

export function ConsumersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [refreshingPresence, setRefreshingPresence] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const { dsFileKey, loading: resolvingDsFileKey } = useDsFileKey();
  const { activeSystem } = useDesignSystem();

  if (resolvingDsFileKey) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumers"
          description="Administrative consumer file management"
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
          title="Consumers"
          description="Administrative consumer file management"
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
        title="Consumers"
        description="Administrative consumer file management"
      />
      <SystemTabsNav />

      <ConsumerTabByFile
        dsFileKey={dsFileKey}
        reloadToken={reloadToken}
        onAddConsumer={() => setAddModalOpen(true)}
        isAddConsumerRefreshing={refreshingPresence}
      />

      <AddConsumerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        dsFileKey={dsFileKey}
        onSuccess={async () => {
          setAddModalOpen(false);
          setReloadToken((value) => value + 1);
          setRefreshingPresence(true);
          try {
            await queryClient.invalidateQueries({
              queryKey: ['sidebar-consumers-presence', activeSystem, dsFileKey],
            });
          } finally {
            setRefreshingPresence(false);
          }
        }}
      />
    </div>
  );
}
