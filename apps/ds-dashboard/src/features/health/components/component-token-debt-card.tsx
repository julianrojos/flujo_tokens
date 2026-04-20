import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
import { toComponentDetail } from "@/lib/routes";
import { useComponentCatalogQuery } from "../use-health-queries";
import { getTopComponentTokenDebt } from "../lib/component-token-debt";

const TOP_COMPONENTS_LIMIT = 8;

export function ComponentTokenDebtCard() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || "").trim();
  const { data, isLoading, isError } = useComponentCatalogQuery(resolvedSystemId);

  const rows = useMemo(
    () => getTopComponentTokenDebt(data ?? null, TOP_COMPONENTS_LIMIT),
    [data],
  );
  const maxUnresolved = rows.reduce((max, row) => Math.max(max, row.unresolvedCount), 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Componentes con deuda de tokens</CardTitle>
          <CardDescription>Loading unresolved bindings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-8 animate-pulse rounded-full bg-muted/60" />
            <div className="h-8 animate-pulse rounded-full bg-muted/60" />
            <div className="h-8 animate-pulse rounded-full bg-muted/60" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <StatusAlert variant="warning" title="Token debt chart unavailable">
        Could not load unresolved bindings for the current system.
      </StatusAlert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Componentes con deuda de tokens</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row) => {
              const width = maxUnresolved > 0 ? Math.max(4, (row.unresolvedCount / maxUnresolved) * 100) : 0;
              return (
                <div key={row.slug} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <Link
                      to={toComponentDetail(row.slug)}
                      className="truncate text-sm text-foreground hover:text-primary hover:underline"
                      title={`Open ${row.displayName} detail`}
                    >
                      {row.displayName}
                    </Link>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted/70">
                    <div
                      className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-300 ease-out"
                      style={{ width: `${width}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="tabular-nums text-sm font-semibold text-foreground">
                    {row.unresolvedCount}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <StatusAlert variant="success" title="No token debt">
            No components have unresolved layer bindings in this system.
          </StatusAlert>
        )}
      </CardContent>
    </Card>
  );
}
