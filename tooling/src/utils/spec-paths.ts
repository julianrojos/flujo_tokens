/**
 * Spec Paths Utilities
 */

import * as path from 'node:path';

/**
 * Build output path for a component spec.
 */
export function buildSpecOutputPath(
    args: { output?: string } | Record<string, string | boolean>,
    specRoot: string,
    componentSlug?: string,
    nodeId?: string,
): string {
    if (typeof args.output === 'string' && args.output) {
        return path.resolve(args.output);
    }

    if (componentSlug) {
        return path.join(path.resolve(specRoot), `${componentSlug}.yml`);
    }

    if (nodeId) {
        return path.join(
            path.resolve(specRoot),
            `component_${nodeId.replace(':', '_')}.yml`,
        );
    }

    return '';
}
