import { useEffect, useMemo, useState } from "react";

import { fetchTokenRegistry } from "@/lib/api";
import type { TokenEntry } from "@/types/token-registry";
import { Badge } from "@/components/ui/badge";
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

function resolveColorSwatch(value: string): string | null {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{8}$/.test(raw)) {
    return raw;
  }
  return null;
}

export function TokensPage() {
  const [entries, setEntries] = useState<TokenEntry[]>([]);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("all");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchTokenRegistry();
        setEntries(payload.entries ?? []);
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
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No tokens match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`token-loading-${index}`}>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        Loading tokens...
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((entry) => {
                    const swatch = resolveColorSwatch(entry.resolvedValue);
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
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
