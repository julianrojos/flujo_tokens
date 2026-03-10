/**
 * React Entry Point
 */

import { createRoot } from 'react-dom/client';
import App from './App';
import './legacy-bridge-compat';

function reportUiError(message: string): void {
  try {
    parent.postMessage({ pluginMessage: { type: 'ERROR', error: `UI runtime: ${message}` } }, '*');
  } catch {
    // no-op
  }
}

window.addEventListener('error', (event) => {
  reportUiError(event.message || 'Unknown window error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  reportUiError(reason || 'Unknown unhandled rejection');
});

const container = document.getElementById('root');
if (container) {
  try {
    const root = createRoot(container);
    root.render(<App />);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportUiError(message || 'Failed to render app');
  }
}
