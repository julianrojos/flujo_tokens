import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpDown } from "lucide-react";

import { fetchFileSnippet, fetchTokenRegistry, fetchTokenUsageIndex } from "@/lib/api";
import type { TokenEntry, TokenRegistry } from "@/types/token-registry";
import type { FileSnippetPayload } from "@/lib/api";
import type {
  TokenUsageEntry,
  TokenUsageOccurrence,
} from "@/types/token-usage-index";
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

function resolveColorSwatch(value: string): string | null {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{8}$/.test(raw)) {
    return raw;
  }
  return null;
}

const KIND_LABELS: Record<string, string> = {
  "component-spec": "Component spec",
  "css-alias": "CSS alias",
};

function extractLineNumber(detail: string): number | null {
  const match = String(detail || "").match(/\bline:(\d+)\b/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveAliasTarget(registry: TokenRegistry | null, aliasOf: string | undefined) {
  const ref = String(aliasOf || "").trim();
  if (!registry || !ref) return null;
  return registry.byPath?.[ref] ?? registry.bySlashPath?.[ref] ?? null;
}

function UsageGroup({
  kind,
  occurrences,
  token,
}: {
  kind: string;
  occurrences: TokenUsageOccurrence[];
  token: TokenEntry;
}) {
  const [snippets, setSnippets] = useState<
    Record<
      string,
      {
        open: boolean;
        loading?: boolean;
        payload?: FileSnippetPayload;
        error?: string;
      }
    >
  >({});
  const [sort, setSort] = useState<{
    field: "owner" | "source" | "detail";
    dir: "asc" | "desc";
  }>({ field: "owner", dir: "asc" });

  const queryHints = useMemo(() => {
    const hints = [token.slashPath, token.path].map((v) => String(v || "").trim());
    return hints.filter(Boolean).filter((v, i, all) => all.indexOf(v) === i);
  }, [token.path, token.slashPath]);

  const sortedOccurrences = useMemo(() => {
    const rows = occurrences.slice();
    rows.sort((left, right) => {
      const lineLeft = extractLineNumber(left.detail || "") ?? 0;
      const lineRight = extractLineNumber(right.detail || "") ?? 0;
      const valueFor = (row: TokenUsageOccurrence, line: number) => {
        if (sort.field === "owner") return String(row.owner || "").toLowerCase();
        if (sort.field === "source")
          return `${String(row.source || "").toLowerCase()}:${line}`;
        return String(row.detail || "").toLowerCase();
      };
      const aValue = valueFor(left, lineLeft);
      const bValue = valueFor(right, lineRight);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [occurrences, sort]);

  const toggleSnippet = async (key: string, occ: TokenUsageOccurrence) => {
    const prev = snippets[key];
    const nextOpen = !(prev?.open ?? false);
    setSnippets((current) => ({
      ...current,
      [key]: { ...current[key], open: nextOpen },
    }));
    if (!nextOpen) return;
    if (prev?.payload || prev?.loading) return;

    setSnippets((current) => ({
      ...current,
      [key]: { open: true, loading: true },
    }));

    const file = String(occ.source || "").trim();
    const line = extractLineNumber(occ.detail || "");
    try {
      let payload: FileSnippetPayload | null = null;
      if (file && line) {
        payload = await fetchFileSnippet({ file, line, before: 2, after: 3 });
      } else if (file) {
        for (const q of queryHints) {
          try {
            payload = await fetchFileSnippet({ file, q, before: 2, after: 3 });
            break;
          } catch {
            // try next query
          }
        }
      }

      if (!payload) {
        throw new Error("Snippet unavailable for this occurrence.");
      }

      setSnippets((current) => ({
        ...current,
        [key]: { open: true, payload },
      }));
    } catch (cause) {
      setSnippets((current) => ({
        ...current,
        [key]: {
          open: true,
          error: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
  };

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {KIND_LABELS[kind] ?? kind}
        <span className="ml-2 font-normal normal-case">({occurrences.length})</span>
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead showSortIcon={false}>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() =>
                  setSort((current) =>
                    current.field === "owner"
                      ? { field: "owner", dir: current.dir === "asc" ? "desc" : "asc" }
                      : { field: "owner", dir: "asc" },
                  )
                }
              >
                Owner <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead showSortIcon={false}>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() =>
                  setSort((current) =>
                    current.field === "source"
                      ? { field: "source", dir: current.dir === "asc" ? "desc" : "asc" }
                      : { field: "source", dir: "asc" },
                  )
                }
              >
                Source <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead showSortIcon={false}>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() =>
                  setSort((current) =>
                    current.field === "detail"
                      ? { field: "detail", dir: current.dir === "asc" ? "desc" : "asc" }
                      : { field: "detail", dir: "asc" },
                  )
                }
              >
                Detail <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead className="w-28" showSortIcon={false}>
              Context
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOccurrences.map((occ, i) => {
            const key = `${kind}:${occ.owner}:${occ.source}:${occ.detail}:${i}`;
            const state = snippets[key];
            const file = String(occ.source || "").trim();
            const line = extractLineNumber(occ.detail || "");
            const fileLabel = file ? (line ? `${file}:${line}` : file) : "—";

            return (
              <Fragment key={key}>
                <TableRow key={key}>
                  <TableCell className="font-medium">{occ.owner || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {file ? (
                      <Link
                        to={{
                          pathname: "/file",
                          search: new URLSearchParams({
                            path: file,
                            ...(line ? { line: String(line) } : {}),
                          }).toString(),
                        }}
                        className="hover:text-primary hover:underline"
                      >
                        {fileLabel}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{occ.detail || "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void toggleSnippet(key, occ);
                      }}
                    >
                      {state?.open ? "Hide" : "Snippet"}
                    </Button>
                  </TableCell>
                </TableRow>

                {state?.open ? (
                  <TableRow key={`${key}:snippet`}>
                    <TableCell colSpan={4} className="bg-muted/30">
                      {state.loading ? (
                        <div className="text-sm text-muted-foreground">Loading snippet…</div>
                      ) : state.error ? (
                        <div className="text-sm text-red-700">{state.error}</div>
                      ) : state.payload ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="neutral">
                              L{state.payload.line} ({state.payload.matchedBy})
                            </Badge>
                            <span>
                              lines {state.payload.startLine}–{state.payload.endLine}
                            </span>
                            <Link
                              to={{
                                pathname: "/file",
                                search: new URLSearchParams({
                                  path: state.payload.file,
                                  line: String(state.payload.line),
                                }).toString(),
                              }}
                              className="hover:text-primary hover:underline"
                            >
                              Open file
                            </Link>
                          </div>
                          <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background/60 p-3 text-xs">
                            <code className="font-mono">{state.payload.snippet}</code>
                          </pre>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function TokenDetailPage() {
  const { tokenPath } = useParams<{ tokenPath: string }>();
  const navigate = useNavigate();
  const decoded = tokenPath ? decodeURIComponent(tokenPath) : "";

  const [registry, setRegistry] = useState<TokenRegistry | null>(null);
  const [token, setToken] = useState<TokenEntry | null>(null);
  const [usage, setUsage] = useState<TokenUsageEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!decoded) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex] = await Promise.all([
          fetchTokenRegistry(),
          fetchTokenUsageIndex().catch(() => null),
        ]);
        setRegistry(registry);
        setToken(registry.byPath[decoded] ?? null);
        setUsage(usageIndex?.byPath[decoded] ?? null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [decoded]);

  const swatch = useMemo(
    () => (token ? resolveColorSwatch(token.resolvedValue) : null),
    [token],
  );

  const occurrencesByKind = useMemo(() => {
    if (!usage?.usedIn?.length) return new Map<string, TokenUsageOccurrence[]>();
    const map = new Map<string, TokenUsageOccurrence[]>();
    for (const occ of usage.usedIn) {
      const list = map.get(occ.kind) ?? [];
      list.push(occ);
      map.set(occ.kind, list);
    }
    // canonical order: component-spec first, css-alias second, rest alphabetical
    const order = ["component-spec", "css-alias"];
    const sorted = new Map<string, TokenUsageOccurrence[]>();
    for (const key of order) {
      if (map.has(key)) sorted.set(key, map.get(key)!);
    }
    for (const [key, value] of map) {
      if (!sorted.has(key)) sorted.set(key, value);
    }
    return sorted;
  }, [usage]);

  const aliasTarget = useMemo(
    () => (token ? resolveAliasTarget(registry, token.aliasOf) : null),
    [registry, token],
  );

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/tokens")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tokens
        </Button>
        {!loading && token ? <Badge variant="neutral">{token.collection}</Badge> : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error && !token ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
          Token <span className="font-mono">{decoded}</span> not found in registry.
        </div>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading token…</CardContent>
        </Card>
      ) : null}

      {!loading && token ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {swatch ? (
                    <span
                      className="mt-1 h-12 w-12 flex-none rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: swatch }}
                      aria-label={`Color swatch ${swatch}`}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <CardTitle className="break-all font-mono text-base">{token.path}</CardTitle>
                    <CardDescription className="mt-1 font-mono text-xs">
                      {token.slashPath}
                    </CardDescription>
                  </div>
                </div>
                <Link
                  to={{
                    pathname: "/impact",
                    search: new URLSearchParams({ token: token.path, depth: "4" }).toString(),
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Analyze impact →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Collection</dt>
                  <dd className="mt-0.5 font-medium">{token.collection}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Type</dt>
                  <dd className="mt-0.5 font-medium">{token.type}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">CSS Variable</dt>
                  <dd className="mt-0.5 font-mono text-xs">{token.cssVar}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Resolved Value</dt>
                  <dd className="mt-0.5 flex items-center gap-2 font-mono text-xs">
                    {swatch ? (
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-sm border border-border"
                        style={{ backgroundColor: swatch }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {token.resolvedValue}
                  </dd>
                </div>
                {token.aliasOf ? (
                  <div className="col-span-2 md:col-span-4">
                    <dt className="text-xs text-muted-foreground">Alias Of</dt>
                    <dd className="mt-0.5">
                      {aliasTarget ? (
                        <button
                          type="button"
                          className="font-mono text-xs text-primary hover:underline"
                          onClick={() =>
                            navigate(`/tokens/${encodeURIComponent(aliasTarget.path)}`)
                          }
                        >
                          {token.aliasOf}
                        </button>
                      ) : (
                        <span className="font-mono text-xs">{token.aliasOf}</span>
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              {usage ? (
                <CardDescription>
                  {usage.usageCount} reference{usage.usageCount !== 1 ? "s" : ""} —{" "}
                  {Object.entries(usage.usageByKind)
                    .map(([kind, count]) => `${count} ${KIND_LABELS[kind] ?? kind}`)
                    .join(", ")}
                </CardDescription>
              ) : (
                <CardDescription className="text-amber-600">
                  Usage index unavailable. Run{" "}
                  <span className="font-mono">npm run ds:token-usage-index</span>.
                </CardDescription>
              )}
            </CardHeader>
            {usage && occurrencesByKind.size > 0 ? (
              <CardContent className="space-y-6">
                {Array.from(occurrencesByKind.entries()).map(([kind, occurrences]) => (
                  <UsageGroup
                    key={kind}
                    kind={kind}
                    occurrences={occurrences}
                    token={token}
                  />
                ))}
              </CardContent>
            ) : null}
            {usage && usage.usageCount === 0 ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Este token no tiene referencias registradas.
                </p>
              </CardContent>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
