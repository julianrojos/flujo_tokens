import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/composites/page-header";
import { EmptyState, EmptyStateAction } from "@/components/composites/empty-state";
import { Button } from "@/components/ui/button";
import { Network } from "lucide-react";
import { ConsumerTabByFile } from "./components/consumer-tab-by-file";
import { ConsumerTabByComponent } from "./components/consumer-tab-by-component";
import { ConsumerTabByVariable } from "./components/consumer-tab-by-variable";
import { AddConsumerModal } from "./components/add-consumer-modal";
import { useDsFileKey } from "./hooks/use-ds-file-key";

type TabKey = "by-file" | "by-component" | "by-variable";
const TAB_KEYS: TabKey[] = ["by-file", "by-component", "by-variable"];

function resolveActiveTab(value: string | null): TabKey {
  if (value && TAB_KEYS.includes(value as TabKey)) {
    return value as TabKey;
  }
  return "by-file";
}

export function ConsumersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { dsFileKey, loading: resolvingDsFileKey } = useDsFileKey();

  const activeTab = resolveActiveTab(searchParams.get("tab"));

  const setActiveTab = (tab: TabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "by-file", label: "By File" },
    { key: "by-component", label: "By Component" },
    { key: "by-variable", label: "By Variable" },
  ];

  if (resolvingDsFileKey) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Consumer Files"
          description="Cross-file usage tracking for design system tokens"
        />
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading consumer context...</p>
        </div>
      </div>
    );
  }

  if (!dsFileKey) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Consumer Files"
          description="Cross-file usage tracking for design system tokens"
        />
        <EmptyState
          icon={Network}
          title="No Figma File ID configured"
          description="Set the Figma File ID in Design Systems Admin to enable consumer file tracking."
          action={
            <EmptyStateAction onClick={() => (window.location.href = "/system/admin")}>
              Go to Admin
            </EmptyStateAction>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consumer Files"
        description="Track cross-file design system token usage"
      />

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddModalOpen(true)}>
          Add Consumer File
        </Button>
      </div>

      {activeTab === "by-file" && (
        <ConsumerTabByFile
          dsFileKey={dsFileKey}
          onAddConsumer={() => setAddModalOpen(true)}
        />
      )}
      {activeTab === "by-component" && <ConsumerTabByComponent dsFileKey={dsFileKey} />}
      {activeTab === "by-variable" && <ConsumerTabByVariable dsFileKey={dsFileKey} />}

      <AddConsumerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        dsFileKey={dsFileKey}
        onSuccess={() => {
          setAddModalOpen(false);
          // Refresh will happen in the tab component
        }}
      />
    </div>
  );
}
