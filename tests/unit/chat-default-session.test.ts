import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const DEDICATED_SESSION_KEY = 'agent:lawclaw-main:main';
const SECONDARY_AGENT_SESSION_KEY = 'agent:contract-review:main';

describe('chat store default session binding', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [],
      currentSessionKey: 'agent:main:main',
      currentAgentId: 'lawclaw-main',
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
            sessions: [{ key: SECONDARY_AGENT_SESSION_KEY }, { key: DEDICATED_SESSION_KEY }],
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
            sessions: [{ key: SECONDARY_AGENT_SESSION_KEY }, { key: DEDICATED_SESSION_KEY }],
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
    useChatStore.getState().switchSession(SECONDARY_AGENT_SESSION_KEY);
    await useChatStore.getState().loadSessions();

    expect(useChatStore.getState().currentSessionKey).toBe(SECONDARY_AGENT_SESSION_KEY);
  });

  it('filters internal migration sessions from list while preserving other agent sessions', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: 'agent:lawclaw-main:__internal_migration__:task-1' },
              { key: 'agent:lawclaw-main:lawclaw-upgrade-migration' },
              { key: SECONDARY_AGENT_SESSION_KEY },
              { key: DEDICATED_SESSION_KEY },
            ],
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

    const sessionKeys = useChatStore.getState().sessions.map((session) => session.key);
    expect(sessionKeys).toEqual([SECONDARY_AGENT_SESSION_KEY, DEDICATED_SESSION_KEY]);
    expect(sessionKeys).not.toContain('agent:lawclaw-main:__internal_migration__:task-1');
    expect(sessionKeys).not.toContain('agent:lawclaw-main:lawclaw-upgrade-migration');
  });

  it('sessions.list 鍙繑鍥為潪 lawclaw 浼氳瘽鏃朵粛鍥炶惤鍒伴粯璁?lawclaw 浼氳瘽', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [{ key: SECONDARY_AGENT_SESSION_KEY }],
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
    expect(useChatStore.getState().sessions.map((session) => session.key)).toEqual([
      SECONDARY_AGENT_SESSION_KEY,
      DEDICATED_SESSION_KEY,
    ]);
  });

  it('falls back to dedicated default when current session is internal migration session', async () => {
    useChatStore.setState({
      currentSessionKey: 'agent:lawclaw-main:__internal_migration__:task-abc',
      hasAppliedStartupDefault: true,
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: 'agent:lawclaw-main:__internal_migration__:task-abc' },
              { key: SECONDARY_AGENT_SESSION_KEY },
              { key: DEDICATED_SESSION_KEY },
            ],
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

  it('does not throttle the first startup session load before the default session is applied', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [{ key: SECONDARY_AGENT_SESSION_KEY }],
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
    await useChatStore.getState().loadSessions();

    expect(
      vi.mocked(window.electron.ipcRenderer.invoke).mock.calls.filter(([, method]) => method === 'sessions.list')
    ).toHaveLength(1);
    expect(useChatStore.getState().currentSessionKey).toBe(DEDICATED_SESSION_KEY);
  });

});
