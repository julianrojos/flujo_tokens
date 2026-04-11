/**
 * Token Identity Section - displays token header, swatch, type, collection.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy } from "lucide-react";
import type { TokenEntry } from "@/types/token-registry";

interface TokenIdentitySectionProps {
  token: TokenEntry;
  swatch: string | null;
  dimensionPreview: { amount: number; unit: string; width: number } | null;
  onCopyField: (field: string, value: string) => void;
  copiedField: string | null;
  onNavigate: (token: TokenEntry) => void;
  previousToken: TokenEntry | null;
  nextToken: TokenEntry | null;
  currentTokenIndex: number;
  scopedTokens: TokenEntry[];
}

export function TokenIdentitySection({
  token,
  swatch,
  dimensionPreview,
  onCopyField,
  copiedField,
  onNavigate,
  previousToken,
  nextToken,
  currentTokenIndex,
  scopedTokens,
}: TokenIdentitySectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-12 min-w-12 items-center justify-center rounded-lg border border-border bg-muted/20 px-2">
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
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Resolved value</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                readOnly
                value={token.resolvedValue}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => onCopyField("resolvedValue", token.resolvedValue)}
              >
                {copiedField === "resolvedValue" ? (
                  <span className="h-4 w-4 text-status-success">✓</span>
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">CSS variable</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                readOnly
                value={token.cssVar}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => onCopyField("cssVar", token.cssVar)}
              >
                {copiedField === "cssVar" ? (
                  <span className="h-4 w-4 text-status-success">✓</span>
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {token.aliasOf ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Aliases</label>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="neutral">alias of: {token.aliasOf}</Badge>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate(previousToken!)} disabled={!previousToken}>
            ← Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate(nextToken!)} disabled={!nextToken}>
            Next →
          </Button>
          {scopedTokens.length > 0 && currentTokenIndex >= 0 ? (
            <span className="text-xs text-muted-foreground">
              {currentTokenIndex + 1} / {scopedTokens.length}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
