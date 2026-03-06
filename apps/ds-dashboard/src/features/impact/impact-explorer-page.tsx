import { useEffect, useMemo, useRef, useState } from "react";
import { createSearchParams, Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ShieldAlert, Target } from "lucide-react";

import { fetchImpact, fetchTokenRegistry } from "@/lib/api";
import { normalizeToHex6 } from "@/features/tokens/accessibility/color-utils";
import type { ImpactReport, ImpactSeverity } from "@/types/impact";
import type { TokenEntry } from "@/types/token-registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

function parseDepth(raw: string | null) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(0, Math.min(8, parsed));
}

function severityBadgeVariant(severity: ImpactSeverity) {
  if (severity === "low") return "neutral" as const;
  if (severity === "medium") return "default" as const;
  return "warning" as const;
}

function severityLabel(severity: ImpactSeverity) {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

function formatRatio(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(2)}:1`;
}

function displayColor(value: string | null) {
  const normalized = value ? normalizeToHex6(value) : null;
  return normalized ?? value ?? "—";
}

type SortDirection = "asc" | "desc";
type AffectedTokenSortField = "severity" | "token" | "depth" | "uses" | "reasons";
type AffectedComponentSortField =
  | "severity"
  | "component"
  | "pipeline"
  | "tokens"
  | "occurrences"
  | "visualProof";
type WcagSortField = "pair" | "level" | "original" | "simulated" | "status";

function compareValues(left: string | number, right: string | number) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function ImpactExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenParam = searchParams.get("token") ?? "";
  const newValueParam = searchParams.get("newValue") ?? "";
  const depthParam = parseDepth(searchParams.get("depth"));

  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [tokenInput, setTokenInput] = useState(tokenParam);
  const [newValueInput, setNewValueInput] = useState(newValueParam);
  const [depth, setDepth] = useState(depthParam);
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [affectedTokenSort, setAffectedTokenSort] = useState<{
    field: AffectedTokenSortField;
    dir: SortDirection;
  }>({ field: "severity", dir: "desc" });
  const [affectedComponentSort, setAffectedComponentSort] = useState<{
    field: AffectedComponentSortField;
    dir: SortDirection;
  }>({ field: "severity", dir: "desc" });
  const [wcagSort, setWcagSort] = useState<{ field: WcagSortField; dir: SortDirection }>({
    field: "status",
    dir: "desc",
  });
  const autoQueryRef = useRef("");

  useEffect(() => {
    const loadTokens = async () => {
      setLoadingTokens(true);
      try {
        const payload = await fetchTokenRegistry();
        setTokens(payload.entries ?? []);
      } catch {
        setTokens([]);
      } finally {
        setLoadingTokens(false);
      }
    };
    void loadTokens();
  }, []);

  const runAnalysis = async (args?: {
    tokenPath?: string;
    newValue?: string;
    depth?: number;
  }) => {
    const tokenPath = String(args?.tokenPath ?? tokenInput).trim();
    const nextValue = String(args?.newValue ?? newValueInput).trim();
    const nextDepth = args?.depth ?? depth;

    if (!tokenPath) {
      setError("Select a token first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchImpact({
        tokenPath,
        newValue: nextValue || null,
        depth: nextDepth,
      });
      setReport(payload);
      setTokenInput(tokenPath);
      setNewValueInput(nextValue);
      setDepth(nextDepth);
      setSearchParams(
        createSearchParams({
          token: tokenPath,
          ...(nextValue ? { newValue: nextValue } : {}),
          depth: String(nextDepth),
        }),
      );
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = tokenParam.trim();
    if (!token) return;
    const signature = `${token}|${newValueParam}|${depthParam}`;
    if (signature === autoQueryRef.current) return;
    autoQueryRef.current = signature;
    setTokenInput(token);
    setNewValueInput(newValueParam);
    setDepth(depthParam);
    void runAnalysis({
      tokenPath: token,
      newValue: newValueParam,
      depth: depthParam,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam, newValueParam, depthParam]);

  const tokenOptions = useMemo(
    () =>
      tokens
        .slice()
        .sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }))
        .slice(0, 2500),
    [tokens],
  );

  const rootCurrentColor = useMemo(
    () => (report ? normalizeToHex6(report.rootToken.resolvedValue) : null),
    [report],
  );
  const rootSimulatedColor = useMemo(
    () => (report ? normalizeToHex6(report.rootToken.simulatedResolvedValue ?? "") : null),
    [report],
  );
  const typedNewColor = useMemo(() => normalizeToHex6(newValueInput), [newValueInput]);

  const sortedAffectedTokens = useMemo(() => {
    if (!report) return [];
    const severityRank: Record<ImpactSeverity, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    const rows = report.affectedTokens.slice();
    rows.sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (affectedTokenSort.field === "severity") return severityRank[row.severity];
        if (affectedTokenSort.field === "token") return row.path.toLowerCase();
        if (affectedTokenSort.field === "depth") return row.depth;
        if (affectedTokenSort.field === "uses") return row.usageCount;
        return row.reasons.join(" ").toLowerCase();
      };
      const comparison = compareValues(valueFor(left), valueFor(right));
      return affectedTokenSort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [affectedTokenSort, report]);

  const sortedAffectedComponents = useMemo(() => {
    if (!report) return [];
    const severityRank: Record<ImpactSeverity, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    const rows = report.affectedComponents.slice();
    rows.sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (affectedComponentSort.field === "severity") return severityRank[row.severity];
        if (affectedComponentSort.field === "component") return row.displayName.toLowerCase();
        if (affectedComponentSort.field === "pipeline") return row.pipelineStage.toLowerCase();
        if (affectedComponentSort.field === "tokens") return row.affectedTokenPaths.length;
        if (affectedComponentSort.field === "occurrences") return row.occurrences;
        return row.visualProofAvailable ? 1 : 0;
      };
      const comparison = compareValues(valueFor(left), valueFor(right));
      return affectedComponentSort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [affectedComponentSort, report]);

  const sortedWcagSimulation = useMemo(() => {
    if (!report) return [];
    const rows = report.wcagSimulation.slice();
    rows.sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (wcagSort.field === "pair")
          return `${row.foreground} ${row.background}`.toLowerCase();
        if (wcagSort.field === "level") return `${row.level}-${row.textSize}`.toLowerCase();
        if (wcagSort.field === "original") return row.originalRatio;
        if (wcagSort.field === "simulated") return row.simulatedRatio ?? -1;
        return row.regression ? 2 : row.simulatedPass ? 1 : 0;
      };
      const comparison = compareValues(valueFor(left), valueFor(right));
      return wcagSort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [report, wcagSort]);

  const toggleAffectedTokenSort = (field: AffectedTokenSortField) => {
    setAffectedTokenSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  const toggleAffectedComponentSort = (field: AffectedComponentSortField) => {
    setAffectedComponentSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  const toggleWcagSort = (field: WcagSortField) => {
    setWcagSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Impact Explorer
          </CardTitle>
          <CardDescription>
            Qué se rompe si cambias un token: dependencias transitivas, usos en componentes y simulación WCAG.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-6">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Token
              </label>
              <Input
                className="mt-2"
                list="impact-token-options"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="Token path / slashPath / cssVar"
                disabled={loadingTokens}
              />
              <datalist id="impact-token-options">
                {tokenOptions.map((entry) => (
                  <option key={entry.path} value={entry.path} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                New value (optional)
              </label>
              <div className="mt-2 flex gap-2">
                <Input
                  value={newValueInput}
                  onChange={(event) => setNewValueInput(event.target.value)}
                  placeholder="#RRGGBB"
                />
                <input
                  type="color"
                  value={typedNewColor ?? "#000000"}
                  onChange={(event) => setNewValueInput(event.target.value)}
                  className="h-10 w-11 rounded-md border border-border bg-transparent p-1"
                  aria-label="Choose new color value"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Depth
              </label>
              <Select
                className="mt-2 w-full"
                value={String(depth)}
                onChange={(event) => setDepth(parseDepth(event.target.value))}
              >
                {Array.from({ length: 9 }).map((_, index) => (
                  <option key={index} value={String(index)}>
                    {index}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end md:col-span-1">
              <Button className="w-full" disabled={loading} onClick={() => void runAnalysis()}>
                {loading ? "Analyzing…" : "Analyze"}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {report ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Severity</CardDescription>
                <CardTitle>{severityLabel(report.summary.severity)}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={severityBadgeVariant(report.summary.severity)}>
                  score {report.summary.severityScore}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Blast radius</CardDescription>
                <CardTitle>{report.summary.blastRadius}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {report.summary.directDependents} direct · {report.summary.transitiveDependents} transitive
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Affected components</CardDescription>
                <CardTitle>{report.summary.affectedComponents}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {report.summary.affectedUsages} total token usages
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>WCAG regressions</CardDescription>
                <CardTitle>{report.summary.wcagRegressions}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={report.summary.wcagRegressions > 0 ? "warning" : "success"}>
                  {report.summary.recommendation}
                </Badge>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Root token</CardTitle>
              <CardDescription className="font-mono text-xs">{report.rootToken.path}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Current</div>
                <div className="mt-2 flex items-center gap-2 font-mono text-xs">
                  {rootCurrentColor ? (
                    <span
                      className="inline-block h-4 w-4 rounded-sm border border-border"
                      style={{ backgroundColor: rootCurrentColor }}
                    />
                  ) : null}
                  {displayColor(report.rootToken.resolvedValue)}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Simulated</div>
                <div className="mt-2 flex items-center gap-2 font-mono text-xs">
                  {rootSimulatedColor ? (
                    <span
                      className="inline-block h-4 w-4 rounded-sm border border-border"
                      style={{ backgroundColor: rootSimulatedColor }}
                    />
                  ) : null}
                  {displayColor(report.rootToken.simulatedResolvedValue)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Affected tokens</CardTitle>
              <CardDescription>
                {report.affectedTokens.length} token{report.affectedTokens.length === 1 ? "" : "s"} in scope
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Severity" onSort={() => toggleAffectedTokenSort("severity")} />
                    <SortableTableHead label="Token" onSort={() => toggleAffectedTokenSort("token")} />
                    <SortableTableHead label="Depth" onSort={() => toggleAffectedTokenSort("depth")} />
                    <SortableTableHead label="Uses" onSort={() => toggleAffectedTokenSort("uses")} />
                    <SortableTableHead label="Reasons" onSort={() => toggleAffectedTokenSort("reasons")} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAffectedTokens.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Badge variant={severityBadgeVariant(row.severity)}>
                          {severityLabel(row.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/tokens/${encodeURIComponent(row.path)}`}
                          className="font-mono text-xs hover:text-primary hover:underline"
                        >
                          {row.path}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">{row.depth}</TableCell>
                      <TableCell className="text-xs">{row.usageCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.reasons.join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Affected components</CardTitle>
              <CardDescription>
                Cross-linking from <code>token-usage-index</code> (<code>component-spec</code> references)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Severity"
                      onSort={() => toggleAffectedComponentSort("severity")}
                    />
                    <SortableTableHead
                      label="Component"
                      onSort={() => toggleAffectedComponentSort("component")}
                    />
                    <SortableTableHead
                      label="Pipeline"
                      onSort={() => toggleAffectedComponentSort("pipeline")}
                    />
                    <SortableTableHead
                      label="Tokens"
                      onSort={() => toggleAffectedComponentSort("tokens")}
                    />
                    <SortableTableHead
                      label="Occurrences"
                      onSort={() => toggleAffectedComponentSort("occurrences")}
                    />
                    <SortableTableHead
                      label="Visual proof"
                      onSort={() => toggleAffectedComponentSort("visualProof")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.affectedComponents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No affected components detected.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedAffectedComponents.map((component) => (
                      <TableRow key={component.slug}>
                        <TableCell>
                          <Badge variant={severityBadgeVariant(component.severity)}>
                            {severityLabel(component.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/components/${encodeURIComponent(component.slug)}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {component.displayName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{component.pipelineStage}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {component.affectedTokenPaths.length}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{component.occurrences}</TableCell>
                        <TableCell className="text-xs">
                          {component.visualProofAvailable ? "Yes" : "No"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4" />
                WCAG simulation
              </CardTitle>
              <CardDescription>
                {report.wcagSimulation.length
                  ? `${report.wcagSimulation.length} pair${report.wcagSimulation.length === 1 ? "" : "s"} analyzed`
                  : "No WCAG pairs configured for this token scope."}
              </CardDescription>
            </CardHeader>
            {report.wcagSimulation.length ? (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Pair" onSort={() => toggleWcagSort("pair")} />
                      <SortableTableHead label="Level" onSort={() => toggleWcagSort("level")} />
                      <SortableTableHead label="Original" onSort={() => toggleWcagSort("original")} />
                      <SortableTableHead
                        label="Simulated"
                        onSort={() => toggleWcagSort("simulated")}
                      />
                      <SortableTableHead label="Status" onSort={() => toggleWcagSort("status")} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWcagSimulation.map((row) => (
                      <TableRow key={`${row.foreground}|${row.background}|${row.level}|${row.textSize}`}>
                        <TableCell className="font-mono text-xs">
                          {row.foreground} / {row.background}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.level} · {row.textSize}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatRatio(row.originalRatio)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatRatio(row.simulatedRatio)}
                        </TableCell>
                        <TableCell>
                          {row.regression ? (
                            <Badge variant="warning">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Regression
                            </Badge>
                          ) : row.simulatedPass === false ? (
                            <Badge variant="warning">Fails</Badge>
                          ) : row.simulatedPass === true ? (
                            <Badge variant="success">Pass</Badge>
                          ) : (
                            <Badge variant="neutral">No simulation</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
