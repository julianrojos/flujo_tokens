/**
 * Component Registry Constants
 *
 * Shared configuration for component registry.
 */

import { PIPELINE_STAGE_ORDER as PipelineStageOrder } from '../types/component-registry.js';
import { resolveDashboardDbUrl } from '../../../apps/ds-dashboard/server/db/pg-db-service.js';

export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

const dashboardDbUrlOverride = String(process.env.DATABASE_URL || '').trim();
export const DEFAULT_COMPONENT_REGISTRY_PATH = dashboardDbUrlOverride
  ? dashboardDbUrlOverride
  : resolveDashboardDbUrl(process.env);

// Re-export from types to maintain single source of truth
export const PIPELINE_STAGE_ORDER = PipelineStageOrder;
