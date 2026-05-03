import { FigmaConnectionTestButton } from './figma-connection-test-button';

interface FigmaConnectionPanelProps {
  connectionStatusTitle: string;
}

export function FigmaConnectionPanel({
  connectionStatusTitle,
}: FigmaConnectionPanelProps) {
  return (
    <div className="space-y-5 p-5">
      <p className="text-sm text-muted-foreground">{connectionStatusTitle}</p>

      <FigmaConnectionTestButton className="w-full" showDesignContextCompact />
    </div>
  );
}
