import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface DataPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function DataPanel({ children, className }: DataPanelProps) {
  return (
    <Card variant="elevated" className={cn(className)}>
      {children}
    </Card>
  );
}

export interface DataPanelHeaderProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function DataPanelHeader({
  title,
  description,
  actions,
  className,
  children,
}: DataPanelHeaderProps) {
  if (children) {
    return (
      <CardHeader className={cn("pb-3", className)}>
        {children}
      </CardHeader>
    );
  }

  return (
    <CardHeader className={cn("pb-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {title ? (
            <CardTitle>{title}</CardTitle>
          ) : null}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </CardHeader>
  );
}

export interface DataPanelContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DataPanelContent({
  children,
  className,
}: DataPanelContentProps) {
  return (
    <CardContent className={cn("p-0", className)}>
      {children}
    </CardContent>
  );
}

export interface DataPanelFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function DataPanelFooter({
  children,
  className,
}: DataPanelFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border/70 px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
