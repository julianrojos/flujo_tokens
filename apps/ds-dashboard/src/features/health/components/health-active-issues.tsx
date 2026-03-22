/**
 * Health Active Issues Section
 */

import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";

interface DashboardIssue {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: "critical" | "warning";
  to: string;
}

interface HealthActiveIssuesProps {
  issues: DashboardIssue[];
  onIssueClick: (event: React.MouseEvent<HTMLAnchorElement>, to: string) => void;
}

export function HealthActiveIssues({ issues, onIssueClick }: HealthActiveIssuesProps) {
  if (issues.length === 0) {
    return (
      <StatusAlert variant="success" title="No active issues">
        All health checks are passing.
      </StatusAlert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Issues</CardTitle>
        <CardDescription>{issues.length} issues require attention</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.map((issue) => (
          <StatusAlert
            key={issue.id}
            variant={issue.severity === "critical" ? "error" : "warning"}
            title={issue.label}
          >
            <div className="flex items-center justify-between gap-2">
              <span>{issue.description}</span>
              <Link
                to={issue.to}
                onClick={(e) => onIssueClick(e, issue.to)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                View →
              </Link>
            </div>
          </StatusAlert>
        ))}
      </CardContent>
    </Card>
  );
}
