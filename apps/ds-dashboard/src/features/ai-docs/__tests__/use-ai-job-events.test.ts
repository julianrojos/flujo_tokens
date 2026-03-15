/**
 * useAiJobEvents Hook Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiJobEventsUrl } from '../lib/ai-jobs-api';
import { mergePolledEvents } from '../hooks/use-ai-job-events';

// Mock EventSource for Node.js environment
class MockEventSource {
    url: string;
    eventListeners: Record<string, Function[]> = {};
    readyState: number = 0; // CONNECTING

    constructor(url: string) {
        this.url = url;
        // Simulate async connection
        setTimeout(() => {
            this.readyState = 1; // OPEN
        }, 0);
    }

    addEventListener(event: string, callback: Function) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    set onmessage(callback: Function) {
        this.addEventListener('message', callback);
    }

    set onerror(callback: Function) {
        this.addEventListener('error', callback);
    }

    close() {
        this.readyState = 2; // CLOSED
    }

    // Test helper methods
    simulateMessage(data: any) {
        const callbacks = this.eventListeners['message'] || [];
        callbacks.forEach(callback => {
            callback({ data: JSON.stringify(data) });
        });
    }

    simulateError() {
        const callbacks = this.eventListeners['error'] || [];
        callbacks.forEach(callback => callback());
    }

    simulateDone(status: string) {
        const callbacks = this.eventListeners['done'] || [];
        callbacks.forEach(callback => {
            callback({ data: JSON.stringify({ status }) });
        });
    }
}

// Mock window.location for URL building
global.window = {
    location: {
        origin: 'http://localhost:3000'
    }
} as any;

// Mock EventSource globally
global.EventSource = MockEventSource as any;

describe('useAiJobEvents', () => {
    // Note: These are basic integration tests for the hook's logic
    // Full React testing would require @testing-library/react setup

    it('builds correct SSE URL with cursor', () => {
        const url = buildAiJobEventsUrl('job-123', 5);
        assert.ok(url.includes('/api/ai/jobs/job-123/events'));
        assert.ok(url.includes('cursor=5'));
    });

    it('builds SSE URL without cursor when not provided', () => {
        const url = buildAiJobEventsUrl('job-123');
        assert.ok(url.includes('/api/ai/jobs/job-123/events'));
        assert.ok(!url.includes('cursor='));
    });

    it('handles cursor=0 as no cursor', () => {
        const url = buildAiJobEventsUrl('job-123', 0);
        assert.ok(url.includes('/api/ai/jobs/job-123/events'));
        assert.ok(!url.includes('cursor='));
    });

    // Mock EventSource behavior tests
    describe('EventSource behavior', () => {
        it('creates EventSource with correct URL', () => {
            const eventSource = new MockEventSource('/api/ai/jobs/job-123/events');
            assert.equal(eventSource.url, '/api/ai/jobs/job-123/events');
            assert.equal(eventSource.readyState, 0); // CONNECTING initially
        });

        it('registers event listeners', () => {
            const eventSource = new MockEventSource('/test');
            let messageReceived = false;

            eventSource.addEventListener('message', () => {
                messageReceived = true;
            });

            eventSource.simulateMessage({ seq: 1, event: 'test' });
            assert.equal(messageReceived, true);
        });

        it('handles error events', () => {
            const eventSource = new MockEventSource('/test');
            let errorReceived = false;

            eventSource.addEventListener('error', () => {
                errorReceived = true;
            });

            eventSource.simulateError();
            assert.equal(errorReceived, true);
        });

        it('handles custom done events', () => {
            const eventSource = new MockEventSource('/test');
            let doneReceived = false;
            let doneStatus = '';

            eventSource.addEventListener('done', (data: any) => {
                doneReceived = true;
                doneStatus = JSON.parse(data.data).status;
            });

            eventSource.simulateDone('completed');
            assert.equal(doneReceived, true);
            assert.equal(doneStatus, 'completed');
        });

        it('closes connection properly', () => {
            const eventSource = new MockEventSource('/test');
            eventSource.close();
            assert.equal(eventSource.readyState, 2); // CLOSED
        });
    });

    describe('polling dedup regression', () => {
        it('keeps [1,2] and appends only new event from [2,3] => [1,2,3]', () => {
            const prev = [
                { seq: 1, ts: 1, event: 'a' },
                { seq: 2, ts: 2, event: 'b' },
            ];
            const polled = [
                { seq: 2, ts: 2, event: 'b' },
                { seq: 3, ts: 3, event: 'c' },
            ];

            const merged = mergePolledEvents(prev, polled);
            assert.deepEqual(merged.map((e) => e.seq), [1, 2, 3]);
        });
    });
});
