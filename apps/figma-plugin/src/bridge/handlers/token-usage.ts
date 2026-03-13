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
    const allVariables = await figma.variables.getLocalVariablesAsync();

    if (!force && allVariables.length > 100) {
        console.log(
            `[Bridge] Warning: Large number of variables (${allVariables.length}). Use force: true to proceed.`
        );
    }

    // BFS configuration
    const MAX_TIME_MS = 10000; // 10 second time budget
    const CHECK_INTERVAL = 100; // Check time every N nodes

    // Usage tracking
    const usageMap = new Map<string, string[]>();
    let scanned = 0;
    let truncated = false;
    const start = Date.now();

    // BFS queue
    const queue: SceneNode[] = [root as SceneNode];

    while (queue.length > 0 && scanned < maxNodes) {
        // Check time budget periodically
        if (scanned % CHECK_INTERVAL === 0 && Date.now() - start > MAX_TIME_MS) {
            console.log(`[Bridge] Token usage scan time budget exceeded after ${scanned} nodes`);
            truncated = true;
            break;
        }

        const node = queue.shift()!;
        scanned++;

        // Check for bound variables
        if ('boundVariables' in node && node.boundVariables) {
            const boundVars = node.boundVariables;

            for (const bindingArray of Object.values(boundVars)) {
                const bindings = Array.isArray(bindingArray) ? bindingArray : [bindingArray];

                for (const binding of bindings) {
                    if (binding && typeof binding === 'object' && 'id' in binding) {
                        const varId = (binding as { id: string }).id;

                        if (!usageMap.has(varId)) {
                            usageMap.set(varId, []);
                        }
                        usageMap.get(varId)!.push(node.id);
                    }
                }
            }
        }

        // Add children to queue
        if ('children' in node) {
            queue.push(...(node as FrameNode).children);
        }
    }

    // Build usage entries (limit nodeIds per entry to 50)
    const MAX_NODE_IDS_PER_ENTRY = 50;
    const usage: TokenUsageEntry[] = [];

    for (const [variableId, nodeIds] of usageMap) {
        const variable = allVariables.find((v) => v.id === variableId);

        usage.push({
            variableId,
            variableName: variable?.name || `unknown (${variableId})`,
            nodeCount: nodeIds.length,
            nodeIds: nodeIds.slice(0, MAX_NODE_IDS_PER_ENTRY),
        });
    }

    // Find unused variables
    const usedVariableIds = new Set(usageMap.keys());
    const unusedVariableIds = allVariables
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
