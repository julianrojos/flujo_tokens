export const ROUTE_PATTERNS = {
  root: '/',
  newSystem: '/new',
  systemOverview: '/system/:systemId/overview',
  systemAdmin: '/system/:systemId/admin',
  systemOperations: '/system/:systemId/operations',
  tokens: '/tokens',
  tokenDetail: '/tokens/:tokenPath',
  tokenGraph: '/tokens/:tokenPath/graph',
  components: '/components',
  componentDetail: '/components/:slug',
  componentEditDocs: '/components/:slug/edit-docs',
  fileViewer: '/file',
  consumers: '/consumers',
  consumerDetail: '/consumers/:consumerId',
} as const;

export const toSystemOverview = (systemId: string): string =>
  `/system/${encodeURIComponent(String(systemId || ''))}/overview`;

export const toSystemAdmin = (systemId: string): string =>
  `/system/${encodeURIComponent(String(systemId || ''))}/admin`;

export const toSystemOperations = (systemId: string): string =>
  `/system/${encodeURIComponent(String(systemId || ''))}/operations`;

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
