import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { getMcpConnectionStateCopy, type McpConnectionState } from '@flujo/shared';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const connectionStatusDotVariants = cva(
  'inline-flex shrink-0 rounded-full transition-colors',
  {
    variants: {
      tone: {
        success: 'bg-status-success',
        warning: 'bg-status-warning',
        error: 'bg-status-error',
      },
      size: {
        sm: 'h-[10px] w-[10px]',
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

export interface FigmaConnectionStatusDotProps
  extends VariantProps<typeof connectionStatusDotVariants> {
  snapshot: McpConnectionState;
  className?: string;
}

export const FigmaConnectionStatusDot = React.forwardRef<
  HTMLSpanElement,
  FigmaConnectionStatusDotProps
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
FigmaConnectionStatusDot.displayName = 'FigmaConnectionStatusDot';
