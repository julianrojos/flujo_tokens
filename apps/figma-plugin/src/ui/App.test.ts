// @vitest-environment happy-dom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

// Enable React's act() test mode for non-RTL setup.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getCapabilitiesMock = vi.fn();
const computeConnectionStateMock = vi.fn();
const sendHeartbeatMock = vi.fn();
const getLastKnownConfiguredPortMock = vi.fn();

const runtimeStartMock = vi.fn();
const runtimeHandshakeMock = vi.fn();
const runtimeStopMock = vi.fn();

vi.mock('./components/StatusIndicator', () => ({
  StatusIndicator: () => null,
}));

vi.mock('./components/KitSummary', () => ({
  KitSummary: () => null,
}));

vi.mock('./components/SyncButton', () => ({
  SyncButton: () => null,
}));

vi.mock('./components/AdvancedSection', () => ({
  AdvancedSection: () => null,
}));

vi.mock('../services/mcp-client', () => ({
  getPluginMcpClient: () => ({
    getCapabilities: getCapabilitiesMock,
    computeConnectionState: computeConnectionStateMock,
    sendHeartbeat: sendHeartbeatMock,
    getLastKnownConfiguredPort: getLastKnownConfiguredPortMock,
  }),
}));

vi.mock('../bridge/ws-runtime', () => ({
  getWSRuntime: () => ({
    start: runtimeStartMock,
    initiateHandshake: runtimeHandshakeMock,
    stop: runtimeStopMock,
  }),
}));

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('App polling and heartbeat behavior', () => {
  let container: HTMLDivElement | null;
  let root: Root | null;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    getCapabilitiesMock.mockReset();
    computeConnectionStateMock.mockReset();
    sendHeartbeatMock.mockReset();
    getLastKnownConfiguredPortMock.mockReset();
    runtimeStartMock.mockReset();
    runtimeHandshakeMock.mockReset();
    runtimeStopMock.mockReset();

    getCapabilitiesMock.mockResolvedValue({
      ok: false,
      code: 'mcp.not_connected',
      message: 'not connected',
    });
    computeConnectionStateMock.mockReturnValue({
      configuredPort: 9223,
      connectedPort: null,
      state: 'disconnected',
    });
    getLastKnownConfiguredPortMock.mockReturnValue(9223);
    sendHeartbeatMock.mockResolvedValue({ ok: true, alive: true });
    runtimeStartMock.mockResolvedValue(undefined);
    runtimeHandshakeMock.mockResolvedValue(undefined);
    runtimeStopMock.mockImplementation(() => {});
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('uses cached polling mode (forceRefresh: false) for auto-refresh', async () => {
    await act(async () => {
      root.render(React.createElement(App));
      await flushMicrotasks();
    });

    const initialCalls = getCapabilitiesMock.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);
    for (const call of getCapabilitiesMock.mock.calls) {
      expect(call[0]).toEqual({ forceRefresh: false });
    }

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await flushMicrotasks();
    });

    expect(getCapabilitiesMock).toHaveBeenCalledTimes(initialCalls + 1);
    expect(getCapabilitiesMock).toHaveBeenLastCalledWith({ forceRefresh: false });
  });

  it('prevents concurrent heartbeat requests while one is in flight', async () => {
    let resolveFirstHeartbeat: (() => void) | null = null;
    sendHeartbeatMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstHeartbeat = () => resolve({ ok: true, alive: true });
          }),
      )
      .mockResolvedValue({ ok: true, alive: true });

    await act(async () => {
      root.render(React.createElement(App));
      await flushMicrotasks();
    });

    // Initial heartbeat fired immediately on mount.
    expect(sendHeartbeatMock).toHaveBeenCalledTimes(1);

    // While first heartbeat is pending, interval ticks should not enqueue more.
    await act(async () => {
      vi.advanceTimersByTime(24_000);
      await flushMicrotasks();
    });
    expect(sendHeartbeatMock).toHaveBeenCalledTimes(1);

    // Resolve in-flight heartbeat and confirm next tick sends exactly one more.
    await act(async () => {
      resolveFirstHeartbeat?.();
      await flushMicrotasks();
    });

    await act(async () => {
      vi.advanceTimersByTime(8_000);
      await flushMicrotasks();
    });
    expect(sendHeartbeatMock).toHaveBeenCalledTimes(2);
  });
});
