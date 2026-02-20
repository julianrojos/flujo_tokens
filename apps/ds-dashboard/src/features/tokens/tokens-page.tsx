import { useEffect, useMemo, useState } from "react";
import { Accessibility, RefreshCcw } from "lucide-react";

import { fetchTokenRegistry, fetchTokenUsageIndex, refreshTokenUsageIndex } from "@/lib/api";
import type { TokenEntry } from "@/types/token-registry";
import type { TokenUsageEntry, TokenUsageIndexSummary } from "@/types/token-usage-index";
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
import { ContrastCheckerModal } from "./accessibility/contrast-checker-modal";
import { buildSemanticColorOptions } from "./accessibility/semantic-color-options";

function resolveColorSwatch(value: string): string | null {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{8}$/.test(raw)) {
    return raw;
  }
  return null;
}

export function TokensPage() {
  const [entries, setEntries] = useState<TokenEntry[]>([]);
  const [usageByPath, setUsageByPath] = useState<Record<string, TokenUsageEntry>>({});
  const [usageSummary, setUsageSummary] = useState<TokenUsageIndexSummary | null>(null);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("all");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageSyncing, setUsageSyncing] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState("");
  const [selectedForegroundPath, setSelectedForegroundPath] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      setUsageError(null);
      try {
        const [registryPayload, usagePayload] = await Promise.all([
          fetchTokenRegistry(),
          fetchTokenUsageIndex().catch((cause) => {
            setUsageError(
              cause instanceof Error
                ? cause.message
                : "Token usage index is unavailable. Run `npm run ds:token-usage-index`.",
            );
            return null;
          }),
        ]);
        setEntries(registryPayload.entries ?? []);
        if (usagePayload) {
          setUsageByPath(usagePayload.byPath ?? {});
          setUsageSummary(usagePayload.summary ?? null);
        } else {
          setUsageByPath({});
          setUsageSummary(null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const collections = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.collection));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const types = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.type));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesSearch =
        !lowered ||
        entry.path.toLowerCase().includes(lowered) ||
        entry.cssVar.toLowerCase().includes(lowered) ||
        entry.resolvedValue.toLowerCase().includes(lowered);
      const matchesCollection =
        collection === "all" || entry.collection === collection;
      const matchesType = type === "all" || entry.type === type;
      return matchesSearch && matchesCollection && matchesType;
    });
  }, [entries, search, collection, type]);

  const summary = useMemo(() => {
    const byCollection: Record<string, number> = {};
    for (const entry of entries) {
      byCollection[entry.collection] =
        (byCollection[entry.collection] ?? 0) + 1;
    }
    return byCollection;
  }, [entries]);

  const semanticColorOptions = useMemo(
    () => buildSemanticColorOptions(entries),
    [entries],
  );

  const showAccessibilityButton = type === "color";

  useEffect(() => {
    if (!showAccessibilityButton && accessibilityOpen) {
      setAccessibilityOpen(false);
    }
  }, [showAccessibilityButton, accessibilityOpen]);

  useEffect(() => {
    const validBackground = semanticColorOptions.background.some(
      (item) => item.tokenPath === selectedBackgroundPath,
    );
    if (!validBackground) {
      setSelectedBackgroundPath(
        semanticColorOptions.background[0]?.tokenPath || "",
      );
    }

    const validForeground = semanticColorOptions.foreground.some(
      (item) => item.tokenPath === selectedForegroundPath,
    );
    if (!validForeground) {
      setSelectedForegroundPath(
        semanticColorOptions.foreground[0]?.tokenPath || "",
      );
    }
  }, [
    semanticColorOptions.background,
    semanticColorOptions.foreground,
    selectedBackgroundPath,
    selectedForegroundPath,
  ]);

  const refreshUsage = async () => {
    setUsageSyncing(true);
    setUsageError(null);
    try {
      await refreshTokenUsageIndex();
      const payload = await fetchTokenUsageIndex();
      setUsageByPath(payload.byPath ?? {});
      setUsageSummary(payload.summary ?? null);
    } catch (cause) {
      setUsageError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUsageSyncing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total tokens</CardDescription>
            <CardTitle>{entries.length}</CardTitle>
          </CardHeader>
        </Card>
        {Object.entries(summary)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, 3)
          .map(([label, count]) => (
            <Card key={label}>
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle>{count}</CardTitle>
              </CardHeader>
            </Card>
          ))}
      </section>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Tokens & Custom Properties</CardTitle>
            <CardDescription>
              Inventory local de `token-registry.json` con filtros por colección
              y tipo.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Button variant="outline" onClick={refreshUsage} disabled={usageSyncing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {usageSyncing ? "Syncing usage..." : "Sync Usage Index"}
            </Button>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por token path, CSS var o valor"
              className="md:w-80"
            />
            <Select
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
            >
              <option value="all">Collection: All</option>
              {collections.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">Type: All</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            {showAccessibilityButton ? (
              <Button
                variant="outline"
                onClick={() => setAccessibilityOpen(true)}
                disabled={
                  semanticColorOptions.background.length === 0 ||
                  semanticColorOptions.foreground.length === 0
                }
                title="Open color accessibility checker"
                aria-label="Open color accessibility checker"
              >
                <Accessibility className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {usageError ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
              Usage index unavailable: {usageError}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token Path</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>CSS Variable</TableHead>
                <TableHead>Resolved Value</TableHead>
                <TableHead>Used In</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No tokens match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`token-loading-${index}`}>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        Loading tokens...
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((entry) => {
                    const swatch = resolveColorSwatch(entry.resolvedValue);
                    const usage = usageByPath[entry.path];
                    const usageCount = usage?.usageCount ?? 0;
                    const specCount = usage?.usageByKind?.["component-spec"] ?? 0;
                    const cssAliasCount = usage?.usageByKind?.["css-alias"] ?? 0;
                    const usageOwners =
                      usage?.usedIn
                        ?.map((item) => item.owner)
                        .filter(Boolean)
                        .filter((value, index, all) => all.indexOf(value) === index)
                        .slice(0, 2) ?? [];
                    return (
                      <TableRow key={entry.path}>
                        <TableCell>
                          <div className="font-medium">{entry.path}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.slashPath}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">{entry.collection}</Badge>
                        </TableCell>
                        <TableCell>{entry.type}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {entry.cssVar}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            {swatch ? (
                              <span
                                className="inline-block h-4 w-4 rounded-sm border border-border"
                                style={{ backgroundColor: swatch }}
                                aria-label={`Color swatch ${swatch}`}
                              />
                            ) : null}
                            {entry.resolvedValue}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="neutral">{usageCount} refs</Badge>
                            {usageSummary ? (
                              <div className="text-xs text-muted-foreground">
                                specs {specCount} · css {cssAliasCount}
                              </div>
                            ) : null}
                            {usageOwners.length > 0 ? (
                              <div className="font-mono text-xs text-muted-foreground">
                                {usageOwners.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ContrastCheckerModal
        open={accessibilityOpen}
        onClose={() => setAccessibilityOpen(false)}
        backgroundOptions={semanticColorOptions.background}
        foregroundOptions={semanticColorOptions.foreground}
        backgroundTokenPath={selectedBackgroundPath}
        foregroundTokenPath={selectedForegroundPath}
        onBackgroundChange={setSelectedBackgroundPath}
        onForegroundChange={setSelectedForegroundPath}
      />
    </div>
  );
}
