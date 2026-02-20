import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { fetchTokenRegistry, fetchTokenUsageIndex } from "@/lib/api";
import type { TokenEntry } from "@/types/token-registry";
import type { TokenUsageEntry, TokenUsageOccurrence } from "@/types/token-usage-index";
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

function UsageGroup({
  kind,
  occurrences,
}: {
  kind: string;
  occurrences: TokenUsageOccurrence[];
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {KIND_LABELS[kind] ?? kind}
        <span className="ml-2 font-normal normal-case">({occurrences.length})</span>
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Owner</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {occurrences.map((occ, i) => (
            <TableRow key={`${occ.owner}-${occ.source}-${i}`}>
              <TableCell className="font-medium">{occ.owner || "—"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {occ.source || "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">{occ.detail || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TokenDetailPage() {
  const { tokenPath } = useParams<{ tokenPath: string }>();
  const navigate = useNavigate();
  const decoded = tokenPath ? decodeURIComponent(tokenPath) : "";

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
                  <UsageGroup key={kind} kind={kind} occurrences={occurrences} />
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
