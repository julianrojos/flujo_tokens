import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TokenRelationsSectionProps {
  aliasOf: string | null;
  hasDescendantAliases: boolean;
}

export function TokenRelationsSection({
  aliasOf,
  hasDescendantAliases,
}: TokenRelationsSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Relations</CardTitle>
            <CardDescription>Alias chain and downstream aliases</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {aliasOf ? (
            <Badge variant="neutral">alias of: {aliasOf}</Badge>
          ) : (
            <span className="text-muted-foreground">No upstream alias</span>
          )}
          {hasDescendantAliases && (
            <Badge variant="neutral">has downstream aliases</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
