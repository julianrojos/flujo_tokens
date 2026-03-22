import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

interface SortableTableHeadProps {
  label: React.ReactNode;
  onSort: () => void;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
}

export const sortableTableHeadButtonVariants = cva("inline-flex items-center gap-1");

const SortableTableHead = React.forwardRef<
  HTMLTableCellElement,
  SortableTableHeadProps
>(({ label, onSort, className, buttonClassName, ariaLabel }, ref) => (
  <TableHead ref={ref} className={className} showSortIcon={false}>
    <button
      type="button"
      className={cn(sortableTableHeadButtonVariants(), buttonClassName)}
      onClick={onSort}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
    >
      {label} <ArrowUpDown className="h-3.5 w-3.5" />
    </button>
  </TableHead>
));
SortableTableHead.displayName = "SortableTableHead";

export { SortableTableHead };
