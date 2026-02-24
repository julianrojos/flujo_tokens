import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowUpDown, CheckCircle2, RefreshCcw } from "lucide-react";

import {
  captureHealthSnapshot,
  fetchComponentsHealth,
  fetchHealthHistory,
  fetchNamingDebt,
  fetchTokenHealth,
  refreshComponentsHealth,
  refreshTokenHealth,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { ComponentsHealthReport } from "@/types/components-health";
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from "@/types/health-history";
import type { NamingDebtReport } from "@/types/naming-debt";
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
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiErrorMessage } from "@/components/api-error-message";
import { HealthTrendsChart } from "./health-trends-chart";

type DashboardIssue = {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: "critical" | "warning";
  to: string;
};

const RANGE_LABEL: Record<HealthHistoryRange, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function componentStatusBadge(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "needs-review") return "warning" as const;
  return "neutral" as const;
}

function stageOrder(stage: string) {
  const order: Record<string, number> = {
    "missing-spec": 0,
    spec: 1,
    markdown: 2,
    render: 3,
    "visual-proof": 4,
  };
  return order[stage] ?? 99;
}

export function HealthDashboardPage() {
  const location = useLocation();
  const [tokenHealth, setTokenHealth] = useState<TokenHealthReport | null>(null);
  const [componentsHealth, setComponentsHealth] =
    useState<ComponentsHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<ApiErrorDisplay | null>(null);
  const [componentsError, setComponentsError] = useState<ApiErrorDisplay | null>(null);
  const [refreshingTokens, setRefreshingTokens] = useState(false);
  const [refreshingComponents, setRefreshingComponents] = useState(false);
  const [history, setHistory] = useState<HealthHistoryReport | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<ApiErrorDisplay | null>(null);
  const [namingDebt, setNamingDebt] = useState<NamingDebtReport | null>(null);
  const [namingError, setNamingError] = useState<ApiErrorDisplay | null>(null);
  const [historyRange, setHistoryRange] = useState<HealthHistoryRange>("30d");
  const [historyBucket, setHistoryBucket] = useState<HealthHistoryBucket>("day");
  const [snapshotting, setSnapshotting] = useState(false);
  const [brokenAliasSort, toggleBrokenAliasSort] = useSortState<
    "token" | "alias" | "reason"
  >({ field: "token", dir: "asc" });
  const [wcagSort, toggleWcagSort] = useSortState<
    "foreground" | "background" | "ratio"
  >({ field: "ratio", dir: "desc" });
  const [atRiskSort, toggleAtRiskSort] = useSortState<
    "component" | "stage" | "status" | "coverage"
  >({ field: "coverage", dir: "desc" });

  const scrollToHashTarget = useCallback((hash: string, behavior: ScrollBehavior = "smooth") => {
    const id = decodeURIComponent(hash.replace(/^#/, "")).trim();
    if (!id) return false;
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView({ behavior, block: "start" });
    return true;
  }, []);

  const load = async () => {
    setLoading(true);
    setTokenError(null);
    setComponentsError(null);
    setNamingError(null);

    const [tokensResult, componentsResult, namingResult] = await Promise.allSettled([
      fetchTokenHealth(),
      fetchComponentsHealth(),
      fetchNamingDebt(),
    ]);

    if (tokensResult.status === "fulfilled") {
      setTokenHealth(tokensResult.value);
    } else {
      setTokenHealth(null);
      setTokenError(
        toApiErrorDisplay(tokensResult.reason, {
          fallbackTitle: "Token health unavailable",
          fallbackMessage: "Unable to load token health report.",
        }),
      );
    }

    if (componentsResult.status === "fulfilled") {
      setComponentsHealth(componentsResult.value);
    } else {
      setComponentsHealth(null);
      setComponentsError(
        toApiErrorDisplay(componentsResult.reason, {
          fallbackTitle: "Components health unavailable",
          fallbackMessage: "Unable to load components health report.",
        }),
      );
    }

    if (namingResult.status === "fulfilled") {
      setNamingDebt(namingResult.value);
    } else {
      setNamingDebt(null);
      setNamingError(
        toApiErrorDisplay(namingResult.reason, {
          fallbackTitle: "Naming report unavailable",
          fallbackMessage: "Unable to load naming debt report.",
        }),
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const loadHistory = async (options?: {
    range?: HealthHistoryRange;
    bucket?: HealthHistoryBucket;
  }) => {
    const range = options?.range ?? historyRange;
    const bucket = options?.bucket ?? historyBucket;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await fetchHealthHistory({ range, bucket });
      setHistory(payload);
    } catch (cause) {
      setHistoryError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Health history unavailable",
          fallbackMessage: "Unable to load health history.",
        }),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory({ range: historyRange, bucket: historyBucket });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyRange, historyBucket]);

  useEffect(() => {
    if (!location.hash || loading) return;
    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      if (scrollToHashTarget(location.hash, "smooth")) return;
      attempts += 1;
      if (attempts < 10) {
        window.setTimeout(run, 80);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [location.hash, loading, scrollToHashTarget]);

  const handleIssueViewClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, to: string) => {
      const hashIndex = to.indexOf("#");
      if (hashIndex < 0) return;

      const targetPath = to.slice(0, hashIndex) || location.pathname;
      const targetHash = to.slice(hashIndex);
      if (targetPath !== location.pathname) return;

      event.preventDefault();
      window.history.replaceState(null, "", `${location.pathname}${targetHash}`);
      scrollToHashTarget(targetHash, "smooth");
    },
    [location.pathname, scrollToHashTarget],
  );

  const handleRefreshTokenHealth = async () => {
    setRefreshingTokens(true);
    setTokenError(null);
    try {
      await refreshTokenHealth();
      const payload = await fetchTokenHealth();
      setTokenHealth(payload);
    } catch (cause) {
      setTokenHealth(null);
      setTokenError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Token health refresh failed",
          fallbackMessage: "Unable to refresh token health report.",
        }),
      );
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
      setComponentsError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Components health refresh failed",
          fallbackMessage: "Unable to refresh components health report.",
        }),
      );
    } finally {
      setRefreshingComponents(false);
    }
  };

  const handleCaptureSnapshot = async () => {
    setSnapshotting(true);
    setHistoryError(null);
    try {
      await captureHealthSnapshot();
      await Promise.all([
        load(),
        loadHistory({ range: historyRange, bucket: historyBucket }),
      ]);
    } catch (cause) {
      setHistoryError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Snapshot capture failed",
          fallbackMessage: "Unable to capture a health snapshot.",
        }),
      );
    } finally {
      setSnapshotting(false);
    }
  };

  const renderErrorPanel = (error: ApiErrorDisplay, tipCommand: string) => (
    <ApiErrorMessage error={error}>
      <div className="mt-1 text-xs text-red-700/80">
        Tip: run <code>{tipCommand}</code>
      </div>
    </ApiErrorMessage>
  );

  const dashboard = useMemo(() => {
    if (!tokenHealth || !componentsHealth) return null;

    const tokensTotal = Math.max(tokenHealth.summary.tokens_total, 1);
    const componentsTotal = Math.max(componentsHealth.summary.total_components, 1);

    const tokenPenalty =
      Math.min(30, (tokenHealth.summary.unused_tokens_total / tokensTotal) * 35) +
      Math.min(
        20,
        (tokenHealth.summary.high_coupling_tokens_total / tokensTotal) * 25,
      ) +
      Math.min(20, (tokenHealth.summary.broken_aliases_total / tokensTotal) * 160) +
      Math.min(
        20,
        (tokenHealth.summary.broken_css_var_refs_total / tokensTotal) * 120,
      ) +
      Math.min(20, (tokenHealth.summary.wcag_failures_total / tokensTotal) * 140);

    const tokenScoreBase = Math.round(Math.max(0, 100 - tokenPenalty));
    const namingScore = namingDebt?.summary.overallScore ?? null;
    const tokenScore =
      namingScore === null
        ? tokenScoreBase
        : Math.round(tokenScoreBase * 0.8 + namingScore * 0.2);

    const componentsScore = Math.round(
      (componentsHealth.summary.ready / componentsTotal) * 45 +
        (componentsHealth.summary.with_visual_proof / componentsTotal) * 35 +
        (componentsHealth.summary.average_coverage_percent / 100) * 20,
    );

    const overallScore = Math.round(tokenScore * 0.55 + componentsScore * 0.45);

    const issues: DashboardIssue[] = [
      {
        id: "broken-aliases",
        label: "Broken aliases",
        description: "Alias links pointing to non-existing targets.",
        count: tokenHealth.summary.broken_aliases_total,
        severity: "critical",
        to: "/health#issue-broken-aliases",
      },
      {
        id: "broken-css-var-refs",
        label: "Broken CSS var refs",
        description: "References that fail token resolution.",
        count: tokenHealth.summary.broken_css_var_refs_total,
        severity: "critical",
        to: "/health#issue-broken-css-var-refs",
      },
      {
        id: "wcag-failures",
        label: "WCAG failures",
        description: "Contrast pairs below required ratio.",
        count: tokenHealth.summary.wcag_failures_total,
        severity: "critical",
        to: "/health#issue-wcag-failures",
      },
      {
        id: "needs-review",
        label: "Components needing review",
        description: "Components not ready for publish.",
        count: componentsHealth.summary.needs_review,
        severity: "warning",
        to: "/health#issue-needs-review-components",
      },
      {
        id: "missing-visual-proof",
        label: "Components without visual proof",
        description: "Components missing screenshot evidence.",
        count: componentsHealth.filters.missing_visual_proof.total,
        severity: "warning",
        to: "/health#issue-missing-visual-proof",
      },
      {
        id: "unused-tokens",
        label: "Unused tokens",
        description: "Tokens currently not used by specs or aliases.",
        count: tokenHealth.summary.unused_tokens_total,
        severity: "warning",
        to: "/health#issue-unused-tokens",
      },
    ];

    if (namingDebt && namingDebt.summary.issuesBySeverity.error > 0) {
      issues.push({
        id: "naming-errors",
        label: "Naming quality (errors)",
        description: "High-severity naming inconsistencies in token taxonomy.",
        count: namingDebt.summary.issuesBySeverity.error,
        severity: "critical",
        to: "/tokens/naming-debt?severity=error",
      });
    } else if (namingDebt && namingDebt.summary.issuesBySeverity.warning > 0) {
      issues.push({
        id: "naming-warnings",
        label: "Naming quality (warnings)",
        description: "Normalization opportunities detected in token vocabulary.",
        count: namingDebt.summary.issuesBySeverity.warning,
        severity: "warning",
        to: "/tokens/naming-debt?severity=warning",
      });
    }

    const criticalIssues = issues.filter(
      (issue) => issue.severity === "critical" && issue.count > 0,
    ).length;
    const warningIssues = issues.filter(
      (issue) => issue.severity === "warning" && issue.count > 0,
    ).length;

    const healthStatus =
      criticalIssues > 0 ? "Critical" : overallScore < 70 ? "Attention" : "Healthy";
    const healthVariant =
      criticalIssues > 0
        ? ("warning" as const)
        : overallScore < 70
          ? ("warning" as const)
          : ("success" as const);

    const pipeline = Object.entries(componentsHealth.summary.by_pipeline_stage)
      .map(([stage, count]) => ({
        stage,
        count,
        percent: Math.round((count / componentsTotal) * 100),
      }))
      .sort((left, right) => {
        const byStage = stageOrder(left.stage) - stageOrder(right.stage);
        if (byStage !== 0) return byStage;
        return right.count - left.count;
      });

    const atRiskComponents = componentsHealth.components
      .filter((row) => row.status !== "ready" || !row.visual_proof_exists)
      .slice()
      .sort((left, right) => {
        const leftRisk =
          (left.status === "needs-review" ? 3 : left.status === "draft" ? 2 : 1) +
          (!left.visual_proof_exists ? 2 : 0);
        const rightRisk =
          (right.status === "needs-review" ? 3 : right.status === "draft" ? 2 : 1) +
          (!right.visual_proof_exists ? 2 : 0);
        return rightRisk - leftRisk || left.slug.localeCompare(right.slug);
      })
      .slice(0, 12);

    return {
      tokenScore,
      namingScore,
      componentsScore,
      overallScore,
      issues,
      criticalIssues,
      warningIssues,
      healthStatus,
      healthVariant,
      pipeline,
      atRiskComponents,
    };
  }, [componentsHealth, namingDebt, tokenHealth]);

  const sortedBrokenAliases = useMemo(() => {
    const rows = tokenHealth?.broken_aliases.items?.slice(0, 8) ?? [];
    rows.sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (brokenAliasSort.field === "token") return row.token.toLowerCase();
        if (brokenAliasSort.field === "alias") return row.aliasCssVar.toLowerCase();
        return row.reason.toLowerCase();
      };
      const aValue = valueFor(left);
      const bValue = valueFor(right);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return brokenAliasSort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [brokenAliasSort, tokenHealth]);

  const sortedBrokenCssVarRefs = useMemo(() => {
    const rows = tokenHealth?.broken_css_var_refs.items?.slice(0, 8) ?? [];
    rows.sort((left, right) => {
      const leftValue = `${left.from} ${left.cssVar} ${left.reason}`.toLowerCase();
      const rightValue = `${right.from} ${right.cssVar} ${right.reason}`.toLowerCase();
      return leftValue.localeCompare(rightValue);
    });
    return rows;
  }, [tokenHealth]);

  const topUnusedTokens = useMemo(() => {
    const rows = tokenHealth?.unused_tokens.items?.slice() ?? [];
    rows.sort((left, right) => left.path.localeCompare(right.path));
    return rows.slice(0, 10);
  }, [tokenHealth]);

  const sortedWcagFailures = useMemo(() => {
    const rows = tokenHealth?.wcag_failures.items?.slice(0, 8) ?? [];
    rows.sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (wcagSort.field === "foreground") return row.foreground.toLowerCase();
        if (wcagSort.field === "background") return row.background.toLowerCase();
        return Number(row.contrastRatio) - Number(row.requiredRatio);
      };
      const aValue = valueFor(left);
      const bValue = valueFor(right);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return wcagSort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [tokenHealth, wcagSort]);

  const sortedAtRiskComponents = useMemo(() => {
    const rows = dashboard?.atRiskComponents?.slice() ?? [];
    rows.sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (atRiskSort.field === "component") return row.display_name.toLowerCase();
        if (atRiskSort.field === "stage") return row.pipeline_stage.toLowerCase();
        if (atRiskSort.field === "status") return row.status.toLowerCase();
        return row.coverage;
      };
      const aValue = valueFor(left);
      const bValue = valueFor(right);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return atRiskSort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [atRiskSort, dashboard]);

  return (
    <div className="space-y-6 animate-fade-slide-in">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Health</h2>
          <p className="text-sm text-muted-foreground">
            Operational dashboard for token and component quality.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCaptureSnapshot}
            disabled={snapshotting}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {snapshotting ? "Capturing…" : "Capture snapshot"}
          </Button>
          <Button
            variant="outline"
            onClick={handleRefreshTokenHealth}
            disabled={refreshingTokens}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {refreshingTokens ? "Refreshing tokens…" : "Refresh tokens"}
          </Button>
          <Button
            variant="outline"
            onClick={handleRefreshComponentsHealth}
            disabled={refreshingComponents}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {refreshingComponents ? "Refreshing components…" : "Refresh components"}
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {loading ? "Loading…" : "Reload all"}
          </Button>
        </div>
      </div>

      {tokenError ? (
        renderErrorPanel(tokenError, "npm run ds:token-health")
      ) : null}

      {componentsError ? (
        renderErrorPanel(componentsError, "npm run ds:registry:report")
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/50 p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Health trends</div>
            <div className="text-xs text-muted-foreground">
              Track weekly/monthly evolution of breaking, WCAG, unresolved refs and coverage.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={historyRange}
              onChange={(event) => setHistoryRange(event.target.value as HealthHistoryRange)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </Select>
            <Select
              value={historyBucket}
              onChange={(event) => setHistoryBucket(event.target.value as HealthHistoryBucket)}
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
            </Select>
            <Button
              variant="outline"
              onClick={() => void loadHistory({ range: historyRange, bucket: historyBucket })}
              disabled={historyLoading}
            >
              {historyLoading ? "Loading…" : "Reload trends"}
            </Button>
          </div>
        </div>

        {historyError ? (
          renderErrorPanel(historyError, "npm run ds:health-snapshot")
        ) : null}

        {history ? (
          <HealthTrendsChart
            snapshots={history.snapshots}
            rangeLabel={RANGE_LABEL[historyRange]}
            bucket={historyBucket}
          />
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              {historyLoading ? "Loading health history…" : "No health history available yet."}
            </CardContent>
          </Card>
        )}
      </section>

      {dashboard ? (
        <>
          <section className="grid gap-4 md:grid-cols-5">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardDescription>System status</CardDescription>
                <CardTitle className="flex items-center gap-3">
                  <span>{dashboard.overallScore}/100</span>
                  <Badge variant={dashboard.healthVariant}>{dashboard.healthStatus}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>Critical issues: {dashboard.criticalIssues}</span>
                  <span>Warnings: {dashboard.warningIssues}</span>
                  <span>
                    Last token update: {formatDate(tokenHealth?.generated_at)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Tokens score</CardDescription>
                <CardTitle>{dashboard.tokenScore}/100</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {tokenHealth?.summary.tokens_with_usage ?? 0}/{tokenHealth?.summary.tokens_total ?? 0}{" "}
                tokens used
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Components score</CardDescription>
                <CardTitle>{dashboard.componentsScore}/100</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Avg coverage {componentsHealth?.summary.average_coverage_percent ?? 0}%
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Naming score</CardDescription>
                <CardTitle>
                  {dashboard.namingScore !== null ? `${dashboard.namingScore}/100` : "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {namingDebt ? (
                  <span>
                    {namingDebt.summary.totalViolations} issues ·{" "}
                    <Link
                      to="/tokens/naming-debt"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Open report
                    </Link>
                  </span>
                ) : namingError ? (
                  <span>Naming report unavailable</span>
                ) : (
                  <span>Loading naming report...</span>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader>
                <CardTitle>Active issues</CardTitle>
                <CardDescription>Prioritized items to address first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.issues
                  .filter((issue) => issue.count > 0)
                  .sort((left, right) => {
                    if (left.severity !== right.severity) {
                      return left.severity === "critical" ? -1 : 1;
                    }
                    return right.count - left.count;
                  })
                  .map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={issue.severity === "critical" ? "warning" : "neutral"}
                          >
                            {issue.severity === "critical" ? "Critical" : "Warning"}
                          </Badge>
                          <span className="font-semibold">{issue.label}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {issue.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-lg font-semibold">{issue.count}</div>
                        </div>
                        <Link
                          to={issue.to}
                          onClick={(event) => handleIssueViewClick(event, issue.to)}
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                {dashboard.issues.every((issue) => issue.count === 0) ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    No active issues detected in current reports.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Pipeline progress</CardTitle>
                <CardDescription>Components by documentation stage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.pipeline.map((stage) => (
                  <div key={stage.stage}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{stage.stage}</span>
                      <span className="text-muted-foreground">
                        {stage.count} · {stage.percent}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${stage.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Token priorities</CardTitle>
                <CardDescription>
                  Highest-risk token issues requiring immediate review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {tokenHealth?.warnings?.length ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800">
                    <div className="font-semibold">Warnings</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {tokenHealth.warnings.map((warning) => (
                        <li key={warning.id}>
                          <code>{warning.id}</code>: {warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div id="issue-unused-tokens" className="scroll-mt-24">
                  <div className="mb-2 text-sm font-semibold">Unused tokens</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Collection</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topUnusedTokens.length ? (
                        topUnusedTokens.map((row) => (
                          <TableRow key={row.path}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                className="underline decoration-border/60 underline-offset-4"
                                to={`/tokens/${encodeURIComponent(row.path)}`}
                              >
                                {row.path}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">{row.type}</TableCell>
                            <TableCell className="text-xs">{row.collection}</TableCell>
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

                <div id="issue-broken-aliases" className="scroll-mt-24">
                  <div className="mb-2 text-sm font-semibold">Broken aliases</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleBrokenAliasSort("token")}
                          >
                            Token <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleBrokenAliasSort("alias")}
                          >
                            Alias CSS var <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleBrokenAliasSort("reason")}
                          >
                            Reason <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedBrokenAliases.length ? (
                        sortedBrokenAliases.map((row) => (
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

                <div id="issue-broken-css-var-refs" className="scroll-mt-24">
                  <div className="mb-2 text-sm font-semibold">Broken CSS var refs</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From token</TableHead>
                        <TableHead>CSS variable</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedBrokenCssVarRefs.length ? (
                        sortedBrokenCssVarRefs.map((row) => (
                          <TableRow key={`${row.from}:${row.cssVar}`}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                className="underline decoration-border/60 underline-offset-4"
                                to={`/tokens/${encodeURIComponent(row.from)}`}
                              >
                                {row.from}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.cssVar}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.reason}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            No broken CSS var references detected.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div id="issue-wcag-failures" className="scroll-mt-24">
                  <div className="mb-2 text-sm font-semibold">WCAG failures</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleWcagSort("foreground")}
                          >
                            Foreground <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleWcagSort("background")}
                          >
                            Background <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleWcagSort("ratio")}
                          >
                            Ratio <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedWcagFailures.length ? (
                        sortedWcagFailures.map((row) => (
                          <TableRow
                            key={`${row.foreground}:${row.background}:${row.level}:${row.textSize}`}
                          >
                            <TableCell className="text-xs">
                              <div className="font-mono">{row.foreground}</div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-mono">{row.background}</div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="warning">
                                {row.contrastRatio} / {row.requiredRatio}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            No WCAG failures for configured pairs.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Component priorities</CardTitle>
                <CardDescription>
                  Components with missing proof or pending review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div
                  id="issue-needs-review-components"
                  className="scroll-mt-24 rounded-lg border border-border/70 bg-background/60 p-3"
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Needs review
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {componentsHealth?.filters.needs_review.items.length ? (
                      componentsHealth.filters.needs_review.items
                        .slice(0, 10)
                        .map((name) => (
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

                <div
                  id="issue-missing-visual-proof"
                  className="scroll-mt-24 rounded-lg border border-border/70 bg-background/60 p-3"
                >
                  <div className="mb-2 text-sm font-semibold">Missing visual proof</div>
                  <div className="flex flex-wrap gap-2">
                    {componentsHealth?.filters.missing_visual_proof.items.length ? (
                      componentsHealth.filters.missing_visual_proof.items
                        .slice(0, 10)
                        .map((name) => (
                          <Badge key={name} variant="neutral">
                            {name}
                          </Badge>
                        ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        All components have visual proof.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold">At-risk components</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleAtRiskSort("component")}
                          >
                            Component <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleAtRiskSort("stage")}
                          >
                            Stage <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleAtRiskSort("status")}
                          >
                            Status <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right" showSortIcon={false}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleAtRiskSort("coverage")}
                          >
                            Coverage <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAtRiskComponents.length ? (
                        sortedAtRiskComponents.map((row) => (
                          <TableRow key={row.slug}>
                            <TableCell>
                              <Link
                                to={`/components/${encodeURIComponent(row.slug)}`}
                                className="font-semibold underline decoration-border/60 underline-offset-4"
                              >
                                {row.display_name}
                              </Link>
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
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-sm text-muted-foreground">
                            No at-risk components detected.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {loading
              ? "Loading health reports…"
              : "Health data unavailable. Refresh token/component health first."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
