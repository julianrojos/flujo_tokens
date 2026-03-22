/**
 * Health Pipeline Progress Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PipelineProgressProps {
  ready: number;
  withVisualProof: number;
  needsReview: number;
  draft: number;
  missing: number;
  total: number;
  anchorId?: string;
}

export function HealthPipelineProgress({
  ready,
  withVisualProof,
  needsReview,
  draft,
  missing,
  total,
  anchorId,
}: PipelineProgressProps) {
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <Card id={anchorId}>
      <CardHeader>
        <CardTitle>Pipeline Progress</CardTitle>
        <CardDescription>Component documentation stages</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Ready</span>
            <Badge variant="success">{ready} ({pct(ready)}%)</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Visual proof</span>
            <Badge variant="neutral">{withVisualProof} ({pct(withVisualProof)}%)</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Needs review</span>
            <Badge variant="neutral">{needsReview} ({pct(needsReview)}%)</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Draft</span>
            <Badge variant="neutral">{draft} ({pct(draft)}%)</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Missing</span>
            <Badge variant="error">{missing} ({pct(missing)}%)</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
