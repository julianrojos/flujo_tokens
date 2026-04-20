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
        "flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="rounded-full border border-border/70 bg-surface-2 p-4 text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-titles font-semibold">{title}</h3>
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

export interface EmptyStateActionProps extends ButtonProps {
  asChild?: boolean;
}

export function EmptyStateAction({
  children,
  className,
  asChild,
  ...props
}: EmptyStateActionProps) {
  if (asChild) {
    return (
      <span className="inline-flex">
        {React.Children.only(children) as React.ReactElement}
      </span>
    );
  }
  return (
    <Button className={cn("min-w-[140px]", className)} {...props}>
      {children}
    </Button>
  );
}
