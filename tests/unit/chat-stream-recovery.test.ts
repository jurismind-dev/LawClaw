import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, type RawMessage } from '@/stores/chat';

function resetChatStore(): void {
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
    sessions: [{ key: 'agent:lawclaw-main:main' }],
    currentSessionKey: 'agent:lawclaw-main:main',
    currentAgentId: 'lawclaw-main',
    hasAppliedStartupDefault: true,
    sessionLabels: {},
    sessionLastActivity: {},
    showThinking: true,
    thinkingLevel: null,
  });
}

describe('chat stream recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    resetChatStore();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps sending state alive on recoverable chat.send timeout', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel, method) => {
      if (channel === 'gateway:rpc' && method === 'chat.send') {
        return {
          success: false,
          error: 'Error: RPC timeout: chat.send',
        };
      }
      throw new Error(`unexpected invoke: ${String(channel)} ${String(method)}`);
    });

    await useChatStore.getState().sendMessage('继续生成');

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.error).toContain('RPC timeout: chat.send');
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: 'agent:lawclaw-main:main',
        message: '继续生成',
      }),
      120_000,
    );
  });

  it('does not let empty delta overwrite existing streamed content', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-delta-guard',
      error: 'Error: RPC timeout: chat.send',
      streamingMessage: {
        role: 'assistant',
        content: '已经输出到一半的内容',
      } satisfies RawMessage,
    });

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-delta-guard',
      message: {
        role: 'assistant',
      },
    });

    const state = useChatStore.getState();
    expect(state.error).toBeNull();
    expect(state.streamingMessage).toEqual({
      role: 'assistant',
      content: '已经输出到一半的内容',
    });
  });

  it('allows distinct delta events in the same run when seq is absent', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-delta-progress',
    });

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-delta-progress',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        content: '第一段',
      },
    });

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-delta-progress',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        content: '第二段',
      },
    });

    expect(useChatStore.getState().streamingMessage).toEqual({
      role: 'assistant',
      content: '第二段',
    });
  });

  it('keeps history polling active after partial delta silence', async () => {
    vi.useFakeTimers();

    const loadHistoryMock = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({
      loadHistory: loadHistoryMock as unknown as (quiet?: boolean) => Promise<void>,
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation((channel, method) => {
      if (channel === 'gateway:rpc' && method === 'chat.send') {
        return new Promise(() => {});
      }
      throw new Error(`unexpected invoke: ${String(channel)} ${String(method)}`);
    });

    void useChatStore.getState().sendMessage('测试流式恢复');
    await Promise.resolve();

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-history-recovery',
      message: {
        role: 'assistant',
        content: '前半段输出',
      },
    });

    expect(useChatStore.getState().streamingMessage).toEqual({
      role: 'assistant',
      content: '前半段输出',
    });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(loadHistoryMock).toHaveBeenCalledWith(true);
  });

  it('does not end the running state when history only contains thinking and tool_use', async () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-tool-only-history',
      pendingFinal: true,
      lastUserMessageAt: 1_000,
      messages: [
        {
          role: 'user',
          content: '查看今天的金价',
          timestamp: 1,
          id: 'user-1',
        },
      ],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              {
                role: 'user',
                content: '查看今天的金价',
                timestamp: 1,
                id: 'user-1',
              },
              {
                role: 'assistant',
                timestamp: 2,
                id: 'assistant-tool-step',
                content: [
                  { type: 'thinking', thinking: '先搜索今天金价数据' },
                  { type: 'tool_use', id: 'tool-1', name: 'web_search', input: { query: '今天 金价' } },
                ],
              },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory(true);

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.activeRunId).toBe('run-tool-only-history');
    expect(state.pendingFinal).toBe(true);
  });
});
