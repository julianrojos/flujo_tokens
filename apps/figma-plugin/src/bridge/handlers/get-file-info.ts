/**
 * GET_FILE_INFO Handler
 *
 * Returns information about the current Figma file.
 */

import {
  GetFileInfoParams,
  GetFileInfoResult,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

export async function handleGetFileInfo(
  _params: GetFileInfoParams
): Promise<GetFileInfoResult> {
  try {
    const selection = figma.currentPage.selection;

    return {
      fileName: figma.root.name,
      fileKey: figma.fileKey || null,
      currentPage: figma.currentPage.name,
      currentPageId: figma.currentPage.id,
      selectionCount: selection ? selection.length : 0,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get file info'
    );
  }
}
