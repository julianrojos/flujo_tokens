/**
 * Bridge Module Index
 *
 * Central export point for the WebSocket bridge layer.
 */

// Protocol types and constants
export * from './protocol';

// WebSocket runtime
export { WebSocketRuntime, getWSRuntime } from './ws-runtime';

// Dispatcher
export { dispatchRequest } from './dispatcher';

// Individual handlers (for testing)
export { handleGetFileInfo } from './handlers/get-file-info';
export { handleGetCurrentSelection } from './handlers/get-current-selection';
export { handleExecuteCode } from './handlers/execute-code';
export {
  handleGetVariablesData,
  handleRefreshVariables,
  handleUpdateVariable,
  handleCreateVariable,
  handleDeleteVariable,
  handleRenameVariable,
  handleSetVariableDescription,
} from './handlers/variables';
export {
  handleAddMode,
  handleRenameMode,
  handleCreateVariableCollection,
  handleDeleteVariableCollection,
} from './handlers/modes-collections';
export { handleClearConsole, handleReloadUI } from './handlers/control';
export {
  handleGetLocalComponents,
  handleGetComponent,
  handleInstantiateComponent,
  handleSetNodeDescription,
  handleAddComponentProperty,
  handleEditComponentProperty,
  handleDeleteComponentProperty,
  handleSetInstanceProperties,
} from './handlers/components';
export {
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
