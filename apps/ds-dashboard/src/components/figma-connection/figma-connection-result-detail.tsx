import type { FigmaMcpPingResult } from '@/lib/api';

interface FigmaConnectionResultDetailProps {
  result: FigmaMcpPingResult | null;
  showRecoveryStepper: boolean;
  showDetectedCounts: boolean;
  isPluginVersionMismatch: boolean;
  isNotConnected: boolean;
  apiHealthHref: string;
}

export function FigmaConnectionResultDetail({
  result,
  showRecoveryStepper,
  showDetectedCounts,
  isPluginVersionMismatch,
  isNotConnected,
  apiHealthHref,
}: FigmaConnectionResultDetailProps) {
  if (!result || showRecoveryStepper) return null;

  if (result.ok && result.connected) {
    return (
      <p className="break-words text-sm text-status-success">
        ✓ Connection successful
        {showDetectedCounts &&
        typeof result.collectionsDetected === 'number' &&
        typeof result.variablesDetected === 'number'
          ? ` — ${result.collectionsDetected} collections, ${result.variablesDetected} variables detected`
          : ''}
      </p>
    );
  }

  if (isPluginVersionMismatch) {
    return (
      <p className="break-words text-sm text-status-warning">
        ⚠ Plugin build mismatch. Reimport the DS Graph plugin so dashboard and plugin use the same
        protocol.
      </p>
    );
  }

  if (isNotConnected) {
    return (
      <p className="break-words text-sm text-status-warning">
        {result.everConnected ? (
          '⚠ Connection lost — reopen the DS Graph plugin to reconnect.'
        ) : (
          <>
            ⚠ No plugin heartbeat received yet. Make sure the dashboard is running with{' '}
            <code>npm run dashboard:dev</code>, then reload the DS Graph plugin, wait 5 seconds,
            and try <strong>Test connection</strong> again. You can quickly verify backend health
            at{' '}
            <a
              href={apiHealthHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2"
            >
              /api/health ↗
            </a>{' '}
            (404 on / can be normal).
          </>
        )}
      </p>
    );
  }

  return (
    <p className="break-words text-sm text-status-error">
      ✗ Connection failed{result.message ? ` — ${result.message}` : ''}
    </p>
  );
}
