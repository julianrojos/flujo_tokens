/**
 * MCP components for the Figma plugin UI.
 */

export { PortSwitcher } from '../components/PortSwitcher';
export { ConnectionStatus } from '../components/ConnectionStatus';
export {
  getPluginMcpClient,
  resetPluginMcpClient,
  McpClientService,
} from '../../services/mcp-client';

export type {
  McpCapabilities,
  McpError,
  PortState,
  PortSwitchResult,
  ConnectionState,
} from '../../services/mcp-client';

// Nuevos componentes del rediseño
export { StatusIndicator } from '../components/StatusIndicator';
export { KitSummary } from '../components/KitSummary';
export { SyncButton } from '../components/SyncButton';
export { AdvancedSection } from '../components/AdvancedSection';

export type {
  DesignSystemKitResponse,
  KitSummary as KitSummaryData,
  SyncTokensResponse,
} from '../../services/mcp-client';
