/**
 * Layer Token Mapping Section
 *
 * Displays per-variant, per-layer token bindings for a component.
 * Uses the same Card + Table markup pattern as TokenUsageSection.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface LayerTokenMappingEntry {
  variant_node_id: string;
  variant_signature: string;
  layer_node_id: string;
  layer_name: string;
  property_path: string;
  variable_id: string;
  token_path: string | null;
  status: "resolved" | "unresolved";
  mode_id: string;
  mode_name: string;
}

interface LayerTokenMappingSectionProps {
  entries: LayerTokenMappingEntry[];
}

function statusBadgeVariant(status: "resolved" | "unresolved"): "success" | "warning" {
  return status === "resolved" ? "success" : "warning";
}

function statusLabel(status: "resolved" | "unresolved"): string {
  return status === "resolved" ? "Resolved" : "Unresolved";
}

export function LayerTokenMappingSection({ entries }: LayerTokenMappingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Layer Token Mapping</CardTitle>
        <CardDescription>
          Token bindings per layer and variant — {entries.length} binding{entries.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Variable ID</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow
                  key={`${entry.variant_node_id}-${entry.layer_node_id}-${entry.property_path}-${entry.variable_id}-${entry.mode_id}-${index}`}
                >
                  <TableCell className="max-w-[200px]">
                    <span className="block truncate text-sm" title={entry.variant_signature || "(no variant)"}>
                      {entry.variant_signature || <span className="text-muted-foreground">—</span>}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    <span className="block truncate text-sm font-mono text-xs" title={entry.layer_name}>
                      {entry.layer_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{entry.property_path}</code>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {entry.token_path ? (
                      <code className="block truncate rounded bg-muted px-1.5 py-0.5 text-xs" title={entry.token_path}>
                        {entry.token_path}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[140px]">
                    <code className="block truncate rounded bg-muted px-1.5 py-0.5 text-xs font-mono" title={entry.variable_id}>
                      {entry.variable_id}
                    </code>
                  </TableCell>
                  <TableCell>
                    {entry.mode_name ? (
                      <Badge variant="neutral" className="text-xs">{entry.mode_name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(entry.status)}>{statusLabel(entry.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground">No token bindings captured for this component.</div>
        )}
      </CardContent>
    </Card>
  );
}
