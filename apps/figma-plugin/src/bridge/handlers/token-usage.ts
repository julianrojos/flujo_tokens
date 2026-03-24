/**
 * Token Usage Handler
 *
 * Handler for getting token usage information:
 * - GET_TOKEN_USAGE: Scan document to find which nodes use which variables
 */

import {
    GetTokenUsageParams,
    GetTokenUsageResult,
    TokenUsageEntry,
    createBridgeError,
    ERROR_CODES,
} from '../protocol';

/**
 * GET_TOKEN_USAGE - Scan document to find which nodes use which variables.
 * Uses BFS with time and node count limits.
 */
export async function handleGetTokenUsage(
    params: GetTokenUsageParams
): Promise<GetTokenUsageResult> {
    console.log('[Bridge] Getting token usage:', params);

    const { pageId, maxNodes = 10000, force = false } = params;

    // Get root node
    let root: PageNode | SceneNode;
    if (pageId) {
        const node = await figma.getNodeByIdAsync(pageId);
        if (!node) {
            throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${pageId}`);
        }
        root = node as PageNode | SceneNode;
    } else {
        root = figma.currentPage;
    }

    // Check if we should proceed (large documents)
    // getLocalVariablesAsync only returns variables defined in this file;
    // library variables imported from other files are NOT included.
    const allLocalVariables = await figma.variables.getLocalVariablesAsync();

    if (!force && allLocalVariables.length > 100) {
        console.log(
            `[Bridge] Warning: Large number of variables (${allLocalVariables.length}). Use force: true to proceed.`
        );
    }

    // BFS configuration
    const MAX_TIME_MS = 10000; // 10 second time budget
    const CHECK_INTERVAL = 100; // Check time every N nodes
    // Compact at most once to release memory without repeatedly paying splice() cost.
    const QUEUE_COMPACTION_THRESHOLD = 4096;

    // Usage tracking: keep exact nodeCount and a bounded node-id sample per variable
    const MAX_NODE_IDS_PER_ENTRY = 50;
    const usageMap = new Map<string, { nodeCount: number; nodeIds: string[] }>();
    let scanned = 0;
    let truncated = false;
    const start = Date.now();

    // BFS queue (index-based traversal to avoid O(n) Array.shift())
    const queue: SceneNode[] = [root as SceneNode];
    let queueIndex = 0;
    let queueCompactions = 0;
    while (queueIndex < queue.length && scanned < maxNodes) {
        // Check time budget periodically
        if (scanned % CHECK_INTERVAL === 0 && Date.now() - start > MAX_TIME_MS) {
            console.log(`[Bridge] Token usage scan time budget exceeded after ${scanned} nodes`);
            truncated = true;
            break;
        }

        const node = queue[queueIndex]!;
        queueIndex += 1;
        scanned++;

        // Check for bound variables
        if ('boundVariables' in node && node.boundVariables) {
            const boundVars = node.boundVariables;

            for (const bindingArray of Object.values(boundVars)) {
                const bindings = Array.isArray(bindingArray) ? bindingArray : [bindingArray];

                for (const binding of bindings) {
                    if (binding && typeof binding === 'object' && 'id' in binding) {
                        const varId = (binding as { id: string }).id;
                        const entry = usageMap.get(varId) ?? { nodeCount: 0, nodeIds: [] };
                        entry.nodeCount += 1;
                        if (entry.nodeIds.length < MAX_NODE_IDS_PER_ENTRY) {
                            entry.nodeIds.push(node.id);
                        }
                        usageMap.set(varId, entry);
                    }
                }
            }
        }

        // Add children to queue
        if ('children' in node) {
            queue.push(...(node as FrameNode).children);
        }

        if (
            queueCompactions === 0 &&
            queueIndex >= QUEUE_COMPACTION_THRESHOLD &&
            queueIndex * 2 > queue.length
        ) {
            queue.splice(0, queueIndex);
            queueIndex = 0;
            queueCompactions += 1;
        }
    }

    // Build usage entries
    const usage: TokenUsageEntry[] = [];

    // Index local variables by ID for O(1) lookup
    const localVariableById = new Map<string, Variable>();
    for (const v of allLocalVariables) {
        localVariableById.set(v.id, v);
    }

    // Collect IDs that need async resolution (library variables not in local set)
    const unresolvedIds: string[] = [];
    for (const variableId of usageMap.keys()) {
        if (!localVariableById.has(variableId)) {
            unresolvedIds.push(variableId);
        }
    }

    // Resolve library variables in parallel with concurrency limit
    // 10 keeps latency reasonable without hammering plugin runtime with unresolved IDs.
    const CONCURRENCY = 10;
    const resolvedById = new Map<string, Variable | null>();
    for (let i = 0; i < unresolvedIds.length; i += CONCURRENCY) {
        const batch = unresolvedIds.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map((id) => figma.variables.getVariableByIdAsync(id))
        );
        for (let j = 0; j < batch.length; j++) {
            const r = results[j];
            resolvedById.set(batch[j], r.status === 'fulfilled' ? r.value : null);
        }
    }

    for (const [variableId, usageEntry] of usageMap) {
        const variable = localVariableById.get(variableId) ?? resolvedById.get(variableId) ?? null;

        usage.push({
            variableId,
            variableName: variable?.name ?? `unknown (${variableId})`,
            variableKey: variable?.key,
            variableType: variable?.resolvedType,
            nodeCount: usageEntry.nodeCount,
            nodeIds: usageEntry.nodeIds,
        });
    }

    // Find unused variables
    const usedVariableIds = new Set(usageMap.keys());
    const unusedVariableIds = allLocalVariables
        .filter((v) => !usedVariableIds.has(v.id))
        .map((v) => v.id);

    // Sort usage by node count descending
    usage.sort((a, b) => b.nodeCount - a.nodeCount);

    console.log(
        `[Bridge] Token usage scan complete: ${usage.length} used, ${unusedVariableIds.length} unused, ${scanned} nodes scanned, truncated: ${truncated}`
    );

    return {
        success: true,
        usage,
        unusedVariableIds,
        scannedNodeCount: scanned,
        truncated,
    };
}
