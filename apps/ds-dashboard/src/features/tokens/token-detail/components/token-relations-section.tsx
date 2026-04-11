import { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TokenRelationsSectionProps {
  tokenPath: string;
  aliasOf: string | null;
  hasDescendantAliases: boolean;
}

let graphPrefetched = false;

function useGraphPrefetch() {
  const prefetching = useRef(false);
  return useCallback(() => {
    if (graphPrefetched || prefetching.current) return;
    prefetching.current = true;
    void import("@/features/tokens/token-graph/token-graph-page")
      .then(() => {
        graphPrefetched = true;
      })
      .finally(() => {
        prefetching.current = false;
      });
  }, []);
}

export function TokenRelationsSection({
  tokenPath,
  aliasOf,
  hasDescendantAliases,
}: TokenRelationsSectionProps) {
  const graphPath = `/tokens/${encodeURIComponent(tokenPath)}/graph`;
  const prefetch = useGraphPrefetch();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Relations</CardTitle>
            <CardDescription>Alias chain and dependency graph</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {aliasOf ? (
            <Badge variant="neutral">alias of: {aliasOf}</Badge>
          ) : (
            <span className="text-muted-foreground">No upstream alias</span>
          )}
          {hasDescendantAliases && (
            <Badge variant="neutral">has downstream aliases</Badge>
          )}
        </div>
        <div className="mt-3">
          <Link
            to={graphPath}
            className="text-sm font-semibold text-primary hover:underline"
            onMouseEnter={prefetch}
            onFocus={prefetch}
          >
            Open dependency graph →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
