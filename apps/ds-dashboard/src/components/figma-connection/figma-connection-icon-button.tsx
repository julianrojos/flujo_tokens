import type { McpConnectionState } from '@flujo/shared';
import { Plug2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FigmaConnectionStatusDot, getConnectionStatusTitle } from '@/components/ui/connection-status-dot';

interface FigmaConnectionIconButtonProps {
  connectionState: McpConnectionState;
  onClick: () => void;
}

export function FigmaConnectionIconButton({
  connectionState,
  onClick,
}: FigmaConnectionIconButtonProps) {
  const connectionStatusTitle = getConnectionStatusTitle(connectionState);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative text-muted-foreground"
      onClick={onClick}
      title={`Figma connection: ${connectionStatusTitle}`}
      aria-label={`Figma connection: ${connectionStatusTitle}`}
    >
      <Plug2 className="h-4 w-4" aria-hidden="true" />
      <FigmaConnectionStatusDot
        snapshot={connectionState}
        className="absolute bottom-1 right-1 h-2 w-2 ring-2 ring-card"
      />
    </Button>
  );
}
