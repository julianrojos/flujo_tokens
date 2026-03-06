import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Camera, ExternalLink, FilePenLine } from "lucide-react";

import {
  fetchComponentRegistry,
  fetchComponentSpec,
  fetchComponentUsageIndex,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
} from "@/lib/api";
import type { ComponentRegistryItem, PipelineStage } from "@/types/component-registry";
import type { ComponentUsageEntry, ComponentUsageIndex } from "@/types/component-usage-index";
import type { PartialComponentSpec } from "ds-types";
import type { TokenEntry, TokenRegistry } from "@/types/token-registry";
import type { TokenUsageIndex } from "@/types/token-usage-index";
import { ComponentSpecViewer } from "./component-spec-viewer";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FigmaCaptureModal } from "./figma-capture-modal";
import { SpecEditorDrawer } from "@/features/spec-editor/spec-editor-drawer";

const ComponentSpecEditor = lazy(() => import("./component-spec-editor").then(module => ({
  default: module.ComponentSpecEditor,
})));
const ComponentDocsModal = lazy(() => import("./component-docs-modal").then(module => ({
  default: module.ComponentDocsModal,
})));

const ModalLoadingFallback = ({ message, zIndex }: { message: string; zIndex: number }) => (
  <div
    className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
    style={{ zIndex }}
  >
    <div className="rounded-xl border border-border bg-card p-6 shadow-2xl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        {message}
      </div>
    </div>
  </div>
);

const EMPTY_COMPONENT_USAGE_INDEX: ComponentUsageIndex = { by_slug: {} };

// ─── Pipeline timeline ────────────────────────────────────────────────────────

const PIPELINE_STAGES: PipelineStage[] = [
  "missing-spec",
  "spec",
  "markdown",
  "render",
  "visual-proof",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  "missing-spec": "Missing spec",
  spec: "Spec",
  markdown: "Markdown",
  render: "Render",
  "visual-proof": "Visual proof",
};

function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

function PipelineTimeline({ current }: { current: PipelineStage }) {
  const currentIdx = stageIndex(current);
  return (
    <div className="flex items-center gap-0">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isLast = idx === PIPELINE_STAGES.length - 1;
        return (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  isDone
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {isDone ? "✓" : idx + 1}
              </div>
              <span
                className={[
                  "hidden text-[10px] md:block",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>
            {!isLast ? (
              <div
                className={[
                  "mx-1 mb-4 h-0.5 w-8 md:w-12",
                  isDone ? "bg-emerald-500" : "bg-border",
                ].join(" ")}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

function stageBadge(stage: PipelineStage) {
  if (stage === "render" || stage === "visual-proof") return "success" as const;
  if (stage === "markdown") return "warning" as const;
  return "neutral" as const;
}

function statusBadge(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "needs-review") return "warning" as const;
  return "neutral" as const;
}

function truncateHash(value: string | null | undefined, size = 8) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (raw.length <= size) return raw;
  return `${raw.slice(0, size)}…`;
}

function buildAssetUrl(
  projectPath: string | null | undefined,
  cacheKey?: string | null,
) {
  const value = String(projectPath || "").trim();
  if (!value) return null;
  const search = new URLSearchParams({
    path: value,
  });
  if (cacheKey) {
    search.set("t", cacheKey);
  }
  return `/api/asset?${search.toString()}`;
}

function toPascalCase(value: string) {
  return String(value || "")
    .replace(/[_\-.]+/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function extractFigmaFileKey(figmaUrl: string | null | undefined) {
  const source = String(figmaUrl || "").trim();
  if (!source) return "TBD";
  try {
    const parsed = new URL(source);
    const match = parsed.pathname.match(/\/(?:design|file)\/([^/]+)/i);
    return match?.[1] || "TBD";
  } catch {
    return "TBD";
  }
}

function buildSpecTemplate(item: ComponentRegistryItem) {
  const name = toPascalCase(item.display_name || item.slug);
  const figmaFileKey = extractFigmaFileKey(item.figma.file_url);
  const nodeId = String(item.figma.component_set_node_id || "").trim();
  const nodeIdLine = nodeId ? `  component_set_node_id: ${nodeId}\n` : "";
  return [
    `name: ${name}`,
    "status: draft",
    "figma:",
    `  file: ${figmaFileKey}`,
    "  page: TBD",
    `  component_set: ${name}`,
    nodeIdLine ? `${nodeIdLine.trimEnd()}` : null,
    "summary:",
    "  purpose: TBD",
    "  when_to_use: TBD",
    "  when_not_to_use: TBD",
    "anatomy:",
    "  - id: container",
    "    description: TBD",
    "properties:",
    "  - name: state",
    "    type: enum",
    "    values:",
    "      - Default",
    "    default: Default",
    "    required: true",
    "    description: TBD",
    "content_guidelines:",
    "  rules:",
    "    - TBD",
    "best_practices:",
    "  do:",
    "    - TBD",
    "  dont:",
    "    - TBD",
    "accessibility:",
    "  role: TBD",
    "  focus:",
    "    tokens:",
    "      inner: TBD",
    "      outer: TBD",
    "  hit_area:",
    "    desktop_token: TBD",
    "    mobile_token: TBD",
    "  labeling:",
    "    rules:",
    "      - TBD",
    "token_mapping:",
    "  container.background:",
    "    state=Default: TBD",
    "qa:",
    '  - "Properties match Figma component-set controls."',
    '  - "Artwork layer includes a hidden source instance that drives anatomy, properties, and layout/spacing exhibits."',
    '  - "Token references resolve in token registry."',
    "related_components: []",
    "",
  ]
    .filter((row): row is string => Boolean(row))
    .join("\n");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ComponentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ComponentRegistryItem | null>(null);
  const [usage, setUsage] = useState<ComponentUsageEntry | null>(null);
  const [allItems, setAllItems] = useState<ComponentRegistryItem[]>([]);
  const [spec, setSpec] = useState<PartialComponentSpec | null>(null);
  const [specRaw, setSpecRaw] = useState("");
  const [specRawHash, setSpecRawHash] = useState<string | null>(null);
  const [tokenRegistry, setTokenRegistry] = useState<TokenRegistry | null>(null);
  const [tokenUsageIndex, setTokenUsageIndex] = useState<TokenUsageIndex | null>(null);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [specEditorOpen, setSpecEditorOpen] = useState(false);
  const [editorialEditorOpen, setEditorialEditorOpen] = useState(false);
  const [captureSummary, setCaptureSummary] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex, specPayload, tokenRegistryPayload, tokenUsagePayload] =
          await Promise.all([
          fetchComponentRegistry(),
          fetchComponentUsageIndex().catch(() => EMPTY_COMPONENT_USAGE_INDEX),
          fetchComponentSpec(slug).catch(() => null),
          fetchTokenRegistry().catch(() => null),
          fetchTokenUsageIndex().catch(() => null),
        ]);
        const found = registry.components.find((c) => c.slug === slug) ?? null;
        setItem(found);
        setAllItems(registry.components);
        setUsage(usageIndex.by_slug[slug] ?? null);
        const hasSpec = Boolean(specPayload?.ok && specPayload.exists);
        setSpec(
          hasSpec && specPayload?.parsed ? (specPayload.parsed as PartialComponentSpec) : null,
        );
        setSpecRawHash(specPayload?.rawHash ?? null);
        setSpecRaw(
          hasSpec
            ? specPayload?.raw ?? ""
            : found
              ? buildSpecTemplate(found)
              : "",
        );
        setTokenRegistry(tokenRegistryPayload);
        setTokenUsageIndex(tokenUsagePayload);
        setDocsModalOpen(false);
        setEditorialEditorOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [slug, reloadNonce]);

  const componentBySlug = useMemo(() => {
    const map: Record<string, ComponentRegistryItem> = {};
    for (const component of allItems) {
      map[component.slug] = component;
    }
    return map;
  }, [allItems]);
  const orderedSlugs = useMemo(() => {
    return allItems
      .slice()
      .sort((left, right) => {
        const leftValue = `${left.display_name} ${left.slug}`.toLowerCase();
        const rightValue = `${right.display_name} ${right.slug}`.toLowerCase();
        return leftValue.localeCompare(rightValue);
      })
      .map((component) => component.slug);
  }, [allItems]);
  const currentPosition = useMemo(() => {
    if (!slug) return -1;
    return orderedSlugs.indexOf(slug);
  }, [orderedSlugs, slug]);
  const previousSlug =
    currentPosition > 0 ? orderedSlugs[currentPosition - 1] : null;
  const nextSlug =
    currentPosition >= 0 && currentPosition < orderedSlugs.length - 1
      ? orderedSlugs[currentPosition + 1]
      : null;

  const usesSlugs = usage?.uses ?? [];
  const usedInSlugs = usage?.used_in ?? [];
  const localProofImageUrl = buildAssetUrl(
    item?.visual_proof?.image_path,
    item?.visual_proof?.captured_at || null,
  );
  const visualProofSrc =
    localProofImageUrl || item?.visual_proof?.screenshot_url || null;
  const visualVariantSources = useMemo(() => {
    const variants = Array.isArray(item?.visual_proof?.variants)
      ? item.visual_proof.variants
      : [];
    return variants
      .map((variant, index) => {
        const localUrl = buildAssetUrl(variant.image_path, variant.captured_at || null);
        const src = localUrl || variant.screenshot_url || null;
        if (!src) return null;
        return {
          key: `${variant.node_id || variant.name || "variant"}-${index}`,
          name: variant.name || `Variant ${index + 1}`,
          src,
          nodeId: variant.node_id || null,
          capturedAt: variant.captured_at || null,
          imageSha256: variant.image_sha256 || null,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      name: string;
      src: string;
      nodeId: string | null;
      capturedAt: string | null;
      imageSha256: string | null;
    }>;
  }, [item]);

  const resolveTokenMeta = useMemo(() => {
    if (!tokenRegistry) return null;
    return (tokenRef: string): { token: TokenEntry | null; usageCount: number | null } => {
      const ref = String(tokenRef || "").trim();
      if (!ref) return { token: null, usageCount: null };
      const token =
        tokenRegistry.bySlashPath?.[ref] ?? tokenRegistry.byPath?.[ref] ?? null;
      if (!token) return { token: null, usageCount: null };
      const usageEntry =
        tokenUsageIndex?.byPath?.[token.path] ??
        tokenUsageIndex?.bySlashPath?.[token.slashPath] ??
        null;
      return { token, usageCount: usageEntry ? usageEntry.usageCount : null };
    };
  }, [tokenRegistry, tokenUsageIndex]);

  const nextStep = useMemo(() => {
    if (!item) return null;

    if (item.pipeline_stage === "missing-spec") {
      return {
        title: "Next step",
        description: "Create the component spec to move into the spec stage.",
        cta: "Create spec",
        onClick: () => setSpecEditorOpen(true),
      };
    }

    if (item.pipeline_stage === "spec") {
      return {
        title: "Next step",
        description: "Complete and validate the spec before generating markdown docs.",
        cta: "Edit spec",
        onClick: () => setSpecEditorOpen(true),
      };
    }

    if (item.pipeline_stage === "markdown" || item.pipeline_stage === "render") {
      if (item.figma.file_url) {
        return {
          title: "Next step",
          description: "Capture visual proof from Figma to complete documentation evidence.",
          cta: "Capture visual proof",
          onClick: () => setCaptureModalOpen(true),
        };
      }
      return {
        title: "Next step",
        description: "Add a Figma source URL to capture visual proof for this component.",
        cta: null,
        onClick: null,
      };
    }

    return {
      title: "Next step",
      description: "Component is in visual-proof stage. Verify docs and publish when ready.",
      cta: item.paths.doc ? "Open docs" : null,
      onClick: item.paths.doc ? () => setDocsModalOpen(true) : null,
    };
  }, [item]);

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/components")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Componentes
        </Button>
        {previousSlug ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/components/${previousSlug}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Prev
          </Button>
        ) : null}
        {nextSlug ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/components/${nextSlug}`)}
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
        {orderedSlugs.length > 0 && currentPosition >= 0 ? (
          <span className="text-xs text-muted-foreground">
            {currentPosition + 1} / {orderedSlugs.length}
          </span>
        ) : null}
        {!loading && item ? (
          <Badge variant={stageBadge(item.pipeline_stage)}>{item.pipeline_stage}</Badge>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {captureSummary ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
          {captureSummary}
        </div>
      ) : null}

      {!loading && !error && !item ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
          Component <span className="font-mono">{slug}</span> not found in registry.
        </div>
      ) : null}

      {loading ? (
        <>
          <Card>
            <CardHeader>
              <div className="h-6 w-48 animate-pulse rounded bg-muted/70" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted/60" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-36 animate-pulse rounded bg-muted/70" />
            </CardHeader>
            <CardContent>
              <div className="aspect-video w-full animate-pulse rounded-lg bg-muted/60" />
            </CardContent>
          </Card>
        </>
      ) : null}

      {!loading && item ? (
        <>
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{item.display_name}</CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">{item.slug}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCaptureModalOpen(true)}
                    aria-label={`Update ${item.display_name} from Figma URL`}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Update from Figma URL
                  </Button>
                  {item.doc.exists && item.paths.doc ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDocsModalOpen(true)}
                      aria-label={`Open ${item.display_name} documentation`}
                    >
                      View docs (rendered)
                    </Button>
                  ) : null}
                  {item.figma.file_url ? (
                    <a
                      href={item.figma.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      aria-label={`Open ${item.display_name} in Figma`}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Figma
                    </a>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={stageBadge(item.pipeline_stage)}>
                  Stage: {STAGE_LABELS[item.pipeline_stage]}
                </Badge>
                <Badge variant={statusBadge(item.doc.status)}>Doc: {item.doc.status}</Badge>
                <Badge variant={statusBadge(item.spec.status)}>Spec: {item.spec.status}</Badge>
                <Badge variant={item.ready_for_publish ? "success" : "neutral"}>
                  Ready: {item.ready_for_publish ? "Yes" : "No"}
                </Badge>
              </div>
              <details className="mt-4 rounded-lg border border-border/70 bg-background/60 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Technical details</summary>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-foreground/80">Spec path</dt>
                    <dd className="font-mono">{item.paths.spec || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Doc path</dt>
                    <dd className="font-mono">{item.paths.doc || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Figma node</dt>
                    <dd className="font-mono">{item.figma.component_set_node_id || "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Visual hash</dt>
                    <dd className="font-mono">{truncateHash(item.visual_proof.image_sha256)}</dd>
                  </div>
                </dl>
              </details>
            </CardContent>
          </Card>

          {/* Visual proof */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Visual Proof</CardTitle>
                {item.figma.file_url ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCaptureModalOpen(true)}
                    aria-label={`Capture visual proof for ${item.display_name}`}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Update from Figma URL
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {item.visual_proof.exists && visualProofSrc ? (
                <>
                  <img
                    src={visualProofSrc}
                    alt={`Visual proof for ${item.display_name}`}
                    className="max-w-full rounded-lg border border-border"
                  />
                  <details className="mt-3 rounded-lg border border-border/70 bg-background/60 p-3 text-xs">
                    <summary className="cursor-pointer font-semibold">Capture metadata</summary>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-muted-foreground md:grid-cols-2">
                      <div>
                        <dt className="font-medium text-foreground/80">Captured at</dt>
                        <dd>{item.visual_proof.captured_at || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground/80">Node ID</dt>
                        <dd className="font-mono">
                          {item.visual_proof.node_id || item.figma.component_set_node_id || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground/80">Image hash</dt>
                        <dd className="font-mono">{truncateHash(item.visual_proof.image_sha256)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground/80">Resolution</dt>
                        <dd>
                          {item.visual_proof.image_width && item.visual_proof.image_height
                            ? `${item.visual_proof.image_width} × ${item.visual_proof.image_height}`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </details>
                  {visualVariantSources.length > 0 ? (
                    <div className="mt-5 space-y-3">
                      <div className="text-sm font-semibold">Variants</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {visualVariantSources.map((variant) => (
                          <div
                            key={variant.key}
                            className="rounded-md border border-border p-2"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                              <span className="font-medium">{variant.name}</span>
                              {variant.nodeId ? (
                                <span className="font-mono text-muted-foreground">
                                  {variant.nodeId}
                                </span>
                              ) : null}
                            </div>
                            <img
                              src={variant.src}
                              alt={`Variant ${variant.name} of ${item.display_name}`}
                              className="max-w-full rounded border border-border"
                            />
                            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                              {variant.capturedAt ? (
                                <span>Captured: {variant.capturedAt}</span>
                              ) : null}
                              {variant.imageSha256 ? (
                                <span className="font-mono">
                                  Hash: {truncateHash(variant.imageSha256)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-md border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                  No visual proof available yet for this component.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>
                Etapa actual:{" "}
                <span className="font-semibold">{STAGE_LABELS[item.pipeline_stage]}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PipelineTimeline current={item.pipeline_stage} />
              {nextStep ? (
                <div className="mt-4 rounded-lg border border-border/70 bg-background/60 p-3">
                  <p className="text-sm font-semibold">{nextStep.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{nextStep.description}</p>
                  {nextStep.cta && nextStep.onClick ? (
                    <Button variant="outline" size="sm" className="mt-3" onClick={nextStep.onClick}>
                      {nextStep.cta}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Spec */}
          {spec ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Component Spec</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {item.paths.spec}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditorialEditorOpen(true)}
                    disabled={editorialEditorOpen}
                  >
                    <FilePenLine className="mr-2 h-4 w-4" />
                    Edit summary (spec source)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpecEditorOpen(true)}
                  >
                    <FilePenLine className="mr-2 h-4 w-4" />
                    Edit spec
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ComponentSpecViewer
                  spec={spec}
                  resolveToken={resolveTokenMeta ?? undefined}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Component Spec</CardTitle>
                    <CardDescription className="text-amber-600">
                      Spec file not available for this component.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSpecEditorOpen(true)}
                  >
                    <FilePenLine className="mr-2 h-4 w-4" />
                    Create spec
                  </Button>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Component relationships */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Uses</CardTitle>
                <CardDescription>Componentes que este usa</CardDescription>
              </CardHeader>
              <CardContent>
                {usesSlugs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguno registrado.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {usesSlugs.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => navigate(`/components/${s}`)}
                        >
                          {componentBySlug[s]?.display_name ?? s}
                        </button>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{s}</span>
                        {componentBySlug[s]?.pipeline_stage ? (
                          <Badge
                            variant={stageBadge(componentBySlug[s].pipeline_stage)}
                            className="ml-2"
                          >
                            {STAGE_LABELS[componentBySlug[s].pipeline_stage]}
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Used In</CardTitle>
                <CardDescription>Componentes que lo usan</CardDescription>
              </CardHeader>
              <CardContent>
                {usedInSlugs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguno registrado.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {usedInSlugs.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => navigate(`/components/${s}`)}
                        >
                          {componentBySlug[s]?.display_name ?? s}
                        </button>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{s}</span>
                        {componentBySlug[s]?.pipeline_stage ? (
                          <Badge
                            variant={stageBadge(componentBySlug[s].pipeline_stage)}
                            className="ml-2"
                          >
                            {STAGE_LABELS[componentBySlug[s].pipeline_stage]}
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {item && editorialEditorOpen ? (
        <Suspense fallback={<ModalLoadingFallback message="Loading editor..." zIndex={1102} />}>
          <ComponentSpecEditor
            open={true}
            slug={item.slug}
            spec={spec}
            expectedHash={specRawHash}
            onCancel={() => setEditorialEditorOpen(false)}
            onSaved={({ message, rawHash }) => {
              setCaptureSummary(
                `${message} Docs may be outdated until markdown is regenerated.`,
              );
              setSpecRawHash(rawHash);
              setReloadNonce((prev) => prev + 1);
              setEditorialEditorOpen(false);
            }}
          />
        </Suspense>
      ) : null}

      {item && item.doc.exists && item.paths.doc && docsModalOpen ? (
        <Suspense fallback={<ModalLoadingFallback message="Loading docs..." zIndex={1003} />}>
          <ComponentDocsModal
            open={true}
            onClose={() => setDocsModalOpen(false)}
            filePath={item.paths.doc}
            displayName={item.display_name}
          />
        </Suspense>
      ) : null}

      {item ? (
        <SpecEditorDrawer
          open={specEditorOpen}
          slug={item.slug}
          displayName={item.display_name}
          specPath={item.paths.spec || null}
          initialRaw={specRaw}
          initialHash={specRawHash}
          tokenRegistry={tokenRegistry}
          onClose={() => setSpecEditorOpen(false)}
          onSaved={({ message }) => {
            setCaptureSummary(message);
            setReloadNonce((prev) => prev + 1);
          }}
        />
      ) : null}

      {item ? (
        <FigmaCaptureModal
          open={captureModalOpen}
          onClose={() => setCaptureModalOpen(false)}
          defaultFigmaUrl={item.figma.file_url || ""}
          componentSlug={item.slug}
          onCaptured={(summary) => {
            setCaptureSummary(
              `Capture completed: ${summary.capturedCount} captured, ${summary.failedCount} failed, ${summary.skippedCount} skipped.`,
            );
            setReloadNonce((prev) => prev + 1);
          }}
        />
      ) : null}
    </div>
  );
}
