/**
 * Token graph builder and query helpers.
 */

import type { IndexingContext, ModeConfig, TokenEdge, TokenGraph, TokenNode, TokenValue } from '../types/tokens.js';
import { isPlainObject, isVariableAlias } from '../types/tokens.js';
import { W3C_REF_REGEX_COLLECT } from '../utils/regex.js';
import { canonicalizeRefPath, normalizePathKey } from '../utils/paths.js';
import { canEmitTokenValue } from '../utils/emittable.js';

type CollectedRef =
    | { kind: 'w3c-ref'; ref: string; canonical: string; normalized: string }
    | { kind: 'alias-id'; ref: string; aliasId: string };

export function getResolvedTokenKeyFromParts(canonical: string, normalized: string, ctx: IndexingContext): string | null {
    const hasKey = (key: string): boolean => ctx.valueMap.has(key) || ctx.refMap.has(key);

    if (ctx.collisionKeys.has(normalized)) return null;
    if (hasKey(canonical)) return canonical;
    if (hasKey(normalized)) return normalized;

    return null;
}

function collectRefsFromValue(value: unknown, refs: CollectedRef[]): void {
    if (isVariableAlias(value)) {
        const id = value.id?.trim();
        if (id) refs.push({ kind: 'alias-id', ref: id, aliasId: id });
        return;
    }

    if (typeof value === 'string') {
        const regex = new RegExp(W3C_REF_REGEX_COLLECT.source, W3C_REF_REGEX_COLLECT.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(value)) !== null) {
            const raw = (match[1] ?? '').trim();
            if (!raw) continue;
            const canonical = canonicalizeRefPath(raw);
            const normalized = normalizePathKey(canonical);
            refs.push({ kind: 'w3c-ref', ref: raw, canonical, normalized });
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectRefsFromValue(item, refs);
        return;
    }

    if (isPlainObject(value)) {
        for (const [key, nested] of Object.entries(value)) {
            if (key.startsWith('$')) continue;
            collectRefsFromValue(nested, refs);
        }
    }
}

function ensureEdgeMapSlot(map: Map<string, TokenEdge[]>, nodeId: string): TokenEdge[] {
    const existing = map.get(nodeId);
    if (existing) return existing;
    const created: TokenEdge[] = [];
    map.set(nodeId, created);
    return created;
}

function computeCycleNodeIds(graph: TokenGraph): Set<string> {
    const indexByNode = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const cycleNodes = new Set<string>();
    let nextIndex = 0;

    const hasSelfLoop = (nodeId: string): boolean => {
        const outgoing = graph.edges.get(nodeId) ?? [];
        return outgoing.some(edge => edge.to === nodeId);
    };

    const strongConnect = (nodeId: string): void => {
        indexByNode.set(nodeId, nextIndex);
        lowLink.set(nodeId, nextIndex);
        nextIndex++;
        stack.push(nodeId);
        onStack.add(nodeId);

        const outgoing = graph.edges.get(nodeId) ?? [];
        for (const edge of outgoing) {
            const target = edge.to;
            if (!graph.nodes.has(target)) continue;

            if (!indexByNode.has(target)) {
                strongConnect(target);
                const currentLow = lowLink.get(nodeId) ?? Number.POSITIVE_INFINITY;
                const targetLow = lowLink.get(target) ?? Number.POSITIVE_INFINITY;
                lowLink.set(nodeId, Math.min(currentLow, targetLow));
                continue;
            }

            if (onStack.has(target)) {
                const currentLow = lowLink.get(nodeId) ?? Number.POSITIVE_INFINITY;
                const targetIndex = indexByNode.get(target) ?? Number.POSITIVE_INFINITY;
                lowLink.set(nodeId, Math.min(currentLow, targetIndex));
            }
        }

        if ((lowLink.get(nodeId) ?? -1) !== (indexByNode.get(nodeId) ?? -2)) return;

        const component: string[] = [];
        while (stack.length > 0) {
            const member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
            if (member === nodeId) break;
        }

        if (component.length > 1) {
            for (const member of component) cycleNodes.add(member);
            return;
        }

        const [single] = component;
        if (single && hasSelfLoop(single)) cycleNodes.add(single);
    };

    for (const nodeId of graph.nodes.keys()) {
        if (!indexByNode.has(nodeId)) strongConnect(nodeId);
    }

    return cycleNodes;
}

export function createTokenGraph(
    ctx: IndexingContext,
    modeConfig?: ModeConfig
): TokenGraph {
    const nodes = new Map<string, TokenNode>();
    const edges = new Map<string, TokenEdge[]>();
    const reverseEdges = new Map<string, TokenEdge[]>();
    const collections = new Map<string, string[]>();
    const modes = new Map<string, ModeConfig>();
    const pathToNodeId = new Map<string, string>();
    const idToNodeId = new Map<string, string>();
    const tokenObjectToNodeId = new WeakMap<object, string>();

    if (modeConfig) {
        modes.set(modeConfig.key, modeConfig);
    }

    const addPathAlias = (aliasKey: string, nodeId: string): void => {
        if (!aliasKey) return;
        if (pathToNodeId.has(aliasKey)) return;
        pathToNodeId.set(aliasKey, nodeId);
    };

    for (const [tokenKey, token] of ctx.valueMap.entries()) {
        if (!token || typeof token !== 'object') continue;

        const tokenObj = token as TokenValue;
        const tokenObjKey = tokenObj as unknown as object;

        let nodeId = tokenObjectToNodeId.get(tokenObjKey);
        if (!nodeId) {
            nodeId = tokenKey;
            tokenObjectToNodeId.set(tokenObjKey, nodeId);

            const path = tokenKey.split('.').filter(Boolean);
            const collection = path[0] ?? 'unknown';
            const cssVar = ctx.refMap.get(tokenKey) ?? ctx.refMap.get(normalizePathKey(tokenKey));

            const node: TokenNode = {
                id: nodeId,
                path,
                value: tokenObj.$value,
                type: tokenObj.$type,
                aliases: [],
                dependents: [],
                metadata: {
                    collection,
                    cssVar,
                    mode: modeConfig?.key
                }
            };

            nodes.set(nodeId, node);
            ensureEdgeMapSlot(edges, nodeId);
            ensureEdgeMapSlot(reverseEdges, nodeId);
        }

        const normalizedKey = normalizePathKey(tokenKey);
        addPathAlias(tokenKey, nodeId);
        addPathAlias(normalizedKey, nodeId);
    }

    for (const [aliasId, tokenKey] of ctx.idToTokenKey.entries()) {
        const normalizedKey = normalizePathKey(tokenKey);
        const nodeId = pathToNodeId.get(tokenKey) ?? pathToNodeId.get(normalizedKey);
        if (!nodeId) continue;
        if (aliasId) idToNodeId.set(aliasId, nodeId);
        const trimmed = aliasId?.trim();
        if (trimmed) idToNodeId.set(trimmed, nodeId);
    }

    const recordCollectionMembership = (nodeId: string, collection: string): void => {
        const bucket = collections.get(collection);
        if (bucket) {
            if (!bucket.includes(nodeId)) bucket.push(nodeId);
            return;
        }
        collections.set(collection, [nodeId]);
    };

    for (const [nodeId, node] of nodes.entries()) {
        recordCollectionMembership(nodeId, node.metadata.collection);

        const refs: CollectedRef[] = [];
        collectRefsFromValue(node.value, refs);

        for (const ref of refs) {
            if (ref.kind === 'w3c-ref') {
                node.aliases.push(`{${ref.ref}}`);

                const resolvedKey = getResolvedTokenKeyFromParts(ref.canonical, ref.normalized, ctx);
                if (!resolvedKey) continue;
                const targetNodeId =
                    pathToNodeId.get(resolvedKey) ??
                    pathToNodeId.get(ref.canonical) ??
                    pathToNodeId.get(ref.normalized);
                if (!targetNodeId) continue;

                const edge: TokenEdge = { from: nodeId, to: targetNodeId, kind: 'w3c-ref', ref: ref.ref };
                ensureEdgeMapSlot(edges, nodeId).push(edge);
                ensureEdgeMapSlot(reverseEdges, targetNodeId).push(edge);
                continue;
            }

            node.aliases.push(`id:${ref.aliasId}`);
            const targetNodeId = idToNodeId.get(ref.aliasId);
            if (!targetNodeId) continue;

            const edge: TokenEdge = { from: nodeId, to: targetNodeId, kind: 'alias-id', ref: ref.aliasId };
            ensureEdgeMapSlot(edges, nodeId).push(edge);
            ensureEdgeMapSlot(reverseEdges, targetNodeId).push(edge);
        }
    }

    for (const [nodeId, node] of nodes.entries()) {
        const incoming = reverseEdges.get(nodeId) ?? [];
        const dependents: string[] = [];
        const seen = new Set<string>();
        for (const edge of incoming) {
            if (seen.has(edge.from)) continue;
            seen.add(edge.from);
            dependents.push(edge.from);
        }
        node.dependents = dependents;
    }

    const graph: TokenGraph = {
        nodes,
        edges,
        reverseEdges,
        collections,
        modes,
        pathToNodeId,
        idToNodeId,
        cycleNodeIds: new Set<string>()
    };

    graph.cycleNodeIds = computeCycleNodeIds(graph);
    return graph;
}

export function buildCycleStatusFromGraph(graph: TokenGraph): Map<string, boolean> {
    const reachable = new Set<string>(graph.cycleNodeIds);
    const queue = Array.from(graph.cycleNodeIds.values());

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const incoming = graph.reverseEdges.get(nodeId) ?? [];
        for (const edge of incoming) {
            if (reachable.has(edge.from)) continue;
            reachable.add(edge.from);
            queue.push(edge.from);
        }
    }

    const out = new Map<string, boolean>();
    for (const nodeId of graph.nodes.keys()) {
        out.set(nodeId, reachable.has(nodeId));
    }
    for (const [aliasKey, nodeId] of graph.pathToNodeId.entries()) {
        out.set(aliasKey, reachable.has(nodeId));
    }
    return out;
}

export function buildEmittableKeySetFromGraph(graph: TokenGraph): Set<string> {
    const emittableNodeIds = new Set<string>();
    for (const [nodeId, node] of graph.nodes.entries()) {
        if (canEmitTokenValue(node.type, node.value)) emittableNodeIds.add(nodeId);
    }

    const out = new Set<string>(emittableNodeIds);
    for (const [aliasKey, nodeId] of graph.pathToNodeId.entries()) {
        if (emittableNodeIds.has(nodeId)) out.add(aliasKey);
    }
    return out;
}

export function getNodeIdByTokenPath(graph: TokenGraph, tokenPath: string): string | undefined {
    const canonical = canonicalizeRefPath(tokenPath);
    const normalized = normalizePathKey(canonical);
    return graph.pathToNodeId.get(canonical) ?? graph.pathToNodeId.get(normalized);
}
