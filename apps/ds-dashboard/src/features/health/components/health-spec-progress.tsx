/**
 * Health Spec Progress Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SpecProgressProps {
  withSpec: number;
  missing: number;
  total: number;
  anchorId?: string;
}

export function HealthSpecProgress({
  withSpec,
  missing,
  total,
  anchorId,
}: SpecProgressProps) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <Card id={anchorId}>
      <CardHeader>
        <CardTitle>Spec Progress</CardTitle>
        <CardDescription>Spec coverage by component</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>With spec</span>
            <Badge variant="success">{withSpec} ({pct(withSpec)}%)</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Missing spec</span>
            <Badge variant="error">{missing} ({pct(missing)}%)</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
