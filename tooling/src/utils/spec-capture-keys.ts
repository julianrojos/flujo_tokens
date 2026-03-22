/**
 * Canonical top-level spec key groups used during capture and editorial updates.
 */

export const CAPTURE_KEYS = Object.freeze([
  'anatomy',
  'properties',
  'variants',
  'layout',
] as const);

export type CaptureKey = (typeof CAPTURE_KEYS)[number];

export const EDITORIAL_KEYS = Object.freeze([
  // status remains editorial to prevent recaptures from downgrading ready specs.
  'status',
  'summary',
  'accessibility',
  'token_mapping',
  'best_practices',
  'content_guidelines',
  'qa',
  'related_components',
] as const);

export type EditorialKey = (typeof EDITORIAL_KEYS)[number];

export const IDENTITY_KEYS = Object.freeze([
  'name',
  'figma',
] as const);

export type IdentityKey = (typeof IDENTITY_KEYS)[number];
