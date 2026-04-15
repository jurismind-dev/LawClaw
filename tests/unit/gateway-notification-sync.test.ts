import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGatewayStore } from '@/stores/gateway';
import { useChatStore } from '@/stores/chat';

function getListener(eventName: string): ((payload: unknown) => void) | undefined {
  const calls = vi.mocked(window.electron.ipcRenderer.on).mock.calls;
  const match = calls.find(([name]) => name === eventName);
  return match?.[1] as ((payload: unknown) => void) | undefined;
}

describe('gateway notification sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();

    useChatStore.setState({
      messages: [],
      loading: false,
      error: null,
      sending: false,
      activeRunId: null,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingFinal: false,
      lastUserMessageAt: null,
      pendingToolImages: [],
      sessions: [{ key: 'agent:lawclaw-main:main', persisted: true }],
      currentSessionKey: 'agent:lawclaw-main:main',
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      sessionLabels: {},
      sessionLastActivity: {},
      showThinking: true,
      thinkingLevel: null,
    });

    useGatewayStore.setState({
      status: { state: 'stopped', port: 18789 },
      isInitialized: false,
      lastError: null,
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel, method) => {
      if (channel === 'gateway:status') {
        return { state: 'running', port: 18789, gatewayReady: true };
      }
      if (channel === 'gateway:rpc' && method === 'sessions.list') {
        return { success: true, result: { sessions: [] } };
      }
      if (channel === 'gateway:rpc' && method === 'chat.history') {
        return { success: true, result: { messages: [] } };
      }
      throw new Error(`unexpected invoke: ${String(channel)}`);
    });

    await useGatewayStore.getState().init();
  });

  it('refreshes sessions on started for background session runs', async () => {
    useChatStore.setState({
      sessions: [{ key: 'agent:lawclaw-main:main', persisted: true }],
      currentSessionKey: 'agent:lawclaw-main:main',
    });

    const listener = getListener('gateway:notification');
    expect(listener).toBeDefined();

    listener?.({
      method: 'agent',
      params: {
        phase: 'started',
        runId: 'run-1',
        sessionKey: 'agent:lawclaw-main:session-2',
      },
    });

    await waitFor(() => {
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
        'gateway:rpc',
        'sessions.list',
        { limit: 50 },
      );
    });
  });

  it('reloads history and clears stale running state on completed for the active run', async () => {
    useChatStore.setState({
      activeRunId: 'run-2',
      sending: true,
    });

    const listener = getListener('gateway:notification');
    expect(listener).toBeDefined();

    listener?.({
      method: 'agent',
      params: {
        phase: 'completed',
        runId: 'run-2',
        sessionKey: 'agent:lawclaw-main:main',
      },
    });

    await waitFor(() => {
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
        'gateway:rpc',
        'chat.history',
        { sessionKey: 'agent:lawclaw-main:main', limit: 200 },
        undefined,
      );
      expect(useChatStore.getState().sending).toBe(false);
      expect(useChatStore.getState().activeRunId).toBeNull();
      expect(useChatStore.getState().pendingFinal).toBe(false);
    });
  });
});
