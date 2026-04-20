import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUTE_PATTERNS,
  toSystemOverview,
  toSystemAdmin,
  toSystemConsumers,
  toSystemOperations,
} from './routes';
import { resolveSystemTab } from './resolve-system-tab';

describe('ROUTE_PATTERNS', () => {
  it('defines new system route as /new', () => {
    assert.equal(ROUTE_PATTERNS.newSystem, '/new');
  });

  it('defines system overview pattern with :systemId', () => {
    assert.equal(ROUTE_PATTERNS.systemOverview, '/system/:systemId/overview');
  });

  it('defines system admin pattern with :systemId', () => {
    assert.equal(ROUTE_PATTERNS.systemAdmin, '/system/:systemId/admin');
  });

  it('defines system consumers pattern with :systemId', () => {
    assert.equal(ROUTE_PATTERNS.systemConsumers, '/system/:systemId/consumers');
  });

  it('defines system operations pattern with :systemId', () => {
    assert.equal(
      ROUTE_PATTERNS.systemOperations,
      '/system/:systemId/operations',
    );
  });

  it('does not expose legacy system routes', () => {
    assert.ok(
      !('system' in ROUTE_PATTERNS),
      'ROUTE_PATTERNS.system should not exist',
    );
    assert.ok(
      !('systemNew' in ROUTE_PATTERNS),
      'ROUTE_PATTERNS.systemNew should not exist',
    );
  });
});

describe('toSystemOverview', () => {
  it('builds overview URL for a given systemId', () => {
    assert.equal(toSystemOverview('abc-123'), '/system/abc-123/overview');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemOverview('my system/id'),
      '/system/my%20system%2Fid/overview',
    );
  });

  it('handles empty systemId gracefully', () => {
    assert.equal(toSystemOverview(''), '/system//overview');
    assert.equal(
      toSystemOverview(null as unknown as string),
      '/system//overview',
    );
  });
});

describe('toSystemAdmin', () => {
  it('builds admin URL for a given systemId', () => {
    assert.equal(toSystemAdmin('xyz-789'), '/system/xyz-789/admin');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemAdmin('my system/id'),
      '/system/my%20system%2Fid/admin',
    );
  });
});

describe('toSystemConsumers', () => {
  it('builds consumers URL for a given systemId', () => {
    assert.equal(toSystemConsumers('xyz-789'), '/system/xyz-789/consumers');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemConsumers('my system/id'),
      '/system/my%20system%2Fid/consumers',
    );
  });
});

describe('toSystemOperations', () => {
  it('builds operations URL for a given systemId', () => {
    assert.equal(toSystemOperations('ops-456'), '/system/ops-456/operations');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemOperations('my system/id'),
      '/system/my%20system%2Fid/operations',
    );
  });
});

describe('resolveSystemTab', () => {
  it('resolves overview tab', () => {
    assert.equal(resolveSystemTab('/system/abc/overview'), 'overview');
  });

  it('resolves admin tab', () => {
    assert.equal(resolveSystemTab('/system/abc/admin'), 'admin');
  });

  it('resolves consumers tab', () => {
    assert.equal(resolveSystemTab('/system/abc/consumers'), 'consumers');
  });

  it('resolves operations tab', () => {
    assert.equal(resolveSystemTab('/system/abc/operations'), 'operations');
  });

  it('falls back to overview for bare system path', () => {
    assert.equal(resolveSystemTab('/system/abc'), 'overview');
  });

  it('falls back to overview for unknown tab', () => {
    assert.equal(resolveSystemTab('/system/abc/settings'), 'overview');
  });

  it('falls back to overview for root path', () => {
    assert.equal(resolveSystemTab('/'), 'overview');
  });

  it('falls back to overview for /new path', () => {
    assert.equal(resolveSystemTab('/new'), 'overview');
  });

  it('falls back to overview for tokens page', () => {
    assert.equal(resolveSystemTab('/tokens'), 'overview');
  });
});
