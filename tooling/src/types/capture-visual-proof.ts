/**
 * Capture visual proof type definitions
 *
 * Types for visual proof capture workflow from Figma.
 */

/**
 * Visual proof capture arguments.
 */
export interface CaptureVisualProofArgs {
  'component-name'?: string;
  markdown?: string;
  'spec-file'?: string;
  'component-set-id'?: string;
  url?: string;
  'figma-token'?: string;
  agent?: string;
  'main-capture-mode'?: string;
  format?: string;
  scale?: string;
  'proof-dir'?: string;
  'proof-image-dir'?: string;
  'store-local-image'?: string;
  'require-local-image'?: string;
  'download-timeout-ms'?: string;
  'include-variants'?: string;
  'variant-limit'?: string;
  'dry-run'?: string;
  'skip-db-persistence'?: string;
  system?: string;
  'docs-root'?: string;
  'spec-root'?: string;
  help?: boolean | string;
}

/**
 * Visual proof variant info.
 */
export interface VisualProofVariant {
  name: string;
  node_id: string;
  screenshot_url: string;
  image_path: string | null;
  image_sha256: string | null;
  image_bytes: number | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
  captured_at: string;
}

/**
 * Local image info.
 */
export interface LocalImageInfo {
  path: string | null;
  sha256: string | null;
  bytes: number | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Visual proof capture report.
 */
export interface CaptureVisualProofReport {
  ok: boolean;
  dryRun: boolean;
  component: string;
  markdownPath: string;
  specPath: string;
  proofImagesSlugPath: string;
  localImagePath: string | null;
  screenshotUrl: string;
  nodeId: string;
  capturedAt: string;
  format: string;
  scale: number;
  imageSha256: string | null;
  imageBytes: number | null;
  imageContentType: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  variantsCount: number;
  variants: VisualProofVariant[];
  mainCaptureMode: string;
  deletedStaleImages: string[];
  db_persistence?: {
    ok: boolean;
    attempted?: number;
    upserted?: number;
    skipped?: number;
    error?: string;
  };
}

/**
 * Downloaded binary result.
 */
export interface DownloadedBinary {
  buffer: Buffer;
  contentType: string;
}

/**
 * Image dimensions.
 */
export interface ImageDimensions {
  width: number | null;
  height: number | null;
}

/**
 * Variant node descriptor.
 */
export interface VariantNode {
  nodeId: string;
  name: string;
}

/**
 * Split frontmatter result.
 */
export interface SplitFrontmatterResult {
  frontmatterRaw: string;
  content: string;
}
