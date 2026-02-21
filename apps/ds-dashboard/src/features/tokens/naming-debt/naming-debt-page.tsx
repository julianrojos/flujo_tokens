import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, RefreshCcw } from "lucide-react";

import { fetchNamingDebt, refreshNamingDebt } from "@/lib/api";
import type {
  NamingDebtCategory,
  NamingDebtReport,
  NamingDebtRenameProposal,
  NamingDebtSeverity,
} from "@/types/naming-debt";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function severityVariant(severity: NamingDebtSeverity) {
  if (severity === "error") return "warning" as const;
  if (severity === "warning") return "neutral" as const;
  return "success" as const;
}

function riskVariant(risk: NamingDebtRenameProposal["riskLevel"]) {
  if (risk === "high") return "warning" as const;
  if (risk === "medium") return "neutral" as const;
  return "success" as const;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function NamingDebtPage() {
  const [report, setReport] = useState<NamingDebtReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | NamingDebtSeverity>("all");
  const [category, setCategory] = useState<"all" | NamingDebtCategory>("all");
  const [collection, setCollection] = useState("all");

  const load = async (forceRefresh = false) => {
    setError(null);
    if (!forceRefresh) setLoading(true);
    try {
      const payload = await fetchNamingDebt({ refresh: forceRefresh });
      setReport(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const collectionOptions = useMemo(() => {
    if (!report) return [];
    return Object.keys(report.scoreByCollection).sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "base" }),
    );
  }, [report]);

  const filteredViolations = useMemo(() => {
    if (!report) return [];
    const query = search.trim().toLowerCase();
    return report.violations.filter((violation) => {
      if (severity !== "all" && violation.severity !== severity) return false;
      if (category !== "all" && violation.category !== category) return false;
      if (collection !== "all" && violation.collection !== collection) return false;
      if (!query) return true;
      return (
        violation.tokenPath.toLowerCase().includes(query) ||
        violation.ruleId.toLowerCase().includes(query) ||
        violation.message.toLowerCase().includes(query)
      );
    });
  }, [report, search, severity, category, collection]);

  const topProposals = useMemo(() => {
    if (!report) return [];
    return report.renameProposals.slice(0, 20);
  }, [report]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshNamingDebt();
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Overall score</CardDescription>
            <CardTitle>{report?.summary.overallScore ?? "—"}/100</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total violations</CardDescription>
            <CardTitle>{report?.summary.totalViolations ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Auto-fixable</CardDescription>
            <CardTitle>{report?.summary.autoFixable ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Manual review</CardDescription>
            <CardTitle>{report?.summary.manualReview ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Naming Debt Detector</CardTitle>
            <CardDescription>
              Detects naming inconsistencies and suggests normalization plans with impact estimates.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              variant="outline"
              disabled={!report}
              onClick={() => report && downloadJson("naming-debt-report.json", report)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search token path, rule or message"
            />
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as "all" | NamingDebtSeverity)}
            >
              <option value="all">Severity: all</option>
              <option value="error">Severity: error</option>
              <option value="warning">Severity: warning</option>
              <option value="info">Severity: info</option>
            </Select>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as "all" | NamingDebtCategory)}
            >
              <option value="all">Category: all</option>
              <option value="structure">Category: structure</option>
              <option value="casing">Category: casing</option>
              <option value="vocabulary">Category: vocabulary</option>
              <option value="consistency">Category: consistency</option>
            </Select>
            <Select value={collection} onChange={(event) => setCollection(event.target.value)}>
              <option value="all">Collection: all</option>
              {collectionOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Collection scores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!report ? (
                  <p className="text-sm text-muted-foreground">
                    {loading ? "Loading report..." : "No naming debt report available."}
                  </p>
                ) : (
                  Object.values(report.scoreByCollection)
                    .sort((left, right) => left.score - right.score)
                    .map((row) => (
                      <div
                        key={row.collection}
                        className="rounded-md border border-border/70 bg-background/70 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{row.collection}</span>
                          <Badge variant={row.score >= 80 ? "success" : row.score >= 60 ? "neutral" : "warning"}>
                            {row.score}/100
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatPercent(row.cleanPercent)} clean · {row.totalTokens} tokens
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          errors {row.issuesBySeverity.error} · warnings {row.issuesBySeverity.warning} · info {row.issuesBySeverity.info}
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-3">
              <CardHeader>
                <CardTitle>Violations</CardTitle>
                <CardDescription>
                  {filteredViolations.length} item(s) matching current filters.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Suggestion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!loading && filteredViolations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No violations match current filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {(loading ? [] : filteredViolations.slice(0, 60)).map((row, index) => (
                      <TableRow key={`${row.tokenPath}:${row.ruleId}:${index}`}>
                        <TableCell className="align-top">
                          <Link
                            to={`/tokens/${encodeURIComponent(row.tokenPath)}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {row.tokenPath}
                          </Link>
                          <div className="mt-1 text-xs text-muted-foreground">{row.message}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.ruleId}</TableCell>
                        <TableCell>
                          <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
                        </TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.suggestedPath ? row.suggestedPath : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top rename proposals</CardTitle>
              <CardDescription>
                Risk-ranked proposals enriched with reference impact.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Current</TableHead>
                    <TableHead>Suggested</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Refs</TableHead>
                    <TableHead>Affected specs</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && topProposals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No rename proposals generated.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {(loading ? [] : topProposals).map((proposal) => (
                    <TableRow key={`${proposal.currentPath}=>${proposal.suggestedPath}`}>
                      <TableCell className="font-mono text-xs">{proposal.currentPath}</TableCell>
                      <TableCell className="font-mono text-xs">{proposal.suggestedPath}</TableCell>
                      <TableCell>
                        <Badge variant={riskVariant(proposal.riskLevel)}>{proposal.riskLevel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        direct {proposal.directRefs} · transitive {proposal.transitiveRefs}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {proposal.affectedSpecs.length}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/impact?tokenPath=${encodeURIComponent(proposal.currentPath)}`}
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Impact
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

