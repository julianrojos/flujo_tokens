/**
 * Figma Description Section
 *
 * S-07: Displays Figma descriptions (component set + variants) on the component
 * detail page. Feature-local (Tier 2).
 *
 * If descriptions have never been synced, the section does not render (invisible).
 */

import { SectionHeader } from "@/components/composites/section-header";
import { Badge } from "@/components/ui/badge";

interface FigmaDescriptionSectionProps {
  componentSetDescription: string | null;
  variantDescriptions: Array<{ canonicalKey: string; description: string | null }>;
  syncedAt: number | null;
  stale: boolean;
}

export function FigmaDescriptionSection({
  componentSetDescription,
  variantDescriptions,
  syncedAt,
  stale,
}: FigmaDescriptionSectionProps) {
  // Don't render if never synced — section should be invisible
  if (syncedAt == null) return null;

  const syncedLabel = new Date(syncedAt * 1000).toLocaleString();
  const hasContent = componentSetDescription?.trim() || variantDescriptions.some(v => v.description?.trim());
  if (!hasContent) return null;

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Figma descriptions"
        badge={
          <Badge variant={stale ? "warning" : "success"}>
            {stale ? "Stale" : "Synced"}
          </Badge>
        }
      />

      {hasContent && (
        <div className="space-y-4">
          {/* Component set description */}
          {componentSetDescription?.trim() && (
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {componentSetDescription}
              </p>
            </div>
          )}

          {/* Variant descriptions */}
          {variantDescriptions.some(v => v.description?.trim()) && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Variant descriptions</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {variantDescriptions
                  .filter(v => v.description?.trim())
                  .map(v => (
                    <li key={v.canonicalKey} className="flex items-start gap-2">
                      <code className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-mono shrink-0">
                        {v.canonicalKey}
                      </code>
                      <span className="text-foreground">{v.description}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Last synced: {syncedLabel}
        {stale && " — data may be outdated."}
      </p>
    </section>
  );
}
