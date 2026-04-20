/**
 * Figma plugin main entrypoint with WebSocket bridge integration.
 *
 * This plugin provides:
 * 1. MCP UI for designers
 * 2. WebSocket bridge to the dashboard server
 *
 * Bridge data flow: code.ts <-> postMessage <-> UI (ws-runtime) <-> WebSocket <-> Server
 */

import {
  dispatchRequest,
  VariablesDataEventData,
  SelectionChangeEventData,
  PageChangeEventData,
  ConsoleCaptureEventData,
  BridgePluginResponseMessage,
  BridgeError,
} from './bridge';
import { PLUGIN_UI_HEIGHT, PLUGIN_UI_WIDTH } from './shared/ui-dimensions';

// Show the plugin UI
figma.showUI(__html__, {
  width: PLUGIN_UI_WIDTH,
  height: PLUGIN_UI_HEIGHT,
});

// Send document info to UI so it can show the design system name.
figma.ui.postMessage({
  type: 'INIT',
  docName: figma.root.name,
  fileKey: figma.fileKey || null,
});

// ============================================================================
// Bridge Event Forwarding - Figma Events -> WebSocket
// ============================================================================

/**
 * Forward variables data to UI.
 */
async function forwardVariablesData(): Promise<void> {
  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    const variablesData: VariablesDataEventData = {
      success: true,
      timestamp: Date.now(),
      fileKey: figma.fileKey || null,
      variables: variables.map((v) => ({
        id: v.id,
        name: v.name,
        key: v.key,
        resolvedType: v.resolvedType,
        valuesByMode: v.valuesByMode,
        variableCollectionId: v.variableCollectionId,
        scopes: v.scopes,
        description: v.description,
        hiddenFromPublishing: v.hiddenFromPublishing,
      })),
      variableCollections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        key: c.key,
        modes: c.modes,
        defaultModeId: c.defaultModeId,
        variableIds: c.variableIds,
      })),
    };

    figma.ui.postMessage({
      type: 'VARIABLES_DATA',
      data: variablesData,
    });
  } catch (error) {
    console.error('[Plugin] Error forwarding variables:', error);
    figma.ui.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Forward selection change event to UI.
 */
function forwardSelectionChange(eventData: SelectionChangeEventData): void {
  figma.ui.postMessage({
    type: 'SELECTION_CHANGE',
    data: eventData,
  });
}

function publishCurrentSelection(): void {
  const selection = figma.currentPage.selection;
  const selectedNodes = selection.slice(0, 50).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
  }));

  forwardSelectionChange({
    nodes: selectedNodes,
    count: selection.length,
    page: figma.currentPage.name,
    timestamp: Date.now(),
  });
}

/**
 * Forward page change event to UI.
 */
function forwardPageChange(eventData: PageChangeEventData): void {
  figma.ui.postMessage({
    type: 'PAGE_CHANGE',
    data: eventData,
  });
}

/**
 * Forward console capture event to UI.
 */
function forwardConsoleCapture(eventData: ConsoleCaptureEventData): void {
  figma.ui.postMessage({
    type: 'CONSOLE_CAPTURE',
    ...eventData,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}


// ============================================================================
// Figma Event Listeners
// ============================================================================

figma.loadAllPagesAsync().then(() => {
  // Selection change listener - tracks user selection
  figma.on('selectionchange', () => {
    publishCurrentSelection();
  });

  // Page change listener - tracks current page
  figma.on('currentpagechange', () => {
    publishCurrentSelection();
    forwardPageChange({
      pageId: figma.currentPage.id,
      pageName: figma.currentPage.name,
      timestamp: Date.now(),
    });
  });

  publishCurrentSelection();
  console.log('[Plugin] Selection and page listeners registered');
}).catch((err) => {
  console.warn('[Plugin] Could not register event listeners:', err);
});

// ============================================================================
// Console Capture - Intercept console.* and forward to UI
// ============================================================================

(function setupConsoleCapture() {
  const levels: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> = [
    'log',
    'info',
    'warn',
    'error',
    'debug',
  ];
  const originals: Record<string, typeof console.log> = {};

  for (const level of levels) {
    originals[level] = console[level];
  }

  function safeSerialize(val: unknown): unknown {
    if (val === null || val === undefined) return val;
    if (
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean'
    )
      return val;
    try {
      return JSON.parse(JSON.stringify(val));
    } catch {
      return String(val);
    }
  }

  for (const level of levels) {
    console[level] = function () {
      const args = Array.prototype.slice.call(arguments) as unknown[];
      // Call original so output still appears in Figma DevTools
      originals[level].apply(console, args);

      // Serialize arguments safely
      const serializedArgs = args.map(safeSerialize);

      // Build message text
      const messageParts = args.map((arg) =>
        typeof arg === 'string' ? arg : String(arg)
      );

      forwardConsoleCapture({
        level,
        message: messageParts.join(' '),
        args: serializedArgs,
        timestamp: Date.now(),
      });
    };
  }
})();

// ============================================================================
// UI Message Handler
// ============================================================================

figma.ui.onmessage = async (
  rawMessage: unknown
) => {
  const msg = asRecord(rawMessage);
  const messageType = typeof msg.type === 'string' ? msg.type : '';
  console.log('[Plugin] Message from UI:', msg);

  // Handle BRIDGE_REQUEST from ws-runtime (server requests forwarded to code.ts)
  if (
    messageType === 'BRIDGE_REQUEST' &&
    typeof msg.requestId === 'string' &&
    typeof msg.method === 'string'
  ) {
    try {
      const response = await dispatchRequest({
        id: msg.requestId,
        method: msg.method as import('./bridge').BridgeMethod,
        params:
          typeof msg.params === 'object' && msg.params !== null
            ? (msg.params as Record<string, unknown>)
            : {},
      });

      const bridgeResponse: BridgePluginResponseMessage = {
        type: 'BRIDGE_RESPONSE',
        requestId: msg.requestId,
        success: !('error' in response),
        result: 'result' in response ? response.result : undefined,
        error: 'error' in response ? response.error : undefined,
      };

      figma.ui.postMessage(bridgeResponse);
    } catch (error) {
      const bridgeError: BridgeError = {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
      };

      figma.ui.postMessage({
        type: 'BRIDGE_RESPONSE',
        requestId: msg.requestId,
        success: false,
        error: bridgeError,
      } as BridgePluginResponseMessage);
    }
    return;
  }

  // Handle standard UI messages
  switch (messageType) {
    case 'ERROR':
      console.error(`[Plugin] UI error: ${msg.error}`);
      figma.notify(
        `MCP Error: ${typeof msg.error === 'string' ? msg.error : 'Unknown error'}`,
        { error: true }
      );
      break;

    default:
      console.warn('[Plugin] Unknown message type:', messageType);
  }
};

// ============================================================================
// Initialization - Fetch and send initial data
// ============================================================================

(async function initialize() {
  try {
    console.log('[Plugin] Initializing...');

    // Fetch and send initial variables data
    await forwardVariablesData();

    console.log('[Plugin] Initialization complete');
  } catch (error) {
    console.error('[Plugin] Initialization error:', error);
    figma.ui.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
  }
})();

// ============================================================================
// Plugin Cleanup
// ============================================================================

figma.on('close', () => {
  console.log('[Plugin] Plugin closed');
});
