export const ROUTE_PATTERNS = {
  root: '/',
  newSystem: '/new',
  systemOverview: '/:systemId/overview',
  systemAdmin: '/:systemId/admin',
  systemConsumers: '/:systemId/consumers',
  tokens: '/tokens',
  tokenDetail: '/tokens/:tokenPath',
  components: '/components',
  componentDetail: '/components/:slug',
  componentEditDocs: '/components/:slug/edit-docs',
  consumers: '/consumers',
  consumerDetail: '/consumers/:consumerId',
} as const;

export const toSystemOverview = (systemId: string): string =>
  String(systemId || '').trim()
    ? `/${encodeURIComponent(String(systemId || ''))}/overview`
    : '/overview';

export const toSystemAdmin = (systemId: string): string =>
  `/${encodeURIComponent(String(systemId || ''))}/admin`;

export const toSystemConsumers = (systemId: string): string =>
  `/${encodeURIComponent(String(systemId || ''))}/consumers`;

export const toTokenDetail = (tokenPath: string): string =>
  `/tokens/${encodeURIComponent(String(tokenPath || ''))}`;

export const toComponentDetail = (slug: string): string =>
  `/components/${encodeURIComponent(String(slug || ''))}`;

export const toComponentEditDocs = (slug: string): string =>
  `${toComponentDetail(slug)}/edit-docs`;

export const toConsumerDetail = (consumerId: string): string =>
  `/consumers/${encodeURIComponent(String(consumerId || ''))}`;
