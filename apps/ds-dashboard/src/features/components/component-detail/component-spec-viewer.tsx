import { lazy, Suspense, useMemo } from "react";
import type { PartialComponentSpec } from "ds-types";

const SummaryMarkdownPreview = lazy(() =>
  import("@/components/markdown/markdown-preview").then((module) => ({
    default: module.MarkdownPreview,
  })),
);

const subsectionLabelClass = "text-[12px] font-titles font-medium uppercase tracking-wider";

function extractGuidanceItems(spec: PartialComponentSpec, candidateKeys: string[]): string[] {
  const looseSpec = spec as Record<string, unknown>;
  const collected: string[] = [];
  for (const key of candidateKeys) {
    if (!(key in looseSpec)) continue;
    const value = looseSpec[key];
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) collected.push(normalized);
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== "string") continue;
      const normalized = item.trim();
      if (normalized) collected.push(normalized);
    }
  }
  return Array.from(new Set(collected));
}

function normalizeStringItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

type ViewerVariant = {
  id: string;
  name: string;
  description: string;
  properties: Record<string, string>;
};

function normalizeVariants(items: unknown): ViewerVariant[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      if (!name) return null;
      const id = String(record.id ?? `variant-${index + 1}`).trim() || `variant-${index + 1}`;
      const description = String(record.description ?? "").trim();
      const properties: Record<string, string> = {};
      const rawProperties = record.properties;
      if (rawProperties && typeof rawProperties === "object" && !Array.isArray(rawProperties)) {
        for (const [key, value] of Object.entries(rawProperties)) {
          const normalizedKey = String(key ?? "").trim();
          const normalizedValue = String(value ?? "").trim();
          if (!normalizedKey || !normalizedValue) continue;
          properties[normalizedKey] = normalizedValue;
        }
      }
      return { id, name, description, properties };
    })
    .filter((variant): variant is ViewerVariant => Boolean(variant));
}

interface ComponentSpecViewerProps {
  spec: PartialComponentSpec;
}

export function ComponentSpecViewer({ spec }: ComponentSpecViewerProps) {
  const summary = spec.summary ?? {
    purpose: "",
    when_to_use: "",
    when_not_to_use: "",
  };
  const behaviourItems = useMemo(
    () => extractGuidanceItems(spec, ["behaviour", "behavior"]),
    [spec.behaviour, (spec as Record<string, unknown>).behavior],
  );
  const accessibilityGuidance = useMemo(
    () => Array.from(new Set([
      ...normalizeStringItems(spec.accessibility?.labeling?.rules),
      ...normalizeStringItems(spec.accessibility?.notes),
    ])),
    [spec.accessibility?.labeling?.rules, spec.accessibility?.notes],
  );
  const contentGuidelineRules = useMemo(
    () => normalizeStringItems(spec.content_guidelines?.rules),
    [spec.content_guidelines?.rules],
  );
  const variants = useMemo(
    () => normalizeVariants(spec.variants),
    [spec.variants],
  );

  const renderSummaryMarkdown = (value: string) => {
    const content = String(value || "").trim();
    if (!content) return <span className="text-muted-foreground">—</span>;
    return (
      <Suspense fallback={<span className="text-muted-foreground">{content}</span>}>
        <SummaryMarkdownPreview content={content} />
      </Suspense>
    );
  };
  return (
    <div className="space-y-6 max-w-prose">
      {/* Summary */}
      <section>
        <h3 className="mb-2 text-sm font-titles font-semibold titles-color">
          Summary
        </h3>
        <div className="space-y-3 text-sm">
          <div>
            <h4 className={`mb-1 ${subsectionLabelClass}`}>Purpose</h4>
            <div>{renderSummaryMarkdown(summary.purpose)}</div>
          </div>
          <div className="space-y-3">
            <div>
              <h4 className={`mb-1 ${subsectionLabelClass}`}>
                When to use
              </h4>
              <div>{renderSummaryMarkdown(summary.when_to_use)}</div>
            </div>
            <div>
              <h4 className={`mb-1 ${subsectionLabelClass}`}>
                When not to use
              </h4>
              <div>{renderSummaryMarkdown(summary.when_not_to_use)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Behaviour */}
      <section>
        <h3 className="mb-2 text-sm font-titles font-semibold titles-color">
          Behaviour
        </h3>
        {behaviourItems.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {behaviourItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Accessibility */}
      <section>
        <h3 className="mb-2 text-sm font-titles font-semibold titles-color">
          Accessibility
        </h3>
        <div className="space-y-3 text-sm">
          <div>
            <h4 className={`mb-1 ${subsectionLabelClass}`}>Role</h4>
            <p className="font-mono text-xs">
              {String(spec.accessibility?.role ?? "").trim() || (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          {spec.accessibility?.focus?.tokens ? (
            <div>
              <h4 className={`mb-1 ${subsectionLabelClass}`}>Focus tokens</h4>
              <div className="space-y-0.5 font-mono text-xs text-muted-foreground">
                {spec.accessibility.focus.tokens.inner ? (
                  <div>inner: {spec.accessibility.focus.tokens.inner}</div>
                ) : null}
                {spec.accessibility.focus.tokens.outer ? (
                  <div>outer: {spec.accessibility.focus.tokens.outer}</div>
                ) : null}
              </div>
            </div>
          ) : null}
          {accessibilityGuidance.length > 0 ? (
            <div>
              <h4 className={`mb-1 ${subsectionLabelClass}`}>Guidance</h4>
              <div>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {accessibilityGuidance.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Content Guidelines */}
      <section>
        <h3 className="mb-2 text-sm font-titles font-semibold titles-color">
          Content Guidelines
        </h3>
        {contentGuidelineRules.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {contentGuidelineRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Variants */}
      <section>
        <h3 className="mb-2 text-sm font-titles font-semibold titles-color">
          Variants
        </h3>
        {variants.length > 0 ? (
          <div className="space-y-3 text-sm">
            {variants.map((variant) => (
              <article key={variant.id} className="space-y-1">
                <h4 className={subsectionLabelClass}>
                  {variant.name}
                </h4>
                {variant.description ? (
                  <p className="text-muted-foreground">{variant.description}</p>
                ) : null}
                {Object.keys(variant.properties).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(variant.properties).map(([key, value]) => (
                      <code key={`${variant.id}-${key}`} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {key}: {value}
                      </code>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

    </div>
  );
}
