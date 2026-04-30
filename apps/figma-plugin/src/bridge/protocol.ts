/**
 * WebSocket Bridge Protocol
 *
 * Defines the typed contract for communication between the Figma plugin
 * and the dashboard server via WebSocket.
 *
 * Data flow: Plugin (code.ts) <-> UI (ws-runtime.ts) <-> WebSocket Server
 */

import { DEFAULT_DIRECT_WS_URL } from '../config/runtime-config';

// ============================================================================
// WebSocket Message Envelopes
// ============================================================================

/**
 * Request envelope sent to the plugin
 */
export interface WSRequest {
  id: string;
  method: BridgeMethod;
  params: Record<string, unknown>;
}

/**
 * Success response envelope
 */
export interface WSResponseSuccess {
  id: string;
  result: unknown;
}

/**
 * Error response envelope
 */
export interface WSResponseError {
  id: string;
  error: BridgeError;
}

/**
 * Union type for WS responses
 */
export type WSResponse = WSResponseSuccess | WSResponseError;

// ============================================================================
// Bridge Methods (P0 - MVP)
// ============================================================================

export const BRIDGE_METHODS = {
  // File info
  GET_FILE_INFO: 'GET_FILE_INFO',
  // Current selection snapshot
  GET_CURRENT_SELECTION: 'GET_CURRENT_SELECTION',
  // Code execution
  EXECUTE_CODE: 'EXECUTE_CODE',
  // Variables - read
  GET_VARIABLES_DATA: 'GET_VARIABLES_DATA',
  GET_LOCAL_STYLES: 'GET_LOCAL_STYLES',
  REFRESH_VARIABLES: 'REFRESH_VARIABLES',
  // Variables - CRUD
  UPDATE_VARIABLE: 'UPDATE_VARIABLE',
  CREATE_VARIABLE: 'CREATE_VARIABLE',
  DELETE_VARIABLE: 'DELETE_VARIABLE',
  RENAME_VARIABLE: 'RENAME_VARIABLE',
  SET_VARIABLE_DESCRIPTION: 'SET_VARIABLE_DESCRIPTION',
  // Modes
  ADD_MODE: 'ADD_MODE',
  RENAME_MODE: 'RENAME_MODE',
  // Collections
  CREATE_VARIABLE_COLLECTION: 'CREATE_VARIABLE_COLLECTION',
  DELETE_VARIABLE_COLLECTION: 'DELETE_VARIABLE_COLLECTION',
  // Components (P1)
  GET_LOCAL_COMPONENTS: 'GET_LOCAL_COMPONENTS',
  GET_COMPONENT: 'GET_COMPONENT',
  INSTANTIATE_COMPONENT: 'INSTANTIATE_COMPONENT',
  SET_NODE_DESCRIPTION: 'SET_NODE_DESCRIPTION',
  ADD_COMPONENT_PROPERTY: 'ADD_COMPONENT_PROPERTY',
  EDIT_COMPONENT_PROPERTY: 'EDIT_COMPONENT_PROPERTY',
  DELETE_COMPONENT_PROPERTY: 'DELETE_COMPONENT_PROPERTY',
  SET_INSTANCE_PROPERTIES: 'SET_INSTANCE_PROPERTIES',
  // Node manipulation (P1)
  RESIZE_NODE: 'RESIZE_NODE',
  MOVE_NODE: 'MOVE_NODE',
  SET_NODE_FILLS: 'SET_NODE_FILLS',
  SET_NODE_STROKES: 'SET_NODE_STROKES',
  SET_NODE_OPACITY: 'SET_NODE_OPACITY',
  SET_NODE_CORNER_RADIUS: 'SET_NODE_CORNER_RADIUS',
  CLONE_NODE: 'CLONE_NODE',
  DELETE_NODE: 'DELETE_NODE',
  RENAME_NODE: 'RENAME_NODE',
  SET_TEXT_CONTENT: 'SET_TEXT_CONTENT',
  CREATE_CHILD_NODE: 'CREATE_CHILD_NODE',
  // Screenshot (P1)
  CAPTURE_SCREENSHOT: 'CAPTURE_SCREENSHOT',
  // Control
  CLEAR_CONSOLE: 'CLEAR_CONSOLE',
  RELOAD_UI: 'RELOAD_UI',
  // Bridge capabilities (direct mode)
  GET_BRIDGE_CAPABILITIES: 'GET_BRIDGE_CAPABILITIES',
  // New read handlers (P2)
  SEARCH_VARIABLES: 'SEARCH_VARIABLES',
  GET_CHILDREN: 'GET_CHILDREN',
  SEARCH_NODES: 'SEARCH_NODES',
  GET_NODES_BY_ID: 'GET_NODES_BY_ID',
  // P1: Enhanced variables
  BATCH_CREATE_VARIABLES: 'BATCH_CREATE_VARIABLES',
  BATCH_UPDATE_VARIABLES: 'BATCH_UPDATE_VARIABLES',
  EXPORT_TOKENS: 'EXPORT_TOKENS',
  SYNC_TOKENS_PLAN: 'SYNC_TOKENS_PLAN',
  SYNC_TOKENS_APPLY: 'SYNC_TOKENS_APPLY',
  GET_TOKEN_USAGE: 'GET_TOKEN_USAGE',
  // P2: Components & Token Bindings
  SEARCH_COMPONENTS: 'SEARCH_COMPONENTS',
  GET_COMPONENT_SPEC: 'GET_COMPONENT_SPEC',
  GET_COMPONENT_IMAGE: 'GET_COMPONENT_IMAGE',
  AUDIT_COMPONENT_TOKEN_COVERAGE: 'AUDIT_COMPONENT_TOKEN_COVERAGE',
  BIND_VARIABLE: 'BIND_VARIABLE',
  UNBIND_VARIABLE: 'UNBIND_VARIABLE',
  APPLY_TOKENS_TO_COMPONENT: 'APPLY_TOKENS_TO_COMPONENT',
} as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS];

// ============================================================================
// Bridge Events (Figma -> Server)
// ============================================================================

export const BRIDGE_EVENTS = {
  FILE_INFO: 'FILE_INFO',
  VARIABLES_DATA: 'VARIABLES_DATA',
  DOCUMENT_CHANGE: 'DOCUMENT_CHANGE',
  SELECTION_CHANGE: 'SELECTION_CHANGE',
  PAGE_CHANGE: 'PAGE_CHANGE',
  CONSOLE_CAPTURE: 'CONSOLE_CAPTURE',
} as const;

export type BridgeEvent = (typeof BRIDGE_EVENTS)[keyof typeof BRIDGE_EVENTS];

// ============================================================================
// Error Types
// ============================================================================

export interface BridgeError {
  code: string;
  message: string;
}

export const ERROR_CODES = {
  // Generic errors
  UNKNOWN_METHOD: 'UNKNOWN_METHOD',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TIMEOUT: 'TIMEOUT',
  // Figma API errors
  FIGMA_API_ERROR: 'FIGMA_API_ERROR',
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',
  VARIABLE_NOT_FOUND: 'VARIABLE_NOT_FOUND',
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  // Validation errors
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  // State errors
  NOT_CONNECTED: 'NOT_CONNECTED',
  HANDSHAKE_INCOMPLETE: 'HANDSHAKE_INCOMPLETE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function createBridgeError(code: ErrorCode, message: string): BridgeError {
  return { code, message };
}

// ============================================================================
// Method-Specific Types
// ============================================================================

// --- GET_FILE_INFO ---
export interface GetFileInfoParams {
  // No params required
}

export interface GetFileInfoResult {
  fileName: string;
  fileKey: string | null;
  currentPage: string;
  currentPageId: string;
  selectionCount: number;
}

// --- GET_CURRENT_SELECTION ---
export interface GetCurrentSelectionParams {
  // No params required
}

// --- EXECUTE_CODE ---
export interface ExecuteCodeParams {
  code: string;
  timeout?: number;
}

export interface ExecuteCodeResult {
  success: boolean;
  result?: unknown;
  error?: string;
  resultAnalysis?: {
    type: string;
    isNull: boolean;
    isUndefined: boolean;
    isEmpty: boolean;
    warning: string | null;
  };
  fileContext?: {
    fileName: string;
    fileKey: string | null;
  };
}

// --- GET_VARIABLES_DATA ---
export interface GetVariablesDataParams {
  // No params required - returns cached data
}

export interface VariableData {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
  scopes: string[];
  description: string;
  hiddenFromPublishing: boolean;
}

export interface VariableCollectionData {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

export interface GetVariablesDataResult {
  success: boolean;
  timestamp: number;
  fileKey: string | null;
  variables: VariableData[];
  variableCollections: VariableCollectionData[];
}

// --- GET_LOCAL_STYLES ---
export interface GetLocalStylesParams {
  // No params required
}

export interface LocalStyleData {
  id: string;
  name: string;
  styleType: string;
  description: string;
  key?: string;
}

export interface GetLocalStylesResult {
  success: boolean;
  timestamp: number;
  fileKey: string | null;
  styles: LocalStyleData[];
}

// --- REFRESH_VARIABLES ---
export interface RefreshVariablesParams {
  // No params required
}

export type RefreshVariablesResult = GetVariablesDataResult;

// --- UPDATE_VARIABLE ---
export interface UpdateVariableParams {
  variableId: string;
  modeId: string;
  value: unknown;
}

export interface UpdateVariableResult {
  success: boolean;
  variable: VariableData;
}

// --- CREATE_VARIABLE ---
export interface CreateVariableParams {
  name: string;
  collectionId: string;
  resolvedType: string;
  valuesByMode?: Record<string, unknown>;
  description?: string;
  scopes?: string[];
}

export interface CreateVariableResult {
  success: boolean;
  variable: VariableData;
}

// --- DELETE_VARIABLE ---
export interface DeleteVariableParams {
  variableId: string;
}

export interface DeleteVariableResult {
  success: boolean;
  deleted: {
    id: string;
    name: string;
  };
}

// --- RENAME_VARIABLE ---
export interface RenameVariableParams {
  variableId: string;
  newName: string;
}

export interface RenameVariableResult {
  success: boolean;
  variable: VariableData;
  oldName: string;
}

// --- SET_VARIABLE_DESCRIPTION ---
export interface SetVariableDescriptionParams {
  variableId: string;
  description: string;
}

export interface SetVariableDescriptionResult {
  success: boolean;
  variable: VariableData;
}

// --- ADD_MODE ---
export interface AddModeParams {
  collectionId: string;
  modeName: string;
}

export interface AddModeResult {
  success: boolean;
  collection: VariableCollectionData;
  newMode: {
    modeId: string;
    name: string;
  };
}

// --- RENAME_MODE ---
export interface RenameModeParams {
  collectionId: string;
  modeId: string;
  newName: string;
}

export interface RenameModeResult {
  success: boolean;
  collection: VariableCollectionData;
  oldName: string;
}

// --- CREATE_VARIABLE_COLLECTION ---
export interface CreateVariableCollectionParams {
  name: string;
  initialModeName?: string;
  additionalModes?: string[];
}

export interface CreateVariableCollectionResult {
  success: boolean;
  collection: VariableCollectionData;
}

// --- DELETE_VARIABLE_COLLECTION ---
export interface DeleteVariableCollectionParams {
  collectionId: string;
}

export interface DeleteVariableCollectionResult {
  success: boolean;
  deleted: {
    id: string;
    name: string;
    variableCount: number;
  };
}

// --- RESIZE_NODE ---
export interface ResizeNodeParams {
  nodeId: string;
  width: number;
  height: number;
  withConstraints?: boolean;
}

// --- MOVE_NODE ---
export interface MoveNodeParams {
  nodeId: string;
  x: number;
  y: number;
}

// --- SET_NODE_FILLS ---
export interface SetNodeFillsParams {
  nodeId: string;
  fills: unknown[];
}

// --- SET_NODE_STROKES ---
export interface SetNodeStrokesParams {
  nodeId: string;
  strokes: unknown[];
  strokeWeight?: number;
}

// --- SET_NODE_OPACITY ---
export interface SetNodeOpacityParams {
  nodeId: string;
  opacity: number;
}

// --- SET_NODE_CORNER_RADIUS ---
export interface SetNodeCornerRadiusParams {
  nodeId: string;
  radius: number;
}

// --- CLONE_NODE ---
export interface CloneNodeParams {
  nodeId: string;
}

// --- DELETE_NODE ---
export interface DeleteNodeParams {
  nodeId: string;
}

// --- RENAME_NODE ---
export interface RenameNodeParams {
  nodeId: string;
  newName: string;
}

// --- SET_TEXT_CONTENT ---
export interface SetTextContentParams {
  nodeId: string;
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
}

// --- CREATE_CHILD_NODE ---
export interface CreateChildNodeParams {
  parentId: string;
  nodeType: string;
  properties?: Record<string, unknown>;
}

// --- CAPTURE_SCREENSHOT ---
export interface CaptureScreenshotParams {
  nodeId?: string;
  format?: 'PNG' | 'JPG' | 'PDF' | 'SVG';
  scale?: number;
}

// --- CLEAR_CONSOLE ---
export interface ClearConsoleParams {
  // No-op control
}

export interface ClearConsoleResult {
  cleared: boolean;
}

// --- RELOAD_UI ---
export interface ReloadUIParams {
  // No params required
}

export interface ReloadUIResult {
  success: boolean;
}

// --- SEARCH_VARIABLES ---
export interface SearchVariablesParams {
  namePattern?: string;
  collectionId?: string;
  resolvedType?: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  limit?: number;
  compact?: boolean;
  // P1 extensions
  nameContains?: string;
  offset?: number;
  collectionName?: string;
  resolveAliases?: boolean;
  modeId?: string;
}

export interface SearchVariablesResult {
  success: boolean;
  variables: Array<{
    id: string;
    name: string;
    key: string;
    resolvedType: string;
    variableCollectionId: string;
  } | VariableData>;
  count: number;
  // P1 extensions
  total?: number;
  offset?: number;
  hasMore?: boolean;
}

// --- GET_CHILDREN ---
export interface GetChildrenParams {
  parentId: string;
  compact?: boolean;
  limit?: number; // Max children to return (default: 500, max: 2000)
  offset?: number; // Offset for pagination (default: 0)
}

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  childCount: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface NodeData extends NodeSummary {
  fills?: unknown[];
  strokes?: unknown[];
  opacity?: number;
  cornerRadius?: unknown;
  visible?: boolean;
  locked?: boolean;
  effects?: unknown[];
  styles?: Record<string, string>;
}

export interface GetChildrenResult {
  success: boolean;
  parentId: string;
  children: Array<NodeSummary | NodeData>;
  total: number;        // Total number of children (before pagination)
  limit: number;        // Applied limit
  offset: number;       // Applied offset
  hasMore: boolean;     // True if there are more children beyond this page
}

// --- SEARCH_NODES ---
export interface SearchNodesParams {
  parentId: string;
  nameContains?: string;
  namePattern?: string;
  types?: string[];
  maxDepth?: number;
  compact?: boolean;
  limit?: number;
}

export interface SearchNodesResult {
  success: boolean;
  nodes: NodeSummary[];
  count: number;
}

// --- GET_NODES_BY_ID ---
export interface GetNodesByIdParams {
  nodeIds: string[];
  depth?: 'minimal' | 'compact' | 'full';
}

export interface GetNodesByIdResult {
  success: boolean;
  nodes: Record<string, NodeData | null>;
  /** Original IDs in the order they were requested, for stable client iteration. */
  requestedIds: readonly string[];
}

// ============================================================================
// P1: Batch Variable Operations
// ============================================================================

// --- BATCH_CREATE_VARIABLES ---
export interface BatchCreateVariableItem {
  name: string;
  collectionId: string;
  resolvedType: string;
  valuesByMode?: Record<string, unknown>;
  description?: string;
  scopes?: string[];
}

export interface BatchCreateVariablesParams {
  items: BatchCreateVariableItem[];
}

export interface BatchCreateVariablesResult {
  success: boolean;
  created: VariableData[];
  errors: Array<{ index: number; name: string; error: string }>;
}

// --- BATCH_UPDATE_VARIABLES ---
export interface BatchUpdateVariableItem {
  variableId: string;
  modeId: string;
  value: unknown;
}

export interface BatchUpdateVariablesParams {
  items: BatchUpdateVariableItem[];
}

export interface BatchUpdateVariablesResult {
  success: boolean;
  updated: VariableData[];
  errors: Array<{ index: number; variableId: string; error: string }>;
}

// ============================================================================
// P1: Token Export
// ============================================================================

// --- EXPORT_TOKENS ---
export type TokenExportFormat = 'css' | 'tailwind' | 'typescript';

export interface ExportTokensParams {
  format: TokenExportFormat;
  collection?: string;
  mode?: string;
  resolveAliases?: boolean; // default: true
}

export interface ExportTokensResult {
  success: boolean;
  content: string;
  format: TokenExportFormat;
  stats: { variableCount: number; collectionCount: number };
}

// ============================================================================
// P1: Sync Tokens
// ============================================================================

// --- SYNC_TOKENS ---
export type DtcgTokenTree = Record<string, unknown>;

export interface SyncTokensPlanParams {
  tokens: DtcgTokenTree;
  collection?: string;
  pruneMode?: boolean;
}

export interface TokenDiff {
  path: string; // e.g. "colors/primary/blue"
  action: 'add' | 'update' | 'delete';
  currentValue?: unknown;
  desiredValue?: unknown;
  variableId?: string; // for update/delete
  tokenType?: string; // for add operations - the Figma variable type (e.g. "COLOR", "FLOAT")
}

export interface SyncTokensPlanResult {
  success: boolean;
  plan: TokenDiff[];
  summary: { additions: number; updates: number; deletions: number };
}

export interface SyncTokensApplyParams {
  plan: TokenDiff[];
  collection?: string;
  abortOnError?: boolean;
}

export interface SyncTokensApplyResult {
  success: boolean;
  applied: { added: number; updated: number; deleted: number };
  errors: Array<{ path: string; error: string }>;
}

// ============================================================================
// P1: Token Usage
// ============================================================================

// --- GET_TOKEN_USAGE ---
export interface GetTokenUsageParams {
  pageId?: string;
  maxNodes?: number;
  force?: boolean;
}

export interface TokenUsageEntry {
  variableId: string;
  variableName: string;
  /** Global Figma key resolved via getVariableByIdAsync (includes library variables). */
  variableKey?: string;
  /** Resolved type from Figma: COLOR | FLOAT | STRING | BOOLEAN. */
  variableType?: string;
  nodeCount: number;
  nodeIds: string[];
}

export interface GetTokenUsageResult {
  success: boolean;
  usage: TokenUsageEntry[];
  unusedVariableIds: string[];
  scannedNodeCount: number;
  truncated: boolean;
}

// ============================================================================
// P2: Components & Token Bindings
// ============================================================================

// --- SEARCH_COMPONENTS ---
export interface SearchComponentsParams {
  nameContains?: string;
  namePattern?: string;
  includeVariants?: boolean; // default false
  limit?: number;            // default 50, max 1000
  compact?: boolean;         // default true
  offset?: number;           // default 0, page start index
  scanSessionId?: string;    // optional client scan session scope for ephemeral pagination cache
}

export interface CompactComponentResult {
  key: string;
  nodeId: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  variantCount?: number;
  pageName?: string;  // Figma page containing the component
  width?: number;
  height?: number;
}

export interface SearchComponentsResult {
  success: true;
  components: CompactComponentResult[];
  /** Number of returned items in `components` (after applying `limit`). */
  count: number;
  truncated: boolean;
  /** Total components matching the filters before applying `limit`. */
  total: number;
  /** True when `total` is a lower-bound estimate due to guardrail cutoff. */
  totalIsEstimated: boolean;
  /** Effective limit applied by the handler (1..1000). */
  limit: number;
  /** True when more results exist beyond this page. */
  hasMore: boolean;
  /** Offset for the next page, or null when no more pages. */
  nextOffset: number | null;
}

// --- GET_COMPONENT_SPEC ---
export interface GetComponentSpecParams {
  nodeId: string;
  depth?: number;   // default 3, -1 = unlimited
  compact?: boolean; // default false
}

export interface SpecLayerNode {
  id: string;
  name: string;
  type: string;
  children?: SpecLayerNode[];
  boundVariables?: Record<string, Array<{ variableId: string }>>;
  // Layout metadata (SC-05)
  layout?: {
    mode?: 'horizontal' | 'vertical' | 'none';
    spacing?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    alignment?: { horizontal: string; vertical: string };
    sizing?: { horizontal: string; vertical: string };
  };
}

export interface VariantSpec {
  key: string;
  nodeId: string;
  name: string;
  description: string | null;
  variantProperties: Record<string, string>;
  width: number;
  height: number;
  layerTokens: Array<{
    nodeId: string;
    nodeName: string;
    field: string;
    variableId: string;
    modeId?: string;
    modeName?: string;
  }>;
}

export interface InstanceDependencySpec {
  instanceNodeId: string;
  instanceNodeName: string;
  usedComponentNodeId: string;
  usedComponentName: string;
  usedComponentKey?: string;
  status?: 'resolved' | 'unresolved';
}

export interface GetComponentSpecResult {
  success: true;
  nodeId: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  description: string | null;
  width?: number;
  height?: number;
  anatomy: SpecLayerNode;
  variants?: VariantSpec[];
  variantAxes?: Array<{ name: string; values: string[] }>;
  props: Array<{ name: string; type: string; defaultValue: unknown }>;
  states: string[];
  tokenBindings: Array<{ nodeId: string; nodeName: string; field: string; variableId: string }>;
  instanceDependencies?: InstanceDependencySpec[];
}

// --- GET_COMPONENT_IMAGE ---
export interface GetComponentImageParams {
  nodeIds: string[];   // max 20
  format?: 'PNG' | 'JPG' | 'SVG';
  scale?: number;      // default 2
}

export interface ComponentImageResult {
  nodeId: string;
  base64?: string;
  format: string;
  byteLength?: number;
  error?: string;
}

export interface GetComponentImageResult {
  success: boolean;
  images: ComponentImageResult[];
  count: number;
  errors: number;
}

// --- AUDIT_COMPONENT_TOKEN_COVERAGE ---
export interface AuditTokenCoverageParams {
  nodeId: string;
  maxNodes?: number; // default 500
}

export interface UnboundNodeInfo {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  hasFills: boolean;
  hasStrokes: boolean;
}

export interface AuditTokenCoverageResult {
  success: true;
  nodeId: string;
  totalNodes: number;
  nodesWithBindings: number;
  coveragePercent: number;
  truncated: boolean;
  unboundNodes: UnboundNodeInfo[];
  fieldCoverage: Record<string, { total: number; bound: number }>;
}

// --- BIND_VARIABLE ---
export interface BindVariableParams {
  nodeId: string;
  variableId: string;
  field: string;
  paintIndex?: number;
  paintField?: 'color' | 'opacity';
}

export interface BindVariableResult {
  success: true;
  nodeId: string;
  field: string;
  variableId: string;
}

// --- UNBIND_VARIABLE ---
export interface UnbindVariableParams {
  nodeId: string;
  field: string;
  paintIndex?: number;
  paintField?: 'color' | 'opacity';
}

export interface UnbindVariableResult {
  success: true;
  nodeId: string;
  field: string;
}

// --- APPLY_TOKENS_TO_COMPONENT ---
export interface ApplyTokenItem {
  nodeId: string;
  variableId: string;
  field: string;
  paintIndex?: number;
  paintField?: 'color' | 'opacity';
}

export interface ApplyTokensParams {
  items: ApplyTokenItem[];
  dryRun?: boolean;
}

export interface ApplyTokensResultItem {
  nodeId: string;
  variableId: string;
  field: string;
  status: 'applied' | 'error';
  reason?: string;
}

export interface ApplyTokensResult {
  success: boolean;
  dryRun: boolean;
  items: ApplyTokensResultItem[];
  appliedCount: number;
  errorCount: number;
}

// ============================================================================
// Event Payload Types
// ============================================================================

export interface FileInfoEventData {
  fileName: string;
  fileKey: string | null;
  currentPage: string;
  currentPageId: string;
  selectionCount: number;
}

export interface VariablesDataEventData {
  success: boolean;
  timestamp: number;
  fileKey: string | null;
  variables: VariableData[];
  variableCollections: VariableCollectionData[];
}

export interface DocumentChangeEventData {
  hasStyleChanges: boolean;
  hasNodeChanges: boolean;
  changedNodeIds: string[];
  changeCount: number;
  timestamp: number;
}

export interface SelectionChangeEventData {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    width?: number;
    height?: number;
  }>;
  count: number;
  page: string;
  timestamp: number;
}

export interface PageChangeEventData {
  pageId: string;
  pageName: string;
  timestamp: number;
}

export interface ConsoleCaptureEventData {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  args: unknown[];
  timestamp: number;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isWSRequest(message: unknown): message is WSRequest {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.method === 'string' &&
    BRIDGE_METHODS_VALUES.includes(msg.method as BridgeMethod) &&
    typeof msg.params === 'object' &&
    msg.params !== null
  );
}

export function isWSResponseSuccess(message: unknown): message is WSResponseSuccess {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return typeof msg.id === 'string' && 'result' in msg && !('error' in msg);
}

export function isWSResponseError(message: unknown): message is WSResponseError {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    'error' in msg &&
    typeof msg.error === 'object' &&
    msg.error !== null &&
    'code' in msg.error &&
    'message' in msg.error
  );
}

export function isBridgeMethod(method: string): method is BridgeMethod {
  return BRIDGE_METHODS_VALUES.includes(method as BridgeMethod);
}

export function isBridgeEvent(event: string): event is BridgeEvent {
  return BRIDGE_EVENTS_VALUES.includes(event as BridgeEvent);
}

// Helper arrays for validation
const BRIDGE_METHODS_VALUES = Object.values(BRIDGE_METHODS);
const BRIDGE_EVENTS_VALUES = Object.values(BRIDGE_EVENTS);

// ============================================================================
// WebSocket Runtime Configuration
// ============================================================================

export interface WSRuntimeConfig {
  /** Transport mode: direct WebSocket connection to Dashboard */
  transportMode: TransportMode;
  /** Direct mode: WebSocket URL for direct connection */
  directWsUrl?: string;
  /** Plugin version sent in session info (default: '0.0.0' if not provided) */
  pluginVersion?: string;
  /** Plugin build identifier sent in session info (default: 'unknown' if not provided) */
  pluginBuild?: string;
  connectionTimeout: number;
  requestTimeout: number;
  reconnectDelay: number;
  reconnectMaxDelay: number;
  maxReconnectAttempts: number;
  handshakeTimeout: number;
}

export const DEFAULT_WS_CONFIG: WSRuntimeConfig = {
  transportMode: 'direct',
  directWsUrl: DEFAULT_DIRECT_WS_URL,
  connectionTimeout: 3000,
  requestTimeout: 15000,
  reconnectDelay: 500,
  reconnectMaxDelay: 5000,
  maxReconnectAttempts: 500,
  handshakeTimeout: 30000,
};

// ============================================================================
// Bridge Connection State
// ============================================================================

export type BridgeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'mismatch'
  | 'fallback'
  | 'handshaking';

/**
 * Transport mode for MCP communication
 * Direct mode: WebSocket connection directly to Dashboard server.
 */
export type TransportMode = 'direct';

export interface BridgeStatus {
  state: BridgeConnectionState;
  configuredPort: number;
  connectedPort: number | null;
  cause?: string;
  lastActivity?: number;
}

// ============================================================================
// UI <-> Main (code.ts) Bridge Messages
// ============================================================================

/**
 * Request from UI to Main (code.ts) for bridge method execution.
 */
export interface BridgePluginRequestMessage {
  type: 'BRIDGE_REQUEST';
  requestId: string;
  method: BridgeMethod;
  params: Record<string, unknown>;
}

/**
 * Response from Main (code.ts) to UI for bridge method execution.
 */
export interface BridgePluginResponseMessage {
  type: 'BRIDGE_RESPONSE';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: BridgeError;
}

/**
 * Union of all bridge message types.
 */
export type BridgePluginMessage = BridgePluginRequestMessage | BridgePluginResponseMessage;

/**
 * Type guard to check if a value is a BridgePluginResponseMessage.
 */
export function isBridgePluginResponseMessage(v: unknown): v is BridgePluginResponseMessage {
  if (typeof v !== 'object' || v === null) return false;
  const msg = v as Record<string, unknown>;
  if (msg.type !== 'BRIDGE_RESPONSE') return false;
  if (typeof msg.requestId !== 'string') return false;
  if (typeof msg.success !== 'boolean') return false;

  if (msg.success === false) {
    return (
      typeof msg.error === 'object' &&
      msg.error !== null &&
      'code' in msg.error &&
      'message' in msg.error
    );
  }

  return true;
}

/**
 * Type guard to check if a value is a BridgePluginRequestMessage.
 */
export function isBridgePluginRequestMessage(v: unknown): v is BridgePluginRequestMessage {
  if (typeof v !== 'object' || v === null) return false;
  const msg = v as Record<string, unknown>;
  return (
    msg.type === 'BRIDGE_REQUEST' &&
    typeof msg.requestId === 'string' &&
    typeof msg.method === 'string' &&
    isBridgeMethod(msg.method) &&
    typeof msg.params === 'object' &&
    msg.params !== null
  );
}
