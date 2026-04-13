/**
 * Component Visual Proof Section
 */

import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";
import type { SpecVariantVisual } from "ds-types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ComponentRegistryItem } from "@/types/component-registry";

import { buildAssetUrl } from "../lib/component-detail-transforms";
import { normalizeVariantName } from "../lib/spec-viewer-utils";

interface ComponentVisualProofSectionProps {
  item: ComponentRegistryItem | null;
  captureSummary: string | null;
  onOpenCapture: () => void;
  variantVisuals?: SpecVariantVisual[];
}

export function ComponentVisualProofSection({ item, captureSummary, onOpenCapture, variantVisuals }: ComponentVisualProofSectionProps) {
  const proof = item?.visual_proof;
  const screenshotUrl = proof?.screenshot_url || buildAssetUrl(proof?.image_path || null);
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const [failedVariantKeys, setFailedVariantKeys] = useState<Set<string>>(new Set());
  const variantPreviews = useMemo(
    () =>
      Array.isArray(proof?.variants)
        ? proof.variants
            .map((variant, index) => {
              const name = String(variant.name || "").trim() || `Variant ${index + 1}`;
              const previewUrl =
                String(variant.screenshot_url || "").trim() || buildAssetUrl(variant.image_path || null);
              return {
                key: `${name}::${previewUrl || "no-preview"}::${index}`,
                name,
                previewUrl,
              };
            })
            .filter((variant) => Boolean(variant.previewUrl))
        : [],
    [proof?.variants],
  );

  const variantVisualMap = useMemo(() => {
    const map = new Map<string, SpecVariantVisual>();
    for (const visual of variantVisuals ?? []) {
      const normalizedName = normalizeVariantName(visual.name);
      if (!normalizedName) continue;
      if (import.meta.env.DEV && map.has(normalizedName)) {
        console.warn(
          "[variant_visuals] duplicate normalized name; using last entry:",
          normalizedName,
          "from",
          visual.name,
        );
      }
      map.set(normalizedName, visual);
    }
    return map;
  }, [variantVisuals]);
  useEffect(() => {
    setMainImageFailed(false);
  }, [screenshotUrl]);
  useEffect(() => {
    setFailedVariantKeys(new Set());
  }, [variantPreviews]);
  const visibleVariantPreviews = useMemo(
    () => variantPreviews.filter((variant) => !failedVariantKeys.has(variant.key)),
    [failedVariantKeys, variantPreviews],
  );
  if (!item || !proof) return null;
  const hasScreenshot = Boolean(screenshotUrl) && !mainImageFailed;
  const hasVariantPreviews = visibleVariantPreviews.length > 0;
  const splitVisualColumns = hasScreenshot && hasVariantPreviews;

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
        {(hasScreenshot || hasVariantPreviews) && (
          <div className={splitVisualColumns ? "grid gap-4 md:grid-cols-2" : "space-y-4"}>
            {hasScreenshot && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Screenshot</h4>
                <img
                  src={screenshotUrl || undefined}
                  alt={`${item.display_name} screenshot`}
                  className="max-h-64 rounded-lg border border-border object-contain"
                  onError={() => setMainImageFailed(true)}
                />
              </div>
            )}
            {hasVariantPreviews && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variants</h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleVariantPreviews.map((variant) => {
                    const matched = variantVisualMap.get(normalizeVariantName(variant.name));
                    if (import.meta.env.DEV && !matched) {
                      console.debug("[variant_visuals] no match for variant:", variant.name);
                    }
                    return (
                      <figure key={variant.key} className="space-y-1">
                        <img
                          src={variant.previewUrl || undefined}
                          alt={`${item.display_name} ${variant.name}`}
                          className="max-h-40 w-full rounded-lg object-contain"
                          onError={() =>
                            setFailedVariantKeys((prev) => {
                              const next = new Set(prev);
                              next.add(variant.key);
                              return next;
                            })
                          }
                        />
                        <figcaption className="text-xs text-muted-foreground">{variant.name}</figcaption>
                        {matched && Object.keys(matched.properties).length > 0 && (
                          <div
                            role="group"
                            aria-label={`${variant.name} variant properties`}
                            className="mt-1 flex flex-wrap gap-1"
                          >
                            {Object.entries(matched.properties).map(([k, v]) => (
                              <span
                                key={k}
                                aria-label={`${variant.name}: ${k} property set to ${String(v)}`}
                                className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                              >
                                {k}={v}
                              </span>
                            ))}
                          </div>
                        )}
                      </figure>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {captureSummary && (
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">
            <h4 className="mb-1 font-semibold">Last capture</h4>
            <pre className="whitespace-pre-wrap text-xs">{captureSummary}</pre>
          </div>
        )}
        {!hasScreenshot && !hasVariantPreviews && (
          <p className="text-sm text-muted-foreground">No visual assets captured yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
