import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';

describe('chat session startup retry', () => {
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
      sessions: [],
      currentSessionKey: MAIN_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: false,
      sessionLabels: {},
      sessionLastActivity: {},
      showThinking: true,
      thinkingLevel: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries sessions.list during gateway startup and hydrates the sidebar sessions', async () => {
    let sessionCalls = 0;

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        sessionCalls += 1;
        if (sessionCalls === 1) {
          return {
            success: false,
            error: 'Error: service not initialized',
          };
        }

        return {
          success: true,
          result: {
            sessions: [{ key: MAIN_SESSION_KEY, updatedAt: 1 }],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    const loadPromise = useChatStore.getState().loadSessions();
    await Promise.resolve();

    expect(useChatStore.getState().sessions).toEqual([]);
    expect(useChatStore.getState().hasAppliedStartupDefault).toBe(false);

    await vi.advanceTimersByTimeAsync(800);
    await loadPromise;

    const state = useChatStore.getState();
    expect(sessionCalls).toBe(2);
    expect(state.sessions).toEqual([
      expect.objectContaining({ key: MAIN_SESSION_KEY, persisted: true }),
    ]);
    expect(state.currentSessionKey).toBe(MAIN_SESSION_KEY);
    expect(state.hasAppliedStartupDefault).toBe(true);
    expect(state.sessionLastActivity[MAIN_SESSION_KEY]).toBe(1_000);
  });
});
