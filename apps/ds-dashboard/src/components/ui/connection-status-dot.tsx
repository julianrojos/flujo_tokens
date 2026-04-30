import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { getMcpConnectionStateCopy, type McpConnectionState } from '@flujo/shared';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const connectionStatusDotVariants = cva(
  'inline-flex shrink-0 rounded-full ring-1 ring-border/40 transition-colors',
  {
    variants: {
      tone: {
        success: 'bg-status-success',
        warning: 'bg-status-warning',
        error: 'bg-status-error',
      },
      size: {
        sm: 'h-1.5 w-1.5',
        md: 'h-2 w-2',
      },
    },
    defaultVariants: {
      tone: 'warning',
      size: 'sm',
    },
  },
);

// ---------------------------------------------------------------------------
// Helpers (exported for tests and external consumers)
// ---------------------------------------------------------------------------

export function getConnectionStatusTone(
  state: McpConnectionState['state'],
): 'success' | 'warning' | 'error' {
  if (state === 'connected') return 'success';
  if (state === 'disconnected') return 'error';
  return 'warning';
}

export function getConnectionStatusTitle(snapshot: McpConnectionState): string {
  const copy = getMcpConnectionStateCopy(snapshot.state);
  return copy.sublabel ? `${copy.label}: ${copy.sublabel}` : copy.label;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FigmaMcpConnectionStatusDotProps
  extends VariantProps<typeof connectionStatusDotVariants> {
  snapshot: McpConnectionState;
  className?: string;
}

export const FigmaMcpConnectionStatusDot = React.forwardRef<
  HTMLSpanElement,
  FigmaMcpConnectionStatusDotProps
>(({ snapshot, size, className }, ref) => {
  const tone = getConnectionStatusTone(snapshot.state);
  const copy = getMcpConnectionStateCopy(snapshot.state);
  const title = getConnectionStatusTitle(snapshot);

  return (
    <span
      ref={ref}
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        connectionStatusDotVariants({ tone, size }),
        snapshot.state === 'connecting' && 'animate-pulse',
        className,
      )}
      data-state={snapshot.state}
      data-tone={tone}
      data-label={copy.label}
    />
  );
});
FigmaMcpConnectionStatusDot.displayName = 'FigmaMcpConnectionStatusDot';
