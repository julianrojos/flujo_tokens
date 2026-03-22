import { lazy, Suspense, useMemo, useState } from "react";
import type { PartialComponentSpec, SpecProperty } from "ds-types";
import type { TokenEntry } from "@/types/token-registry";
import { Badge } from "@/components/ui/badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";

const SummaryMarkdownPreview = lazy(() =>
  import("@/components/markdown/markdown-preview").then((module) => ({
    default: module.MarkdownPreview,
  })),
);

const TYPE_DISPLAY: Record<string, string> = {
  enum: "VARIANT",
  text: "TEXT",
  boolean: "BOOLEAN",
  instance_swap: "INSTANCE_SWAP",
};

function typeBadgeVariant(type: string): "neutral" | "success" | "warning" {
  if (type === "enum") return "success";
  if (type === "boolean") return "warning";
  return "neutral";
}

function PropertyRow({ prop }: { prop: SpecProperty }) {
  const displayType = TYPE_DISPLAY[prop.type.toLowerCase()] ?? prop.type.toUpperCase();
  return (
    <TableRow>
      <TableCell className="font-medium">{prop.name}</TableCell>
      <TableCell>
        <Badge variant={typeBadgeVariant(prop.type.toLowerCase())}>{displayType}</Badge>
      </TableCell>
      <TableCell>
        {prop.values ? (
          <div className="flex flex-wrap gap-1">
            {prop.values.map((v) => (
              <code key={v} className="rounded bg-muted px-1 py-0.5 text-xs">
                {v}
              </code>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {prop.default === null || prop.default === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          String(prop.default)
        )}
      </TableCell>
      <TableCell>
        <Badge variant={prop.required ? "success" : "neutral"}>
          {prop.required ? "Yes" : "No"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{prop.description}</TableCell>
    </TableRow>
  );
}

interface ComponentSpecViewerProps {
  spec: PartialComponentSpec;
  resolveToken?: (tokenRef: string) => { token: TokenEntry | null; usageCount: number | null };
}

type PropertySortField = "name" | "type" | "values" | "default" | "required" | "description";

const PROPERTY_SORT_COLUMNS: Array<{ field: PropertySortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "type", label: "Type" },
  { field: "values", label: "Values" },
  { field: "default", label: "Default" },
  { field: "required", label: "Required" },
  { field: "description", label: "Description" },
];

type TokenMappingSortField = "condition" | "token" | "resolved" | "refs";

const TOKEN_MAPPING_SORT_COLUMNS: Array<{ field: TokenMappingSortField; label: string }> = [
  { field: "condition", label: "Condition" },
  { field: "token", label: "Token" },
  { field: "resolved", label: "Resolved" },
  { field: "refs", label: "Refs" },
];

export function ComponentSpecViewer({ spec, resolveToken }: ComponentSpecViewerProps) {
  const summary = spec.summary ?? {
    purpose: "",
    when_to_use: "",
    when_not_to_use: "",
  };
  const anatomyItems = spec.anatomy ?? [];
  const propertyItems = spec.properties ?? [];

  const [propertySort, setPropertySort] = useState<{
    field: PropertySortField;
    dir: "asc" | "desc";
  }>({ field: "name", dir: "asc" });
  const [tokenMappingSort, setTokenMappingSort] = useState<{
    field: TokenMappingSortField;
    dir: "asc" | "desc";
  }>({ field: "condition", dir: "asc" });

  const sortedProperties = useMemo(() => {
    const rows = propertyItems.slice();
    rows.sort((left, right) => {
      const valueFor = (prop: SpecProperty) => {
        if (propertySort.field === "name") return prop.name.toLowerCase();
        if (propertySort.field === "type") return prop.type.toLowerCase();
        if (propertySort.field === "values") return (prop.values || []).join("|").toLowerCase();
        if (propertySort.field === "default") return String(prop.default ?? "").toLowerCase();
        if (propertySort.field === "required") return prop.required ? 1 : 0;
        return String(prop.description ?? "").toLowerCase();
      };
      const aValue = valueFor(left);
      const bValue = valueFor(right);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return propertySort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [propertyItems, propertySort]);

  const togglePropertySort = (field: PropertySortField) => {
    setPropertySort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  const toggleTokenMappingSort = (field: TokenMappingSortField) => {
    setTokenMappingSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  const sortedTokenMappings = useMemo(() => {
    if (!spec.token_mapping) return [];
    return Object.entries(spec.token_mapping).map(([slot, conditions]) => {
      const rows = Object.entries(conditions).map(([condition, tokenRef]) => ({
        condition,
        tokenRef,
        meta: resolveToken ? resolveToken(tokenRef) : null,
      }));
      rows.sort((left, right) => {
        const valueFor = (row: {
          condition: string;
          tokenRef: string;
          meta: { token: TokenEntry | null; usageCount: number | null } | null;
        }) => {
          if (tokenMappingSort.field === "condition") return row.condition.toLowerCase();
          if (tokenMappingSort.field === "token") return row.tokenRef.toLowerCase();
          if (tokenMappingSort.field === "resolved") {
            return String(row.meta?.token?.resolvedValue ?? "").toLowerCase();
          }
          return row.meta?.usageCount ?? -1;
        };
        const aValue = valueFor(left);
        const bValue = valueFor(right);
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return tokenMappingSort.dir === "asc" ? comparison : comparison * -1;
      });
      return { slot, rows };
    });
  }, [spec.token_mapping, resolveToken, tokenMappingSort]);

  const renderSummaryMarkdown = (value: string) => {
    const content = String(value || "").trim();
    if (!content) return <span className="text-muted-foreground">—</span>;
    return (
      <Suspense fallback={<span className="text-muted-foreground">{content}</span>}>
        <SummaryMarkdownPreview content={content} />
      </Suspense>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </h4>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">Purpose</dt>
            <dd>{renderSummaryMarkdown(summary.purpose)}</dd>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <dt className="font-medium">When to use</dt>
              <dd>{renderSummaryMarkdown(summary.when_to_use)}</dd>
            </div>
            <div>
              <dt className="font-medium">When not to use</dt>
              <dd>{renderSummaryMarkdown(summary.when_not_to_use)}</dd>
            </div>
          </div>
        </dl>
      </section>

      {/* Anatomy */}
      {anatomyItems.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Anatomy
          </h4>
          <ol className="space-y-1 text-sm">
            {anatomyItems.map((item, idx) => (
              <li key={item.id} className="flex gap-2">
                <span className="w-5 flex-none font-mono text-xs text-muted-foreground">
                  {idx + 1}.
                </span>
                <span>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{item.id}</code>
                  {" — "}
                  {item.description}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Properties */}
      {propertyItems.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Properties
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                {PROPERTY_SORT_COLUMNS.map((column) => (
                  <SortableTableHead
                    key={column.field}
                    label={column.label}
                    onSort={() => togglePropertySort(column.field)}
                  />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProperties.map((prop) => (
                <PropertyRow key={prop.name} prop={prop} />
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* Token mapping */}
      {sortedTokenMappings.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Token Mapping
          </h4>
          <div className="space-y-3">
            {sortedTokenMappings.map(({ slot, rows }) => (
              <div key={slot}>
                <p className="mb-1 font-mono text-xs font-semibold">{slot}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {TOKEN_MAPPING_SORT_COLUMNS.map((column) => (
                        <SortableTableHead
                          key={column.field}
                          label={column.label}
                          onSort={() => toggleTokenMappingSort(column.field)}
                        />
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ condition, tokenRef, meta }) => {
                      return (
                        <TableRow key={condition}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {condition}
                          </TableCell>
                          <TableCell className="space-y-0.5">
                            {tokenRef === "TBD" ? (
                              <Badge variant="warning">TBD</Badge>
                            ) : meta?.token ? (
                              <>
                                <Link
                                  to={`/tokens/${encodeURIComponent(meta.token.path)}`}
                                  className="font-mono text-xs text-primary hover:underline"
                                >
                                  {tokenRef}
                                </Link>
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  {meta.token.cssVar}
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <code className="font-mono text-xs">{tokenRef}</code>
                                <Badge variant="warning">Unknown</Badge>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {meta?.token ? meta.token.resolvedValue : "—"}
                          </TableCell>
                          <TableCell>
                            {meta && meta.usageCount !== null ? (
                              <Badge variant="neutral">{meta.usageCount} refs</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Accessibility */}
      {spec.accessibility ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Accessibility
          </h4>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">Role</dt>
              <dd className="font-mono text-xs">{spec.accessibility.role}</dd>
            </div>
            {spec.accessibility.focus?.tokens ? (
              <div>
                <dt className="font-medium">Focus tokens</dt>
                <dd className="space-y-0.5 font-mono text-xs text-muted-foreground">
                  {spec.accessibility.focus.tokens.inner ? (
                    <div>inner: {spec.accessibility.focus.tokens.inner}</div>
                  ) : null}
                  {spec.accessibility.focus.tokens.outer ? (
                    <div>outer: {spec.accessibility.focus.tokens.outer}</div>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {spec.accessibility.labeling?.rules?.length ? (
              <div>
                <dt className="font-medium">Labeling</dt>
                <dd>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                    {spec.accessibility.labeling.rules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* Best practices */}
      {spec.best_practices ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Best Practices
          </h4>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="mb-1 font-semibold text-status-success">Do</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                {(spec.best_practices.do ?? []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-status-error">Don't</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                {(spec.best_practices.dont ?? []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
