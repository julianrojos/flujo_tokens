/**
 * GET_CURRENT_SELECTION Handler
 *
 * Returns the current Figma selection snapshot.
 */

import {
  createBridgeError,
  ERROR_CODES,
  type GetCurrentSelectionParams,
  type SelectionChangeEventData,
} from '../protocol';

function toSelectionSnapshot(): SelectionChangeEventData {
  const selection = figma.currentPage.selection;
  const nodes = selection.slice(0, 50).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
  }));

  return {
    nodes,
    count: selection.length,
    page: figma.currentPage.name,
    timestamp: Date.now(),
  };
}

export async function handleGetCurrentSelection(
  _params: GetCurrentSelectionParams,
): Promise<SelectionChangeEventData> {
  try {
    return toSelectionSnapshot();
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get current selection',
    );
  }
}
