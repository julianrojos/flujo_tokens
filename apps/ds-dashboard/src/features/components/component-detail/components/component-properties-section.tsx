import { useMemo, useState } from "react";
import type { PartialComponentSpec, SpecProperty } from "ds-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

const TYPE_DISPLAY: Record<string, string> = {
  enum: "VARIANT",
  text: "TEXT",
  boolean: "BOOLEAN",
  instance_swap: "INSTANCE_SWAP",
  slot: "SLOT",
};

type PropertySortField = "name" | "type" | "values";

const PROPERTY_SORT_COLUMNS: Array<{ field: PropertySortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "type", label: "Type" },
  { field: "values", label: "Values" },
];

function typeBadgeVariant(type: string): "neutral" | "success" | "warning" {
  if (type === "enum") return "success";
  if (type === "boolean") return "warning";
  return "neutral";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Properties</CardTitle>
      </CardHeader>
      <CardContent>
        {!spec || spec.properties === null ? (
          <p className="text-sm text-muted-foreground">
            No properties defined for this component.
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
      </CardContent>
    </Card>
  );
}
