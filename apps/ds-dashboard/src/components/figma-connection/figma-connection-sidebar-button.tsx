import type { McpConnectionState } from '@flujo/shared';

import { Button } from '@/components/ui/button';
import { FigmaConnectionStatusDot, getConnectionStatusTitle } from '@/components/ui/connection-status-dot';
import { cn } from '@/lib/utils';

interface FigmaConnectionSidebarButtonProps {
  connectionState: McpConnectionState;
  collapsed: boolean;
  onClick: () => void;
}

export function FigmaConnectionSidebarButton({
  connectionState,
  collapsed,
  onClick,
}: FigmaConnectionSidebarButtonProps) {
  const connectionStatusTitle = getConnectionStatusTitle(connectionState);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-auto gap-1.5 rounded-full border border-border/70 bg-sidebar/80 px-3 py-2 text-sidebar-foreground shadow-sm backdrop-blur hover:bg-sidebar/90 hover:text-sidebar-foreground',
        collapsed && 'px-2',
      )}
      onClick={onClick}
      title={connectionStatusTitle}
      aria-label={`Figma connection: ${connectionStatusTitle}`}
    >
      <FigmaConnectionStatusDot snapshot={connectionState} />
      {collapsed ? null : <span>Figma connection</span>}
    </Button>
  );
}
