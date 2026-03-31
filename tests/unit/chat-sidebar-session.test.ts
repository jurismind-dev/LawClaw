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
});
