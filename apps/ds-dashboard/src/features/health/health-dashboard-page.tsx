import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCcw } from "lucide-react";

import {
  fetchComponentsHealth,
  fetchTokenHealth,
  refreshComponentsHealth,
  refreshTokenHealth,
} from "@/lib/api";
import type { ComponentsHealthReport } from "@/types/components-health";
import type { TokenHealthReport } from "@/types/token-health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function sectionMeta(total: number, truncated: boolean) {
  if (total === 0) return "0";
  return truncated ? `${total} (truncated)` : String(total);
}

function wcagBadge(level: string) {
  if (level === "AAA") return "success" as const;
  return "warning" as const;
}

function componentStatusBadge(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "needs-review") return "warning" as const;
  return "neutral" as const;
}

export function HealthDashboardPage() {
  const [tokenHealth, setTokenHealth] = useState<TokenHealthReport | null>(null);
  const [componentsHealth, setComponentsHealth] =
    useState<ComponentsHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [componentsError, setComponentsError] = useState<string | null>(null);
  const [refreshingTokens, setRefreshingTokens] = useState(false);
  const [refreshingComponents, setRefreshingComponents] = useState(false);

  const load = async () => {
    setLoading(true);
    setTokenError(null);
    setComponentsError(null);

    const [tokensResult, componentsResult] = await Promise.allSettled([
      fetchTokenHealth(),
      fetchComponentsHealth(),
    ]);

    if (tokensResult.status === "fulfilled") {
      setTokenHealth(tokensResult.value);
    } else {
      setTokenHealth(null);
      setTokenError(
        tokensResult.reason instanceof Error
          ? tokensResult.reason.message
          : String(tokensResult.reason),
      );
    }

    if (componentsResult.status === "fulfilled") {
      setComponentsHealth(componentsResult.value);
    } else {
      setComponentsHealth(null);
      setComponentsError(
        componentsResult.reason instanceof Error
          ? componentsResult.reason.message
          : String(componentsResult.reason),
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const tokenSummaryCards = useMemo(() => {
    if (!tokenHealth) return [];
    const summary = tokenHealth.summary;
    return [
      { label: "Unused tokens", value: summary.unused_tokens_total },
      { label: "High coupling", value: summary.high_coupling_tokens_total },
      { label: "Broken aliases", value: summary.broken_aliases_total },
      { label: "Broken refs", value: summary.broken_css_var_refs_total },
      { label: "WCAG failures", value: summary.wcag_failures_total },
    ];
  }, [tokenHealth]);

  const handleRefreshTokenHealth = async () => {
    setRefreshingTokens(true);
    setTokenError(null);
    try {
      await refreshTokenHealth();
      const payload = await fetchTokenHealth();
      setTokenHealth(payload);
    } catch (cause) {
      setTokenHealth(null);
      setTokenError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshingTokens(false);
    }
  };

  const handleRefreshComponentsHealth = async () => {
    setRefreshingComponents(true);
    setComponentsError(null);
    try {
      await refreshComponentsHealth();
      const payload = await fetchComponentsHealth();
      setComponentsHealth(payload);
    } catch (cause) {
      setComponentsHealth(null);
      setComponentsError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshingComponents(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-slide-in">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Health</h2>
          <p className="text-sm text-muted-foreground">
            Métricas operativas (tokens + componentes) a partir de artefactos
            generados localmente.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          {loading ? "Loading..." : "Reload"}
        </Button>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Token Health</CardTitle>
              <CardDescription>
                Fuente: <code>docs/_generated/token-health.json</code>
              </CardDescription>
              <CardDescription>
                Generated: {tokenHealth ? formatDate(tokenHealth.generated_at) : "—"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={handleRefreshTokenHealth}
              disabled={refreshingTokens}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {refreshingTokens ? "Refreshing..." : "Refresh Token Health"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenError ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                {tokenError}
                <div className="mt-2 text-xs text-red-700/80">
                  Tip: ejecuta <code>npm run ds:token-health</code>
                </div>
              </div>
            ) : null}

            {tokenHealth?.hint ? (
              <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                {tokenHealth.hint}
              </div>
            ) : null}

            {tokenHealth?.warnings?.length ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800">
                <div className="font-semibold">Warnings</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {tokenHealth.warnings.map((warning) => (
                    <li key={warning.id}>
                      <code>{warning.id}</code>: {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tokenSummaryCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border/70 bg-background/60 p-3"
                >
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {tokenHealth ? item.value : "—"}
                  </div>
                </div>
              ))}
            </div>

            {tokenHealth ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Broken aliases</div>
                    <div className="text-xs text-muted-foreground">
                      {sectionMeta(
                        tokenHealth.broken_aliases.total,
                        tokenHealth.broken_aliases.truncated,
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Alias CSS var</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenHealth.broken_aliases.items.length ? (
                        tokenHealth.broken_aliases.items.map((row) => (
                          <TableRow key={`${row.token}:${row.aliasCssVar}`}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                className="underline decoration-border/60 underline-offset-4"
                                to={`/tokens/${encodeURIComponent(row.token)}`}
                              >
                                {row.token}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.aliasCssVar}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.reason}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            No broken aliases detected.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Broken references</div>
                    <div className="text-xs text-muted-foreground">
                      {sectionMeta(
                        tokenHealth.broken_css_var_refs.total,
                        tokenHealth.broken_css_var_refs.truncated,
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>CSS var</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenHealth.broken_css_var_refs.items.length ? (
                        tokenHealth.broken_css_var_refs.items.map((row) => (
                          <TableRow key={`${row.from}:${row.cssVar}`}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                className="underline decoration-border/60 underline-offset-4"
                                to={`/tokens/${encodeURIComponent(row.from)}`}
                              >
                                {row.from}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.cssVar}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.reason}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            No broken CSS var refs detected.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Unused tokens</div>
                    <div className="text-xs text-muted-foreground">
                      {sectionMeta(
                        tokenHealth.unused_tokens.total,
                        tokenHealth.unused_tokens.truncated,
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Collection</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenHealth.unused_tokens.items.length ? (
                        tokenHealth.unused_tokens.items.map((row) => (
                          <TableRow key={row.path}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                className="underline decoration-border/60 underline-offset-4"
                                to={`/tokens/${encodeURIComponent(row.path)}`}
                              >
                                {row.path}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.type}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.collection}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            No unused tokens detected.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">High coupling tokens</div>
                    <div className="text-xs text-muted-foreground">
                      {sectionMeta(
                        tokenHealth.high_coupling_tokens.total,
                        tokenHealth.high_coupling_tokens.truncated,
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead className="text-right">Usage</TableHead>
                        <TableHead className="text-right">In</TableHead>
                        <TableHead className="text-right">Out</TableHead>
                        <TableHead>Reasons</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenHealth.high_coupling_tokens.items.length ? (
                        tokenHealth.high_coupling_tokens.items.map((row) => (
                          <TableRow key={row.path}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                className="underline decoration-border/60 underline-offset-4"
                                to={`/tokens/${encodeURIComponent(row.path)}`}
                              >
                                {row.path}
                              </Link>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {row.usageCount}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {row.inDegree}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {row.outDegree}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <div className="flex flex-wrap gap-1">
                                {(row.reasons || []).map((reason) => (
                                  <Badge key={reason} variant="outline">
                                    {reason}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-sm text-muted-foreground">
                            No high coupling tokens detected with current thresholds.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">WCAG failures</div>
                    <div className="text-xs text-muted-foreground">
                      {sectionMeta(
                        tokenHealth.wcag_failures.total,
                        tokenHealth.wcag_failures.truncated,
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Foreground</TableHead>
                        <TableHead>Background</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead className="text-right">Ratio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenHealth.wcag_failures.items.length ? (
                        tokenHealth.wcag_failures.items.map((row) => (
                          <TableRow
                            key={`${row.foreground}:${row.background}:${row.level}:${row.textSize}`}
                          >
                            <TableCell className="text-xs">
                              <div className="font-mono">{row.foreground}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {row.foregroundHex}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-mono">{row.background}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {row.backgroundHex}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant={wcagBadge(row.level)}>
                                {row.level} · {row.textSize}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {row.contrastRatio} / {row.requiredRatio}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-sm text-muted-foreground">
                            No WCAG failures for configured pairs.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Components Health</CardTitle>
              <CardDescription>
                Fuente: <code>docs/_generated/components-health.json</code>
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={handleRefreshComponentsHealth}
              disabled={refreshingComponents}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {refreshingComponents ? "Refreshing..." : "Refresh Components Health"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {componentsError ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                {componentsError}
                <div className="mt-2 text-xs text-red-700/80">
                  Tip: ejecuta <code>npm run ds:registry:report</code>
                </div>
              </div>
            ) : null}

            {componentsHealth ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Components
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {componentsHealth.summary.total_components}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Needs review
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {componentsHealth.summary.needs_review}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Missing visual proof
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {componentsHealth.filters.missing_visual_proof.total}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Needs review</div>
                    <div className="text-xs text-muted-foreground">
                      {sectionMeta(
                        componentsHealth.filters.needs_review.total,
                        componentsHealth.filters.needs_review.truncated,
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {componentsHealth.filters.needs_review.items.length ? (
                      componentsHealth.filters.needs_review.items.map((name) => (
                        <Badge key={name} variant="warning">
                          {name}
                        </Badge>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No components in needs-review.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Components</div>
                    <div className="text-xs text-muted-foreground">
                      {componentsHealth.components.length}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Coverage</TableHead>
                        <TableHead className="text-right">Proof</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {componentsHealth.components.map((row) => (
                        <TableRow key={row.slug}>
                          <TableCell>
                            <Link
                              to={`/components/${encodeURIComponent(row.slug)}`}
                              className="font-semibold underline decoration-border/60 underline-offset-4"
                            >
                              {row.display_name}
                            </Link>
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {row.slug}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.pipeline_stage}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={componentStatusBadge(row.status)}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.coverage}%
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.visual_proof_exists ? (
                              <Badge variant="success">yes</Badge>
                            ) : (
                              <Badge variant="warning">no</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

