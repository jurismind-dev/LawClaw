import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGatewayStore } from '@/stores/gateway';
import { useChatStore } from '@/stores/chat';

function getListener(eventName: string): ((payload: unknown) => void) | undefined {
  const calls = vi.mocked(window.electron.ipcRenderer.on).mock.calls;
  const match = calls.find(([name]) => name === eventName);
  return match?.[1] as ((payload: unknown) => void) | undefined;
}

function getLastListener(eventName: string): ((payload: unknown) => void) | undefined {
  const calls = vi.mocked(window.electron.ipcRenderer.on).mock.calls;
  const match = [...calls].reverse().find(([name]) => name === eventName);
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

  it('cleans up previous renderer gateway listeners before re-initializing in dev setup mode', async () => {
    const unsubscribeCalls: string[] = [];

    vi.mocked(window.electron.ipcRenderer.on).mockImplementation((channel) => {
      return () => {
        unsubscribeCalls.push(String(channel));
      };
    });

    useGatewayStore.setState({
      status: { state: 'stopped', port: 18789 },
      isInitialized: false,
      lastError: null,
    });

    await useGatewayStore.getState().init();

    useGatewayStore.setState({
      status: { state: 'stopped', port: 18789 },
      isInitialized: false,
      lastError: null,
    });

    await useGatewayStore.getState().init();

    expect(unsubscribeCalls).toEqual([
      'gateway:status-changed',
      'gateway:error',
      'gateway:notification',
      'gateway:chat-message',
    ]);
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

  it('keeps running state on non-terminal phase end events', async () => {
    const sessionKey = 'agent:lawclaw-main:phase-end';
    useChatStore.setState({
      activeRunId: 'run-2a',
      currentSessionKey: sessionKey,
      sessions: [{ key: sessionKey, persisted: true }],
      sending: true,
      pendingFinal: true,
    });

    const listener = getListener('gateway:notification');
    expect(listener).toBeDefined();

    listener?.({
      method: 'agent',
      params: {
        phase: 'end',
        runId: 'run-2a',
        sessionKey,
      },
    });

    await waitFor(() => {
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
        'gateway:rpc',
        'chat.history',
        { sessionKey, limit: 200 },
        undefined,
      );
    });

    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().activeRunId).toBe('run-2a');
    expect(useChatStore.getState().pendingFinal).toBe(true);
  });

  it('deduplicates the same final chat event delivered through notification and chat-message channels', async () => {
    const handleChatEvent = vi.spyOn(useChatStore.getState(), 'handleChatEvent');
    useChatStore.setState({
      activeRunId: 'run-image-1',
      sending: true,
      pendingFinal: true,
    });

    const notificationListener = getLastListener('gateway:notification');
    const chatMessageListener = getLastListener('gateway:chat-message');
    expect(notificationListener).toBeDefined();
    expect(chatMessageListener).toBeDefined();

    const message = {
      role: 'assistant',
      id: 'assistant-image-final',
      content: '这是一个界面截图。',
      timestamp: 1776920924,
    };

    notificationListener?.({
      method: 'agent',
      params: {
        runId: 'run-image-1',
        sessionKey: 'agent:lawclaw-main:main',
        data: {
          state: 'final',
          message,
        },
      },
    });

    chatMessageListener?.({
      message: {
        state: 'final',
        runId: 'run-image-1',
        message,
      },
    });

    await waitFor(() => {
      expect(handleChatEvent).toHaveBeenCalledTimes(1);
    });
  });
});
