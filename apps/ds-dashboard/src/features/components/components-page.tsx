import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ExternalLink, RefreshCcw } from "lucide-react";

import { FigmaUrlScanner } from "./figma-url-scanner";

import {
  fetchComponentRegistry,
  fetchComponentUsageIndex,
  refreshRegistry,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import type { ComponentRegistryItem } from "@/types/component-registry";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
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
import { ApiErrorMessage } from "@/components/api-error-message";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortField =
  | "display_name"
  | "pipeline_stage"
  | "doc_status"
  | "spec_status"
  | "usage_count"
  | "ready_for_publish";

function stageBadge(stage: string) {
  if (stage === "render" || stage === "visual-proof") return "success" as const;
  if (stage === "markdown") return "warning" as const;
  return "neutral" as const;
}

function statusBadge(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "needs-review") return "warning" as const;
  return "neutral" as const;
}

export function ComponentsPage() {
  const [rows, setRows] = useState<ComponentRegistryItem[]>([]);
  const [usageBySlug, setUsageBySlug] = useState<
    ComponentUsageIndex["by_slug"]
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [docStatus, setDocStatus] = useState("all");
  const [sortField, setSortField] = useState<SortField>("display_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [registryPayload, usagePayload] = await Promise.all([
        fetchComponentRegistry(),
        fetchComponentUsageIndex().catch(() => ({ by_slug: {} })),
      ]);
      setRows(registryPayload.components ?? []);
      setUsageBySlug(usagePayload.by_slug ?? {});
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Component data unavailable",
          fallbackMessage: "Unable to load component registry.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const next = rows.filter((item) => {
      const matchesSearch =
        !lowered ||
        item.display_name.toLowerCase().includes(lowered) ||
        item.slug.toLowerCase().includes(lowered);
      const matchesStage = stage === "all" || item.pipeline_stage === stage;
      const matchesDoc = docStatus === "all" || item.doc.status === docStatus;
      return matchesSearch && matchesStage && matchesDoc;
    });

    next.sort((a, b) => {
      const valueFor = (row: ComponentRegistryItem): string | number => {
        if (sortField === "display_name") return row.display_name.toLowerCase();
        if (sortField === "pipeline_stage") return row.pipeline_stage;
        if (sortField === "doc_status") return row.doc.status;
        if (sortField === "spec_status") return row.spec.status;
        if (sortField === "usage_count") return usageBySlug[row.slug]?.used_in.length ?? 0;
        return row.ready_for_publish ? 1 : 0;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDir === "asc" ? comparison : comparison * -1;
    });

    return next;
  }, [rows, search, stage, docStatus, sortField, sortDir]);

  const stats = useMemo(() => {
    const total = rows.length;
    const ready = rows.filter((item) => item.doc.status === "ready").length;
    const needsReview = rows.filter(
      (item) => item.doc.status === "needs-review",
    ).length;
    const withProof = rows.filter((item) => item.visual_proof.exists).length;
    return { total, ready, needsReview, withProof };
  }, [rows]);

  const displayNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.slug] = row.display_name;
    }
    return map;
  }, [rows]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  };

  const handleRefreshFromPipeline = async () => {
    setSyncing(true);
    try {
      await refreshRegistry();
      await loadData();
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Registry refresh failed",
          fallbackMessage: "Unable to refresh component registry.",
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <FigmaUrlScanner onSuccess={loadData} />

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total componentes</CardDescription>
            <CardTitle>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Docs ready</CardDescription>
            <CardTitle>{stats.ready}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Needs review</CardDescription>
            <CardTitle>{stats.needsReview}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Con visual proof</CardDescription>
            <CardTitle>{stats.withProof}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Componentes</CardTitle>
            <CardDescription>
              Filtra y ordena con datos locales del registry generado.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o slug"
              className="md:w-72"
            />
            <Select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
            >
              <option value="all">Stage: All</option>
              <option value="missing-spec">missing-spec</option>
              <option value="spec">spec</option>
              <option value="markdown">markdown</option>
              <option value="render">render</option>
              <option value="visual-proof">visual-proof</option>
            </Select>
            <Select
              value={docStatus}
              onChange={(event) => setDocStatus(event.target.value)}
            >
              <option value="all">Doc status: All</option>
              <option value="draft">draft</option>
              <option value="needs-review">needs-review</option>
              <option value="ready">ready</option>
            </Select>
            <Button
              variant="outline"
              onClick={handleRefreshFromPipeline}
              disabled={syncing}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {syncing ? "Refreshing..." : "Refresh Registry"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("display_name")}
                  >
                    Component <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("pipeline_stage")}
                  >
                    Stage <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("doc_status")}
                  >
                    Doc status <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("spec_status")}
                  >
                    Spec status <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("usage_count")}
                  >
                    Used In <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("ready_for_publish")}
                  >
                    Ready <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No components match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={`loading-${index}`}>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        Loading components...
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((item) => (
                    <TableRow key={item.slug}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.figma.file_url ? (
                            <a
                              href={item.figma.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-muted-foreground hover:text-primary"
                              title={`Open ${item.display_name} in Figma`}
                              aria-label={`Open ${item.display_name} in Figma`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                          <Link
                            to={`/components/${item.slug}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                            aria-label={`Open ${item.display_name} detail`}
                          >
                            {item.display_name}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <Link
                            to={`/components/${item.slug}`}
                            className="font-mono hover:text-primary hover:underline"
                            aria-label={`Open ${item.slug} detail`}
                          >
                            {item.slug}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={stageBadge(item.pipeline_stage)}>
                          {item.pipeline_stage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadge(item.doc.status)}>
                          {item.doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadge(item.spec.status)}>
                          {item.spec.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const usedInSlugs = usageBySlug[item.slug]?.used_in ?? [];
                          if (usedInSlugs.length === 0) return "-";
                          const labels = usedInSlugs.map(
                            (slug) => displayNameBySlug[slug] || slug,
                          );
                          return labels.join(", ");
                        })()}
                      </TableCell>
                      <TableCell>
                        {item.ready_for_publish ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
