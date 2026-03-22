/**
 * Health Broken Aliases Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";

interface BrokenAlias {
  token: string;
  aliasCssVar: string;
  reason: string;
}

interface HealthBrokenAliasesProps {
  aliases: BrokenAlias[];
  onSort: (field: "token" | "alias" | "reason") => void;
}

export function HealthBrokenAliases({ aliases, onSort }: HealthBrokenAliasesProps) {
  return (
    <Card id="broken-aliases">
      <CardHeader>
        <CardTitle>Broken Aliases</CardTitle>
        <CardDescription>Token alias references that cannot be resolved</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Token"
                onSort={() => onSort("token")}
              />
              <SortableTableHead
                label="Alias"
                onSort={() => onSort("alias")}
              />
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aliases.slice(0, 50).map((item) => (
              <TableRow key={`${item.token}-${item.aliasCssVar}-${item.reason}`}>
                <TableCell className="font-mono text-xs">{item.token}</TableCell>
                <TableCell className="font-mono text-xs">{item.aliasCssVar}</TableCell>
                <TableCell>
                  <Badge variant="error" className="text-xs">
                    {item.reason || "Unresolved"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {aliases.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  No broken aliases found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {aliases.length > 50 && (
          <p className="mt-2 text-xs text-muted-foreground">Showing 50 of {aliases.length} broken aliases</p>
        )}
      </CardContent>
    </Card>
  );
}
