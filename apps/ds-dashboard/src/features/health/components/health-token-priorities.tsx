/**
 * Health Token Priorities Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TokenPrioritiesProps {
  unusedTokens: Array<{ path: string; collection: string }>;
  highCouplingTokens: Array<{ path: string; collection: string }>;
  wcagFailures: Array<{ foreground: string; background: string; contrastRatio: number; requiredRatio: number }>;
  onRefreshTokens: () => void;
  refreshing: boolean;
}

export function HealthTokenPriorities({
  unusedTokens,
  highCouplingTokens,
  wcagFailures,
  onRefreshTokens,
  refreshing,
}: TokenPrioritiesProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Token Priorities</CardTitle>
            <CardDescription>High-impact cleanup opportunities</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefreshTokens} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div id="unused-tokens">
          <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
            Unused ({unusedTokens.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {unusedTokens.slice(0, 10).map((token) => (
              <Badge key={token.path} variant="neutral" className="font-mono text-xs">
                {token.path}
              </Badge>
            ))}
            {unusedTokens.length === 0 && (
              <span className="text-sm text-muted-foreground">No unused tokens</span>
            )}
          </div>
        </div>
        <div id="wcag-failures">
          <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
            WCAG failures ({wcagFailures.length})
          </h4>
          <div className="space-y-2">
            {wcagFailures.slice(0, 8).map((row, idx) => (
              <div key={`${row.foreground}-${row.background}-${idx}`} className="flex items-center gap-2 text-xs">
                <Badge variant="warning">
                  {row.contrastRatio} / {row.requiredRatio}
                </Badge>
                <span className="font-mono text-muted-foreground">{row.foreground}</span>
                <span className="text-muted-foreground">on</span>
                <span className="font-mono text-muted-foreground">{row.background}</span>
              </div>
            ))}
            {wcagFailures.length === 0 && (
              <span className="text-sm text-muted-foreground">No WCAG failures</span>
            )}
          </div>
        </div>
        <div id="high-coupling-tokens">
          <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
            High coupling ({highCouplingTokens.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {highCouplingTokens.slice(0, 10).map((token) => (
              <Badge key={token.path} variant="warning" className="font-mono text-xs">
                {token.path}
              </Badge>
            ))}
            {highCouplingTokens.length === 0 && (
              <span className="text-sm text-muted-foreground">No high coupling tokens</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
