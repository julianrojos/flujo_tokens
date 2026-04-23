export interface NormalizedVisualProofVariant {
  name: string;
  node_id: string | null;
  screenshot_url: string | null;
  image_path: string | null;
  captured_at: string | null;
  image_sha256: string | null;
  image_bytes: number | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
}

type WarnFn = (message: string) => void;

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeVisualProofVariants(value: unknown): NormalizedVisualProofVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const variant = entry as Record<string, unknown>;
      const normalizedName =
        typeof variant.name === 'string' && variant.name.trim()
          ? variant.name.trim()
          : 'Variant';
      return {
        name: normalizedName,
        node_id: toNullableString(variant.node_id),
        screenshot_url: toNullableString(variant.screenshot_url),
        image_path: toNullableString(variant.image_path),
        captured_at: toNullableString(variant.captured_at),
        image_sha256: toNullableString(variant.image_sha256),
        image_bytes: toNullableFiniteNumber(variant.image_bytes),
        image_content_type: toNullableString(variant.image_content_type),
        image_width: toNullableFiniteNumber(variant.image_width),
        image_height: toNullableFiniteNumber(variant.image_height),
      };
    });
}

export function resolveVisualProofVariantsCount(options: {
  value: unknown;
  variantsLength: number;
  context?: string;
  warn?: WarnFn;
}): number {
  const { value, variantsLength, context = 'visual-proof', warn = console.warn } = options;
  if (value === null || value === undefined || value === '') {
    return variantsLength;
  }
  const parsed = Number(value);
  const hasDbCount = Number.isFinite(parsed);
  if (!hasDbCount) return variantsLength;
  const dbCount = parsed;
  if (dbCount !== variantsLength) {
    warn(
      `[${context}] variants_count mismatch (db=${dbCount}, variants_json=${variantsLength}); using DB count as source of truth. Re-capture if this persists.`,
    );
  }
  return dbCount;
}

export function normalizeVisualProofFromRepositoryEntry(
  raw: unknown,
  warn: WarnFn = console.warn,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const screenshotUrl = toNullableString(value.screenshotUrl);
  const imagePath = toNullableString(value.imagePath);
  const capturedAt = toNullableString(value.capturedAt);
  const nodeId = toNullableString(value.nodeId);
  const imageSha256 = toNullableString(value.imageSha256);
  const imageContentType = toNullableString(value.imageContentType);
  const imageBytes = toNullableFiniteNumber(value.imageBytes);
  const imageWidth = toNullableFiniteNumber(value.imageWidth);
  const imageHeight = toNullableFiniteNumber(value.imageHeight);
  if (value.variants !== null && value.variants !== undefined && !Array.isArray(value.variants)) {
    warn('[component-catalog] visual proof variants payload is not an array; treating as empty.');
  }
  const variants = normalizeVisualProofVariants(value.variants);
  const variantsCount = resolveVisualProofVariantsCount({
    value: value.variantsCount,
    variantsLength: variants.length,
    context: 'component-catalog',
    warn,
  });

  const hasEvidence =
    Boolean(screenshotUrl) ||
    Boolean(imagePath) ||
    variants.length > 0 ||
    (Number.isFinite(Number(variantsCount)) && Number(variantsCount) > 0);
  if (!hasEvidence) return null;

  return {
    screenshot_url: screenshotUrl,
    image_path: imagePath,
    captured_at: capturedAt,
    node_id: nodeId,
    image_sha256: imageSha256,
    image_bytes: imageBytes,
    image_content_type: imageContentType,
    image_width: imageWidth,
    image_height: imageHeight,
    variants_count: variantsCount,
    variants,
  };
}
