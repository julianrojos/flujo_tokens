/**
 * Token Diff Stats Grid - summary statistics cards.
 */

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

interface DiffStats {
  total: number;
  added: number;
  removed: number;
  modified: number;
  breaking: number;
}

interface TokenDiffStatsGridProps {
  stats: DiffStats | null;
  usageIndexLoaded: boolean;
}

export function TokenDiffStatsGrid({ stats, usageIndexLoaded }: TokenDiffStatsGridProps) {
  if (!stats) {
    return (
      <div className="text-sm text-muted-foreground">
        No diff data available. Click "Compare" to load.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-5">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription>Total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription>Added</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-status-success">{stats.added}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription>Removed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-status-error">{stats.removed}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription>Modified</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.modified}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription>Breaking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-status-warning">{stats.breaking}</div>
          {!usageIndexLoaded && (
            <p className="text-xs text-muted-foreground mt-1">
              Usage index unavailable
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
