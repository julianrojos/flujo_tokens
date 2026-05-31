import type { ConnectionHealth } from '@/hooks/use-figma-mcp-connection-test';
import { cn } from '@/lib/utils';

interface FigmaConnectionHealthSummaryProps {
  connectionHealth: ConnectionHealth;
}

export function FigmaConnectionHealthSummary({
  connectionHealth,
}: FigmaConnectionHealthSummaryProps) {
  return (
    <p
      className={cn(
        'break-words text-sm',
        connectionHealth.tone === 'success'
          ? 'text-status-success'
          : connectionHealth.tone === 'warning'
            ? 'text-status-warning'
            : connectionHealth.tone === 'error'
              ? 'text-status-error'
              : 'text-muted-foreground',
      )}
    >
      {connectionHealth.text}
    </p>
  );
}
