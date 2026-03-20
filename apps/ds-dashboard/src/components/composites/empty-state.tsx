import * as React from "react";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-border/70 bg-surface-1/50 p-8 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="rounded-full border border-border/70 bg-surface-2 p-4 text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <div className="max-w-md space-y-1">
        <h3 className="text-lg font-serif font-semibold">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="pt-2">{action}</div>
      ) : null}
    </div>
  );
}

export function EmptyStateAction({
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <Button className={cn("min-w-[140px]", className)} {...props}>
      {children}
    </Button>
  );
}
