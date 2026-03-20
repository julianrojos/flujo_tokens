import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        success:
          "border-status-success-border/30 bg-status-success-bg/15 text-status-success",
        warning:
          "border-status-warning-border/30 bg-status-warning-bg/15 text-status-warning",
        neutral: "border-border bg-muted text-muted-foreground",
        error:
          "border-status-error-border/30 bg-status-error-bg/15 text-status-error",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
