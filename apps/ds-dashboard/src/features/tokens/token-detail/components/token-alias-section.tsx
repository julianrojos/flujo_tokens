/**
 * Token Alias Section - displays alias chain and descendant aliases.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import type { TokenEntry } from "@/types/token-registry";

interface TokenAliasSectionProps {
  token: TokenEntry;
  tokenAliasChain: TokenEntry[];
  aliasFinal: TokenEntry | null;
  aliasDescendantChains: Map<string, TokenEntry[]>;
  onCopyField: (field: string, value: string) => void;
  copiedField: string | null;
}

export function TokenAliasSection({
  token,
  tokenAliasChain,
  aliasFinal,
  aliasDescendantChains,
  onCopyField,
  copiedField,
}: TokenAliasSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alias Chain</CardTitle>
        <CardDescription>
          Token alias resolution path to final value
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resolution Path
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            {tokenAliasChain.map((entry, idx) => (
              <div key={entry.path} className="flex items-center gap-2">
                <Badge
                  variant={idx === tokenAliasChain.length - 1 ? "success" : "neutral"}
                  className="font-mono text-xs"
                >
                  {entry.path}
                </Badge>
                {idx < tokenAliasChain.length - 1 && (
                  <span className="text-muted-foreground">→</span>
                )}
              </div>
            ))}
            {tokenAliasChain.length === 0 && (
              <span className="text-sm text-muted-foreground">No alias chain</span>
            )}
          </div>
        </div>

        {aliasFinal && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Final Value
            </h4>
            <div className="flex items-center gap-2">
              <Badge variant="success" className="font-mono text-xs">
                {aliasFinal.resolvedValue}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6"
                onClick={() => onCopyField("finalValue", aliasFinal.resolvedValue)}
              >
                {copiedField === "finalValue" ? (
                  <span className="h-3 w-3 text-status-success">✓</span>
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        )}

        {aliasDescendantChains.size > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Descendant Aliases ({aliasDescendantChains.size})
            </h4>
            <div className="flex flex-wrap gap-2">
              {Array.from(aliasDescendantChains.keys()).slice(0, 20).map((path) => (
                <Badge key={path} variant="neutral" className="font-mono text-xs">
                  {path}
                </Badge>
              ))}
              {aliasDescendantChains.size > 20 && (
                <Badge variant="neutral">+{aliasDescendantChains.size - 20} more</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
