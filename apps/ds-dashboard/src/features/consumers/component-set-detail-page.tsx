import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";

import { PageHeader } from "@/components/composites/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByComponent } from "@/lib/api";
import { ImpactLevelBadge } from "./components/impact-level-badge";
import { ArrowLeft } from "lucide-react";
import { useDsFileKey } from "./hooks/use-ds-file-key";
import { type ComponentUsageReport } from "@/types/consumers";
import { deriveComponentSetVariants } from "./lib/component-set-variants";

export function ComponentSetDetailPage() {
  const { componentSetName } = useParams<{ componentSetName: string }>();
  const location = useLocation();
  const fromConsumerId =
    typeof (location.state as { fromConsumerId?: unknown } | null)?.fromConsumerId === "string"
      ? (location.state as { fromConsumerId: string }).fromConsumerId
      : null;
  const { dsFileKey, loading: dsFileKeyLoading } = useDsFileKey();
  const [componentReports, setComponentReports] = useState<ComponentUsageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);

  const decodedName = componentSetName ? decodeURIComponent(componentSetName) : "";

  const variants = useMemo(
    () => deriveComponentSetVariants(componentReports, decodedName),
    [componentReports, decodedName],
  );

  useEffect(() => {
    if (dsFileKeyLoading) return;
    if (!decodedName.trim()) {
      setComponentReports([]);
      setError(
        toApiErrorDisplay(new Error("Missing component set name"), {
          fallbackTitle: "Invalid component set",
          fallbackMessage: "Open this page from a component name in Consumer Detail.",
        }),
      );
      setLoading(false);
      return;
    }

    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!dsFileKey) {
          throw new Error("No figmaFileId found for active system");
        }
        const response = await fetchReportByComponent(dsFileKey);
        if (!active) return;
        setComponentReports(response.data ?? []);
      } catch (cause) {
        if (!active) return;
        setError(
          toApiErrorDisplay(cause, {
            fallbackTitle: "Unable to load component set",
            fallbackMessage: "Try again from the consumer detail page.",
          }),
        );
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [decodedName, dsFileKey, dsFileKeyLoading]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." description="Loading component set details" />
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading component set...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={decodedName || "Component set"} description="Could not load variant data" />
        <ApiErrorMessage error={error} />
      </div>
    );
  }

  const title = decodedName || "Component set";
  const backHref = fromConsumerId ? `/consumers/${encodeURIComponent(fromConsumerId)}` : "/consumers";
  const backLabel = fromConsumerId ? "Back to consumer" : "Back to consumers";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={`Variants for ${title}`}
        actions={
          <Link to={backHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        }
      />

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-base font-semibold">Variants</h3>
        {variants.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No variants found for this component set in the current dependency snapshot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Variant</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Instances</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Used in files</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Impact</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Sample Links</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <tr key={variant.componentKey} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <div className="space-y-0.5">
                        <p className="font-medium">{variant.variantLabel || variant.componentName}</p>
                        <span className="block text-xs text-muted-foreground">{variant.componentName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant="neutral">{variant.totalInstances}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="tabular-nums text-muted-foreground">{variant.consumerCount}</span>
                    </td>
                    <td className="px-3 py-2">
                      <ImpactLevelBadge level={variant.impactLevel.level} />
                    </td>
                    <td className="px-3 py-2">
                      {variant.sampleLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {variant.sampleLinks.slice(0, 5).map((link) => (
                            <a
                              key={link}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-app-accent hover:underline"
                            >
                              ↗ Figma
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
