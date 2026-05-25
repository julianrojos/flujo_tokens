import type { McpConnectionState } from '@flujo/shared';
import { Plug2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FigmaConnectionStatusDot, getConnectionStatusTitle } from '@/components/ui/connection-status-dot';
import { cn } from '@/lib/utils';

interface FigmaConnectionIconButtonProps {
  connectionState: McpConnectionState;
  onClick: () => void;
  className?: string;
  dotClassName?: string;
}

export function FigmaConnectionIconButton({
  connectionState,
  onClick,
  className,
  dotClassName,
}: FigmaConnectionIconButtonProps) {
  const connectionStatusTitle = getConnectionStatusTitle(connectionState);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      onClick={onClick}
      title={`Figma connection: ${connectionStatusTitle}`}
      aria-label={`Figma connection: ${connectionStatusTitle}`}
    >
      <Plug2 className="h-4 w-4" aria-hidden="true" />
      <FigmaConnectionStatusDot
        snapshot={connectionState}
        className={cn("absolute bottom-1 right-1 h-2 w-2 ring-2 ring-card", dotClassName)}
      />
    </Button>
  );
}
