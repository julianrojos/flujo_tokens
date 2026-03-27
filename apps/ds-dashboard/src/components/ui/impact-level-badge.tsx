import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type { ImpactLevel } from "@/types/consumers";

const impactLevelBadgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      level: {
        CRITICAL: "border-status-error-border/30 bg-status-error-bg/15 text-status-error",
        HIGH: "border-status-warning-border/30 bg-status-warning-bg/15 text-status-warning",
        MEDIUM: "border-border bg-muted text-foreground",
        LOW: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      level: "LOW",
    },
  },
);

export interface ImpactLevelBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof impactLevelBadgeVariants> {
  level: ImpactLevel;
}

const labelMap: Record<ImpactLevel, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const ImpactLevelBadge = React.forwardRef<HTMLSpanElement, ImpactLevelBadgeProps>(
  ({ level, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(impactLevelBadgeVariants({ level }), className)}
        {...props}
      >
        {labelMap[level]}
      </span>
    );
  },
);
ImpactLevelBadge.displayName = "ImpactLevelBadge";

export { ImpactLevelBadge, impactLevelBadgeVariants };
