import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const DEDICATED_SESSION_KEY = 'agent:lawclaw-main:main';

describe('chat store default session binding', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [],
      currentSessionKey: 'agent:main:main',
      hasAppliedStartupDefault: false,
      messages: [],
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      activeRunId: null,
      error: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      pendingToolImages: [],
    });
  });

  it('首次加载 sessions 时，默认绑定到 lawclaw-main main 会话', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [{ key: 'agent:main:main' }, { key: DEDICATED_SESSION_KEY }],
          },
        };
      }
      if (method === 'chat.history') {
        return {
          success: true,
          result: { messages: [] },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadSessions();

    expect(useChatStore.getState().currentSessionKey).toBe(DEDICATED_SESSION_KEY);
  });

  it('运行期用户切换会话后，后续刷新 sessions 不会重置选择', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [{ key: 'agent:main:main' }, { key: DEDICATED_SESSION_KEY }],
          },
        };
      }
      if (method === 'chat.history') {
        return {
          success: true,
          result: { messages: [] },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadSessions();
    useChatStore.getState().switchSession('agent:main:main');
    await useChatStore.getState().loadSessions();

    expect(useChatStore.getState().currentSessionKey).toBe('agent:main:main');
  });
});
