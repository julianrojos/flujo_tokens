import type { McpConnectionState } from '@flujo/shared';

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
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-2 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur transition hover:bg-accent hover:text-foreground',
        collapsed && 'px-2',
      )}
      onClick={onClick}
      title={connectionStatusTitle}
      aria-label={`Figma connection: ${connectionStatusTitle}`}
    >
      <FigmaConnectionStatusDot snapshot={connectionState} />
      {collapsed ? null : <span>Figma connection</span>}
    </button>
  );
}
