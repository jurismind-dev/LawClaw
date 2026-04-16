import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const PRIMARY_SESSION_KEY = 'agent:lawclaw-main:session-reload-a';
const SECONDARY_SESSION_KEY = 'agent:lawclaw-main:session-reload-b';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe('chat session history reload', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState({
      sessions: [
        { key: PRIMARY_SESSION_KEY, displayName: PRIMARY_SESSION_KEY },
        { key: SECONDARY_SESSION_KEY, displayName: SECONDARY_SESSION_KEY },
      ],
      currentSessionKey: PRIMARY_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      sessionLabels: {
        [PRIMARY_SESSION_KEY]: 'Primary session',
        [SECONDARY_SESSION_KEY]: 'Secondary session',
      },
      sessionLastActivity: {
        [PRIMARY_SESSION_KEY]: 10_000,
        [SECONDARY_SESSION_KEY]: 9_000,
      },
      messages: [
        { role: 'user', content: 'primary question', timestamp: 1 },
        { role: 'assistant', content: 'primary answer', timestamp: 2 },
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
      showThinking: true,
      thinkingLevel: null,
    });
  });

  it('keeps the cached messages visible when switching back to a session whose fresh history still returns empty', async () => {
    let resolvePrimaryQuietHistory: ((value: unknown) => void) | null = null;
    const primaryQuietHistoryPromise = new Promise((resolve) => {
      resolvePrimaryQuietHistory = resolve;
    });
    let primaryHistoryCalls = 0;

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method !== 'chat.history') {
        throw new Error(`unexpected method: ${String(method)}`);
      }

      const sessionKey = (params as { sessionKey?: string } | undefined)?.sessionKey;
      if (sessionKey === PRIMARY_SESSION_KEY) {
        primaryHistoryCalls += 1;
        if (primaryHistoryCalls === 1) {
          return primaryQuietHistoryPromise as Promise<unknown>;
        }

        return {
          success: true,
          result: {
            messages: [],
          },
        };
      }

      if (sessionKey === SECONDARY_SESSION_KEY) {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', content: 'secondary question', timestamp: 4 },
              { role: 'assistant', content: 'secondary answer', timestamp: 5 },
            ],
          },
        };
      }

      throw new Error(`unexpected session: ${String(sessionKey)}`);
    });

    const staleQuietLoadPromise = useChatStore.getState().loadHistory(true);
    useChatStore.getState().switchSession(SECONDARY_SESSION_KEY);
    await flushMicrotasks();
    await flushMicrotasks();

    useChatStore.getState().switchSession(PRIMARY_SESSION_KEY);
    await flushMicrotasks();
    await flushMicrotasks();

    const primaryHistoryRequests = vi.mocked(window.electron.ipcRenderer.invoke).mock.calls.filter(
      ([, method, params]) =>
        method === 'chat.history'
        && (params as { sessionKey?: string } | undefined)?.sessionKey === PRIMARY_SESSION_KEY,
    );
    expect(primaryHistoryRequests).toHaveLength(1);

    let state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(PRIMARY_SESSION_KEY);
    expect(state.loading).toBe(false);
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'primary question' }),
      expect.objectContaining({ role: 'assistant', content: 'primary answer' }),
    ]);

    resolvePrimaryQuietHistory?.({
      success: true,
      result: { messages: [] },
    });
    await staleQuietLoadPromise;
    await flushMicrotasks();

    state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(PRIMARY_SESSION_KEY);
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'primary question' }),
      expect.objectContaining({ role: 'assistant', content: 'primary answer' }),
    ]);
  });
});
