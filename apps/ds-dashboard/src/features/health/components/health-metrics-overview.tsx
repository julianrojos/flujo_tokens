/**
 * Health Metrics Overview Section
 */

import { MetricCard } from "@/components/composites";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface HealthMetricsOverviewProps {
  tokensTotal: number;
  componentsTotal: number;
  tokenScore: number;
  namingScore: number | null;
  componentsScore: number;
  overallScore: number;
}

export function HealthMetricsOverview({
  tokensTotal,
  componentsTotal,
  tokenScore,
  namingScore,
  componentsScore,
  overallScore,
}: HealthMetricsOverviewProps) {
  const scoreIcon =
    overallScore >= 80 ? <CheckCircle2 className="h-4 w-4" /> : overallScore >= 60 ? <AlertTriangle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Overall Health"
        value={overallScore}
        change="/100"
        icon={scoreIcon}
      />
      <MetricCard
        label="Tokens"
        value={tokensTotal}
        change={`${tokenScore}/100 health`}
        icon={<CheckCircle2 className="h-4 w-4" />}
      />
      <MetricCard
        label="Components"
        value={componentsTotal}
        change={`${componentsScore}/100 health`}
        icon={<CheckCircle2 className="h-4 w-4" />}
      />
      <MetricCard
        label="Naming"
        value={namingScore ?? "—"}
        change={namingScore !== null ? "/100" : undefined}
        icon={<CheckCircle2 className="h-4 w-4" />}
      />
    </div>
  );
}
