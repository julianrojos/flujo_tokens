/**
 * Component Detail Page - orchestrator only.
 */

import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/composites";
import { StatusAlert } from "@/components/ui/status-alert";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { FigmaCaptureModal } from "./figma-capture-modal";
import { useComponentDetail } from "./hooks/use-component-detail";
import { useFigmaDescriptions } from "./hooks/use-figma-descriptions";
import { ComponentNavBar } from "./components/component-nav-bar";
import { ComponentVisualProofSection } from "./components/component-visual-proof-section";
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
    hasEditorialSpec,
    isEditorialSpecStatusUnknown,
    tokenCatalog,
    captureModalOpen,
    captureSummary,
    canOpenDocs,
    previousItem,
    nextItem,
    currentIndex,
    totalItems,
    downloadError,
    downloadWarnings,
    isDownloadingMarkdown,
    setCaptureModalOpen,
    setCaptureSummary,
    handleReload,
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

  const isInitialLoading = loading && !item;

  if (isInitialLoading) {
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
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          <Loader size="sm" />
          <span>Loading component details…</span>
        </div>
      ) : null}

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
      />

      <ComponentVisualProofSection
        item={item}
        captureSummary={captureSummary}
        onOpenCapture={() => setCaptureModalOpen(true)}
        variantVisuals={spec?.variant_visuals}
      />

      <ComponentSpecSection
        spec={spec}
        canOpenDocs={canOpenDocs}
        showDownloadMarkdown={hasEditorialSpec || isEditorialSpecStatusUnknown}
        isDownloadingMarkdown={isDownloadingMarkdown}
        downloadError={downloadError}
        downloadWarnings={downloadWarnings}
        onDownloadMarkdown={handleDownloadMarkdown}
        onOpenEditorial={() => navigate(toComponentEditDocs(slug ?? ""))}
        figmaComponentSetDescription={descriptionsData.componentSetDescription}
        figmaVariantDescriptions={descriptionsData.variantDescriptions}
        figmaSyncedAt={descriptionsData.syncedAt}
      />

      <LayerTokenMappingSection entries={spec?.layer_token_mapping ?? []} tokenCatalog={tokenCatalog} />

      <ComponentGraphSection usage={usage} allItems={allItems} />

      {slug && <ComponentAdoptionSection slug={slug} allItems={allItems} />}

      {captureModalOpen && (
        <FigmaCaptureModal
          open={captureModalOpen}
          onClose={() => setCaptureModalOpen(false)}
          defaultFigmaUrl={item.figma.file_url || ""}
          componentSlug={slug!}
          onCaptured={(summary) => {
            setCaptureSummary(
              `Captured ${summary.capturedCount}, failed ${summary.failedCount}, skipped ${summary.skippedCount}.`,
            );
            handleReload();
          }}
        />
      )}
    </div>
  );
}
