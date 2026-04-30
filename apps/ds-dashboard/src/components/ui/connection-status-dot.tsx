import {
  getMcpConnectionStateCopy,
  type McpConnectionState,
  type McpConnectionStateValue,
} from '@flujo/shared';

import { cn } from '@/lib/utils';

const toneClassByState: Record<McpConnectionStateValue, string> = {
  connected: 'bg-status-success',
  connecting: 'bg-status-warning',
  disconnected: 'bg-status-error',
  mismatch: 'bg-status-warning',
  fallback: 'bg-status-warning',
};

export function getConnectionStatusTone(state: McpConnectionStateValue): 'success' | 'warning' | 'error' {
  switch (state) {
    case 'connected':
      return 'success';
    case 'disconnected':
      return 'error';
    default:
      return 'warning';
  }
}

export function getConnectionStatusTitle(snapshot: McpConnectionState): string {
  const copy = getMcpConnectionStateCopy(snapshot.state);
  return copy.sublabel ? `${copy.label}: ${copy.sublabel}` : copy.label;
}

interface FigmaMcpConnectionStatusDotProps {
  snapshot: McpConnectionState;
  className?: string;
}

export function FigmaMcpConnectionStatusDot({
  snapshot,
  className,
}: FigmaMcpConnectionStatusDotProps) {
  const tone = getConnectionStatusTone(snapshot.state);
  const copy = getMcpConnectionStateCopy(snapshot.state);
  const title = getConnectionStatusTitle(snapshot);

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        'inline-flex h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-border/40 transition-colors',
        toneClassByState[snapshot.state],
        snapshot.state === 'connecting' && 'animate-pulse',
        className,
      )}
      data-state={snapshot.state}
      data-tone={tone}
      data-label={copy.label}
    />
  );
}
