import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface FilterBarProps {
  children?: React.ReactNode;
  searchValue?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  count?: number;
  className?: string;
}

export function FilterBar({
  children,
  searchValue,
  onSearch,
  searchPlaceholder = "Search...",
  count,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-3">
        {onSearch ? (
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            className="max-w-[240px]"
          />
        ) : null}
        {children}
      </div>
      {count !== undefined ? (
        <Badge variant="neutral" className="shrink-0">
          {count} item{count !== 1 ? "s" : ""}
        </Badge>
      ) : null}
    </div>
  );
}
