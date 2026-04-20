import { lazy, Suspense, useMemo, useState } from "react";
import type { PartialComponentSpec, SpecProperty } from "ds-types";
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
  slot: "SLOT",
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
      <TableCell className="!font-normal">{prop.name}</TableCell>
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
    </TableRow>
  );
}

interface ComponentSpecViewerProps {
  spec: PartialComponentSpec;
}

type PropertySortField = "name" | "type" | "values";

const PROPERTY_SORT_COLUMNS: Array<{ field: PropertySortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "type", label: "Type" },
  { field: "values", label: "Values" },
];

export function ComponentSpecViewer({ spec }: ComponentSpecViewerProps) {
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
  const accessibilityGuidance = useMemo(
    () => Array.from(new Set([
      ...normalizeStringItems(spec.accessibility?.labeling?.rules),
      ...normalizeStringItems(spec.accessibility?.notes),
    ])),
    [spec.accessibility?.labeling?.rules, spec.accessibility?.notes],
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
        return (prop.values || []).join("|").toLowerCase();
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
  return (
    <div className="space-y-6">
      {/* Summary */}
      <section>
        <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
          Summary
        </h4>
        <div className="space-y-3 text-sm">
          <div>
            <h5 className="text-xs font-titles font-semibold">Purpose</h5>
            <div>{renderSummaryMarkdown(summary.purpose)}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h5 className="mb-2 text-muted-foreground text-xs font-titles font-semibold">
                When to use
              </h5>
              <div>{renderSummaryMarkdown(summary.when_to_use)}</div>
            </div>
            <div>
              <h5 className="mb-2 text-muted-foreground text-xs font-titles font-semibold">
                When not to use
              </h5>
              <div>{renderSummaryMarkdown(summary.when_not_to_use)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Properties */}
      <section>
        <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
          Properties
        </h4>
        {spec.properties === null ? (
          <p className="text-sm text-muted-foreground">
            Properties available after Figma capture.
          </p>
        ) : propertyItems.length > 0 ? (
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
          <p className="text-sm text-muted-foreground">
            No properties defined for this component.
          </p>
        )}
      </section>

      {/* Behaviour */}
      <section>
        <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
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
        <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
          Accessibility
        </h4>
        <div className="space-y-2 text-sm">
          <div>
            <h5 className="text-xs font-titles font-semibold">Role</h5>
            <p className="font-mono text-xs">
              {String(spec.accessibility?.role ?? "").trim() || (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          {spec.accessibility?.focus?.tokens ? (
            <div>
              <h5 className="text-xs font-titles font-semibold">Focus tokens</h5>
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
          {accessibilityGuidance.length > 0 ? (
            <div>
              <h5 className="text-xs font-titles font-semibold">Guidance</h5>
              <div>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                  {accessibilityGuidance.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Content Guidelines */}
      <section>
        <h4 className="mb-2 text-muted-foreground text-sm font-titles font-semibold">
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

    </div>
  );
}
