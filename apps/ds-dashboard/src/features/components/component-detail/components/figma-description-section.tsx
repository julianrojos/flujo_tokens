/**
 * Figma Description Section
 *
 * S-07: Displays Figma descriptions (component set + variants) on the component
 * detail page. Feature-local (Tier 2).
 */

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
  const componentDescription = String(componentSetDescription ?? "").trim();
  const variantEntries = variantDescriptions
    .filter((variant) => String(variant.description ?? "").trim().length > 0)
    .map((variant) => ({
      ...variant,
      description: String(variant.description ?? "").trim(),
    }));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Figma descriptions
        </h4>
        {syncedAt == null ? (
          <Badge variant="neutral">Not synced</Badge>
        ) : stale ? (
          <Badge variant="warning">Stale</Badge>
        ) : null}
      </div>

      <div className="space-y-4">
        {/* Component set description */}
        <div>
          {componentDescription ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {componentDescription}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>

        {/* Variant descriptions */}
        <div className="space-y-2">
          <h5 className="font-medium text-sm">Variant descriptions</h5>
          {variantEntries.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {variantEntries.map((variant) => (
                <li key={variant.canonicalKey} className="flex items-start gap-2">
                  <code className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-mono shrink-0">
                    {variant.canonicalKey}
                  </code>
                  <span className="text-foreground">{variant.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

    </section>
  );
}
