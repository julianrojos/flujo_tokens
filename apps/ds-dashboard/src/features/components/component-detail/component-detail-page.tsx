/**
 * Component Detail Page - orchestrator only.
 */

import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/composites";
import { StatusAlert } from "@/components/ui/status-alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FigmaCaptureModal } from "./figma-capture-modal";
import { useComponentDetail } from "./hooks/use-component-detail";
import { useFigmaDescriptions } from "./hooks/use-figma-descriptions";
import { ComponentNavBar } from "./components/component-nav-bar";
import { ComponentPipelineSection } from "./components/component-pipeline-section";
import { ComponentVisualProofSection } from "./components/component-visual-proof-section";
import { ComponentSpecSection } from "./components/component-spec-section";
import { LayerTokenMappingSection } from "./components/layer-token-mapping-section";
import { ComponentGraphSection } from "./components/component-graph-section";
import { ComponentAdoptionSection } from "./components/component-adoption-section";
import { STAGE_LABELS } from "./lib/component-detail-transforms";
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

  // S-11 (R-005): React Query for server-state fetching (MUST per §6.4)
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

  const variantsCount =
    item.visual_proof.variants_count ??
    item.visual_proof.variants?.length ??
    0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={item.display_name}
        description={item.slug}
      />

      {/* Stats pills */}
      <div className="flex flex-wrap items-center gap-2">
        {variantsCount > 0 && (
          <Badge variant="neutral">
            {variantsCount} variant{variantsCount !== 1 ? "s" : ""}
          </Badge>
        )}
        <Badge variant="neutral">{STAGE_LABELS[item.pipeline_stage]}</Badge>
        {item.ready_for_publish && (
          <Badge variant="success">Ready to publish</Badge>
        )}
      </div>

      <ComponentNavBar
        previousItem={previousItem}
        nextItem={nextItem}
        currentIndex={currentIndex}
        totalItems={totalItems}
        onNavigate={handleNavigate}
        onBack={handleBack}
      />

      <ComponentPipelineSection
        currentStage={item.pipeline_stage}
        hasFigmaUrl={Boolean(item.figma.file_url)}
        canOpenDocs={canOpenDocs}
        onCapture={() => setCaptureModalOpen(true)}
        onOpenEditorial={() => navigate(toComponentEditDocs(slug ?? ""))}
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
