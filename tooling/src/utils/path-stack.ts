/**
 * Small helpers for safely mutating path stacks with guaranteed rollback.
 */

export function withPathSegment<T>(stack: string[], segment: string, fn: () => T): T {
    stack.push(segment);
    try {
        return fn();
    } finally {
        stack.pop();
    }
}
