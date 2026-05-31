import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { Link } from "react-router-dom";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { splitComponentName } from "@/lib/component-identity";
import { useDesignSystem } from "@/lib/design-system-context";
import { toSystemConsumerDetail } from "@/lib/routes";
import { useComponentAdoption } from "../hooks/use-component-adoption";
import type { ComponentCatalogItem } from "@/types/component-catalog";

interface ComponentAdoptionSectionProps {
  slug: string;
  allItems: ComponentCatalogItem[];
}

export function ComponentAdoptionSection({ slug, allItems }: ComponentAdoptionSectionProps) {
  const { activeSystem } = useDesignSystem();
  const {
    reports,
    totalInstances,
    consumerCount,
    worstImpactLevel,
    aggregatedConsumers,
    loading,
    error,
  } = useComponentAdoption({ slug, allItems });

  if (!loading && !error && reports.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Component Adoption</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Unable to load adoption data: {error}
          </p>
        ) : (
          <>
            {/* Summary row */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">
                {totalInstances} instance{totalInstances !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="neutral">
                {consumerCount} consumer{consumerCount !== 1 ? "s" : ""}
              </Badge>
              {worstImpactLevel && (
                <ImpactLevelBadge level={worstImpactLevel} />
              )}
            </div>

            {/* Variants table */}
            <div className="space-y-2">
              <h3 className="text-sm font-titles font-semibold titles-color">Variants Used</h3>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted titles-color">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium titles-color">Variant</th>
                      <th className="px-3 py-2 text-right font-medium titles-color">Instances</th>
                      <th className="px-3 py-2 text-left font-medium titles-color">Consumers</th>
                      <th className="px-3 py-2 text-left font-medium titles-color">Impact</th>
                      <th className="px-3 py-2 text-left font-medium titles-color">Sample Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => {
                      const { variantLabel } = splitComponentName(report.componentName);
                      const variantConsumerCount = report.consumers.length;
                      return (
                      <tr key={report.componentKey} className="border-t">
                          <td className="px-3 py-2">
                            <span className="font-normal">{variantLabel || "(base)"}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {report.totalInstances}
                          </td>
                          <td className="px-3 py-2">
                            {variantConsumerCount}
                          </td>
                          <td className="px-3 py-2">
                            <ImpactLevelBadge level={report.impactLevel.level} />
                          </td>
                          <td className="px-3 py-2">
                            {report.sampleLinks.length > 0 ? (
                              <a
                                href={report.sampleLinks[0]}
                                className="text-app-accent hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View in Figma
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Consumers table */}
            <div className="space-y-2">
              <h3 className="text-sm font-titles font-semibold titles-color">Consumers</h3>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted titles-color">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium titles-color">Consumer</th>
                      <th className="px-3 py-2 text-right font-medium titles-color">Instances</th>
                      <th className="px-3 py-2 text-left font-medium titles-color">Last Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedConsumers.map((consumer) => (
                      <tr key={consumer.id} className="border-t">
                        <td className="px-3 py-2">
                          {activeSystem ? (
                            <Link
                              to={toSystemConsumerDetail(activeSystem, consumer.name)}
                              className="text-app-accent hover:underline"
                            >
                              <span className="font-normal">{consumer.name}</span>
                            </Link>
                          ) : (
                            <span className="font-normal">{consumer.name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {consumer.instances}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatSyncedAt(consumer.lastSyncedAt ?? undefined)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
