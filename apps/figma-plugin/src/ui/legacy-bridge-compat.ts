/**
 * Legacy MCP Management UI compatibility layer.
 *
 * Exposes the same window.* API used by MCP Management's CDP connector:
 * - window.executeCode(...)
 * - window.requestComponentData(...)
 * - window.updateVariable(...), etc.
 * - window.__figmaVariablesData / window.__figmaVariablesReady
 *
 * This allows our plugin UI to be used as a drop-in replacement for the
 * original /figma-desktop-bridge/ui.html contract.
 */

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PendingComponentRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type CompatMessage = {
  type?: string;
  requestId?: string;
  success?: boolean;
  error?: unknown;
  [key: string]: unknown;
};

interface LegacyCompatWindow extends Window {
  __figmaVariablesData?: unknown;
  __figmaVariablesReady?: boolean;
  __figmaComponentData?: unknown;
  __figmaComponentRequests?: Map<string, PendingComponentRequest>;
  __figmaPendingRequests?: Map<string, PendingRequest>;
  sendPluginCommand?: (type: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>;
  executeCode?: (code: string, timeout?: number) => Promise<unknown>;
  updateVariable?: (variableId: string, modeId: string, value: unknown) => Promise<unknown>;
  createVariable?: (
    name: string,
    collectionId: string,
    resolvedType: string,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  createVariableCollection?: (name: string, options?: Record<string, unknown>) => Promise<unknown>;
  deleteVariable?: (variableId: string) => Promise<unknown>;
  deleteVariableCollection?: (collectionId: string) => Promise<unknown>;
  renameVariable?: (variableId: string, newName: string) => Promise<unknown>;
  setVariableDescription?: (variableId: string, description: string) => Promise<unknown>;
  addMode?: (collectionId: string, modeName: string) => Promise<unknown>;
  renameMode?: (collectionId: string, modeId: string, newName: string) => Promise<unknown>;
  refreshVariables?: () => Promise<unknown>;
  getLocalComponents?: () => Promise<unknown>;
  instantiateComponent?: (componentKey: string, options?: Record<string, unknown>) => Promise<unknown>;
  requestComponentData?: (nodeId: string) => Promise<unknown>;
  setNodeDescription?: (
    nodeId: string,
    description: string,
    descriptionMarkdown?: string
  ) => Promise<unknown>;
  addComponentProperty?: (
    nodeId: string,
    propertyName: string,
    type: string,
    defaultValue: unknown,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  editComponentProperty?: (
    nodeId: string,
    propertyName: string,
    newValue: unknown
  ) => Promise<unknown>;
  deleteComponentProperty?: (nodeId: string, propertyName: string) => Promise<unknown>;
  resizeNode?: (
    nodeId: string,
    width: number,
    height: number,
    withConstraints?: boolean
  ) => Promise<unknown>;
  moveNode?: (nodeId: string, x: number, y: number) => Promise<unknown>;
  setNodeFills?: (nodeId: string, fills: unknown[]) => Promise<unknown>;
  setNodeStrokes?: (nodeId: string, strokes: unknown[], strokeWeight?: number) => Promise<unknown>;
  setNodeOpacity?: (nodeId: string, opacity: number) => Promise<unknown>;
  setNodeCornerRadius?: (nodeId: string, radius: number) => Promise<unknown>;
  cloneNode?: (nodeId: string) => Promise<unknown>;
  deleteNode?: (nodeId: string) => Promise<unknown>;
  renameNode?: (nodeId: string, newName: string) => Promise<unknown>;
  setTextContent?: (
    nodeId: string,
    text: string,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  createChildNode?: (
    parentId: string,
    nodeType: string,
    properties?: Record<string, unknown>
  ) => Promise<unknown>;
  captureScreenshot?: (nodeId?: string, options?: Record<string, unknown>) => Promise<unknown>;
  setInstanceProperties?: (nodeId: string, properties: Record<string, unknown>) => Promise<unknown>;
}

const COMPONENT_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15_000;
let requestIdCounter = 0;

const pendingRequests = new Map<string, PendingRequest>();
const pendingComponentRequests = new Map<string, PendingComponentRequest>();

const compatWindow = window as LegacyCompatWindow;
compatWindow.__figmaVariablesData = compatWindow.__figmaVariablesData ?? null;
compatWindow.__figmaVariablesReady = compatWindow.__figmaVariablesReady ?? false;
compatWindow.__figmaComponentData = compatWindow.__figmaComponentData ?? null;
compatWindow.__figmaPendingRequests = pendingRequests;
compatWindow.__figmaComponentRequests = pendingComponentRequests;

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

function sendPluginCommand(
  type: string,
  params: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = `${type.toLowerCase()}_${++requestIdCounter}_${Date.now()}`;

    const timeoutId = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`${type} request timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timeoutId });

    parent.postMessage(
      {
        pluginMessage: {
          type,
          requestId,
          ...params,
        },
      },
      '*',
    );
  });
}

function withStandardError<T>(promise: Promise<T>): Promise<T | { success: false; error: string }> {
  return promise.catch((error) => ({
    success: false,
    error: toErrorMessage(error, 'Unknown error'),
  }));
}

function setupLegacyFunctions(): void {
  compatWindow.sendPluginCommand = sendPluginCommand;

  compatWindow.executeCode = (code, timeout = 5_000) =>
    withStandardError(
      sendPluginCommand('EXECUTE_CODE', { code, timeout }, timeout + 2_000) as Promise<unknown>
    );
  compatWindow.updateVariable = (variableId, modeId, value) =>
    withStandardError(sendPluginCommand('UPDATE_VARIABLE', { variableId, modeId, value }) as Promise<unknown>);
  compatWindow.createVariable = (name, collectionId, resolvedType, options = {}) =>
    withStandardError(
      sendPluginCommand('CREATE_VARIABLE', { name, collectionId, resolvedType, ...options }) as Promise<unknown>
    );
  compatWindow.createVariableCollection = (name, options = {}) =>
    withStandardError(sendPluginCommand('CREATE_VARIABLE_COLLECTION', { name, ...options }) as Promise<unknown>);
  compatWindow.deleteVariable = (variableId) =>
    withStandardError(sendPluginCommand('DELETE_VARIABLE', { variableId }) as Promise<unknown>);
  compatWindow.deleteVariableCollection = (collectionId) =>
    withStandardError(sendPluginCommand('DELETE_VARIABLE_COLLECTION', { collectionId }) as Promise<unknown>);
  compatWindow.renameVariable = (variableId, newName) =>
    withStandardError(sendPluginCommand('RENAME_VARIABLE', { variableId, newName }) as Promise<unknown>);
  compatWindow.setVariableDescription = (variableId, description) =>
    withStandardError(sendPluginCommand('SET_VARIABLE_DESCRIPTION', { variableId, description }) as Promise<unknown>);
  compatWindow.addMode = (collectionId, modeName) =>
    withStandardError(sendPluginCommand('ADD_MODE', { collectionId, modeName }) as Promise<unknown>);
  compatWindow.renameMode = (collectionId, modeId, newName) =>
    withStandardError(sendPluginCommand('RENAME_MODE', { collectionId, modeId, newName }) as Promise<unknown>);
  compatWindow.refreshVariables = () =>
    withStandardError(sendPluginCommand('REFRESH_VARIABLES', {}, 300_000) as Promise<unknown>);

  compatWindow.getLocalComponents = () =>
    withStandardError(sendPluginCommand('GET_LOCAL_COMPONENTS', {}, 300_000) as Promise<unknown>);
  compatWindow.instantiateComponent = (componentKey, options = {}) =>
    withStandardError(
      sendPluginCommand('INSTANTIATE_COMPONENT', { componentKey, ...options }) as Promise<unknown>
    );
  compatWindow.requestComponentData = (nodeId) =>
    new Promise((resolve, reject) => {
      const requestId = `component_${++requestIdCounter}_${Date.now()}`;
      const timeoutId = setTimeout(() => {
        if (pendingComponentRequests.has(requestId)) {
          pendingComponentRequests.delete(requestId);
          reject(new Error('Component request timed out'));
        }
      }, COMPONENT_TIMEOUT_MS);

      pendingComponentRequests.set(requestId, { resolve, reject, timeoutId });
      parent.postMessage(
        {
          pluginMessage: {
            type: 'GET_COMPONENT',
            requestId,
            nodeId,
          },
        },
        '*',
      );
    });
  compatWindow.setNodeDescription = (nodeId, description, descriptionMarkdown) =>
    withStandardError(
      sendPluginCommand('SET_NODE_DESCRIPTION', { nodeId, description, descriptionMarkdown }) as Promise<unknown>
    );
  compatWindow.addComponentProperty = (
    nodeId,
    propertyName,
    type,
    defaultValue,
    options = {}
  ) =>
    withStandardError(
      sendPluginCommand('ADD_COMPONENT_PROPERTY', {
        nodeId,
        propertyName,
        propertyType: type,
        defaultValue,
        ...options,
      }) as Promise<unknown>
    );
  compatWindow.editComponentProperty = (nodeId, propertyName, newValue) =>
    withStandardError(
      sendPluginCommand('EDIT_COMPONENT_PROPERTY', { nodeId, propertyName, newValue }) as Promise<unknown>
    );
  compatWindow.deleteComponentProperty = (nodeId, propertyName) =>
    withStandardError(sendPluginCommand('DELETE_COMPONENT_PROPERTY', { nodeId, propertyName }) as Promise<unknown>);

  compatWindow.resizeNode = (nodeId, width, height, withConstraints = true) =>
    withStandardError(
      sendPluginCommand('RESIZE_NODE', { nodeId, width, height, withConstraints }) as Promise<unknown>
    );
  compatWindow.moveNode = (nodeId, x, y) =>
    withStandardError(sendPluginCommand('MOVE_NODE', { nodeId, x, y }) as Promise<unknown>);
  compatWindow.setNodeFills = (nodeId, fills) =>
    withStandardError(sendPluginCommand('SET_NODE_FILLS', { nodeId, fills }) as Promise<unknown>);
  compatWindow.setNodeStrokes = (nodeId, strokes, strokeWeight) =>
    withStandardError(
      sendPluginCommand('SET_NODE_STROKES', { nodeId, strokes, strokeWeight }) as Promise<unknown>
    );
  compatWindow.setNodeOpacity = (nodeId, opacity) =>
    withStandardError(sendPluginCommand('SET_NODE_OPACITY', { nodeId, opacity }) as Promise<unknown>);
  compatWindow.setNodeCornerRadius = (nodeId, radius) =>
    withStandardError(sendPluginCommand('SET_NODE_CORNER_RADIUS', { nodeId, radius }) as Promise<unknown>);
  compatWindow.cloneNode = (nodeId) =>
    withStandardError(sendPluginCommand('CLONE_NODE', { nodeId }) as Promise<unknown>);
  compatWindow.deleteNode = (nodeId) =>
    withStandardError(sendPluginCommand('DELETE_NODE', { nodeId }) as Promise<unknown>);
  compatWindow.renameNode = (nodeId, newName) =>
    withStandardError(sendPluginCommand('RENAME_NODE', { nodeId, newName }) as Promise<unknown>);
  compatWindow.setTextContent = (nodeId, text, options = {}) =>
    withStandardError(sendPluginCommand('SET_TEXT_CONTENT', { nodeId, text, ...options }) as Promise<unknown>);
  compatWindow.createChildNode = (parentId, nodeType, properties = {}) =>
    withStandardError(sendPluginCommand('CREATE_CHILD_NODE', { parentId, nodeType, properties }) as Promise<unknown>);

  compatWindow.captureScreenshot = (nodeId, options = {}) =>
    withStandardError(sendPluginCommand('CAPTURE_SCREENSHOT', { nodeId, ...options }, 30_000) as Promise<unknown>);
  compatWindow.setInstanceProperties = (nodeId, properties) =>
    withStandardError(sendPluginCommand('SET_INSTANCE_PROPERTIES', { nodeId, properties }) as Promise<unknown>);
}

function handleCompatResultMessage(msg: CompatMessage): void {
  if (typeof msg.requestId !== 'string') {
    return;
  }

  const componentPending = pendingComponentRequests.get(msg.requestId);
  if (componentPending && (msg.type === 'COMPONENT_DATA' || msg.type === 'COMPONENT_ERROR')) {
    clearTimeout(componentPending.timeoutId);
    pendingComponentRequests.delete(msg.requestId);
    if (msg.type === 'COMPONENT_DATA') {
      compatWindow.__figmaComponentData = msg.data ?? null;
      componentPending.resolve(msg.data ?? null);
    } else {
      componentPending.reject(new Error(toErrorMessage(msg.error, 'Component request failed')));
    }
    return;
  }

  const pending = pendingRequests.get(msg.requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingRequests.delete(msg.requestId);

  const success = Boolean(msg.success);
  if (!success) {
    pending.resolve({
      success: false,
      error: toErrorMessage(msg.error, 'Unknown error'),
    });
    return;
  }

  const payload: Record<string, unknown> = { success: true };
  for (const [key, value] of Object.entries(msg)) {
    if (key === 'type' || key === 'requestId' || key === 'success') {
      continue;
    }
    payload[key] = value;
  }

  pending.resolve(payload);
}

function setupMessageListener(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    const pluginMessage = event.data?.pluginMessage as CompatMessage | undefined;
    if (!pluginMessage || typeof pluginMessage.type !== 'string') {
      return;
    }

    if (pluginMessage.type === 'VARIABLES_DATA') {
      compatWindow.__figmaVariablesData = pluginMessage.data ?? null;
      compatWindow.__figmaVariablesReady = true;
      return;
    }

    if (pluginMessage.type === 'ERROR') {
      compatWindow.__figmaVariablesReady = false;
      return;
    }

    if (
      pluginMessage.type === 'COMPONENT_DATA' ||
      pluginMessage.type === 'COMPONENT_ERROR' ||
      pluginMessage.type.endsWith('_RESULT')
    ) {
      handleCompatResultMessage(pluginMessage);
    }
  });
}

setupLegacyFunctions();
setupMessageListener();
