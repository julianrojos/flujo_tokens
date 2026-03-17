/**
 * Map Bridge Methods to Capabilities
 *
 * Pure function mapper for converting bridge method names to capability flags.
 * Centralized mapping logic to avoid drift and facilitate testing.
 */

export interface BridgeCapabilities {
  /** Legacy supports flags (deprecated, maintained for compatibility) */
  supports: {
    searchNodes: boolean;
    getChildren: boolean;
    searchStyles: boolean;
    searchVariables: boolean;
    portSwitch: boolean;
  };
  /** V2 semantic capability flags (canonical) */
  supportsV2: {
    hasFileInfo: boolean;
    hasComponent: boolean;
    hasLocalStyles: boolean;
    hasVariablesData: boolean;
    hasPortSwitch: boolean;
  };
}

/**
 * Map bridge methods to capability flags.
 * @param methods - Array of supported bridge method names (e.g., ['GET_FILE_INFO', 'GET_COMPONENT'])
 * @returns Object with both legacy (supports) and V2 (supportsV2) capability flags
 */
export function mapBridgeMethodsToCapabilities(methods: string[]): BridgeCapabilities {
  const has = (methodName: string): boolean => methods.includes(methodName);

  // V2 semantic flags (canonical)
  const supportsV2 = {
    hasFileInfo: has('GET_FILE_INFO'),
    hasComponent: has('GET_COMPONENT'),
    hasLocalStyles: has('GET_LOCAL_STYLES'),
    hasVariablesData: has('GET_VARIABLES_DATA'),
    hasPortSwitch: false, // Port switching deprecated in direct-only mode
  };

  // Legacy flags (deprecated, maintained for backward compatibility)
  const supports = {
    searchNodes: supportsV2.hasFileInfo,
    getChildren: supportsV2.hasComponent,
    searchStyles: supportsV2.hasLocalStyles,
    searchVariables: supportsV2.hasVariablesData,
    portSwitch: supportsV2.hasPortSwitch,
  };

  return { supports, supportsV2 };
}
