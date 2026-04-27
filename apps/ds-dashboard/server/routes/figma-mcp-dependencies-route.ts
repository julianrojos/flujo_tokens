import type { Context } from 'hono';
import type { ConnInfo } from 'hono/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Sql } from 'postgres';
import { isLoopbackAddress } from '../lib/loopback-utils.js';
import { DEFAULT_CONSUMER_STALE_HOURS } from '../lib/dependency-sync-constants.js';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DependencySyncService, type SystemConfig } from '../services/dependency-sync-service.js';
import { DependencyAnalysisService } from '../services/dependency-analysis-service.js';
import { DependencySimulateService } from '../services/dependency-simulate-service.js';
import { extractFileKey } from '../lib/filekey-utils.js';
import { resolveEnvRef } from '../lib/env-ref-utils.js';

// Validation helpers
function validateAddConsumerBody(body: Record<string, unknown>) {
  const errors: string[] = [];
  const hasNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  if (!hasNonEmptyString(body.dsFileKey)) {
    errors.push('dsFileKey is required and must be a non-empty string');
  }

  if (!hasNonEmptyString(body.consumerFileUrl)) {
    errors.push('consumerFileUrl is required');
  }

  if (!hasNonEmptyString(body.consumerName)) {
    errors.push('Consumer name is required and must be a non-empty string');
  }

  return errors;
}

function validateSyncConsumersBody(body: Record<string, unknown>) {
  const errors: string[] = [];

  if (!body.dsFileKey || typeof body.dsFileKey !== 'string' || body.dsFileKey.trim().length === 0) {
    errors.push('DS file key is required and must be a non-empty string');
  }

  if (
    body.consumerIds !== undefined &&
    (!Array.isArray(body.consumerIds) ||
      !body.consumerIds.every((id) => typeof id === 'string' && id.trim().length > 0))
  ) {
    errors.push('consumerIds must be an array of strings');
  }

  if (body.force !== undefined && typeof body.force !== 'boolean') {
    errors.push('force must be a boolean');
  }

  if (body.captureParentUsage !== undefined && typeof body.captureParentUsage !== 'boolean') {
    errors.push('captureParentUsage must be a boolean');
  }

  return errors;
}

function validateSimulateChangeBody(body: Record<string, unknown>) {
  const errors: string[] = [];

  if (!body.dsFileKey || typeof body.dsFileKey !== 'string' || body.dsFileKey.trim().length === 0) {
    errors.push('DS file key is required and must be a non-empty string');
  }

  if (!body.variableKey || typeof body.variableKey !== 'string' || body.variableKey.trim().length === 0) {
    errors.push('Variable key is required and must be a non-empty string');
  }

  return errors;
}

function validateReportQuery(query: Record<string, unknown>) {
  const errors: string[] = [];

  if (!query.dsFileKey || typeof query.dsFileKey !== 'string' || query.dsFileKey.trim().length === 0) {
    errors.push('DS file key is required and must be a non-empty string');
  }

  if (query.componentKey !== undefined && typeof query.componentKey !== 'string') {
    errors.push('componentKey must be a string');
  }

  if (query.variableKey !== undefined && typeof query.variableKey !== 'string') {
    errors.push('variableKey must be a string');
  }

  return errors;
}

function withParentFileName(
  reports: Array<{
    consumers: Array<{ consumerId: string; consumerName: string }>;
  }>,
  parentFileName: string,
) {
  if (!parentFileName.trim()) return reports;
  return reports.map((report) => ({
    ...report,
    consumers: report.consumers.map((consumer) =>
      consumer.consumerName === 'Parent file'
        ? { ...consumer, consumerName: parentFileName }
        : consumer,
      ),
  }));
}

async function resolveParentFileNameByDsFileKey(db: Sql, dsFileKey: string): Promise<string> {
  const normalizedDsFileKey = String(dsFileKey || '').trim();
  if (!normalizedDsFileKey) return '';
  const rows = (await db`
    SELECT name
    FROM design_systems
    WHERE figma_file_id = ${normalizedDsFileKey}
    LIMIT 1
  `) as Array<{ name?: string | null }>;
  return String(rows[0]?.name || '').trim();
}

type RouteDeps = {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  db: Sql;
  getSystemConfig: (c: Context) => SystemConfig;
  getSystemConfigByDsFileKey?: (dsFileKey: string) => SystemConfig | null;
};

function isAuthorized(c: Context, deps: RouteDeps): boolean {
  const getConnInfoFn = deps.getConnInfoFn || getConnInfo;
  const connInfo = getConnInfoFn(c);
  const remoteAddr = connInfo.remote.address;

  // Allow loopback connections
  if (remoteAddr && isLoopbackAddress(remoteAddr)) {
    return true;
  }

  // Check internal token if provided
  if (deps.internalToken) {
    const authHeader = c.req.header('Authorization');
    if (authHeader === `Bearer ${deps.internalToken}`) {
      return true;
    }
  }

  return false;
}

/**
 * Register dependency tracking routes
 */
export function registerFigmaMcpDependenciesRoutes(
  app: any,
  deps: RouteDeps
) {
  const repository = new DependencyRepository(deps.db);
  const syncService = new DependencySyncService(repository, deps.getSystemConfig);
  const analysisService = new DependencyAnalysisService(repository);
  const simulateService = new DependencySimulateService(repository);

  // POST /api/figma-mcp/dependencies/consumers - Add consumer
  app.post('/api/figma-mcp/dependencies/consumers', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(c);
    } catch {
      return c.json({
        ok: false,
        code: 'deps.validation.invalid_json',
        message: 'Invalid JSON in request body',
      }, 400);
    }

    const validationErrors = validateAddConsumerBody(body);
    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const dsFileKey = body.dsFileKey as string;
      const consumerFileKey = extractFileKey(body.consumerFileUrl as string);

      if (!consumerFileKey) {
        return c.json({
          ok: false,
          code: 'deps.validation.invalid_consumer_file',
          message: 'Invalid consumer file URL',
        }, 400);
      }

      const consumer = await repository.addConsumer({
        ds_file_key: dsFileKey as string,
        consumer_file_key: consumerFileKey as string,
        consumer_name: body.consumerName as string,
      });

      return c.json({
        ok: true,
        data: consumer,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        const err = error as any;
        if (err.code === 'deps.consumer.duplicate') {
          return c.json({
            ok: false,
            code: err.code,
            message: err.message,
          }, 409);
        }
      }

      console.error('Error adding consumer:', error);
      return c.json({
        ok: false,
        code: 'deps.consumer.add_failed',
        message: 'Failed to add consumer',
      }, 500);
    }
  });

  // GET /api/figma-mcp/dependencies/consumers - List consumers
  app.get('/api/figma-mcp/dependencies/consumers', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const query = c.req.query();
    const validationErrors = validateReportQuery(query);

    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const consumers = await repository.listConsumers(query.dsFileKey);

      return c.json({
        ok: true,
        data: consumers,
      });
    } catch (error) {
      console.error('Error listing consumers:', error);
      return c.json({
        ok: false,
        code: 'deps.consumer.list_failed',
        message: 'Failed to list consumers',
      }, 500);
    }
  });

  // DELETE /api/figma-mcp/dependencies/consumers/:consumerId - Remove consumer
  app.delete('/api/figma-mcp/dependencies/consumers/:consumerId', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    try {
      const consumerId = c.req.param('consumerId');

      if (!consumerId) {
        return c.json({
          ok: false,
          code: 'deps.validation.missing_consumer_id',
          message: 'Consumer ID is required',
        }, 400);
      }

      const consumer = await repository.getConsumer(consumerId);
      if (!consumer) {
        return c.json({
          ok: false,
          code: 'deps.consumer.not_found',
          message: 'Consumer not found',
        }, 404);
      }

      await repository.removeConsumer(consumerId);

      return c.json({
        ok: true,
        data: { consumerId },
      });
    } catch (error) {
      console.error('Error removing consumer:', error);
      return c.json({
        ok: false,
        code: 'deps.consumer.remove_failed',
        message: 'Failed to remove consumer',
      }, 500);
    }
  });

  // GET /api/figma-mcp/dependencies/consumers/:consumerId - Get single consumer
  app.get('/api/figma-mcp/dependencies/consumers/:consumerId', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    try {
      const consumerId = c.req.param('consumerId');

      if (!consumerId) {
        return c.json({
          ok: false,
          code: 'deps.validation.missing_consumer_id',
          message: 'Consumer ID is required',
        }, 400);
      }

      const consumer = await repository.getConsumer(consumerId);
      if (!consumer) {
        return c.json({
          ok: false,
          code: 'deps.consumer.not_found',
          message: 'Consumer not found',
        }, 404);
      }

      return c.json({
        ok: true,
        data: consumer,
      });
    } catch (error) {
      console.error('Error getting consumer:', error);
      return c.json({
        ok: false,
        code: 'deps.consumer.get_failed',
        message: 'Failed to load consumer',
      }, 500);
    }
  });

  // POST /api/figma-mcp/dependencies/sync - Trigger sync
  app.post('/api/figma-mcp/dependencies/sync', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(c);
    } catch {
      return c.json({
        ok: false,
        code: 'deps.validation.invalid_json',
        message: 'Invalid JSON in request body',
      }, 400);
    }

    const validationErrors = validateSyncConsumersBody(body);
    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const dsFileKey = String(body.dsFileKey || '').trim();
      const systemByDsFile = deps.getSystemConfigByDsFileKey?.(dsFileKey);
      const rawTokenRef = String(
        systemByDsFile?.figmaApiToken ||
          deps.getSystemConfig(c).figmaApiToken ||
          '',
      );
      const resolvedToken = resolveEnvRef(rawTokenRef);
      if (!resolvedToken) {
        return c.json({
          ok: false,
          code: 'deps.sync.no_token',
          message: 'Figma API token not resolved from system config',
        }, 500);
      }

      const result = await syncService.syncConsumers({
        dsFileKey,
        consumerIds: body.consumerIds as string[],
        force: body.force as boolean,
        token: resolvedToken,
        captureParentUsage: body.captureParentUsage === true,
      });

      return c.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      console.error('Error during sync:', error);

      if (error && typeof error === 'object' && 'code' in error) {
        const err = error as any;
        return c.json({
          ok: false,
          code: err.code,
          message: err.message,
        }, 500);
      }

      return c.json({
        ok: false,
        code: 'deps.sync.failed',
        message: 'Sync operation failed',
      }, 500);
    }
  });

  // GET /api/figma-mcp/dependencies/report/by-file - Report by file
  app.get('/api/figma-mcp/dependencies/report/by-file', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const query = c.req.query();
    const validationErrors = validateReportQuery(query);

    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const staleOnly = query.stale === 'true';

      const reports = (await analysisService
        .reportByFile(query.dsFileKey))
        .filter((report) => {
          if (!staleOnly) return true;
          const syncedMs = Date.parse(report.lastSyncedAt);
          if (!Number.isFinite(syncedMs)) return true;
          const ageHours = (Date.now() - syncedMs) / (1000 * 60 * 60);
          return ageHours > DEFAULT_CONSUMER_STALE_HOURS;
        });

      return c.json({
        ok: true,
        data: reports,
      });
    } catch (error) {
      console.error('Error generating file report:', error);
      return c.json({
        ok: false,
        code: 'deps.analysis.file_report_failed',
        message: 'Failed to generate file report',
      }, 500);
    }
  });

  // GET /api/figma-mcp/dependencies/report/by-component - Report by component
  app.get('/api/figma-mcp/dependencies/report/by-component', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const query = c.req.query();
    const validationErrors = validateReportQuery(query);

    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const reports = await analysisService.reportByComponent(query.dsFileKey, query.componentKey);

      return c.json({
        ok: true,
        data: reports,
      });
    } catch (error) {
      console.error('Error generating component report:', error);
      return c.json({
        ok: false,
        code: 'deps.analysis.component_report_failed',
        message: 'Failed to generate component report',
      }, 500);
    }
  });

  // GET /api/figma-mcp/dependencies/report/by-variable - Report by variable
  app.get('/api/figma-mcp/dependencies/report/by-variable', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const query = c.req.query();
    const validationErrors = validateReportQuery(query);

    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const parentFileName = await resolveParentFileNameByDsFileKey(deps.db, query.dsFileKey);
      const reports = withParentFileName(
        await analysisService.reportByVariable(query.dsFileKey, query.variableKey),
        parentFileName,
      );

      return c.json({
        ok: true,
        data: reports,
      });
    } catch (error) {
      console.error('Error generating variable report:', error);
      return c.json({
        ok: false,
        code: 'deps.analysis.variable_report_failed',
        message: 'Failed to generate variable report',
      }, 500);
    }
  });

  // POST /api/figma-mcp/dependencies/simulate-change - Simulate variable change
  app.post('/api/figma-mcp/dependencies/simulate-change', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(c);
    } catch {
      return c.json({
        ok: false,
        code: 'deps.validation.invalid_json',
        message: 'Invalid JSON in request body',
      }, 400);
    }

    const validationErrors = validateSimulateChangeBody(body);
    if (validationErrors.length > 0) {
      return c.json({
        ok: false,
        code: 'deps.validation.failed',
        message: 'Validation failed',
        errors: validationErrors,
      }, 400);
    }

    try {
      const result = await simulateService.simulateVariableChange(
        body.dsFileKey as string,
        body.variableKey as string,
        body.proposedValue
      );

      return c.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      console.error('Error simulating change:', error);
      return c.json({
        ok: false,
        code: 'deps.simulate.failed',
        message: 'Failed to simulate change',
      }, 500);
    }
  });

  // GET /api/figma-mcp/dependencies/consumers/:consumerId/runs - List sync runs
  app.get('/api/figma-mcp/dependencies/consumers/:consumerId/runs', async (c: Context) => {
    if (!isAuthorized(c, deps)) {
      return c.json({
        ok: false,
        code: 'deps.unauthorized',
        message: 'Unauthorized access',
      }, 401);
    }

    try {
      const consumerId = c.req.param('consumerId');
      const limitParam = c.req.query('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 20;

      if (!consumerId) {
        return c.json({
          ok: false,
          code: 'deps.validation.missing_consumer_id',
          message: 'Consumer ID is required',
        }, 400);
      }

      if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
        return c.json({
          ok: false,
          code: 'deps.validation.invalid_limit',
          message: 'Limit must be between 1 and 100',
        }, 400);
      }

      const consumer = await repository.getConsumer(consumerId);
      if (!consumer) {
        return c.json({
          ok: false,
          code: 'deps.consumer.not_found',
          message: 'Consumer not found',
        }, 404);
      }

      const runs = await repository.listSyncRuns(consumerId, limit);

      return c.json({
        ok: true,
        data: runs,
      });
    } catch (error) {
      console.error('Error listing sync runs:', error);
      return c.json({
        ok: false,
        code: 'deps.sync_runs.list_failed',
        message: 'Failed to list sync runs',
      }, 500);
    }
  });
}
