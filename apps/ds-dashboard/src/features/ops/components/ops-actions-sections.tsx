/**
 * Ops Actions Sections - Data & Indexing + Diagnostics + Workflows.
 */

import { SectionHeader } from "@/components/composites/section-header";
import { OperationRow } from "./operation-row";
import { PipelineForm } from "./pipeline-form";
import { CaptureForm } from "./capture-form";
import { FigmaTokenSyncForm } from "./figma-token-sync-form";

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
          <OperationRow id="refresh-registry" label="Refresh Component Registry" description="Reconstruye component-registry.json escaneando specs y docs locales." endpoint="/api/refresh-registry" onRunSuccess={onRunSuccess} />
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
          Reportes de calidad, deuda de naming y estado de componentes.
        </p>
        <div className="space-y-2">
          <OperationRow id="refresh-naming-debt" label="Refresh Naming Debt" description="Recomputa violaciones de calidad de nombres en todas las colecciones." endpoint="/api/refresh-naming-debt" />
          <OperationRow id="refresh-components-health" label="Refresh Components Health" description="Genera el reporte de salud de componentes: pipeline, docs, readiness." endpoint="/api/refresh-components-health" />
        </div>
      </section>

      {/* Workflows */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          title="Workflows"
          badge="Pipeline"
        />
        <p className="text-xs text-muted-foreground/70 -mt-2">
          Orquestación de pipelines complejos con parámetros configurables y streaming en vivo.
        </p>
        <PipelineForm id="ds-pipeline" label="Run Component Pipeline" description="Orquesta el pipeline completo: Spec → Markdown." endpoint="/api/run/ds:pipeline" onRunSuccess={onRunSuccess} />
        <CaptureForm id="capture-figma" label="Capture Figma Screenshot" description="Captura la visual proof de un nodo Figma por URL y la asocia al componente." endpoint="/api/capture-figma-screenshot" onRunSuccess={onRunSuccess} />
        <FigmaTokenSyncForm id="figma-token-sync" label="Sync Figma Variables → Tokens" description="Importa variables locales desde el plugin y actualiza la base de datos (sin artefactos JSON)." endpoint="/api/sync-figma-tokens" onRunSuccess={onRunSuccess} />
      </section>
    </>
  );
}
