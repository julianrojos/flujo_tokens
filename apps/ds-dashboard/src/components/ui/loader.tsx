import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const loaderVariants = cva("inline-flex items-center justify-center", {
  variants: {
    variant: {
      spinner: "",
      skeleton: "animate-pulse bg-muted",
    },
    size: {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    },
  },
  defaultVariants: {
    variant: "spinner",
    size: "md",
  },
});

const skeletonHeight: Record<string, string> = {
  sm: "h-2",
  md: "h-3",
  lg: "h-4",
};

export interface LoaderProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loaderVariants> {}

const Loader = React.forwardRef<HTMLDivElement, LoaderProps>(
  ({ className, variant = "spinner", size = "md", ...props }, ref) => {
    if (variant === "skeleton") {
      const skeletonHeightClass = skeletonHeight[size || "md"];

      return (
        <div
          ref={ref}
          className={cn(
            loaderVariants({ variant, size }),
            skeletonHeightClass,
            "w-full rounded",
            className,
          )}
          {...props}
        />
      );
    }

    // For spinner, render SVG inside a wrapper div
    return (
      <div ref={ref} role="status" className={cn(loaderVariants({ variant, size }), className)} {...props}>
        <svg
          className="animate-spin text-current h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-label="Loading"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  },
);
Loader.displayName = "Loader";

export { Loader, loaderVariants };
