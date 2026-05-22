import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUTE_PATTERNS,
  toSystemOverview,
  toSystemAdmin,
  toSystemConsumers,
  toSystemConsumerDetail,
} from './routes';
import { resolveSystemTab } from './resolve-system-tab';

describe('ROUTE_PATTERNS', () => {
  it('defines new system route as /new', () => {
    assert.equal(ROUTE_PATTERNS.newSystem, '/new');
  });

  it('defines system overview pattern with :systemId', () => {
    assert.equal(ROUTE_PATTERNS.systemOverview, '/:systemId/overview');
  });

  it('defines system admin pattern with :systemId', () => {
    assert.equal(ROUTE_PATTERNS.systemAdmin, '/:systemId/admin');
  });

  it('defines system consumers pattern with :systemId', () => {
    assert.equal(ROUTE_PATTERNS.systemConsumers, '/:systemId/consumers');
  });

  it('defines system consumer detail pattern with :systemId and :consumerName', () => {
    assert.equal(
      ROUTE_PATTERNS.systemConsumerDetail,
      '/:systemId/consumers/:consumerName',
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
    assert.equal(toSystemOverview('abc-123'), '/abc-123/overview');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemOverview('my system/id'),
      '/my%20system%2Fid/overview',
    );
  });

  it('handles empty systemId gracefully', () => {
    assert.equal(toSystemOverview(''), '/overview');
    assert.equal(toSystemOverview(null as unknown as string), '/overview');
  });
});

describe('toSystemAdmin', () => {
  it('builds admin URL for a given systemId', () => {
    assert.equal(toSystemAdmin('xyz-789'), '/xyz-789/admin');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemAdmin('my system/id'),
      '/my%20system%2Fid/admin',
    );
  });

  it('handles empty systemId gracefully', () => {
    assert.equal(toSystemAdmin(''), '/admin');
    assert.equal(toSystemAdmin(null as unknown as string), '/admin');
  });
});

describe('toSystemConsumers', () => {
  it('builds consumers URL for a given systemId', () => {
    assert.equal(toSystemConsumers('xyz-789'), '/xyz-789/consumers');
  });

  it('URL-encodes the systemId', () => {
    assert.equal(
      toSystemConsumers('my system/id'),
      '/my%20system%2Fid/consumers',
    );
  });

  it('handles empty systemId gracefully', () => {
    assert.equal(toSystemConsumers(''), '/consumers');
    assert.equal(toSystemConsumers(null as unknown as string), '/consumers');
  });
});

describe('toSystemConsumerDetail', () => {
  it('builds system consumer detail URL for a given systemId and consumerId', () => {
    assert.equal(
      toSystemConsumerDetail('xyz-789', 'consumer-1'),
      '/xyz-789/consumers/consumer-1',
    );
  });

  it('URL-encodes both identifiers', () => {
    assert.equal(
      toSystemConsumerDetail('my system/id', 'consumer/name'),
      '/my%20system%2Fid/consumers/consumer%2Fname',
    );
  });
});

describe('resolveSystemTab', () => {
  it('resolves overview tab', () => {
    assert.equal(resolveSystemTab('/abc/overview'), 'overview');
  });

  it('resolves admin tab', () => {
    assert.equal(resolveSystemTab('/abc/admin'), 'admin');
  });

  it('resolves consumers tab', () => {
    assert.equal(resolveSystemTab('/abc/consumers'), 'consumers');
  });

  it('falls back to overview for bare system path', () => {
    assert.equal(resolveSystemTab('/abc'), 'overview');
  });

  it('falls back to overview for unknown tab', () => {
    assert.equal(resolveSystemTab('/abc/settings'), 'overview');
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
