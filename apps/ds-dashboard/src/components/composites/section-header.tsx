import * as React from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface SectionHeaderProps {
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  badge,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-titles font-semibold tracking-tight titles-color">
          {title}
        </h2>
        {badge ? (
          typeof badge === "string" ? (
            <Badge variant="neutral">{badge}</Badge>
          ) : (
            badge
          )
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
