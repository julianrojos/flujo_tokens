import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  Database,
  ShieldAlert,
  GitGraph,
  RefreshCw,
  Layers,
  FlaskConical,
  Zap,
  Loader2,
} from "lucide-react";
import { OperationRow } from "./components/operation-row";
import { PipelineForm } from "./components/pipeline-form";
import { CaptureForm } from "./components/capture-form";
import { FigmaTokenSyncForm } from "./components/figma-token-sync-form";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "./hooks/use-operation-runner";

// ─── Artifact Status ───────────────────────────────────────────────────────────

interface ArtifactMeta {
  id: string;
  label: string;
  icon: React.ElementType;
  generatedAt?: string;
  summary?: string;
  isStale?: boolean;
}

type ArtifactId = "registry" | "usage" | "health" | "graph";

const STALE_HOURS = 24;

function staleness(isoString?: string): boolean {
  if (!isoString) return false;
  const hoursOld = (Date.now() - new Date(isoString).getTime()) / 3_600_000;
  return hoursOld > STALE_HOURS;
}

const INITIAL_ARTIFACTS: ArtifactMeta[] = [
  { id: "registry", label: "Registry",     icon: Database   },
  { id: "usage",    label: "Usage Index",  icon: Activity   },
  { id: "health",   label: "Token Health", icon: ShieldAlert },
  { id: "graph",    label: "Token Graph",  icon: GitGraph   },
];

import { getActiveSystemId } from "@/lib/api";

const getSystemHeaders = (): HeadersInit | undefined => {
  const id = getActiveSystemId();
  return id ? { "x-ds-system": id } : undefined;
};

async function fetchArtifactMeta(id: ArtifactId): Promise<Partial<ArtifactMeta>> {
  try {
    switch (id) {
      case "registry": {
        const r = await fetch("/api/component-registry", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = lm ? new Date(lm).toISOString() : undefined;
        const count = Array.isArray(d.components) ? d.components.length : "?";
        return { generatedAt, summary: `${count} components · v${d.schema_version ?? 1}` };
      }
      case "usage": {
        const r = await fetch("/api/token-usage-index", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = d.generated_at ?? (lm ? new Date(lm).toISOString() : undefined);
        const total = d.summary?.usage_links_total ?? d.summary?.tokens_total ?? "?";
        return { generatedAt, summary: `${total} tokens indexados` };
      }
      case "health": {
        const r = await fetch("/api/token-health", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const generatedAt = d.generated_at;
        const broken = d.summary?.broken_aliases_total ?? 0;
        const unused = d.summary?.unused_tokens_total ?? 0;
        return { generatedAt, summary: `${broken} broken · ${unused} unused` };
      }
      case "graph": {
        const r = await fetch("/api/token-graph", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = d.generated_at ?? (lm ? new Date(lm).toISOString() : undefined);
        const nodes = d.summary?.total_nodes ?? d.nodes?.length ?? "?";
        const cycles = d.cycles?.length ?? 0;
        return { generatedAt, summary: `${nodes} nodos · ${cycles} ciclos` };
      }
    }
  } catch {
    return {};
  }
}

// ─── Run-All sequential hook ───────────────────────────────────────────────────

const REFRESH_ALL_SEQUENCE = [
  { label: "Registry",     endpoint: "/api/refresh-registry" },
  { label: "Usage Index",  endpoint: "/api/refresh-token-usage-index" },
  { label: "Token Health", endpoint: "/api/refresh-token-health" },
  { label: "Token Graph",  endpoint: "/api/refresh-token-graph" },
];

interface RunAllState {
  isRunning: boolean;
  stepIndex: number; // 0 = idle, 1-based while running
  failed: boolean;
}

function useRunAll(onDone: () => void): [RunAllState, () => void] {
  const [state, setState] = useState<RunAllState>({ isRunning: false, stepIndex: 0, failed: false });
  const cancelRef = useRef(false);

  const runAll = useCallback(async () => {
    cancelRef.current = false;
    setState({ isRunning: true, stepIndex: 1, failed: false });

    for (let i = 0; i < REFRESH_ALL_SEQUENCE.length; i++) {
      if (cancelRef.current) break;
      setState((s) => ({ ...s, stepIndex: i + 1 }));
      try {
        const res = await fetch(REFRESH_ALL_SEQUENCE[i].endpoint, { 
          method: "POST",
          headers: getSystemHeaders()
        });
        if (!res.ok) {
          setState({ isRunning: false, stepIndex: i + 1, failed: true });
          return;
        }
      } catch {
        setState({ isRunning: false, stepIndex: i + 1, failed: true });
        return;
      }
    }

    setState({ isRunning: false, stepIndex: 0, failed: false });
    onDone();
  }, [onDone]);

  return [state, runAll];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OperationsPage() {
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>(INITIAL_ARTIFACTS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStatuses = useCallback(async () => {
    setIsRefreshing(true);
    const updates = await Promise.all(
      (["registry", "usage", "health", "graph"] as ArtifactId[]).map((id) =>
        fetchArtifactMeta(id).then((meta) => ({ id, ...meta }))
      )
    );
    setArtifacts((prev) =>
      prev.map((a) => {
        const update = updates.find((u) => u.id === a.id);
        if (!update) return a;
        return {
          ...a,
          generatedAt: update.generatedAt,
          summary: update.summary,
          isStale: staleness(update.generatedAt),
        };
      })
    );
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses]);

  const [runAllState, runAll] = useRunAll(refreshStatuses);

  const currentStepLabel =
    runAllState.isRunning && runAllState.stepIndex > 0
      ? REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            Centro de control: regenera artefactos, ejecuta pipelines y sincroniza el sistema de diseño.
          </p>
        </div>

        {/* Run All */}
        <div className="shrink-0 flex flex-col items-end gap-1 pt-1">
          <button
            onClick={runAll}
            disabled={runAllState.isRunning || isRefreshing}
            title="Ejecuta en secuencia: Registry → Usage → Health → Graph"
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              runAllState.failed
                ? "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/15"
                : "bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            )}
          >
            {runAllState.isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{currentStepLabel ?? "…"}</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 shrink-0" />
                <span>Actualizar todo</span>
              </>
            )}
          </button>
          {runAllState.isRunning && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              paso {runAllState.stepIndex} de {REFRESH_ALL_SEQUENCE.length}
            </span>
          )}
          {runAllState.failed && !runAllState.isRunning && (
            <span className="text-[10px] text-destructive">
              Error en "{REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label}"
            </span>
          )}
        </div>
      </header>

      {/* ── System Status ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Estado del sistema
          </h2>
          <button
            onClick={refreshStatuses}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {artifacts.map((artifact) => {
            const Icon = artifact.icon;
            const hasDate = !!artifact.generatedAt;
            return (
              <div
                key={artifact.id}
                className="flex flex-col p-4 rounded-xl border border-border/70 bg-card/50 shadow-sm gap-2"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{artifact.label}</span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        !hasDate
                          ? "bg-muted-foreground/40"
                          : artifact.isStale
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        artifact.isStale ? "text-amber-500" : !hasDate ? "text-muted-foreground/60" : ""
                      )}
                    >
                      {hasDate ? formatRelativeTime(artifact.generatedAt) : "Sin datos"}
                    </span>
                  </div>

                  {artifact.summary && (
                    <p className="text-[11px] text-muted-foreground leading-tight pl-3.5 truncate">
                      {artifact.summary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Data & Indexing ─────────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          icon={<Database className="h-3.5 w-3.5" />}
          title="Data & Indexing"
          badge="Artefactos"
          description="Regenera los índices y artefactos derivados de tokens y componentes."
        />
        <div className="space-y-2">
          <OperationRow
            id="refresh-registry"
            label="Refresh Component Registry"
            description="Reconstruye component-registry.json escaneando specs y docs locales."
            endpoint="/api/refresh-registry"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="usage-index"
            label="Rebuild Usage Index"
            description="Indexa referencias en specs y CSS para trazar dónde se usa cada token."
            endpoint="/api/refresh-token-usage-index"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="token-health"
            label="Recompute Token Health"
            description="Analiza salud de tokens: aliases rotos, tokens sin uso, estado de resolución."
            endpoint="/api/refresh-token-health"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="health-snapshot"
            label="Capture Health Snapshot"
            description="Guarda el estado actual de salud en el historial de tendencias."
            endpoint="/api/capture-health-snapshot"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="rebuild-token-graph"
            label="Rebuild Token Graph"
            description="Recomputa el grafo de dependencias entre tokens, detectando ciclos."
            endpoint="/api/refresh-token-graph"
            onRunSuccess={refreshStatuses}
          />
        </div>
      </section>

      {/* ── Diagnostics ───────────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          icon={<FlaskConical className="h-3.5 w-3.5" />}
          title="Diagnostics"
          badge="Análisis"
          description="Reportes de calidad, deuda de naming y estado de componentes."
        />
        <div className="space-y-2">
          <OperationRow
            id="refresh-naming-debt"
            label="Refresh Naming Debt"
            description="Recomputa violaciones de calidad de nombres en todas las colecciones."
            endpoint="/api/refresh-naming-debt"
          />
          <OperationRow
            id="refresh-components-health"
            label="Refresh Components Health"
            description="Genera el reporte de salud de componentes: pipeline, docs, readiness."
            endpoint="/api/refresh-components-health"
          />
        </div>
      </section>

      {/* ── Workflows ─────────────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          icon={<Layers className="h-3.5 w-3.5" />}
          title="Workflows"
          badge="Pipeline"
          description="Orquestación de pipelines complejos con parámetros configurables y streaming en vivo."
        />
        <PipelineForm
          id="ds-pipeline"
          label="Run Component Pipeline"
          description="Orquesta el pipeline completo: Spec → Markdown → Figma → Visual Proof."
          endpoint="/api/run/ds:pipeline"
          onRunSuccess={refreshStatuses}
        />
        <CaptureForm
          id="capture-figma"
          label="Capture Figma Screenshot"
          description="Captura la visual proof de un nodo Figma por URL y la asocia al componente."
          endpoint="/api/capture-figma-screenshot"
          onRunSuccess={refreshStatuses}
        />
        <FigmaTokenSyncForm
          id="figma-token-sync"
          label="Sync Figma Variables → Tokens"
          description="Importa variables locales de Figma, escribe los JSON en input/ y compila a CSS custom properties."
          endpoint="/api/sync-figma-tokens"
          onRunSuccess={refreshStatuses}
        />
      </section>
    </div>
  );
}

// ─── Section header helper ─────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  badge,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <h2 className="text-xs font-semibold uppercase tracking-wider">{title}</h2>
        </div>
        <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
          {badge}
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground/70">{description}</p>
    </div>
  );
}
