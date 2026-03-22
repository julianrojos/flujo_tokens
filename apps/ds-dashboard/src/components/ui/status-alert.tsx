import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";

import { cn } from "@/lib/utils";

const statusAlertVariants = cva(
  "flex w-full items-start gap-3 rounded-md border p-3 text-sm",
  {
    variants: {
      variant: {
        error:
          "border-status-error-border/30 bg-status-error-bg/10 text-status-error",
        success:
          "border-status-success-border/30 bg-status-success-bg/10 text-status-success",
        warning:
          "border-status-warning-border/30 bg-status-warning-bg/10 text-status-warning",
        info:
          "border-border/70 bg-muted/30 text-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

const iconMap = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

export interface StatusAlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusAlertVariants> {
  title?: string;
  description?: React.ReactNode;
}

const StatusAlert = React.forwardRef<HTMLDivElement, StatusAlertProps>(
  ({ className, variant, title, description, children, ...props }, ref) => {
    const Icon = iconMap[variant || "info"];
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(statusAlertVariants({ variant, className }))}
        {...props}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          {title ? (
            <StatusAlertTitle>{title}</StatusAlertTitle>
          ) : null}
          {description ? (
            <StatusAlertDescription>{description}</StatusAlertDescription>
          ) : null}
          {children}
        </div>
      </div>
    );
  },
);
StatusAlert.displayName = "StatusAlert";

export function StatusAlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("text-sm font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function StatusAlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-xs opacity-80", className)}
      {...props}
    />
  );
}

export { StatusAlert, statusAlertVariants };
