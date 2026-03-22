/**
 * Token Health Section - displays health issues and WCAG warnings.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";

interface HealthIssue {
  key: string;
  severity: "error" | "warning";
  label: string;
  detail: string;
}

interface TokenHealthSectionProps {
  healthIssues: HealthIssue[];
}

export function TokenHealthSection({ healthIssues }: TokenHealthSectionProps) {
  if (healthIssues.length === 0) {
    return (
      <StatusAlert variant="success" title="No health issues">
        This token has no known health issues.
      </StatusAlert>
    );
  }

  const errors = healthIssues.filter((i) => i.severity === "error");
  const warnings = healthIssues.filter((i) => i.severity === "warning");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Issues</CardTitle>
        <CardDescription>
          {errors.length} errors · {warnings.length} warnings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors.map((issue) => (
          <StatusAlert key={issue.key} variant="error" title={issue.label}>
            {issue.detail}
          </StatusAlert>
        ))}
        {warnings.map((issue) => (
          <StatusAlert key={issue.key} variant="warning" title={issue.label}>
            {issue.detail}
          </StatusAlert>
        ))}
      </CardContent>
    </Card>
  );
}
