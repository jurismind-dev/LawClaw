import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';

describe('chat history quiet timeout handling', () => {
  beforeEach(() => {
    useGatewayStore.setState({
      status: {
        state: 'running',
        port: 18789,
        connectedAt: Date.now() - 60_000,
      },
      isInitialized: true,
      lastError: null,
    });

    useChatStore.setState({
      messages: [
        { role: 'user', content: '你好', timestamp: 1 },
        { role: 'assistant', content: '已加载的历史消息', timestamp: 2 },
      ],
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
      sessions: [{ key: MAIN_SESSION_KEY, displayName: MAIN_SESSION_KEY }],
      currentSessionKey: MAIN_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      sessionLabels: {},
      sessionLastActivity: {},
      showThinking: true,
      thinkingLevel: null,
    });
  });

  it('keeps rendered history and suppresses error bar on quiet chat.history timeout', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: false,
          error: 'Error: RPC timeout: chat.history',
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory(true);

    const state = useChatStore.getState();
    expect(state.error).toBeNull();
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '你好' }),
      expect.objectContaining({ role: 'assistant', content: '已加载的历史消息' }),
    ]);
    expect(state.loading).toBe(false);
  });
});
