/**
 * Figma Plugin Code
 *
 * MCP Management Plugin - Controls dashboard MCP connection from Figma.
 */

// Show the plugin UI
figma.showUI(__html__, {
  width: 320,
  height: 460,
});

// Send document info to UI so it can show the design system name.
figma.ui.postMessage({
  type: 'INIT',
  docName: figma.root.name,
});

// Handle messages from UI
figma.ui.onmessage = (msg: { type: string; port?: number; error?: string; height?: number }) => {
  console.log('[Plugin] Message from UI:', msg);

  switch (msg.type) {
    case 'PORT_CHANGED':
      console.log(`[Plugin] Port changed to ${msg.port}`);
      figma.notify(`MCP port switched to ${msg.port}`, { timeout: 3000 });
      break;

    case 'ERROR':
      console.error(`[Plugin] UI error: ${msg.error}`);
      figma.notify(`MCP Error: ${msg.error}`, { error: true });
      break;

    case 'RESIZE':
      if (typeof msg.height === 'number' && msg.height > 0) {
        figma.ui.resize(320, msg.height);
      }
      break;

    case 'SYNC_COMPLETE':
      figma.notify('Tokens synced successfully ✓', { timeout: 3000 });
      break;

    case 'SYNC_ERROR':
      figma.notify(`Sync failed: ${msg.error ?? 'Unknown error'}`, { error: true });
      break;

    default:
      console.warn('[Plugin] Unknown message type:', msg.type);
  }
};

// Plugin cleanup
figma.on('close', () => {
  console.log('[Plugin] Plugin closed');
});
