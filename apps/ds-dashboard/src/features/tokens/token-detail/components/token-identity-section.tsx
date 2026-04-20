/**
 * Token Identity Section - displays token header, swatch, type, collection.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import type { TokenCatalogEntry } from "@/types/token-catalog";
import { toTokenDetail } from "@/lib/routes";
import { resolveColorSwatch } from "../lib/token-detail-transforms";

interface TokenIdentitySectionProps {
  token: TokenCatalogEntry;
  tokenAliasChain: TokenCatalogEntry[];
  aliasFinal: TokenCatalogEntry | null;
  swatch: string | null;
  dimensionPreview: { amount: number; unit: string; width: number } | null;
}

export function TokenIdentitySection({
  token,
  tokenAliasChain,
  aliasFinal,
  swatch,
  dimensionPreview,
}: TokenIdentitySectionProps) {
  const aliasLine = tokenAliasChain.length > 0 ? tokenAliasChain : [token];
  const finalValue = aliasFinal?.resolvedValue || token.resolvedValue;
  const finalSwatch = resolveColorSwatch(finalValue);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-12 min-w-12 items-center justify-center rounded border border-border bg-muted/20 px-2">
              {swatch ? (
                <span
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  // Dynamic swatch value comes from token data (allowed by ui-style-contract).
                  style={{ backgroundColor: swatch }}
                  aria-label={`Color swatch ${swatch}`}
                />
              ) : token.type === "dimension" ? (
                <span className="flex h-8 w-20 items-center">
                  <span
                    className="h-2 rounded bg-primary/80"
                    // Dynamic preview width is calculated from token value (allowed dynamic style).
                    style={{ width: `${dimensionPreview?.width ?? 16}px` }}
                  />
                </span>
              ) : (
                <span className="font-semibold text-muted-foreground">Aa</span>
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="break-all font-mono text-base">{token.path}</CardTitle>
              <CardDescription className="mt-1">
                <span className="font-medium">{token.collection}</span> · {token.type}
              </CardDescription>
              <CardDescription className="mt-1 font-mono text-xs">
                {token.slashPath}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Alias chain</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {aliasLine.map((entry, index) => (
              <div key={entry.path} className="flex items-center gap-2">
                {index === 0 ? (
                  <Badge
                    variant={index === aliasLine.length - 1 ? "success" : "neutral"}
                    className="font-mono text-xs"
                  >
                    {entry.path}
                  </Badge>
                ) : (
                  <Link
                    to={toTokenDetail(entry.path)}
                    className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={`Open ${entry.path} detail`}
                  >
                    <Badge
                      variant={index === aliasLine.length - 1 ? "success" : "neutral"}
                      className="font-mono text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {entry.path}
                    </Badge>
                  </Link>
                )}
                {index < aliasLine.length - 1 ? (
                  <span className="text-muted-foreground">→</span>
                ) : null}
              </div>
            ))}
            <span className="text-muted-foreground">→</span>
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="font-mono text-xs">
                {finalValue}
              </Badge>
              {finalSwatch ? (
                <span
                  className="h-3.5 w-3.5 rounded border border-border shadow-sm"
                  style={{ backgroundColor: finalSwatch }}
                  aria-label={`Color swatch ${finalSwatch}`}
                />
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
