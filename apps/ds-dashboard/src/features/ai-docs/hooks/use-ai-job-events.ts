/**
 * useAiJobEvents Hook
 * SSE hook for real-time job event streaming with polling fallback
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildAiJobEventsUrl } from '@/types/ai-jobs';
import type { AiJobEvent, AiJobStatus } from '@/types/ai-jobs';

const MAX_SSE_RETRIES = 2;
const POLLING_INTERVAL = 2000;

export interface UseAiJobEventsOptions {
    /** Job ID to stream events for */
    jobId: string | null;
    /** Callback when job reaches terminal state */
    onDone?: (status: AiJobStatus) => void;
}

export interface UseAiJobEventsResult {
    /** Accumulated events from SSE stream */
    events: AiJobEvent[];
    /** Whether SSE is currently streaming */
    isStreaming: boolean;
    /** Whether the job is done (terminal state) */
    isDone: boolean;
    /** Whether there was a connection error */
    connectionError: boolean;
    /** Current cursor position */
    cursor: number;
}

/**
 * Merge polled events into previous events, deduplicating by seq.
 * Keeps original order: previous events first, then truly new polled events.
 */
export function mergePolledEvents(prev: AiJobEvent[], polled: AiJobEvent[]): AiJobEvent[] {
    const existingSeqs = new Set(prev.map((e) => e.seq));
    const newEvents = polled.filter((e) => !existingSeqs.has(e.seq));
    if (newEvents.length === 0) return prev;
    return [...prev, ...newEvents];
}

export function useAiJobEvents({ jobId, onDone }: UseAiJobEventsOptions): UseAiJobEventsResult {
    const [events, setEvents] = useState<AiJobEvent[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [connectionError, setConnectionError] = useState(false);
    const [cursor, setCursor] = useState(0);

    const eventSourceRef = useRef<EventSource | null>(null);
    const sseRetriesRef = useRef(0);
    const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastEventIdRef = useRef(0);
    const isCleaningRef = useRef(false);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cleanup = useCallback(() => {
        if (isCleaningRef.current) {
            return; // Prevent concurrent cleanup
        }
        isCleaningRef.current = true;

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
            pollingTimeoutRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        isCleaningRef.current = false;
    }, []);

    // Cleanup on unmount or jobId change
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    // Reset state when jobId changes
    useEffect(() => {
        if (jobId) {
            setIsDone(false);
            setEvents([]);
            setCursor(0);
            lastEventIdRef.current = 0;
            setConnectionError(false);
            sseRetriesRef.current = 0;
            reconnectTimeoutRef.current = null;
        }
    }, [jobId]);

    // Start SSE connection
    useEffect(() => {
        if (!jobId || isDone) {
            return;
        }

        // Reset state
        setConnectionError(false);
        sseRetriesRef.current = 0;

        const connectSSE = () => {
            if (!jobId || isDone) return;

            const url = buildAiJobEventsUrl(jobId, lastEventIdRef.current);
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            setIsStreaming(true);

            eventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data) as AiJobEvent;
                    // Deduplicate by seq — events arrive in order, so last element has the highest seq
                    setEvents(prev => {
                        const maxSeq = prev.length > 0 ? prev[prev.length - 1].seq : -1;
                        if (data.seq > maxSeq) {
                            return [...prev, data];
                        }
                        return prev;
                    });
                    lastEventIdRef.current = data.seq;
                    setCursor(data.seq);
                } catch (err) {
                    console.error('Failed to parse SSE message:', err);
                }
            };

            eventSource.onerror = () => {
                setIsStreaming(false);
                eventSource.close();
                eventSourceRef.current = null;

                sseRetriesRef.current += 1;

                if (sseRetriesRef.current >= MAX_SSE_RETRIES) {
                    // Max retries reached, enable polling fallback
                    setConnectionError(true);
                    return;
                }

                // Retry SSE connection
                reconnectTimeoutRef.current = setTimeout(connectSSE, 1000);
            };

            eventSource.addEventListener('done', (e) => {
                try {
                    const data = JSON.parse(e.data) as { status: AiJobStatus };
                    setIsDone(true);
                    setIsStreaming(false);
                    onDone?.(data.status);
                    cleanup();
                } catch (err) {
                    console.error('Failed to parse done event:', err);
                }
            });
        };

        connectSSE();

        return () => {
            cleanup();
        };
    }, [jobId, isDone, onDone, cleanup]);

    // Cleanup reconnect timeout when effect ends
    useEffect(() => {
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, [jobId, isDone]);

    // Polling fallback when SSE fails - polls GET /api/ai/jobs/:id for status
    useEffect(() => {
        if (!connectionError || !jobId || isDone) {
            return;
        }

        const poll = async () => {
            if (isDone || !jobId) return;

            try {
                const response = await fetch(`/api/ai/jobs/${jobId}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                });

                if (response.ok) {
                    const job = await response.json();

                    // Add new events from polling (deduplicated against previous state)
                    if (job.events && job.events.length > 0) {
                        setEvents(prev => {
                            return mergePolledEvents(prev, job.events as AiJobEvent[]);
                        });

                        // Update cursor to latest
                        const latestSeq = Math.max(...job.events!.map((e: AiJobEvent) => e.seq));
                        setCursor(latestSeq);
                        lastEventIdRef.current = latestSeq;
                    }

                    // Check if job reached terminal state
                    if (job.done) {
                        setIsDone(true);
                        onDone?.(job.status);
                        return; // Stop polling
                    }
                }
            } catch (err) {
                // Polling failed, will retry
            }

            // Continue polling if not done
            pollingTimeoutRef.current = setTimeout(poll, POLLING_INTERVAL);
        };

        // Start polling after a delay
        pollingTimeoutRef.current = setTimeout(poll, POLLING_INTERVAL);

        return () => {
            if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
            }
        };
    }, [connectionError, jobId, isDone, onDone]);

    return {
        events,
        isStreaming,
        isDone,
        connectionError,
        cursor,
    };
}
