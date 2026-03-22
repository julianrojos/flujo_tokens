/**
 * Component Visual Proof Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import type { ComponentRegistryItem } from "@/types/component-registry";

interface ComponentVisualProofSectionProps {
  item: ComponentRegistryItem | null;
  captureSummary: string | null;
  onOpenCapture: () => void;
}

export function ComponentVisualProofSection({ item, captureSummary, onOpenCapture }: ComponentVisualProofSectionProps) {
  if (!item) return null;
  const screenshotUrl = item.visual_proof.screenshot_url;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Visual Proof</CardTitle>
            <CardDescription>Screenshot and artwork</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenCapture}>
            <Camera className="mr-2 h-4 w-4" /> Capture
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {screenshotUrl && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Screenshot</h4>
            <img src={screenshotUrl} alt={`${item.display_name} screenshot`} className="max-h-64 rounded-lg border border-border object-contain" />
          </div>
        )}
        {captureSummary && (
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">
            <h4 className="mb-1 font-semibold">Last capture</h4>
            <pre className="whitespace-pre-wrap text-xs">{captureSummary}</pre>
          </div>
        )}
        {!screenshotUrl && (
          <p className="text-sm text-muted-foreground">No visual assets captured yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
