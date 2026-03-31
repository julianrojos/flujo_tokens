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

function formatBytes(value: number | null | undefined): string | null {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCapturedAt(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString();
}

export function ComponentVisualProofSection({ item, captureSummary, onOpenCapture }: ComponentVisualProofSectionProps) {
  if (!item) return null;
  const proof = item.visual_proof;
  const screenshotUrl = proof.screenshot_url;
  const capturedAt = formatCapturedAt(proof.captured_at);
  const imageBytes = formatBytes(proof.image_bytes);
  const imageDimensions =
    Number.isFinite(Number(proof.image_width)) && Number.isFinite(Number(proof.image_height))
      ? `${proof.image_width} × ${proof.image_height}`
      : null;
  const variantsCount = Number.isFinite(Number(proof.variants_count))
    ? Number(proof.variants_count)
    : Array.isArray(proof.variants)
      ? proof.variants.length
      : 0;
  const variantNames = Array.isArray(proof.variants)
    ? proof.variants.map((variant) => String(variant.name || "").trim()).filter(Boolean)
    : [];
  const hasTechnicalEvidence =
    Boolean(proof.exists) ||
    Boolean(capturedAt) ||
    Boolean(imageBytes) ||
    Boolean(imageDimensions) ||
    Boolean(proof.image_sha256) ||
    Number(variantsCount) > 0;

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
        {hasTechnicalEvidence && (
          <div className="grid gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground sm:grid-cols-2">
            <div>Captured: {capturedAt || "N/A"}</div>
            <div>Variants: {variantsCount}</div>
            <div>Image size: {imageBytes || "N/A"}</div>
            <div>Dimensions: {imageDimensions || "N/A"}</div>
            <div className="sm:col-span-2">Node ID: {proof.node_id || "N/A"}</div>
            <div className="sm:col-span-2">SHA-256: {proof.image_sha256 || "N/A"}</div>
            {variantNames.length > 0 && (
              <div className="sm:col-span-2">Variant names: {variantNames.join(", ")}</div>
            )}
          </div>
        )}
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
