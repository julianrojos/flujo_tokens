import { tsImport } from "tsx/esm/api";

const source = await tsImport("../../../apps/ds-dashboard/server/system-repository.ts", import.meta.url);

export const createDesignSystemRepository = source.createDesignSystemRepository;
export const normalizeSystemId = source.normalizeSystemId;
export const normalizeCollectionList = source.normalizeCollectionList;
export const ensureRelativeDir = source.ensureRelativeDir;
export const normalizeFigmaApiTokenRef = source.normalizeFigmaApiTokenRef;
export const resolveSafeSystemPathsForDeletion = source.resolveSafeSystemPathsForDeletion;
export const summarizeDesignSystemsConfig = source.summarizeDesignSystemsConfig;

// Backward-compatible alias kept for existing script imports.
export const normalizeCollectionNames = source.normalizeCollectionList;
