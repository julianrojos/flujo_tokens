/**
 * Token Identity Section - displays token header, swatch, type, collection.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Hash, Ruler, ToggleLeft, Type } from 'lucide-react';
import type { TokenCatalogEntry } from '@/types/token-catalog';
import { TokenRelationTrail } from '@/components/composites';
import { toTokenDetail } from '@/lib/routes';
import { resolveColorSwatch } from '../lib/token-detail-transforms';

interface TokenIdentitySectionProps {
  token: TokenCatalogEntry;
  displayType: string;
  tokenAliasChain: TokenCatalogEntry[];
  aliasFinal: TokenCatalogEntry | null;
  aliasConsumers: TokenCatalogEntry[];
  swatch: string | null;
  dimensionPreview: { amount: number; unit: string; width: number } | null;
}

export function TokenIdentitySection({
  token,
  displayType,
  tokenAliasChain,
  aliasFinal,
  aliasConsumers,
  swatch,
  dimensionPreview,
}: TokenIdentitySectionProps) {
  const aliasLine = tokenAliasChain.length > 0 ? tokenAliasChain : [token];
  const finalValue = aliasFinal?.resolvedValue || token.resolvedValue;
  const finalSwatch = resolveColorSwatch(finalValue);
  const displayTokenPath = token.slashPath;
  const iconClassName = 'h-8 w-8 text-primary';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-[63px] w-[63px] items-center justify-center rounded border border-border bg-muted/20 px-2 py-2">
              {swatch ? (
                <span
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  // Dynamic swatch value comes from token data (allowed by ui-style-contract).
                  style={{ backgroundColor: swatch }}
                  aria-label={`Color swatch ${swatch}`}
                />
              ) : displayType === 'dimension' ? (
                dimensionPreview ? (
                  <span className="flex h-8 w-20 items-center">
                    <span
                      className="h-2 rounded bg-primary/80"
                      // Dynamic preview width is calculated from token value (allowed dynamic style).
                      style={{ width: `${dimensionPreview.width}px` }}
                    />
                  </span>
                ) : (
                  <Ruler
                    className="h-8 w-8 text-primary"
                    aria-label="Dimension token"
                  />
                )
              ) : displayType === 'string' ? (
                <Type className={iconClassName} aria-label="String token" />
              ) : displayType === 'boolean' ? (
                <ToggleLeft
                  className={iconClassName}
                  aria-label="Boolean token"
                />
              ) : displayType === 'number' ? (
                <Hash className={iconClassName} aria-label="Number token" />
              ) : (
                <span className="text-sm font-semibold tracking-tight text-muted-foreground">
                  Aa
                </span>
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="break-all font-mono text-base">
                {displayTokenPath}
              </CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="neutral" className="font-medium">
                  {token.collection}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">
                  {displayType}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TokenRelationTrail
          title="Alias chain"
          rootLabel={aliasLine[0]?.slashPath || displayTokenPath}
          items={aliasLine.slice(1).map((entry) => ({
            label: entry.slashPath,
            href: toTokenDetail(entry.path),
            title: `Open ${entry.slashPath} detail`,
          }))}
          leadingConnector="left"
          itemConnector="left"
          terminal={{ label: finalValue, swatch: finalSwatch }}
          terminalConnector="left"
          emptyText="No alias chain"
        />
        <TokenRelationTrail
          title="Consumers"
          rootLabel={displayTokenPath}
          items={
            aliasConsumers.length > 0
              ? aliasConsumers.map((consumer) => ({
                  label: consumer.slashPath,
                  href: toTokenDetail(consumer.path),
                  title: `Open ${consumer.slashPath} detail`,
                }))
              : []
          }
          leadingConnector="right"
          itemConnector="comma"
          emptyText="No direct consumers"
        />
      </CardContent>
    </Card>
  );
}
