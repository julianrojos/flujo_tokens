/**
 * Component Registry Constants
 *
 * Default paths and configuration for component registry.
 */

import path from 'node:path';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { PIPELINE_STAGE_ORDER as PipelineStageOrder } from '../types/component-registry.js';

export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

export const DEFAULT_COMPONENT_SPECS_DIR = path.join(PROJECT_ROOT, 'docs/_spec/components');
export const DEFAULT_COMPONENT_DOCS_DIR = path.join(PROJECT_ROOT, 'docs/components');
export const DEFAULT_VISUAL_PROOFS_DIR = path.join(PROJECT_ROOT, 'docs/_generated/visual-proofs');
const dashboardDbPathOverride = String(process.env.DS_DASHBOARD_DB_PATH || '').trim();
export const DEFAULT_COMPONENT_REGISTRY_PATH = dashboardDbPathOverride
  ? path.resolve(dashboardDbPathOverride)
  : path.join(PROJECT_ROOT, 'apps/ds-dashboard/server/db/ds-dashboard.db');
export const DEFAULT_COMPONENT_OVERVIEW_PATH = path.join(PROJECT_ROOT, 'docs/components/overview.md');

// Re-export from types to maintain single source of truth
export const PIPELINE_STAGE_ORDER = PipelineStageOrder;
