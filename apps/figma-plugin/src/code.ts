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
  FileInfoEventData,
  VariablesDataEventData,
  DocumentChangeEventData,
  SelectionChangeEventData,
  PageChangeEventData,
  ConsoleCaptureEventData,
  BridgePluginResponseMessage,
  BridgeError,
  isBridgeMethod,
  BridgeMethod,
} from './bridge';

// Show the plugin UI
figma.showUI(__html__, {
  width: 320,
  height: 460,
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
 * Forward file info to UI (for handshake).
 */
function forwardFileInfo(requestId: string): void {
  const selection = figma.currentPage.selection;
  const fileInfo: FileInfoEventData = {
    fileName: figma.root.name,
    fileKey: figma.fileKey || null,
    currentPage: figma.currentPage.name,
    currentPageId: figma.currentPage.id,
    selectionCount: selection ? selection.length : 0,
  };

  // Send to UI for bridge forwarding
  figma.ui.postMessage({
    type: 'BRIDGE_RESPONSE',
    requestId,
    success: true,
    result: fileInfo,
  } as BridgePluginResponseMessage);
}

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
 * Forward document change event to UI.
 */
function forwardDocumentChange(eventData: DocumentChangeEventData): void {
  figma.ui.postMessage({
    type: 'DOCUMENT_CHANGE',
    data: eventData,
  });
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

function extractLegacyParams(msg: Record<string, unknown>): Record<string, unknown> {
  if (typeof msg.params === 'object' && msg.params !== null) {
    return { ...(msg.params as Record<string, unknown>) };
  }

  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(msg)) {
    if (key === 'type' || key === 'requestId') {
      continue;
    }
    params[key] = value;
  }
  return params;
}

function buildLegacySuccessMessage(
  method: BridgeMethod,
  requestId: string,
  result: unknown
): Record<string, unknown> {
  if (method === 'GET_COMPONENT') {
    return {
      type: 'COMPONENT_DATA',
      requestId,
      data: result,
    };
  }

  if (method === 'GET_FILE_INFO') {
    return {
      type: 'GET_FILE_INFO_RESULT',
      requestId,
      success: true,
      fileInfo: result,
    };
  }

  if (method === 'REFRESH_VARIABLES' || method === 'GET_VARIABLES_DATA') {
    return {
      type: `${method}_RESULT`,
      requestId,
      success: true,
      data: result,
    };
  }

  const payload = asRecord(result);
  const response: Record<string, unknown> = {
    type: `${method}_RESULT`,
    requestId,
    ...(payload.success === undefined ? { success: true } : {}),
    ...payload,
  };

  return response;
}

function buildLegacyErrorMessage(
  method: BridgeMethod,
  requestId: string,
  message: string
): Record<string, unknown> {
  if (method === 'GET_COMPONENT') {
    return {
      type: 'COMPONENT_ERROR',
      requestId,
      error: message,
    };
  }

  return {
    type: `${method}_RESULT`,
    requestId,
    success: false,
    error: message,
  };
}

// ============================================================================
// Figma Event Listeners
// ============================================================================

// Document change listener - forwards changes for cache invalidation
figma.loadAllPagesAsync().then(() => {
  figma.on('documentchange', (event) => {
    let hasStyleChanges = false;
    let hasNodeChanges = false;
    const changedNodeIds: string[] = [];

    for (const change of event.documentChanges) {
      if (
        change.type === 'STYLE_CREATE' ||
        change.type === 'STYLE_DELETE' ||
        change.type === 'STYLE_PROPERTY_CHANGE'
      ) {
        hasStyleChanges = true;
      } else if (
        change.type === 'CREATE' ||
        change.type === 'DELETE' ||
        change.type === 'PROPERTY_CHANGE'
      ) {
        hasNodeChanges = true;
        if (change.id && changedNodeIds.length < 50) {
          changedNodeIds.push(change.id);
        }
      }
    }

    if (hasStyleChanges || hasNodeChanges) {
      forwardDocumentChange({
        hasStyleChanges,
        hasNodeChanges,
        changedNodeIds,
        changeCount: event.documentChanges.length,
        timestamp: Date.now(),
      });
    }
  });

  // Selection change listener - tracks user selection
  figma.on('selectionchange', () => {
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
  });

  // Page change listener - tracks current page
  figma.on('currentpagechange', () => {
    forwardPageChange({
      pageId: figma.currentPage.id,
      pageName: figma.currentPage.name,
      timestamp: Date.now(),
    });
  });

  console.log('[Plugin] Document change, selection, and page listeners registered');
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

  // Legacy command compatibility: direct method messages with requestId.
  if (messageType && isBridgeMethod(messageType)) {
    const requestId =
      typeof msg.requestId === 'string'
        ? msg.requestId
        : `legacy_${messageType.toLowerCase()}_${Date.now()}`;

    try {
      const response = await dispatchRequest({
        id: requestId,
        method: messageType,
        params: extractLegacyParams(msg),
      });

      if ('error' in response) {
        figma.ui.postMessage(
          buildLegacyErrorMessage(
            messageType,
            requestId,
            response.error.message
          )
        );
        return;
      }

      if (messageType === 'REFRESH_VARIABLES') {
        figma.ui.postMessage({
          type: 'VARIABLES_DATA',
          data: response.result,
        });
      }

      figma.ui.postMessage(
        buildLegacySuccessMessage(messageType, requestId, response.result)
      );
    } catch (error) {
      figma.ui.postMessage(
        buildLegacyErrorMessage(
          messageType,
          requestId,
          error instanceof Error ? error.message : String(error)
        )
      );
    }
    return;
  }

  // Handle standard UI messages
  switch (messageType) {
    case 'PORT_CHANGED':
      if (typeof msg.port === 'number') {
        console.log(`[Plugin] Port changed to ${msg.port}`);
        figma.notify(`MCP port switched to ${msg.port}`, { timeout: 3000 });
      }
      break;

    case 'ERROR':
      console.error(`[Plugin] UI error: ${msg.error}`);
      figma.notify(
        `MCP Error: ${typeof msg.error === 'string' ? msg.error : 'Unknown error'}`,
        { error: true }
      );
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
      figma.notify(
        `Sync failed: ${msg.error ?? 'Unknown error'}`,
        { error: true }
      );
      break;

    case 'START_BRIDGE':
      // Bridge runtime now lives in UI (ws-runtime.ts via useBridgeStatus).
      console.log('[Plugin] START_BRIDGE ignored (runtime managed by UI)');
      break;

    case 'STOP_BRIDGE':
      // Bridge runtime now lives in UI (ws-runtime.ts via useBridgeStatus).
      console.log('[Plugin] STOP_BRIDGE ignored (runtime managed by UI)');
      break;

    case 'GET_FILE_INFO':
      // UI requests file info for handshake (legacy, use BRIDGE_REQUEST instead)
      const requestId =
        typeof msg.requestId === 'string'
          ? msg.requestId
          : `fileinfo_${Date.now()}`;
      forwardFileInfo(requestId);
      break;

    case 'REFRESH_VARIABLES_REQUEST':
      // UI requests variables refresh
      forwardVariablesData();
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
