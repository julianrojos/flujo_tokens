import { FigmaConnectionTestButton } from './figma-connection-test-button';

interface FigmaConnectionPanelProps {
  connectionStatusTitle: string;
}

export function FigmaConnectionPanel({
  connectionStatusTitle,
}: FigmaConnectionPanelProps) {
  return (
    <FigmaConnectionTestButton
      className="w-full"
      connectionStatusTitle={connectionStatusTitle}
    />
  );
}
