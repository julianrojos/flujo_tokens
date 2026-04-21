import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const tableVariants = cva("w-full caption-bottom text-sm");
export const tableHeaderVariants = cva("[&_tr]:border-b");
export const tableBodyVariants = cva(
  "[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-table-row-alt",
);
export const tableRowVariants = cva(
  "transition-colors hover:bg-muted/40",
);
export const tableHeadVariants = cva(
  "h-11 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide",
);
export const tableHeadContentVariants = cva("flex w-full items-center gap-2", {
  variants: {
    alignment: {
      end: "justify-end",
      split: "justify-between",
    },
  },
  defaultVariants: {
    alignment: "split",
  },
});
export const tableCellVariants = cva("p-3 align-middle");

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn(tableVariants(), className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(tableHeaderVariants(), "titles-color", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(tableBodyVariants(), className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(tableRowVariants(), className)}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { showSortIcon?: boolean }
>(({ className, children, showSortIcon = true, ...props }, ref) => {
  const isRightAligned = className?.includes("text-right");
  return (
    <th
      ref={ref}
      className={cn(tableHeadVariants(), className)}
      {...props}
    >
      <div
        className={cn(
          tableHeadContentVariants({ alignment: isRightAligned ? "end" : "split" }),
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-1">{children}</span>
        {showSortIcon ? (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        ) : null}
      </div>
    </th>
  );
});
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn(tableCellVariants(), className)} {...props} />
));
TableCell.displayName = "TableCell";
