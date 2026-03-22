import type { ReactNode } from "react";

import type { ApiErrorDisplay } from "@/lib/api-error-ux";
import { cn } from "@/lib/utils";

type ApiErrorMessageTone = "error" | "warning";

interface ApiErrorMessageProps {
  error: ApiErrorDisplay;
  tone?: ApiErrorMessageTone;
  className?: string;
  children?: ReactNode;
}

const toneClasses: Record<ApiErrorMessageTone, string> = {
  error: "border-status-error-border/40 bg-status-error-bg/20 text-status-error",
  warning: "border-status-warning-border/40 bg-status-warning-bg/20 text-status-warning",
};

export function ApiErrorMessage({
  error,
  tone = "error",
  className,
  children,
}: ApiErrorMessageProps) {
  return (
    <div className={cn("rounded-md border p-3 text-sm", toneClasses[tone], className)}>
      <div className="font-medium">{error.title}</div>
      <div className="mt-1">{error.message}</div>
      {error.action ? (
        <div className="mt-2 text-xs opacity-80">
          Suggested action: {error.action}
        </div>
      ) : null}
      {children}
      {error.code ? (
        <div className="mt-2 text-[11px] opacity-80">
          Code: {error.code}
          {error.requestId ? ` · Request: ${error.requestId}` : ""}
        </div>
      ) : null}
    </div>
  );
}
