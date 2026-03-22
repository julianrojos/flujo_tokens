import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const selectVariants = cva(
  "h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(selectVariants(), className)}
        {...props}
      />
    );
  },
);

Select.displayName = "Select";

export { Select };
