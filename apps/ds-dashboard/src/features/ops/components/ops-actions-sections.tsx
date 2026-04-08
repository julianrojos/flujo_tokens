/**
 * Ops Actions Sections - Data & Indexing + Diagnostics.
 */

import { SectionHeader } from "@/components/composites/section-header";
import { OperationRow } from "./operation-row";

interface OpsActionsSectionsProps {
  onRunSuccess: () => void;
}

export function OpsActionsSections({ onRunSuccess }: OpsActionsSectionsProps) {
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
          <OperationRow id="refresh-registry" label="Refresh Component Registry" description="Sincroniza metadatos de componentes en DB escaneando specs y docs locales." endpoint="/api/refresh-registry" onRunSuccess={onRunSuccess} />
          <OperationRow id="usage-index" label="Rebuild Usage Index" description="Indexa referencias en specs y CSS para trazar dónde se usa cada token." endpoint="/api/refresh-token-usage-index" onRunSuccess={onRunSuccess} />
          <OperationRow id="token-health" label="Recompute Token Health" description="Analiza salud de tokens: aliases rotos, tokens sin uso, estado de resolución." endpoint="/api/refresh-token-health" onRunSuccess={onRunSuccess} />
          <OperationRow id="health-snapshot" label="Capture Health Snapshot" description="Guarda el estado actual de salud en el historial de tendencias." endpoint="/api/capture-health-snapshot" onRunSuccess={onRunSuccess} />
          <OperationRow id="rebuild-token-graph" label="Rebuild Token Graph" description="Recomputa el grafo de dependencias entre tokens, detectando ciclos." endpoint="/api/refresh-token-graph" onRunSuccess={onRunSuccess} />
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
          <OperationRow id="refresh-components-health" label="Refresh Components Health" description="Genera el reporte de salud de componentes: pipeline, docs, readiness." endpoint="/api/refresh-components-health" />
        </div>
      </section>
    </>
  );
}
