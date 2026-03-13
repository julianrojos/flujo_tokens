# MCP API Contract — Legacy Bridge Parity Matrix

## Overview

This document tracks API parity between the original legacy bridge (`figma-console-mcp/figma-desktop-bridge`) and the integrated plugin bridge (`apps/figma-plugin/src/bridge`).

**Last Updated:** 2026-03-10  
**Target:** 100% parity for P0 + P1 methods

## Legend

| Status | Meaning |
|--------|---------|
| ✅ done | Full parity achieved |
| ⚠️ partial | Implemented but divergent |
| ❌ missing | Not implemented |
| 📋 deferred | P2/optional, deferred |

## Method Parity Matrix

### Variables Management (P0)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `GET_VARIABLES_DATA` | `{}` → `{success, timestamp, fileKey, variables[], variableCollections[]}` | Same | ✅ done | None | Verify |
| `REFRESH_VARIABLES` | `{}` → `{success, data}` | Same | ✅ done | None | Verify |
| `UPDATE_VARIABLE` | `{variableId, modeId, value}` → `{success, variable}` | Same | ✅ done | None | Verify |
| `CREATE_VARIABLE` | `{name, collectionId, resolvedType, valuesByMode?, description?, scopes?}` → `{success, variable}` | Same | ✅ done | None | Verify |
| `DELETE_VARIABLE` | `{variableId}` → `{success, deleted: {id, name}}` | Same | ✅ done | None | Verify |
| `RENAME_VARIABLE` | `{variableId, newName}` → `{success, variable, oldName}` | Same | ✅ done | None | Verify |
| `SET_VARIABLE_DESCRIPTION` | `{variableId, description}` → `{success, variable}` | Same | ✅ done | None | Verify |

### Collections & Modes (P0)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `CREATE_VARIABLE_COLLECTION` | `{name, initialModeName?, additionalModes?}` → `{success, collection}` | Same | ✅ done | None | Verify |
| `DELETE_VARIABLE_COLLECTION` | `{collectionId}` → `{success, deleted: {id, name, variableCount}}` | Same | ✅ done | None | Verify |
| `ADD_MODE` | `{collectionId, modeName}` → `{success, collection, newMode: {modeId, name}}` | Same | ✅ done | None | Verify |
| `RENAME_MODE` | `{collectionId, modeId, newName}` → `{success, collection, oldName}` | Same | ✅ done | None | Verify |

### File & Connection (P0)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `GET_FILE_INFO` | `{}` → `{fileName, fileKey, currentPage, currentPageId, selectionCount}` | Same | ✅ done | None | Verify |
| `CLEAR_CONSOLE` | `{}` → `{cleared: true}` | Same | ✅ done | None | Verify |
| `RELOAD_UI` | `{}` → `{success: true}` | Same | ✅ done | None | Verify |

### Code Execution (P0)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `EXECUTE_CODE` | `{code, timeout?}` → `{success, result, resultAnalysis?, fileContext?}` | Same + resultAnalysis | ✅ done | Enhanced | Keep enhancement |

### Components (P1)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `GET_LOCAL_COMPONENTS` | `{}` → `{success, data: {components[], componentSets[],...}}` | Same | ✅ done | None | Verify |
| `GET_COMPONENT` | `{nodeId}` → `{success, data: {component: {...}}}` | Same | ✅ done | None | Verify |
| `INSTANTIATE_COMPONENT` | `{componentKey, nodeId?, position?, size?, overrides?, variant?, parentId?}` → `{success, instance}` | Same | ✅ done | None | Verify |
| `SET_NODE_DESCRIPTION` | `{nodeId, description, descriptionMarkdown?}` → `{success, node}` | Same | ✅ done | None | Verify |
| `ADD_COMPONENT_PROPERTY` | `{nodeId, propertyName, propertyType, defaultValue, options?}` → `{success, propertyName}` | Same | ✅ done | None | Verify |
| `EDIT_COMPONENT_PROPERTY` | `{nodeId, propertyName, newValue}` → `{success, propertyName}` | Same | ✅ done | None | Verify |
| `DELETE_COMPONENT_PROPERTY` | `{nodeId, propertyName}` → `{success}` | Same | ✅ done | None | Verify |
| `SET_INSTANCE_PROPERTIES` | `{nodeId, properties}` → `{success, instance}` | Same | ✅ done | None | Verify |

### Node Manipulation (P1)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `RESIZE_NODE` | `{nodeId, width, height, withConstraints?}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `MOVE_NODE` | `{nodeId, x, y}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `SET_NODE_FILLS` | `{nodeId, fills}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `SET_NODE_STROKES` | `{nodeId, strokes, strokeWeight?}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `SET_NODE_OPACITY` | `{nodeId, opacity}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `SET_NODE_CORNER_RADIUS` | `{nodeId, radius}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `CLONE_NODE` | `{nodeId}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `DELETE_NODE` | `{nodeId}` → `{success, deleted}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `RENAME_NODE` | `{nodeId, newName}` → `{success, node, oldName}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `SET_TEXT_CONTENT` | `{nodeId, text, fontSize?, fontWeight?, fontFamily?}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |
| `CREATE_CHILD_NODE` | `{parentId, nodeType, properties?}` → `{success, node}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |

### Screenshot & Visual (P1)

| Method | Original Contract | Our Contract | Status | Diff | Action |
|--------|------------------|--------------|--------|------|--------|
| `CAPTURE_SCREENSHOT` | `{nodeId, format?, scale?}` → `{success, image: {base64, format, scale, byteLength, node, bounds}}` | ❌ missing | ❌ missing | Not implemented | **Implement P1** |

## Summary

### P0 Methods (Core Variables & Connection)
- **Total:** 15
- **Implemented:** 15 ✅
- **Missing:** 0
- **Parity:** 100%

### P1 Methods (Components & Node Manipulation)
- **Total:** 20
- **Implemented:** 8 ✅ (Components complete)
- **Missing:** 12 ❌ (Node manipulation + screenshot)
- **Parity:** 40%

### P2 Methods (Deferred)
- Node manipulation methods (RESIZE_NODE, MOVE_NODE, etc.) - can be implemented on demand
- Screenshot (CAPTURE_SCREENSHOT) - can be implemented on demand

## Action Items

### ✅ Completed (P1 Components)
All 8 component methods implemented and tested:
- GET_LOCAL_COMPONENTS
- GET_COMPONENT
- INSTANTIATE_COMPONENT
- SET_NODE_DESCRIPTION
- ADD_COMPONENT_PROPERTY
- EDIT_COMPONENT_PROPERTY
- DELETE_COMPONENT_PROPERTY
- SET_INSTANCE_PROPERTIES

### Remaining (P1 Node Manipulation - 11 methods)
- RESIZE_NODE
- MOVE_NODE
- SET_NODE_FILLS
- SET_NODE_STROKES
- SET_NODE_OPACITY
- SET_NODE_CORNER_RADIUS
- CLONE_NODE
- DELETE_NODE
- RENAME_NODE
- SET_TEXT_CONTENT
- CREATE_CHILD_NODE

### Remaining (P1 Screenshot - 1 method)
- CAPTURE_SCREENSHOT

## Error Codes

Both implementations should share these error codes:

| Code | Meaning |
|------|---------|
| `UNKNOWN_METHOD` | Method not in BRIDGE_METHODS |
| `INVALID_REQUEST` | Malformed request envelope |
| `INTERNAL_ERROR` | Unexpected handler error |
| `TIMEOUT` | Request exceeded timeout |
| `FIGMA_API_ERROR` | Figma API failure |
| `NODE_NOT_FOUND` | Node ID doesn't exist |
| `VARIABLE_NOT_FOUND` | Variable ID doesn't exist |
| `COLLECTION_NOT_FOUND` | Collection ID doesn't exist |
| `INVALID_PARAMETER` | Parameter validation failed |
| `MISSING_PARAMETER` | Required parameter missing |
| `NOT_CONNECTED` | No WebSocket connection |
| `HANDSHAKE_INCOMPLETE` | Handshake not completed |

## Next Steps

1. Implement P1 handlers in priority order:
   - First: Components (most critical for design system workflow)
   - Second: Node manipulation (essential for layout edits)
   - Third: Screenshot (visual validation)

2. Add tests for each new handler:
   - Success path
   - Validation error path
   - Figma API failure path

3. Update this document as methods are implemented
