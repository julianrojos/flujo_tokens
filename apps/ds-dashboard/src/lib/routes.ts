export const ROUTE_PATTERNS = {
  root: '/',
  newSystem: '/new',
  systemOverview: '/:systemId/overview',
  systemAdmin: '/:systemId/admin',
  systemConsumers: '/:systemId/consumers',
  systemOperations: '/:systemId/operations',
  tokens: '/tokens',
  tokenDetail: '/tokens/:tokenPath',
  tokenGraph: '/tokens/:tokenPath/graph',
  components: '/components',
  componentDetail: '/components/:slug',
  componentEditDocs: '/components/:slug/edit-docs',
  consumers: '/consumers',
  consumerDetail: '/consumers/:consumerId',
} as const;

export const toSystemOverview = (systemId: string): string =>
  `/${encodeURIComponent(String(systemId || ''))}/overview`;

export const toSystemAdmin = (systemId: string): string =>
  `/${encodeURIComponent(String(systemId || ''))}/admin`;

export const toSystemConsumers = (systemId: string): string =>
  `/${encodeURIComponent(String(systemId || ''))}/consumers`;

export const toSystemOperations = (systemId: string): string =>
  `/${encodeURIComponent(String(systemId || ''))}/operations`;

export const toTokenDetail = (tokenPath: string): string =>
  `/tokens/${encodeURIComponent(String(tokenPath || ''))}`;

export const toTokenGraph = (tokenPath: string): string =>
  `${toTokenDetail(tokenPath)}/graph`;

export const toComponentDetail = (slug: string): string =>
  `/components/${encodeURIComponent(String(slug || ''))}`;

export const toComponentEditDocs = (slug: string): string =>
  `${toComponentDetail(slug)}/edit-docs`;

export const toConsumerDetail = (consumerId: string): string =>
  `/consumers/${encodeURIComponent(String(consumerId || ''))}`;
