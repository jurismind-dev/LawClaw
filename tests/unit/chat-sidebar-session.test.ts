import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';
const DRAFT_SESSION_KEY = 'agent:lawclaw-main:session-1';

describe('chat sidebar session state', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [
        { key: MAIN_SESSION_KEY, displayName: MAIN_SESSION_KEY },
        { key: DRAFT_SESSION_KEY, displayName: DRAFT_SESSION_KEY },
      ],
      currentSessionKey: DRAFT_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      sessionLabels: { [DRAFT_SESSION_KEY]: 'Draft memo' },
      sessionLastActivity: { [DRAFT_SESSION_KEY]: 1_000 },
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
      showThinking: false,
      thinkingLevel: null,
    });
  });

  it('switchSession removes an unused draft session before switching away', () => {
    useChatStore.setState({
      sessionLabels: {},
      sessionLastActivity: {},
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValue({
      success: true,
      result: { messages: [] },
    });

    useChatStore.getState().switchSession(MAIN_SESSION_KEY);

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(MAIN_SESSION_KEY);
    expect(state.sessions.map((session) => session.key)).toEqual([MAIN_SESSION_KEY]);
    expect(state.sessionLabels[DRAFT_SESSION_KEY]).toBeUndefined();
    expect(state.sessionLastActivity[DRAFT_SESSION_KEY]).toBeUndefined();
  });

  it('switchSession ignores clicks on the already active session', () => {
    useChatStore.setState({
      currentSessionKey: MAIN_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      messages: [
        { role: 'user', content: '保留这条消息', timestamp: 1, id: 'msg-1' },
      ],
    });

    useChatStore.getState().switchSession(MAIN_SESSION_KEY);

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(MAIN_SESSION_KEY);
    expect(state.messages).toEqual([
      { role: 'user', content: '保留这条消息', timestamp: 1, id: 'msg-1' },
    ]);
  });

  it('newSession replaces an unused draft session instead of accumulating ghosts', () => {
    useChatStore.setState({
      sessionLabels: {},
      sessionLastActivity: {},
    });
    vi.spyOn(Date, 'now').mockReturnValue(2_000);

    useChatStore.getState().newSession();

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe('agent:lawclaw-main:session-2000');
    expect(state.sessions.map((session) => session.key)).toEqual([
      MAIN_SESSION_KEY,
      'agent:lawclaw-main:session-2000',
    ]);
    expect(state.sessionLabels[DRAFT_SESSION_KEY]).toBeUndefined();
    expect(state.sessionLastActivity[DRAFT_SESSION_KEY]).toBeUndefined();
  });

  it('newSession clears the running state so the new chat is immediately usable', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-1',
      pendingFinal: true,
      lastUserMessageAt: 2_000,
      messages: [
        { role: 'user', content: '正在执行的任务', timestamp: 1 },
      ],
    });
    vi.spyOn(Date, 'now').mockReturnValue(2_500);

    useChatStore.getState().newSession();

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe('agent:lawclaw-main:session-2500');
    expect(state.sending).toBe(false);
    expect(state.activeRunId).toBeNull();
    expect(state.pendingFinal).toBe(false);
    expect(state.lastUserMessageAt).toBeNull();
    expect(state.messages).toEqual([]);
  });

  it('loadHistory updates sidebar labels and activity timestamps for non-main sessions', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', content: 'Need a litigation risk memo for this deal', timestamp: 10 },
              { role: 'assistant', content: 'Working on it', timestamp: 20 },
            ],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory();

    const state = useChatStore.getState();
    expect(state.sessionLabels[DRAFT_SESSION_KEY]).toBe('Need a litigation risk memo for this deal');
    expect(state.sessionLastActivity[DRAFT_SESSION_KEY]).toBe(20_000);
  });

  it('newSession keeps the active agent prefix when chatting on another agent', () => {
    useChatStore.setState({
      sessions: [{ key: 'agent:contract-review:main', displayName: 'agent:contract-review:main' }],
      currentSessionKey: 'agent:contract-review:main',
      currentAgentId: 'contract-review',
      sessionLabels: {},
      sessionLastActivity: {},
    });
    vi.spyOn(Date, 'now').mockReturnValue(3_000);

    useChatStore.getState().newSession();

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe('agent:contract-review:session-3000');
    expect(state.currentAgentId).toBe('contract-review');
    expect(state.sessions.map((session) => session.key)).toEqual([
      'agent:contract-review:main',
      'agent:contract-review:session-3000',
    ]);
  });

  it('deleteSession removes the session locally after the main-process soft delete', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValue({ success: true });

    await useChatStore.getState().deleteSession(DRAFT_SESSION_KEY);

    const state = useChatStore.getState();
    expect(state.sessions.map((session) => session.key)).toEqual([MAIN_SESSION_KEY]);
    expect(state.sessionLabels[DRAFT_SESSION_KEY]).toBeUndefined();
    expect(state.sessionLastActivity[DRAFT_SESSION_KEY]).toBeUndefined();
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('session:delete', DRAFT_SESSION_KEY);
  });

  it('switchSession clears the previous session running state before loading the target history', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-2',
      pendingFinal: true,
      lastUserMessageAt: 3_000,
      messages: [{ role: 'user', content: '旧会话任务', timestamp: 1 }],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValue({
      success: true,
      result: { messages: [] },
    });

    useChatStore.getState().switchSession(MAIN_SESSION_KEY);

    const state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(MAIN_SESSION_KEY);
    expect(state.sending).toBe(false);
    expect(state.activeRunId).toBeNull();
    expect(state.pendingFinal).toBe(false);
    expect(state.lastUserMessageAt).toBeNull();
  });

  it('cleanupEmptySession 不会删除已持久化但当前内存为空的历史会话', () => {
    useChatStore.setState({
      sessions: [
        { key: MAIN_SESSION_KEY, displayName: MAIN_SESSION_KEY, persisted: true },
        { key: DRAFT_SESSION_KEY, displayName: DRAFT_SESSION_KEY, persisted: true },
      ],
      currentSessionKey: DRAFT_SESSION_KEY,
      messages: [],
      sessionLabels: {},
      sessionLastActivity: {},
    });

    useChatStore.getState().cleanupEmptySession();

    expect(useChatStore.getState().sessions.map((session) => session.key)).toEqual([
      MAIN_SESSION_KEY,
      DRAFT_SESSION_KEY,
    ]);
  });
});
