/**
 * Component Detail Page - orchestrator only.
 */

import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/composites";
import { StatusAlert } from "@/components/ui/status-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useComponentDetail } from "./hooks/use-component-detail";
import { useFigmaDescriptions } from "./hooks/use-figma-descriptions";
import { ComponentNavBar } from "./components/component-nav-bar";
import { ComponentVisualProofSection } from "./components/component-visual-proof-section";
import { ComponentSpecSection } from "./components/component-spec-section";
import { LayerTokenMappingSection } from "./components/layer-token-mapping-section";
import { ComponentGraphSection } from "./components/component-graph-section";
import { ComponentAdoptionSection } from "./components/component-adoption-section";
import { toComponentEditDocs } from "@/lib/routes";

function buildFigmaNodeUrl(fileUrl: string | null | undefined, nodeId: string | null | undefined) {
  const normalizedFileUrl = String(fileUrl || "").trim();
  if (!normalizedFileUrl) return null;

  const normalizedNodeId = String(nodeId || "").trim();
  if (!normalizedNodeId) return normalizedFileUrl;

  if (typeof URL.canParse === "function" && !URL.canParse(normalizedFileUrl)) {
    return normalizedFileUrl;
  }

  try {
    const parsed = new URL(normalizedFileUrl);
    parsed.searchParams.set("node-id", normalizedNodeId);
    return parsed.toString();
  } catch {
    return normalizedFileUrl;
  }
}

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
  };

  if (error || (!loading && !item)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Component not found" description={slug} />
        <StatusAlert
          variant="error"
          description={error || `Component "${slug}" not found`}
        />
        <Button variant="outline" onClick={handleBack}>← Back</Button>
      </div>
    );
  }

  const pageTitle = item?.display_name || slug || "Component";
  const pageDescription = item?.slug || slug || "";
  const figmaUrl = buildFigmaNodeUrl(
    item?.figma.file_url,
    item?.figma.component_set_node_id,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        actions={
          figmaUrl ? (
            <a
              href={figmaUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
              aria-label={`Open ${pageTitle} in Figma`}
            >
              <span>Open in Figma</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null
        }
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
      />

      <LayerTokenMappingSection entries={spec?.layer_token_mapping ?? []} tokenCatalog={tokenCatalog} />

      <ComponentGraphSection usage={usage} allItems={allItems} />

      {slug && <ComponentAdoptionSection slug={slug} allItems={allItems} />}
    </div>
  );
}
