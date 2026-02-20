import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { fetchComponentRegistry, fetchComponentUsageIndex } from "@/lib/api";
import type { ComponentRegistryItem, PipelineStage } from "@/types/component-registry";
import type { ComponentUsageEntry } from "@/types/component-usage-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ComponentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ComponentRegistryItem | null>(null);
  const [usage, setUsage] = useState<ComponentUsageEntry | null>(null);
  const [allItems, setAllItems] = useState<ComponentRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex] = await Promise.all([
          fetchComponentRegistry(),
          fetchComponentUsageIndex().catch(() => ({ by_slug: {} })),
        ]);
        const found = registry.components.find((c) => c.slug === slug) ?? null;
        setItem(found);
        setAllItems(registry.components);
        setUsage(usageIndex.by_slug[slug] ?? null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [slug]);

  const displayNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of allItems) map[c.slug] = c.display_name;
    return map;
  }, [allItems]);

  const usesSlugs = usage?.uses ?? [];
  const usedInSlugs = usage?.used_in ?? [];

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
                {item.figma.file_url ? (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={item.figma.file_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${item.display_name} in Figma`}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Figma
                    </a>
                  </Button>
                ) : null}
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

          {/* Visual proof */}
          {item.visual_proof.exists && item.visual_proof.screenshot_url ? (
            <Card>
              <CardHeader>
                <CardTitle>Visual Proof</CardTitle>
              </CardHeader>
              <CardContent>
                <img
                  src={item.visual_proof.screenshot_url}
                  alt={`Visual proof for ${item.display_name}`}
                  className="max-w-full rounded-lg border border-border"
                />
              </CardContent>
            </Card>
          ) : null}

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
    </div>
  );
}
