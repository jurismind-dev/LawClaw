import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';
const DRAFT_SESSION_KEY = 'agent:lawclaw-main:session-draft';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe('chat refresh session race handling', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState({
      sessions: [
        { key: MAIN_SESSION_KEY, displayName: MAIN_SESSION_KEY },
        { key: DRAFT_SESSION_KEY, displayName: DRAFT_SESSION_KEY },
      ],
      currentSessionKey: DRAFT_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      sessionLabels: {
        [DRAFT_SESSION_KEY]: 'Draft session',
      },
      sessionLastActivity: {
        [DRAFT_SESSION_KEY]: 1_000,
      },
      messages: [
        { role: 'user', content: 'draft prompt', timestamp: 1 },
        { role: 'assistant', content: 'draft answer', timestamp: 2 },
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

  it('refresh reloads sessions before history so stale draft keys do not blank the page', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [{ key: MAIN_SESSION_KEY }],
          },
        };
      }

      if (method === 'chat.history') {
        const sessionKey = (params as { sessionKey?: string } | undefined)?.sessionKey;
        if (sessionKey === MAIN_SESSION_KEY) {
          return {
            success: true,
            result: {
              messages: [
                { role: 'user', content: '你好', timestamp: 10 },
                { role: 'assistant', content: '你好！', timestamp: 11 },
              ],
            },
          };
        }

        if (sessionKey === DRAFT_SESSION_KEY) {
          return {
            success: true,
            result: { messages: [] },
          };
        }
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().refresh();

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(MAIN_SESSION_KEY);
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '你好' }),
      expect.objectContaining({ role: 'assistant', content: '你好！' }),
    ]);

    const staleHistoryCalls = vi.mocked(window.electron.ipcRenderer.invoke).mock.calls.filter(
      ([, method, params]) =>
        method === 'chat.history'
        && (params as { sessionKey?: string } | undefined)?.sessionKey === DRAFT_SESSION_KEY,
    );
    expect(staleHistoryCalls).toHaveLength(0);
  });

  it('ignores stale loadHistory results after the active session changes', async () => {
    let resolveDraftHistory: ((value: unknown) => void) | null = null;
    const draftHistoryPromise = new Promise((resolve) => {
      resolveDraftHistory = resolve;
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method === 'chat.history') {
        const sessionKey = (params as { sessionKey?: string } | undefined)?.sessionKey;
        if (sessionKey === DRAFT_SESSION_KEY) {
          return draftHistoryPromise as Promise<unknown>;
        }

        if (sessionKey === MAIN_SESSION_KEY) {
          return {
            success: true,
            result: {
              messages: [
                { role: 'user', content: '主会话问题', timestamp: 20 },
                { role: 'assistant', content: '主会话回答', timestamp: 21 },
              ],
            },
          };
        }
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    const staleLoadPromise = useChatStore.getState().loadHistory();
    useChatStore.getState().switchSession(MAIN_SESSION_KEY);
    await flushMicrotasks();
    await flushMicrotasks();

    resolveDraftHistory?.({
      success: true,
      result: { messages: [] },
    });
    await staleLoadPromise;
    await flushMicrotasks();

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(MAIN_SESSION_KEY);
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '主会话问题' }),
      expect.objectContaining({ role: 'assistant', content: '主会话回答' }),
    ]);
  });
});
