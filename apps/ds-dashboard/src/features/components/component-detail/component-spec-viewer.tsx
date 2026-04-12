import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PartialComponentSpec, SpecProperty, SpecLayoutItem } from "ds-types";
import { Badge } from "@/components/ui/badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deduplicateRelated,
  slugToComponentRouteSlug,
  slugToDisplayName,
} from "./lib/spec-viewer-utils";

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

function extractGuidanceItems(spec: PartialComponentSpec, candidateKeys: string[]): string[] {
  const looseSpec = spec as Record<string, unknown>;
  const collected: string[] = [];
  for (const key of candidateKeys) {
    if (!(key in looseSpec)) continue;
    const value = looseSpec[key];
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) collected.push(normalized);
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== "string") continue;
      const normalized = item.trim();
      if (normalized) collected.push(normalized);
    }
  }
  return Array.from(new Set(collected));
}

function normalizeStringItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
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
  selfSlug?: string;
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

const LAYOUT_COLUMNS = [
  "Node",
  "Direction",
  "H Sizing",
  "V Sizing",
  "Alignment",
  "Item Spacing",
  "Padding",
] as const;

export function ComponentSpecViewer({ spec, selfSlug }: ComponentSpecViewerProps) {
  const summary = spec.summary ?? {
    purpose: "",
    when_to_use: "",
    when_not_to_use: "",
  };
  const propertyItems = spec.properties ?? [];
  const behaviourItems = useMemo(
    () => extractGuidanceItems(spec, ["behaviour", "behavior"]),
    [spec.behaviour, (spec as Record<string, unknown>).behavior],
  );
  const edgeCaseItems = useMemo(
    () => extractGuidanceItems(spec, ["edge_cases", "edgeCases", "edge-cases"]),
    [spec.edge_cases, (spec as Record<string, unknown>).edgeCases, (spec as Record<string, unknown>)["edge-cases"]],
  );
  const accessibilityLabelingRules = useMemo(
    () => normalizeStringItems(spec.accessibility?.labeling?.rules),
    [spec.accessibility?.labeling?.rules],
  );
  const accessibilityNotes = useMemo(
    () => normalizeStringItems(spec.accessibility?.notes),
    [spec.accessibility?.notes],
  );
  const contentGuidelineRules = useMemo(
    () => normalizeStringItems(spec.content_guidelines?.rules),
    [spec.content_guidelines?.rules],
  );

  const [propertySort, setPropertySort] = useState<{
    field: PropertySortField;
    dir: "asc" | "desc";
  }>({ field: "name", dir: "asc" });

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

  const renderSummaryMarkdown = (value: string) => {
    const content = String(value || "").trim();
    if (!content) return <span className="text-muted-foreground">—</span>;
    return (
      <Suspense fallback={<span className="text-muted-foreground">{content}</span>}>
        <SummaryMarkdownPreview content={content} />
      </Suspense>
    );
  };
  const dedupedRelated = useMemo(
    () => deduplicateRelated(spec.related_components ?? [], selfSlug ?? ""),
    [spec.related_components, selfSlug],
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </h4>
        <div className="space-y-3 text-sm">
          <div>
            <h5 className="font-medium text-sm">Purpose</h5>
            <div>{renderSummaryMarkdown(summary.purpose)}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                When to use
              </h5>
              <div>{renderSummaryMarkdown(summary.when_to_use)}</div>
            </div>
            <div>
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                When not to use
              </h5>
              <div>{renderSummaryMarkdown(summary.when_not_to_use)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Properties */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Properties
        </h4>
        {propertyItems.length > 0 ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Behaviour */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Behaviour
        </h4>
        {behaviourItems.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {behaviourItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Accessibility */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Accessibility
        </h4>
        <div className="space-y-2 text-sm">
          <div>
            <h5 className="font-medium text-sm">Role</h5>
            <p className="font-mono text-xs">
              {String(spec.accessibility?.role ?? "").trim() || (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          {spec.accessibility?.focus?.tokens ? (
            <div>
              <h5 className="font-medium text-sm">Focus tokens</h5>
              <div className="space-y-0.5 font-mono text-xs text-muted-foreground">
                {spec.accessibility.focus.tokens.inner ? (
                  <div>inner: {spec.accessibility.focus.tokens.inner}</div>
                ) : null}
                {spec.accessibility.focus.tokens.outer ? (
                  <div>outer: {spec.accessibility.focus.tokens.outer}</div>
                ) : null}
              </div>
            </div>
          ) : null}
          {accessibilityLabelingRules.length > 0 ? (
            <div>
              <h5 className="font-medium text-sm">Labeling</h5>
              <div>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                  {accessibilityLabelingRules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {accessibilityNotes.length > 0 ? (
            <div>
              <h5 className="font-medium text-sm">Notes</h5>
              <div>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                  {accessibilityNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Edge cases
        </h4>
        {edgeCaseItems.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {edgeCaseItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Content Guidelines */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Content Guidelines
        </h4>
        {contentGuidelineRules.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {contentGuidelineRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Layout */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Layout
        </h4>
        {spec.layout?.length ? (
          <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {LAYOUT_COLUMNS.map((col) => (
                    <TableHead key={col}>{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {spec.layout.map((row: SpecLayoutItem, i) => (
                  <TableRow key={`${row.node}-${i}`}>
                    <TableCell className="font-mono text-xs">{row.node ?? "—"}</TableCell>
                    <TableCell>{row.direction ?? "—"}</TableCell>
                    <TableCell>{row.hSizing ?? "—"}</TableCell>
                    <TableCell>{row.vSizing ?? "—"}</TableCell>
                    <TableCell>{row.alignment ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.itemSpacing === undefined || row.itemSpacing === null
                        ? "—"
                        : String(row.itemSpacing)}
                    </TableCell>
                    <TableCell className="font-mono text-xs" title="Top/Right/Bottom/Left">
                      {row.padding
                        ? `${row.padding.top}/${row.padding.right}/${row.padding.bottom}/${row.padding.left}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Related Components */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Related Components
        </h4>
        {dedupedRelated.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dedupedRelated.map((slug) => (
              <Link
                key={slug}
                to={`/components/${encodeURIComponent(slugToComponentRouteSlug(slug))}`}
                className="inline-flex items-center rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                {slugToDisplayName(slug)}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>
    </div>
  );
}
