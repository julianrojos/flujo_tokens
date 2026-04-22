import { useMemo, useState } from "react";
import type { PartialComponentSpec, SpecProperty } from "ds-types";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/composites/empty-state";

type PropertySortField = "name" | "type" | "values";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  enum: "Variant",
  text: "Text",
  boolean: "Boolean",
  instance_swap: "Instance swap",
  slot: "Slot",
};

const PROPERTY_SORT_COLUMNS: Array<{ field: PropertySortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "type", label: "Type" },
  { field: "values", label: "Values" },
];

function PropertyRow({ prop }: { prop: SpecProperty }) {
  const typeLabel =
    PROPERTY_TYPE_LABELS[prop.type.toLowerCase()] ?? prop.type;
  return (
    <TableRow>
      <TableCell className="!font-normal">{prop.name}</TableCell>
      <TableCell>
        <span className="text-sm text-foreground">{typeLabel}</span>
      </TableCell>
      <TableCell>
        {prop.values ? (
          <div className="flex flex-wrap gap-1">
            {prop.values.map((value) => (
              <code key={value} className="rounded px-1 py-0.5 text-xs">
                {value}
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

interface ComponentPropertiesSectionProps {
  spec: PartialComponentSpec | null;
}

export function ComponentPropertiesSection({ spec }: ComponentPropertiesSectionProps) {
  const propertyItems = spec?.properties ?? [];
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

  if (!spec || spec.properties === null || propertyItems.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-titles font-semibold tracking-tight titles-color">
          Properties
        </h2>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
