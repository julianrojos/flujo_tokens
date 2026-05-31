import * as React from "react";
import { ArrowUpDown, Info } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

interface SortableTableHeadProps {
  label: React.ReactNode;
  onSort: () => void;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  ariaSort?: "none" | "ascending" | "descending";
  tooltip?: string;
}

export const sortableTableHeadButtonVariants = cva("inline-flex items-center gap-1");

const SortableTableHead = React.forwardRef<
  HTMLTableCellElement,
  SortableTableHeadProps
>(({ label, onSort, className, buttonClassName, ariaLabel, ariaSort = "none", tooltip }, ref) => (
  <TableHead ref={ref} className={className} showSortIcon={false} aria-sort={ariaSort}>
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={cn(sortableTableHeadButtonVariants(), buttonClassName)}
        onClick={onSort}
        aria-label={ariaLabel ?? (typeof label === "string" ? `Sort by ${label}` : undefined)}
      >
        {label} <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
      {tooltip && (
        <span
          title={tooltip}
          aria-label={tooltip}
          role="img"
          className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-help"
        >
          <Info className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </div>
  </TableHead>
));
SortableTableHead.displayName = "SortableTableHead";

export { SortableTableHead };
