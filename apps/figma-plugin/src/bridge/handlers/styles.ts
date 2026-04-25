/**
 * Style Handlers
 */

import {
  type GetLocalStylesParams,
  type GetLocalStylesResult,
  type LocalStyleData,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

function serializeStyle(
  style: PaintStyle | TextStyle | EffectStyle | GridStyle,
  styleType: LocalStyleData['styleType'],
): LocalStyleData {
  return {
    id: style.id,
    name: style.name,
    styleType,
    description: style.description ?? '',
    key: style.key,
  };
}

export async function handleGetLocalStyles(_params: GetLocalStylesParams): Promise<GetLocalStylesResult> {
  try {
    const styles: LocalStyleData[] = [
      ...figma.getLocalPaintStyles().map((style) => serializeStyle(style, 'PAINT')),
      ...figma.getLocalTextStyles().map((style) => serializeStyle(style, 'TEXT')),
      ...figma.getLocalEffectStyles().map((style) => serializeStyle(style, 'EFFECT')),
      ...figma.getLocalGridStyles().map((style) => serializeStyle(style, 'GRID')),
    ];

    return {
      success: true,
      timestamp: Date.now(),
      fileKey: figma.fileKey ?? null,
      styles,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to read local styles'
    );
  }
}
