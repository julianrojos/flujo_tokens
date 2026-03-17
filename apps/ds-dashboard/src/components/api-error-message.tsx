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
  error: "border-red-500/40 bg-red-500/10 text-red-700",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700",
};

const toneSubtleClasses: Record<ApiErrorMessageTone, string> = {
  error: "text-red-700/80",
  warning: "text-amber-700/80",
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
        <div className={cn("mt-2 text-xs", toneSubtleClasses[tone])}>
          Suggested action: {error.action}
        </div>
      ) : null}
      {children}
      {error.code ? (
        <div className={cn("mt-2 text-[11px]", toneSubtleClasses[tone])}>
          Code: {error.code}
          {error.requestId ? ` · Request: ${error.requestId}` : ""}
        </div>
      ) : null}
    </div>
  );
}
