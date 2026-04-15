import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import type { ComponentUsageEntry } from "@/types/component-usage-index";
import type { ComponentRegistryItem } from "@/types/component-registry";

interface ComponentGraphSectionProps {
  usage: ComponentUsageEntry | null;
  allItems: ComponentRegistryItem[];
}

export function ComponentGraphSection({ usage, allItems }: ComponentGraphSectionProps) {
  // Build slug to display name map
  const slugToDisplayName = new Map(
    allItems.map((item) => [item.slug, item.display_name] as const)
  );

  // Always render Card - never return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Component Graph</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage === null || (usage.uses.length === 0 && usage.used_in.length === 0) ? (
          <p className="text-sm text-muted-foreground">
            No dependency data available for this component.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Uses column */}
            <div className="space-y-2">
              <h4 className="text-sm font-titles font-semibold">
                Uses ({usage.uses.length})
              </h4>
              {usage.uses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No dependencies recorded
                </p>
              ) : (
                <ul className="space-y-1">
                  {usage.uses.map((slug: string) => (
                    <li key={slug}>
                      <Link
                        to={`/components/${encodeURIComponent(slug)}`}
                        className="text-app-accent hover:underline text-sm"
                      >
                        {slugToDisplayName.get(slug) ?? slug}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Used by column */}
            <div className="space-y-2">
              <h4 className="text-sm font-titles font-semibold">
                Used by ({usage.used_in.length})
              </h4>
              {usage.used_in.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not used by any registered component
                </p>
              ) : (
                <ul className="space-y-1">
                  {usage.used_in.map((slug: string) => (
                    <li key={slug}>
                      <Link
                        to={`/components/${encodeURIComponent(slug)}`}
                        className="text-app-accent hover:underline text-sm"
                      >
                        {slugToDisplayName.get(slug) ?? slug}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
