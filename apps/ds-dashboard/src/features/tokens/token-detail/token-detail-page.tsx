import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpDown, Check, Copy } from "lucide-react";

import {
  fetchFileSnippet,
  fetchTokenHealth,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
} from "@/lib/api";
import type { TokenEntry, TokenRegistry } from "@/types/token-registry";
import type { FileSnippetPayload } from "@/lib/api";
import type {
  TokenUsageEntry,
  TokenUsageOccurrence,
} from "@/types/token-usage-index";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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

function parseDimensionPreview(value: string) {
  const match = String(value || "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toLowerCase();
  const absolutePx = unit === "px" ? amount : amount * 16;
  return {
    amount,
    unit,
    width: Math.max(6, Math.min(absolutePx, 160)),
  };
}

function compactPathLabel(filePath: string) {
  const value = String(filePath || "").trim();
  if (!value) return "—";
  const parts = value.split("/");
  if (parts.length <= 3) return value;
  return `…/${parts.slice(-3).join("/")}`;
}

function buildOccurrenceKey(kind: string, occ: TokenUsageOccurrence, index: number) {
  return `${kind}:${occ.owner}:${occ.source}:${occ.detail}:${index}`;
}

function tokenMatchesRef(token: TokenEntry, value: string) {
  const ref = String(value || "").trim();
  if (!ref) return false;
  return ref === token.path || ref === token.slashPath || ref === token.cssVar;
}

function buildAliasChain(registry: TokenRegistry | null, token: TokenEntry | null) {
  if (!registry || !token) {
    return { chain: [] as TokenEntry[], brokenRef: null as string | null, hasCycle: false };
  }
  const chain: TokenEntry[] = [token];
  const visited = new Set<string>([token.path]);
  let current = token;
  let brokenRef: string | null = null;
  let hasCycle = false;

  while (current.aliasOf) {
    const next = resolveAliasTarget(registry, current.aliasOf);
    if (!next) {
      brokenRef = current.aliasOf;
      break;
    }
    chain.push(next);
    if (visited.has(next.path)) {
      hasCycle = true;
      break;
    }
    visited.add(next.path);
    current = next;
  }

  return { chain, brokenRef, hasCycle };
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
    field: "owner" | "file" | "line";
    dir: "asc" | "desc";
  }>({ field: "owner", dir: "asc" });
  const autoExpanded = useRef(false);

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
        if (sort.field === "file") return String(row.source || "").toLowerCase();
        return line;
      };
      const aValue = valueFor(left, lineLeft);
      const bValue = valueFor(right, lineRight);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [occurrences, sort]);

  const openSnippet = async (key: string, occ: TokenUsageOccurrence) => {
    const prev = snippets[key];
    setSnippets((current) => ({
      ...current,
      [key]: { ...current[key], open: true },
    }));
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

  const toggleSnippet = (key: string, occ: TokenUsageOccurrence) => {
    const prev = snippets[key];
    if (prev?.open) {
      setSnippets((current) => ({
        ...current,
        [key]: { ...current[key], open: false },
      }));
      return;
    }
    void openSnippet(key, occ);
  };

  useEffect(() => {
    if (autoExpanded.current) return;
    if (sortedOccurrences.length === 0) return;
    autoExpanded.current = true;
    const first = sortedOccurrences[0];
    const firstKey = buildOccurrenceKey(kind, first, 0);
    void openSnippet(firstKey, first);
  }, [kind, sortedOccurrences]);

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
                    current.field === "file"
                      ? { field: "file", dir: current.dir === "asc" ? "desc" : "asc" }
                      : { field: "file", dir: "asc" },
                  )
                }
              >
                File <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead showSortIcon={false}>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() =>
                  setSort((current) =>
                    current.field === "line"
                      ? { field: "line", dir: current.dir === "asc" ? "desc" : "asc" }
                      : { field: "line", dir: "asc" },
                  )
                }
              >
                Line <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </TableHead>
            <TableHead className="w-28" showSortIcon={false}>
              Snippet
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOccurrences.map((occ, i) => {
            const key = buildOccurrenceKey(kind, occ, i);
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
                        title={fileLabel}
                      >
                        {compactPathLabel(file)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{line ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toggleSnippet(key, occ);
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
                            <Badge variant="neutral">{KIND_LABELS[kind] ?? kind}</Badge>
                            <span>
                              lines {state.payload.startLine}–{state.payload.endLine}
                            </span>
                            {occ.detail ? <span>detail: {occ.detail}</span> : null}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const decoded = tokenPath ? decodeURIComponent(tokenPath) : "";

  const [registry, setRegistry] = useState<TokenRegistry | null>(null);
  const [token, setToken] = useState<TokenEntry | null>(null);
  const [usage, setUsage] = useState<TokenUsageEntry | null>(null);
  const [tokenHealth, setTokenHealth] = useState<TokenHealthReport | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!decoded) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex, health] = await Promise.all([
          fetchTokenRegistry(),
          fetchTokenUsageIndex().catch(() => null),
          fetchTokenHealth().catch(() => null),
        ]);
        setRegistry(registry);
        setToken(registry.byPath[decoded] ?? null);
        setUsage(usageIndex?.byPath[decoded] ?? null);
        setTokenHealth(health);
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
  const dimensionPreview = useMemo(
    () => (token?.type === "dimension" ? parseDimensionPreview(token.resolvedValue) : null),
    [token?.resolvedValue, token?.type],
  );
  const aliasChain = useMemo(() => buildAliasChain(registry, token), [registry, token]);
  const tokenAliasChain = aliasChain.chain;
  const aliasFinal = tokenAliasChain.length > 0 ? tokenAliasChain[tokenAliasChain.length - 1] : null;

  const fromCollection = searchParams.get("fromCollection") || "all";
  const fromType = searchParams.get("fromType") || "all";
  const fromSearch = String(searchParams.get("fromSearch") || "").trim().toLowerCase();
  const usageKindFilter = searchParams.get("uk") || "all";
  const usageOwnerFilter = searchParams.get("uo") || "all";
  const usageQuery = String(searchParams.get("uq") || "");

  const scopedTokens = useMemo(() => {
    const entries = registry?.entries ?? [];
    const next = entries.filter((entry) => {
      const matchesCollection = fromCollection === "all" || entry.collection === fromCollection;
      const matchesType = fromType === "all" || entry.type === fromType;
      const matchesSearch =
        !fromSearch ||
        entry.path.toLowerCase().includes(fromSearch) ||
        entry.slashPath.toLowerCase().includes(fromSearch) ||
        entry.cssVar.toLowerCase().includes(fromSearch) ||
        entry.resolvedValue.toLowerCase().includes(fromSearch);
      return matchesCollection && matchesType && matchesSearch;
    });
    next.sort((left, right) => left.path.localeCompare(right.path));
    return next;
  }, [fromCollection, fromSearch, fromType, registry?.entries]);

  const currentTokenIndex = useMemo(() => {
    if (!token) return -1;
    return scopedTokens.findIndex((entry) => entry.path === token.path);
  }, [scopedTokens, token]);
  const previousToken =
    currentTokenIndex > 0 ? scopedTokens[currentTokenIndex - 1] : null;
  const nextToken =
    currentTokenIndex >= 0 && currentTokenIndex < scopedTokens.length - 1
      ? scopedTokens[currentTokenIndex + 1]
      : null;

  const occurrencesByKind = useMemo(() => {
    if (!usage?.usedIn?.length) return new Map<string, TokenUsageOccurrence[]>();
    const map = new Map<string, TokenUsageOccurrence[]>();
    const loweredQuery = usageQuery.trim().toLowerCase();
    for (const occ of usage.usedIn) {
      const matchesKind = usageKindFilter === "all" || occ.kind === usageKindFilter;
      const matchesOwner = usageOwnerFilter === "all" || occ.owner === usageOwnerFilter;
      const searchValue = `${occ.owner} ${occ.source} ${occ.detail}`.toLowerCase();
      const matchesQuery = !loweredQuery || searchValue.includes(loweredQuery);
      if (!matchesKind || !matchesOwner || !matchesQuery) continue;
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
  }, [usage, usageKindFilter, usageOwnerFilter, usageQuery]);

  const usageOwners = useMemo(() => {
    if (!usage?.usedIn?.length) return [];
    const values = new Set<string>();
    for (const item of usage.usedIn) {
      if (item.owner) values.add(item.owner);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [usage?.usedIn]);
  const healthIssues = useMemo(() => {
    if (!token || !tokenHealth) return [] as Array<{ key: string; severity: "error" | "warning"; label: string; detail: string }>;
    const issues: Array<{ key: string; severity: "error" | "warning"; label: string; detail: string }> = [];
    if (tokenHealth.unused_tokens.items.some((item) => item.path === token.path)) {
      issues.push({
        key: "unused",
        severity: "warning",
        label: "Unused token",
        detail: "No references found in the usage index.",
      });
    }
    if (tokenHealth.high_coupling_tokens.items.some((item) => item.path === token.path)) {
      issues.push({
        key: "high-coupling",
        severity: "warning",
        label: "High coupling",
        detail: "Token has many downstream references and change risk is elevated.",
      });
    }
    if (
      tokenHealth.broken_aliases.items.some(
        (item) => tokenMatchesRef(token, item.token) || tokenMatchesRef(token, item.aliasCssVar),
      )
    ) {
      issues.push({
        key: "broken-alias",
        severity: "error",
        label: "Broken alias",
        detail: "Alias reference cannot be resolved to an existing token.",
      });
    }
    if (
      tokenHealth.broken_css_var_refs.items.some(
        (item) => tokenMatchesRef(token, item.from) || tokenMatchesRef(token, item.cssVar),
      )
    ) {
      issues.push({
        key: "broken-css-ref",
        severity: "error",
        label: "Broken CSS var reference",
        detail: "Resolved value references an unknown CSS variable.",
      });
    }
    if (
      tokenHealth.wcag_failures.items.some(
        (item) => tokenMatchesRef(token, item.foreground) || tokenMatchesRef(token, item.background),
      )
    ) {
      issues.push({
        key: "wcag",
        severity: "error",
        label: "WCAG contrast failure",
        detail: "Token participates in at least one failing contrast pair.",
      });
    }
    return issues;
  }, [token, tokenHealth]);

  const setUsageFilter = (key: "uk" | "uo" | "uq", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const copyValue = async (key: string, value: string) => {
    const content = String(value || "").trim();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedField(key);
      window.setTimeout(() => {
        setCopiedField((current) => (current === key ? null : current));
      }, 1500);
    } catch {
      setCopiedField(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/tokens")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tokens
        </Button>
        {previousToken ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                pathname: `/tokens/${encodeURIComponent(previousToken.path)}`,
                search: searchParams.toString(),
              })
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Prev
          </Button>
        ) : null}
        {nextToken ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                pathname: `/tokens/${encodeURIComponent(nextToken.path)}`,
                search: searchParams.toString(),
              })
            }
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
        {scopedTokens.length > 0 && currentTokenIndex >= 0 ? (
          <span className="text-xs text-muted-foreground">
            {currentTokenIndex + 1} / {scopedTokens.length}
          </span>
        ) : null}
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
        <>
          <Card>
            <CardHeader>
              <div className="h-6 w-64 animate-pulse rounded bg-muted/70" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted/60" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-muted/70" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-9 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-40 w-full animate-pulse rounded bg-muted/60" />
            </CardContent>
          </Card>
        </>
      ) : null}

      {!loading && token ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-12 min-w-12 items-center justify-center rounded-lg border border-border bg-muted/20 px-2">
                    {swatch ? (
                      <span
                        className="h-8 w-8 rounded-md border border-border shadow-sm"
                        style={{ backgroundColor: swatch }}
                        aria-label={`Color swatch ${swatch}`}
                      />
                    ) : token.type === "dimension" ? (
                      <span className="flex h-8 w-20 items-center">
                        <span
                          className="h-2 rounded bg-primary/80"
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
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm md:grid-cols-2">
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
                  <dd className="mt-0.5 flex items-center gap-2 font-mono text-xs">
                    <span>{token.cssVar}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => void copyValue("cssVar", token.cssVar)}
                    >
                      {copiedField === "cssVar" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </dd>
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
                    <span>{token.resolvedValue}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => void copyValue("resolvedValue", token.resolvedValue)}
                    >
                      {copiedField === "resolvedValue" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </dd>
                </div>
                {tokenAliasChain.length > 1 || aliasChain.brokenRef ? (
                  <div className="md:col-span-2">
                    <dt className="text-xs text-muted-foreground">Alias Chain</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                      {tokenAliasChain.map((entry, index) => (
                        <Fragment key={`${entry.path}:${index}`}>
                          {index > 0 ? <span className="text-muted-foreground">→</span> : null}
                          <button
                            type="button"
                            className="font-mono text-primary hover:underline"
                            onClick={() =>
                              navigate({
                                pathname: `/tokens/${encodeURIComponent(entry.path)}`,
                                search: searchParams.toString(),
                              })
                            }
                          >
                            {entry.slashPath}
                          </button>
                        </Fragment>
                      ))}
                      {aliasChain.brokenRef ? (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <Badge variant="warning" className="font-mono">
                            Missing: {aliasChain.brokenRef}
                          </Badge>
                        </>
                      ) : null}
                      {aliasChain.hasCycle ? (
                        <Badge variant="warning">Cycle detected</Badge>
                      ) : null}
                      {aliasFinal ? (
                        <span className="font-mono text-muted-foreground">
                          ({aliasFinal.resolvedValue})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {healthIssues.length > 0 ? (
            <div
              className={[
                "rounded-lg border p-4 text-sm",
                healthIssues.some((issue) => issue.severity === "error")
                  ? "border-red-500/40 bg-red-500/10"
                  : "border-amber-500/40 bg-amber-500/10",
              ].join(" ")}
            >
              <p className="font-semibold">This token has health issues</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                {healthIssues.map((issue) => (
                  <li key={issue.key}>
                    <span className="font-medium text-foreground">{issue.label}:</span>{" "}
                    {issue.detail}
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <Link to="/health" className="text-sm font-semibold text-primary hover:underline">
                  View health dashboard →
                </Link>
              </div>
            </div>
          ) : null}

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
            {usage ? (
              <CardContent className="pt-0">
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={usageQuery}
                    onChange={(event) => setUsageFilter("uq", event.target.value)}
                    placeholder="Search owner, file or detail"
                  />
                  <Select
                    value={usageKindFilter}
                    onChange={(event) => setUsageFilter("uk", event.target.value)}
                  >
                    <option value="all">Kind: All</option>
                    {Object.keys(usage.usageByKind)
                      .sort((a, b) => a.localeCompare(b))
                      .map((kind) => (
                        <option key={kind} value={kind}>
                          Kind: {KIND_LABELS[kind] ?? kind}
                        </option>
                      ))}
                  </Select>
                  <Select
                    value={usageOwnerFilter}
                    onChange={(event) => setUsageFilter("uo", event.target.value)}
                  >
                    <option value="all">Owner: All</option>
                    {usageOwners.map((owner) => (
                      <option key={owner} value={owner}>
                        Owner: {owner}
                      </option>
                    ))}
                  </Select>
                </div>
              </CardContent>
            ) : null}
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
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="text-sm font-semibold">This token has no registered references.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    It may be unused, or the usage index may be outdated.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      to={{
                        pathname: "/impact",
                        search: new URLSearchParams({ token: token.path, depth: "4" }).toString(),
                      }}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Analyze impact →
                    </Link>
                    <Link to="/health" className="text-sm font-semibold text-primary hover:underline">
                      View health →
                    </Link>
                  </div>
                </div>
              </CardContent>
            ) : null}
            {usage && usage.usageCount > 0 && occurrencesByKind.size === 0 ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No references match the active filters.
                </p>
              </CardContent>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
