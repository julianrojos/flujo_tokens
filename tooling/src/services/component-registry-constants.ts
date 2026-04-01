/**
 * Component Registry Constants
 *
 * Shared configuration for component registry.
 */

import path from 'node:path';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { PIPELINE_STAGE_ORDER as PipelineStageOrder } from '../types/component-registry.js';

export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

const dashboardDbPathOverride = String(process.env.DS_DASHBOARD_DB_PATH || '').trim();
export const DEFAULT_COMPONENT_REGISTRY_PATH = dashboardDbPathOverride
  ? path.resolve(dashboardDbPathOverride)
  : path.join(PROJECT_ROOT, 'apps/ds-dashboard/server/db/ds-dashboard.db');

// Re-export from types to maintain single source of truth
export const PIPELINE_STAGE_ORDER = PipelineStageOrder;
