/**
 * Bridge Dispatcher
 *
 * Routes incoming WebSocket requests to appropriate handlers.
 * Each method returns a deterministic success/error response.
 * Errors in one handler do not affect the bridge runtime.
 *
 * This module is pure - no window.* or DOM APIs.
 */

import {
  WSRequest,
  WSResponseSuccess,
  WSResponseError,
  BridgeMethod,
  BridgeError,
  createBridgeError,
  ERROR_CODES,
  BRIDGE_METHODS,
} from './protocol';

// Import all handlers
import { handleGetFileInfo } from './handlers/get-file-info';
import { handleExecuteCode } from './handlers/execute-code';
import {
  handleGetVariablesData,
  handleRefreshVariables,
  handleUpdateVariable,
  handleCreateVariable,
  handleDeleteVariable,
  handleRenameVariable,
  handleSetVariableDescription,
} from './handlers/variables';
import { handleGetLocalStyles } from './handlers/styles';
import {
  handleAddMode,
  handleRenameMode,
  handleCreateVariableCollection,
  handleDeleteVariableCollection,
} from './handlers/modes-collections';
import { handleClearConsole, handleReloadUI } from './handlers/control';
import {
  handleGetLocalComponents,
  handleGetComponent,
  handleInstantiateComponent,
  handleSetNodeDescription,
  handleAddComponentProperty,
  handleEditComponentProperty,
  handleDeleteComponentProperty,
  handleSetInstanceProperties,
} from './handlers/components';
import {
  handleResizeNode,
  handleMoveNode,
  handleSetNodeFills,
  handleSetNodeStrokes,
  handleSetNodeOpacity,
  handleSetNodeCornerRadius,
  handleCloneNode,
  handleDeleteNode,
  handleRenameNode,
  handleSetTextContent,
  handleCreateChildNode,
  handleCaptureScreenshot,
} from './handlers/nodes';

/**
 * Type for handler functions.
 */
type HandlerFunction = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * Map of method names to handler functions.
 */
const HANDLERS: Record<BridgeMethod, HandlerFunction> = {
  [BRIDGE_METHODS.GET_FILE_INFO]: handleGetFileInfo as unknown as HandlerFunction,
  [BRIDGE_METHODS.EXECUTE_CODE]: handleExecuteCode as unknown as HandlerFunction,
  [BRIDGE_METHODS.GET_VARIABLES_DATA]: handleGetVariablesData as unknown as HandlerFunction,
  [BRIDGE_METHODS.GET_LOCAL_STYLES]: handleGetLocalStyles as unknown as HandlerFunction,
  [BRIDGE_METHODS.REFRESH_VARIABLES]: handleRefreshVariables as unknown as HandlerFunction,
  [BRIDGE_METHODS.UPDATE_VARIABLE]: handleUpdateVariable as unknown as HandlerFunction,
  [BRIDGE_METHODS.CREATE_VARIABLE]: handleCreateVariable as unknown as HandlerFunction,
  [BRIDGE_METHODS.DELETE_VARIABLE]: handleDeleteVariable as unknown as HandlerFunction,
  [BRIDGE_METHODS.RENAME_VARIABLE]: handleRenameVariable as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_VARIABLE_DESCRIPTION]: handleSetVariableDescription as unknown as HandlerFunction,
  [BRIDGE_METHODS.ADD_MODE]: handleAddMode as unknown as HandlerFunction,
  [BRIDGE_METHODS.RENAME_MODE]: handleRenameMode as unknown as HandlerFunction,
  [BRIDGE_METHODS.CREATE_VARIABLE_COLLECTION]:
    handleCreateVariableCollection as unknown as HandlerFunction,
  [BRIDGE_METHODS.DELETE_VARIABLE_COLLECTION]:
    handleDeleteVariableCollection as unknown as HandlerFunction,
  // Components (P1)
  [BRIDGE_METHODS.GET_LOCAL_COMPONENTS]: handleGetLocalComponents as unknown as HandlerFunction,
  [BRIDGE_METHODS.GET_COMPONENT]: handleGetComponent as unknown as HandlerFunction,
  [BRIDGE_METHODS.INSTANTIATE_COMPONENT]: handleInstantiateComponent as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_NODE_DESCRIPTION]: handleSetNodeDescription as unknown as HandlerFunction,
  [BRIDGE_METHODS.ADD_COMPONENT_PROPERTY]: handleAddComponentProperty as unknown as HandlerFunction,
  [BRIDGE_METHODS.EDIT_COMPONENT_PROPERTY]: handleEditComponentProperty as unknown as HandlerFunction,
  [BRIDGE_METHODS.DELETE_COMPONENT_PROPERTY]: handleDeleteComponentProperty as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_INSTANCE_PROPERTIES]: handleSetInstanceProperties as unknown as HandlerFunction,
  // Node manipulation (P1)
  [BRIDGE_METHODS.RESIZE_NODE]: handleResizeNode as unknown as HandlerFunction,
  [BRIDGE_METHODS.MOVE_NODE]: handleMoveNode as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_NODE_FILLS]: handleSetNodeFills as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_NODE_STROKES]: handleSetNodeStrokes as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_NODE_OPACITY]: handleSetNodeOpacity as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_NODE_CORNER_RADIUS]: handleSetNodeCornerRadius as unknown as HandlerFunction,
  [BRIDGE_METHODS.CLONE_NODE]: handleCloneNode as unknown as HandlerFunction,
  [BRIDGE_METHODS.DELETE_NODE]: handleDeleteNode as unknown as HandlerFunction,
  [BRIDGE_METHODS.RENAME_NODE]: handleRenameNode as unknown as HandlerFunction,
  [BRIDGE_METHODS.SET_TEXT_CONTENT]: handleSetTextContent as unknown as HandlerFunction,
  [BRIDGE_METHODS.CREATE_CHILD_NODE]: handleCreateChildNode as unknown as HandlerFunction,
  // Screenshot (P1)
  [BRIDGE_METHODS.CAPTURE_SCREENSHOT]: handleCaptureScreenshot as unknown as HandlerFunction,
  // Control
  [BRIDGE_METHODS.CLEAR_CONSOLE]: handleClearConsole as unknown as HandlerFunction,
  [BRIDGE_METHODS.RELOAD_UI]: handleReloadUI as unknown as HandlerFunction,
};

/**
 * Dispatch a WebSocket request to the appropriate handler.
 *
 * @param request - The incoming WS request
 * @returns A WSResponse (success or error)
 */
export async function dispatchRequest(request: WSRequest): Promise<WSResponseSuccess | WSResponseError> {
  const { id, method, params } = request;

  // Check if method is supported
  if (!isSupportedMethod(method)) {
    return {
      id,
      error: createBridgeError(
        ERROR_CODES.UNKNOWN_METHOD,
        `Unknown method: ${method}`
      ),
    };
  }

  const handler = HANDLERS[method];

  try {
    // Execute the handler
    const result = await handler(params);

    return {
      id,
      result,
    };
  } catch (error) {
    // Handler threw an error - convert to BridgeError if needed
    let bridgeError: BridgeError;

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error
    ) {
      bridgeError = error as BridgeError;
    } else {
      bridgeError = createBridgeError(
        ERROR_CODES.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    console.error(`[Bridge] Handler error for ${method}:`, bridgeError);

    return {
      id,
      error: bridgeError,
    };
  }
}

/**
 * Check if a method string is a supported bridge method.
 */
function isSupportedMethod(method: string): method is BridgeMethod {
  return Object.values(BRIDGE_METHODS).includes(method as BridgeMethod);
}
