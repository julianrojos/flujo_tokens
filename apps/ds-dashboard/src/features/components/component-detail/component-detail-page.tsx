/**
 * Component Detail Page - orchestrator only.
 */

import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/composites";
import { StatusAlert } from "@/components/ui/status-alert";
import { Button } from "@/components/ui/button";
import { useComponentDetail } from "./hooks/use-component-detail";
import { useFigmaDescriptions } from "./hooks/use-figma-descriptions";
import { ComponentNavBar } from "./components/component-nav-bar";
import { ComponentSpecSection } from "./components/component-spec-section";
import { LayerTokenMappingSection } from "./components/layer-token-mapping-section";
import { ComponentGraphSection } from "./components/component-graph-section";
import { ComponentAdoptionSection } from "./components/component-adoption-section";
import { toComponentEditDocs } from "@/lib/routes";

export function ComponentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const {
    loading,
    error,
    item,
    usage,
    allItems,
    spec,
    tokenRegistry,
    canOpenDocs,
    previousItem,
    nextItem,
    currentIndex,
    totalItems,
    downloadError,
    downloadWarnings,
    isDownloadingMarkdown,
    handleNavigate,
    handleBack,
    downloadMarkdown,
  } = useComponentDetail();

  const { data: figmaDesc } = useFigmaDescriptions(slug);
  const handleDownloadMarkdown = useCallback(() => {
    void downloadMarkdown();
  }, [downloadMarkdown]);

  const descriptionsData = figmaDesc ?? {
    componentSetDescription: null,
    variantDescriptions: [],
    syncedAt: null,
    stale: true,
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Loading…" description="Loading component details" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-5">
        <PageHeader title="Component not found" description={slug} />
        <StatusAlert variant="error" description={error || `Component "${slug}" not found`} />
        <Button variant="outline" onClick={handleBack}>← Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={item.display_name}
        description={item.slug}
      />

      <ComponentNavBar
        previousItem={previousItem}
        nextItem={nextItem}
        currentIndex={currentIndex}
        totalItems={totalItems}
        onNavigate={handleNavigate}
        onBack={handleBack}
      />

      <ComponentSpecSection
        spec={spec}
        canOpenDocs={canOpenDocs}
        isDownloadingMarkdown={isDownloadingMarkdown}
        downloadError={downloadError}
        downloadWarnings={downloadWarnings}
        onDownloadMarkdown={handleDownloadMarkdown}
        onOpenEditorial={() => navigate(toComponentEditDocs(slug ?? ""))}
        selfSlug={item.slug}
        figmaComponentSetDescription={descriptionsData.componentSetDescription}
        figmaVariantDescriptions={descriptionsData.variantDescriptions}
        figmaSyncedAt={descriptionsData.syncedAt}
        figmaStale={descriptionsData.stale}
      />

      <LayerTokenMappingSection entries={spec?.layer_token_mapping ?? []} tokenRegistry={tokenRegistry} />

      <ComponentGraphSection usage={usage} allItems={allItems} />

      {slug && <ComponentAdoptionSection slug={slug} allItems={allItems} />}
    </div>
  );
}
