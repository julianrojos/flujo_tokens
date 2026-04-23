/**
 * Pipeline Options
 *
 * Parse pipeline CLI options into structured flags.
 */
import type { FigmaVariableSource } from './figma-token-sync.js';

import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parseTokensSource,
  parsePositiveNumber,
} from './capture-options.js';

export interface PipelineFlags {
  componentSlugOverride: string;
  componentKind: string;
  includeVariants: boolean;
  continueOnError: boolean;
  dryRun: boolean;
  includeSpecExhibits: boolean;
  variantLimit: number;
  scale: number;
  format: string;
  agent: string;
  mainCaptureMode: string;
  tokensSource: FigmaVariableSource;
  force: boolean;
  skipValidation: boolean;
  allowNonEvidenceUpdates: boolean;
  skipDbPersistence: boolean;
}

export interface PipelineOptionsArgs {
  'component-slug'?: string;
  'component-kind'?: string;
  'include-variants'?: string | boolean;
  'continue-on-error'?: string | boolean;
  'dry-run'?: string | boolean;
  'include-spec-exhibits'?: string | boolean;
  'variant-limit'?: string | number;
  scale?: string | number;
  format?: string;
  agent?: string;
  'main-capture-mode'?: string;
  'tokens-source'?: string;
  force?: string | boolean;
  'skip-validation'?: string | boolean;
  'allow-non-evidence-updates'?: string | boolean;
  'skip-db-persistence'?: string | boolean;
  [key: string]: unknown;
}

/**
 * Parse pipeline options from CLI arguments.
 */
export function parsePipelineOptions(args: PipelineOptionsArgs): PipelineFlags {
  const rawSlug = String(args['component-slug'] || '').trim().toLowerCase();
  const componentSlugOverride = rawSlug.replace(/[\\/]/g, '-').replace(/\.\./g, '');

  return {
    componentSlugOverride,
    componentKind: parseComponentKind(args['component-kind']),
    includeVariants: parseBooleanOption(args['include-variants'], '--include-variants', true),
    continueOnError: parseBooleanOption(args['continue-on-error'], '--continue-on-error', true),
    dryRun: parseBooleanOption(args['dry-run'], '--dry-run', false),
    includeSpecExhibits: parseBooleanOption(args['include-spec-exhibits'], '--include-spec-exhibits', true),
    variantLimit: Math.floor(parsePositiveNumber(args['variant-limit'], '--variant-limit', 6)),
    scale: parsePositiveNumber(args.scale, '--scale', 2),
    format: String(args.format || 'png').trim().toLowerCase(),
    agent: String(args.agent || 'auto').trim(),
    mainCaptureMode: parseMainCaptureMode(args['main-capture-mode']),
    tokensSource: parseTokensSource(args['tokens-source']),
    force: String(args.force || 'false') === 'true',
    skipValidation: String(args['skip-validation'] || 'false') === 'true',
    allowNonEvidenceUpdates: String(args['allow-non-evidence-updates'] || 'false') === 'true',
    skipDbPersistence: parseBooleanOption(args['skip-db-persistence'], '--skip-db-persistence', false),
  };
}
