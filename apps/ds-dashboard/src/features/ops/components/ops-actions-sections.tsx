/**
 * Ops Actions Sections - Data & Indexing + Diagnostics.
 */

import { SectionHeader } from '@/components/composites/section-header';
import { OperationRow } from './operation-row';

interface OpsActionsSectionsProps {
  systemId?: string;
}

type OperationConfig = {
  id: string;
  label: string;
  description: string;
  endpoint: string;
};

const DATA_INDEXING_OPERATIONS: OperationConfig[] = [
  {
    id: 'token-health',
    label: 'Recompute Token Health',
    description:
      'Analiza salud de tokens: aliases rotos, tokens sin uso, estado de resolución.',
    endpoint: '/api/refresh-token-health',
  },
];

const DIAGNOSTIC_OPERATIONS: OperationConfig[] = [
  {
    id: 'refresh-components-health',
    label: 'Refresh Components Health',
    description:
      'Genera el reporte de salud de componentes: pipeline, docs, readiness.',
    endpoint: '/api/refresh-components-health',
  },
];

export function OpsActionsSections({ systemId }: OpsActionsSectionsProps) {
  return (
    <>
      {/* Data & Indexing */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader title="Data & Indexing" badge="Índices" />
        <p className="text-xs text-muted-foreground/70 -mt-2">
          Análisis de salud y relaciones entre tokens.
        </p>
        <div className="space-y-2">
          {DATA_INDEXING_OPERATIONS.map((operation) => (
            <OperationRow
              key={operation.id}
              id={operation.id}
              label={operation.label}
              description={operation.description}
              endpoint={operation.endpoint}
              systemId={systemId}
            />
          ))}
        </div>
      </section>

      {/* Diagnostics */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader title="Diagnostics" badge="Análisis" />
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
              systemId={systemId}
            />
          ))}
        </div>
      </section>
    </>
  );
}
