/**
 * Figma Description Section
 *
 * S-07: Displays Figma descriptions (component set + variants) on the component
 * detail page. Feature-local (Tier 2).
 */
import React from "react";
import { MarkdownPreview } from "@/components/markdown/markdown-preview";

const subsectionLabelClass = "text-[11px] font-titles font-medium uppercase tracking-wider";

interface FigmaDescriptionSectionProps {
  componentSetDescription: string | null;
  variantDescriptions: Array<{ canonicalKey: string; description: string | null }>;
}

export function FigmaDescriptionSection({
  componentSetDescription,
  variantDescriptions,
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
        <h3 className="text-sm font-titles font-semibold titles-color">
          Figma descriptions
        </h3>
      </div>

      <div className="space-y-4">
        {/* Component set description */}
        <div>
          {componentDescription ? (
            <MarkdownPreview content={componentDescription} />
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>

        {/* Variant descriptions */}
        <div className="space-y-2">
          <h4 className={subsectionLabelClass}>Variant descriptions</h4>
          {variantEntries.length > 0 ? (
            <ul className="space-y-2">
              {variantEntries.map((variant) => (
                <li key={variant.canonicalKey} className="space-y-1.5">
                  <code className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-mono shrink-0">
                    {variant.canonicalKey}
                  </code>
                  <MarkdownPreview content={variant.description} />
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
