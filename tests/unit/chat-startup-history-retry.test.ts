import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';

describe('chat history startup retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGatewayStore.setState({
      status: { state: 'starting', port: 18789 },
      isInitialized: true,
      lastError: null,
    });
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
      sessions: [{ key: MAIN_SESSION_KEY }],
      currentSessionKey: MAIN_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      sessionLabels: {},
      sessionLastActivity: {},
      showThinking: true,
      thinkingLevel: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses the transient gateway-startup history error and retries quietly', async () => {
    let historyCalls = 0;

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        historyCalls += 1;
        if (historyCalls === 1) {
          return {
            success: false,
            error: 'Error: chat.history unavailable during gateway startup',
          };
        }

        return {
          success: true,
          result: {
            messages: [
              {
                role: 'assistant',
                content: 'ready',
                timestamp: 1,
              },
            ],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    const loadPromise = useChatStore.getState().loadHistory();
    await Promise.resolve();

    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);

    await vi.advanceTimersByTimeAsync(600);
    await loadPromise;

    expect(historyCalls).toBe(2);
    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().messages).toEqual([
      {
        role: 'assistant',
        content: 'ready',
        timestamp: 1,
      },
    ]);
  });
});
