import { FigmaConnectionTestButton } from './figma-connection-test-button';

export function FigmaConnectionPanel() {
  return (
    <div className="space-y-5 p-5">
      <p className="text-sm text-muted-foreground">
        Test the plugin session and inspect the current connection state.
      </p>

      <FigmaConnectionTestButton className="w-full" showDesignContextCompact />
    </div>
  );
}
