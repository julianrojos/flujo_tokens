/**
 * Ops Actions Sections - Data & Indexing + Diagnostics.
 */

import { SectionHeader } from "@/components/composites/section-header";
import { OperationRow } from "./operation-row";

interface OpsActionsSectionsProps {
  onRunSuccess: () => void;
  systemId?: string;
}

type OperationConfig = {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  triggerRefresh?: boolean;
};

const DATA_INDEXING_OPERATIONS: OperationConfig[] = [
  {
    id: "refresh-registry",
    label: "Refresh Component Registry",
    description: "Reconcila y normaliza metadatos de componentes directamente en la base de datos.",
    endpoint: "/api/refresh-registry",
    triggerRefresh: true,
  },
  {
    id: "usage-index",
    label: "Rebuild Usage Index",
    description: "Reconstruye el índice de uso de tokens desde señales persistidas en base de datos.",
    endpoint: "/api/refresh-token-usage-index",
    triggerRefresh: true,
  },
  {
    id: "token-health",
    label: "Recompute Token Health",
    description: "Analiza salud de tokens: aliases rotos, tokens sin uso, estado de resolución.",
    endpoint: "/api/refresh-token-health",
    triggerRefresh: true,
  },
  {
    id: "health-snapshot",
    label: "Capture Health Snapshot",
    description: "Guarda el estado actual de salud en el historial de tendencias.",
    endpoint: "/api/capture-health-snapshot",
    triggerRefresh: true,
  },
  {
    id: "rebuild-token-graph",
    label: "Rebuild Token Graph",
    description: "Recomputa el grafo de dependencias entre tokens, detectando ciclos.",
    endpoint: "/api/refresh-token-graph",
    triggerRefresh: true,
  },
];

const DIAGNOSTIC_OPERATIONS: OperationConfig[] = [
  {
    id: "refresh-components-health",
    label: "Refresh Components Health",
    description: "Genera el reporte de salud de componentes: pipeline, docs, readiness.",
    endpoint: "/api/refresh-components-health",
  },
];

export function OpsActionsSections({ onRunSuccess, systemId }: OpsActionsSectionsProps) {
  return (
    <>
      {/* Data & Indexing */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          title="Data & Indexing"
          badge="Artefactos"
        />
        <p className="text-xs text-muted-foreground/70 -mt-2">
          Regenera los índices y artefactos derivados de tokens y componentes.
        </p>
        <div className="space-y-2">
          {DATA_INDEXING_OPERATIONS.map((operation) => (
            <OperationRow
              key={operation.id}
              id={operation.id}
              label={operation.label}
              description={operation.description}
              endpoint={operation.endpoint}
              onRunSuccess={operation.triggerRefresh ? onRunSuccess : undefined}
              systemId={systemId}
            />
          ))}
        </div>
      </section>

      {/* Diagnostics */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          title="Diagnostics"
          badge="Análisis"
        />
        <p className="text-xs text-muted-foreground/70 -mt-2">
          Reportes de calidad y estado de componentes.
        </p>
        <div className="space-y-2">
          {DIAGNOSTIC_OPERATIONS.map((operation) => (
            <OperationRow
              key={operation.id}
              id={operation.id}
              label={operation.label}
              description={operation.description}
              endpoint={operation.endpoint}
              onRunSuccess={operation.triggerRefresh ? onRunSuccess : undefined}
              systemId={systemId}
            />
          ))}
        </div>
      </section>
    </>
  );
}
