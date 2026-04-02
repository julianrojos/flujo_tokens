/**
 * Component Detail Page - orchestrator only.
 */

import { Suspense, lazy } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/composites";
import { StatusAlert } from "@/components/ui/status-alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FigmaCaptureModal } from "./figma-capture-modal";
import { useComponentDetail } from "./hooks/use-component-detail";
import { ComponentNavBar } from "./components/component-nav-bar";
import { ComponentPipelineSection } from "./components/component-pipeline-section";
import { ComponentVisualProofSection } from "./components/component-visual-proof-section";
import { ComponentSpecSection } from "./components/component-spec-section";
import { ComponentGraphSection } from "./components/component-graph-section";
import { ComponentAdoptionSection } from "./components/component-adoption-section";
import { STAGE_LABELS } from "./lib/component-detail-transforms";

const SpecEditorDrawer = lazy(() => import("./spec-editor-drawer").then(m => ({ default: m.SpecEditorDrawer })));
const ComponentDocsModal = lazy(() => import("./component-docs-modal").then(m => ({ default: m.ComponentDocsModal })));
const ComponentSpecEditor = lazy(() => import("./component-spec-editor").then(m => ({ default: m.ComponentSpecEditor })));

export function ComponentDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const {
    loading,
    error,
    item,
    usage,
    allItems,
    spec,
    specRaw,
    specRawHash,
    tokenRegistry,
    captureModalOpen,
    docsModalOpen,
    specEditorOpen,
    editorialEditorOpen,
    captureSummary,
    docsFilePath,
    previousItem,
    nextItem,
    currentIndex,
    totalItems,
    setCaptureModalOpen,
    setDocsModalOpen,
    setSpecEditorOpen,
    setEditorialEditorOpen,
    setCaptureSummary,
    handleSpecSaved,
    handleReload,
    handleNavigate,
    handleBack,
    openDocsModal,
  } = useComponentDetail();

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
        hasDocs={item.doc.exists}
        onCapture={() => setCaptureModalOpen(true)}
        onOpenSpec={() => setSpecEditorOpen(true)}
        onOpenDocs={openDocsModal}
      />

      <ComponentGraphSection usage={usage} allItems={allItems} />

      {slug && <ComponentAdoptionSection slug={slug} allItems={allItems} />}

      <ComponentVisualProofSection
        item={item}
        captureSummary={captureSummary}
        onOpenCapture={() => setCaptureModalOpen(true)}
        variantVisuals={spec?.variant_visuals}
      />

      <ComponentSpecSection
        spec={spec}
        hasDocs={item.doc.exists}
        onOpenSpecEditor={() => setSpecEditorOpen(true)}
        onOpenDocs={openDocsModal}
        onOpenEditorial={() => setEditorialEditorOpen(true)}
        selfSlug={item.slug}
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading editor…</div>}>
        {specEditorOpen && (
          <SpecEditorDrawer
            slug={slug!}
            open={specEditorOpen}
            displayName={item.display_name}
            specPath={item.paths.spec}
            initialRaw={specRaw}
            initialHash={specRawHash}
            tokenRegistry={tokenRegistry}
            onClose={() => setSpecEditorOpen(false)}
            onSaved={({ raw, rawHash }) => {
              if (raw !== undefined) {
                handleSpecSaved(raw, rawHash ?? null);
              } else {
                handleReload();
              }
            }}
          />
        )}
        {docsModalOpen && docsFilePath && (
          <ComponentDocsModal
            open={docsModalOpen}
            onClose={() => setDocsModalOpen(false)}
            filePath={docsFilePath}
            displayName={item.display_name}
          />
        )}
        {editorialEditorOpen && (
          <ComponentSpecEditor
            open={editorialEditorOpen}
            slug={slug!}
            spec={spec}
            expectedHash={specRawHash}
            onSaved={() => {
              setEditorialEditorOpen(false);
              handleReload();
            }}
            onCancel={() => setEditorialEditorOpen(false)}
          />
        )}
      </Suspense>

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
