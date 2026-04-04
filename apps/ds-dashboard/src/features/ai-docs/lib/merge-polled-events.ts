import type { AiJobEvent } from "@/types/ai-jobs";

/**
 * Merge polled events into previous events, deduplicating by seq.
 * Keeps original order: previous events first, then truly new polled events.
 */
export function mergePolledEvents(prev: AiJobEvent[], polled: AiJobEvent[]): AiJobEvent[] {
  const existingSeqs = new Set(prev.map((event) => event.seq));
  const newEvents = polled.filter((event) => !existingSeqs.has(event.seq));
  if (newEvents.length === 0) return prev;
  return [...prev, ...newEvents];
}
