import * as React from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  change,
  trend = "neutral",
  icon,
  className,
}: MetricCardProps) {
  const trendIcon = {
    up: <ArrowUpRight className="h-4 w-4 text-status-success" />,
    down: <ArrowDownRight className="h-4 w-4 text-status-error" />,
    neutral: <Minus className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <Card variant="elevated" className={cn(className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-serif font-semibold tracking-tight">
              {value}
            </p>
            {change ? (
              <div className="flex items-center gap-1.5 text-xs">
                {trendIcon[trend]}
                <span
                  className={cn(
                    trend === "up" && "text-status-success",
                    trend === "down" && "text-status-error",
                    trend === "neutral" && "text-muted-foreground",
                  )}
                >
                  {change}
                </span>
              </div>
            ) : null}
          </div>
          {icon ? (
            <div className="rounded border border-border/70 bg-surface-2 p-2 text-muted-foreground">
              {icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
