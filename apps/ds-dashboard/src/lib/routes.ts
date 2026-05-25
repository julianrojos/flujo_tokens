export const ROUTE_PATTERNS = {
  root: '/',
  newSystem: '/new',
  systemOverview: '/:systemId/overview',
  systemAdmin: '/:systemId/admin',
  systemConsumers: '/:systemId/consumers',
  systemConsumersOverview: '/:systemId/consumers/overview',
  systemConsumerDetail: '/:systemId/consumers/:consumerName',
  tokens: '/tokens',
  tokenDetail: '/tokens/:tokenPath',
  components: '/components',
  componentDetail: '/components/:slug',
  componentEditDocs: '/components/:slug/edit-docs',
  consumers: '/consumers',
} as const;

function toSystemRoute(systemId: string, suffix: string): string {
  const normalizedSystemId = String(systemId || '').trim();
  return normalizedSystemId
    ? `/${encodeURIComponent(normalizedSystemId)}${suffix}`
    : suffix.replace(/^\/+/, '/');
}

export const toSystemOverview = (systemId: string): string =>
  toSystemRoute(systemId, '/overview');

export const toSystemAdmin = (systemId: string): string =>
  toSystemRoute(systemId, '/admin');

export const toSystemConsumers = (systemId: string): string =>
  toSystemRoute(systemId, '/consumers');

export const toSystemConsumersOverview = (systemId: string): string =>
  toSystemRoute(systemId, '/consumers/overview');

export const toSystemConsumerDetail = (
  systemId: string,
  consumerId: string,
): string => toSystemRoute(systemId, `/consumers/${encodeURIComponent(String(consumerId || ''))}`);

export const toTokenDetail = (tokenPath: string): string =>
  `/tokens/${encodeURIComponent(String(tokenPath || ''))}`;

export const toComponentDetail = (slug: string): string =>
  `/components/${encodeURIComponent(String(slug || ''))}`;

export const toComponentEditDocs = (slug: string): string =>
  `${toComponentDetail(slug)}/edit-docs`;
