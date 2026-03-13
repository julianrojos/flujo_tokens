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

function serializePaintStyle(style: PaintStyle): LocalStyleData {
  return {
    id: style.id,
    name: style.name,
    styleType: 'PAINT',
    description: style.description ?? '',
    key: style.key,
  };
}

function serializeTextStyle(style: TextStyle): LocalStyleData {
  return {
    id: style.id,
    name: style.name,
    styleType: 'TEXT',
    description: style.description ?? '',
    key: style.key,
  };
}

function serializeEffectStyle(style: EffectStyle): LocalStyleData {
  return {
    id: style.id,
    name: style.name,
    styleType: 'EFFECT',
    description: style.description ?? '',
    key: style.key,
  };
}

function serializeGridStyle(style: GridStyle): LocalStyleData {
  return {
    id: style.id,
    name: style.name,
    styleType: 'GRID',
    description: style.description ?? '',
    key: style.key,
  };
}

export async function handleGetLocalStyles(_params: GetLocalStylesParams): Promise<GetLocalStylesResult> {
  try {
    const styles: LocalStyleData[] = [
      ...figma.getLocalPaintStyles().map(serializePaintStyle),
      ...figma.getLocalTextStyles().map(serializeTextStyle),
      ...figma.getLocalEffectStyles().map(serializeEffectStyle),
      ...figma.getLocalGridStyles().map(serializeGridStyle),
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
