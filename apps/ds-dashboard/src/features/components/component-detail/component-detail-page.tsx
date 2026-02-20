import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, ExternalLink } from "lucide-react";

import {
  fetchComponentRegistry,
  fetchComponentSpec,
  fetchComponentUsageIndex,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
} from "@/lib/api";
import type { ComponentRegistryItem, PipelineStage } from "@/types/component-registry";
import type { ComponentUsageEntry, ComponentUsageIndex } from "@/types/component-usage-index";
import type { ComponentSpec } from "@/types/component-spec";
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ComponentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ComponentRegistryItem | null>(null);
  const [usage, setUsage] = useState<ComponentUsageEntry | null>(null);
  const [allItems, setAllItems] = useState<ComponentRegistryItem[]>([]);
  const [spec, setSpec] = useState<ComponentSpec | null>(null);
  const [tokenRegistry, setTokenRegistry] = useState<TokenRegistry | null>(null);
  const [tokenUsageIndex, setTokenUsageIndex] = useState<TokenUsageIndex | null>(null);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
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
        setSpec(specPayload?.ok && specPayload.parsed ? (specPayload.parsed as ComponentSpec) : null);
        setTokenRegistry(tokenRegistryPayload);
        setTokenUsageIndex(tokenUsagePayload);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [slug, reloadNonce]);

  const displayNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of allItems) map[c.slug] = c.display_name;
    return map;
  }, [allItems]);

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

  const tokensUsed = useMemo(() => {
    if (!spec?.token_mapping) return [];
    const map = new Map<
      string,
      { ref: string; occurrences: number; token: TokenEntry | null; usageCount: number | null }
    >();

    for (const [, conditions] of Object.entries(spec.token_mapping)) {
      for (const [, tokenRef] of Object.entries(conditions || {})) {
        const ref = String(tokenRef || "").trim();
        if (!ref || ref.toUpperCase() === "TBD") continue;
        const existing = map.get(ref);
        if (existing) {
          existing.occurrences += 1;
          continue;
        }
        const resolved = resolveTokenMeta ? resolveTokenMeta(ref) : { token: null, usageCount: null };
        map.set(ref, {
          ref,
          occurrences: 1,
          token: resolved.token,
          usageCount: resolved.usageCount,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.ref.localeCompare(b.ref, "en", { sensitivity: "base" }));
  }, [resolveTokenMeta, spec?.token_mapping]);

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/components")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Componentes
        </Button>
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
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading component…
          </CardContent>
        </Card>
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
                  {item.figma.file_url ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setCaptureModalOpen(true)}
                      aria-label={`Capture visual proof for ${item.display_name}`}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Update screenshot
                    </Button>
                  ) : null}
                  {item.doc.exists && item.paths.doc ? (
                    <Link
                      to={{
                        pathname: "/file",
                        search: new URLSearchParams({ path: item.paths.doc }).toString(),
                      }}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      aria-label={`Open ${item.display_name} documentation`}
                    >
                      Docs
                    </Link>
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
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Doc status</dt>
                  <dd className="mt-0.5">
                    <Badge variant={statusBadge(item.doc.status)}>{item.doc.status}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Spec status</dt>
                  <dd className="mt-0.5">
                    <Badge variant={statusBadge(item.spec.status)}>{item.spec.status}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ready for publish</dt>
                  <dd className="mt-0.5 font-medium">{item.ready_for_publish ? "Yes" : "No"}</dd>
                </div>
                {item.figma.component_set_node_id ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Figma node</dt>
                    <dd className="mt-0.5 font-mono text-xs">
                      {item.figma.component_set_node_id}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {/* Tokens used */}
          {spec?.token_mapping ? (
            <Card>
              <CardHeader>
                <CardTitle>Tokens used</CardTitle>
                <CardDescription>
                  Tokens referenciados en <span className="font-mono text-xs">token_mapping</span>.
                  {tokenUsageIndex ? null : (
                    <span className="text-amber-600">
                      {" "}
                      Usage index unavailable (refs counts will be missing).
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tokensUsed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay tokens referenciados (o todos son TBD).
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3">Token</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">CSS Var</th>
                          <th className="py-2 pr-3">Resolved</th>
                          <th className="py-2 pr-3">Refs</th>
                          <th className="py-2 pr-3">Occurrences</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokensUsed.map((row) => (
                          <tr key={row.ref} className="border-b border-border/60">
                            <td className="py-2 pr-3">
                              {row.token ? (
                                <Link
                                  to={`/tokens/${encodeURIComponent(row.token.path)}`}
                                  className="font-mono text-xs text-primary hover:underline"
                                >
                                  {row.ref}
                                </Link>
                              ) : (
                                <span className="font-mono text-xs">{row.ref}</span>
                              )}
                              {row.token ? (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {row.token.collection}.{row.token.slashPath.replace(/\//g, ".")}
                                </div>
                              ) : (
                                <div className="mt-0.5 text-xs text-amber-700">
                                  Token not found in registry
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-3">{row.token?.type ?? "—"}</td>
                            <td className="py-2 pr-3 font-mono text-xs">
                              {row.token?.cssVar ?? "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs">
                              {row.token?.resolvedValue ?? "—"}
                            </td>
                            <td className="py-2 pr-3">
                              {row.usageCount !== null ? (
                                <Badge variant="neutral">{row.usageCount} refs</Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge variant="neutral">{row.occurrences}×</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

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
            </CardContent>
          </Card>

          {/* Spec */}
          {spec ? (
            <Card>
              <CardHeader>
                <CardTitle>Component Spec</CardTitle>
                <CardDescription className="font-mono text-xs">
                  {item.paths.spec}
                </CardDescription>
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
                <CardTitle>Component Spec</CardTitle>
                <CardDescription className="text-amber-600">
                  Spec file not available for this component.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

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
                    Capture from Figma
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
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-muted-foreground md:grid-cols-2">
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
                      <dd className="font-mono break-all">
                        {item.visual_proof.image_sha256 || "—"}
                      </dd>
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
                                <span className="font-mono break-all">
                                  Hash: {variant.imageSha256}
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
                          {displayNameBySlug[s] ?? s}
                        </button>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{s}</span>
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
                          {displayNameBySlug[s] ?? s}
                        </button>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
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
