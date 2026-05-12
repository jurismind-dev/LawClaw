import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';
const PREFETCHED_SESSION_KEY = 'agent:lawclaw-main:session-prefetched-view';
const SUBAGENT_SESSION_KEY = 'agent:lawclaw-main:session-subagent-label';

describe('session label fetch concurrency', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ key: MAIN_SESSION_KEY }],
      currentSessionKey: MAIN_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      messages: [],
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      activeRunId: null,
      error: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      pendingToolImages: [],
      sessionLabels: {},
      sessionLastActivity: {},
    });
  });

  it('limits concurrent chat.history label fetches to the ClawX batch size', async () => {
    let activeFetches = 0;
    let maxConcurrentFetches = 0;
    let startedFetches = 0;
    const resolvers: Array<() => void> = [];

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: MAIN_SESSION_KEY },
              ...Array.from({ length: 12 }, (_, index) => ({
                key: `agent:lawclaw-main:session-${index + 1}`,
              })),
            ],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    useGatewayStore.setState({
      rpc: vi.fn(async (method: string) => {
        if (method !== 'chat.history') {
          throw new Error(`unexpected gateway method: ${method}`);
        }

        startedFetches += 1;
        activeFetches += 1;
        maxConcurrentFetches = Math.max(maxConcurrentFetches, activeFetches);

        await new Promise<void>((resolve) => {
          resolvers.push(() => {
            activeFetches -= 1;
            resolve();
          });
        });

        return {
          messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
        };
      }),
    });

    await useChatStore.getState().loadSessions(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startedFetches).toBe(5);

    resolvers.splice(0, 5).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startedFetches).toBe(10);

    resolvers.splice(0, 5).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startedFetches).toBe(12);

    resolvers.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(maxConcurrentFetches).toBeLessThanOrEqual(5);
  });

  it('does not refetch labels that are already cached', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: MAIN_SESSION_KEY },
              { key: 'agent:lawclaw-main:session-1' },
            ],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    const rpc = vi.fn(async () => ({
      messages: [{ role: 'user', content: 'cached label', timestamp: Date.now() }],
    }));

    useGatewayStore.setState({ rpc });

    await useChatStore.getState().loadSessions(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpc).toHaveBeenCalledTimes(1);

    await useChatStore.getState().loadSessions(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('ignores subagent notices when prefetching sidebar labels', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: MAIN_SESSION_KEY },
              { key: SUBAGENT_SESSION_KEY },
            ],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    useGatewayStore.setState({
      rpc: vi.fn(async (method: string) => {
        if (method !== 'chat.history') {
          throw new Error(`unexpected gateway method: ${method}`);
        }

        return {
          messages: [
            {
              role: 'user',
              content: '[Subagent reviewer completed] Reviewed the generated answer.',
              timestamp: 10,
            },
            { role: 'user', content: '真正的历史会话标题', timestamp: 11 },
            { role: 'assistant', content: '正常回答', timestamp: 12 },
          ],
        };
      }),
    });

    await useChatStore.getState().loadSessions(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = useChatStore.getState();
    expect(state.sessionLabels[SUBAGENT_SESSION_KEY]).toBe('真正的历史会话标题');
    expect(state.sessionLastActivity[SUBAGENT_SESSION_KEY]).toBe(12_000);
  });

  it('does not surface heartbeat metadata labels from sessions.list', async () => {
    const heartbeatSessionKey = 'agent:lawclaw-main:session-heartbeat-label';
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: MAIN_SESSION_KEY },
              {
                key: heartbeatSessionKey,
                label: 'heartbeat',
                displayName: '[heartbeat]',
              },
            ],
          },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    useGatewayStore.setState({
      rpc: vi.fn(async (method: string) => {
        if (method !== 'chat.history') {
          throw new Error(`unexpected gateway method: ${method}`);
        }

        return {
          messages: [
            { role: 'user', content: 'heartbeat', timestamp: 10 },
            { role: 'assistant', content: 'HEARTBEAT_OK', timestamp: 11 },
            { role: 'user', content: '真正的历史会话标题', timestamp: 12 },
            { role: 'assistant', content: '正常回答', timestamp: 13 },
          ],
        };
      }),
    });

    await useChatStore.getState().loadSessions(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = useChatStore.getState();
    const session = state.sessions.find((item) => item.key === heartbeatSessionKey);
    expect(session?.label).toBeUndefined();
    expect(session?.displayName).toBeUndefined();
    expect(state.sessionLabels[heartbeatSessionKey]).toBe('真正的历史会话标题');
  });

  it('reuses prefetched history so switching sessions renders immediately without foreground loading', async () => {
    useChatStore.setState({
      sessions: [
        { key: MAIN_SESSION_KEY },
        { key: PREFETCHED_SESSION_KEY },
      ],
      currentSessionKey: MAIN_SESSION_KEY,
      currentAgentId: 'lawclaw-main',
      hasAppliedStartupDefault: true,
      messages: [
        { role: 'user', content: 'main question', timestamp: 1 },
        { role: 'assistant', content: 'main answer', timestamp: 2 },
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
      sessionLabels: {},
      sessionLastActivity: {},
      showThinking: true,
      thinkingLevel: null,
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: MAIN_SESSION_KEY },
              { key: PREFETCHED_SESSION_KEY },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    let prefetchedHistoryCalls = 0;
    let resolveForegroundHistory: ((value: unknown) => void) | null = null;
    const foregroundHistoryPromise = new Promise((resolve) => {
      resolveForegroundHistory = resolve;
    });

    useGatewayStore.setState({
      rpc: vi.fn(async (method: string, params?: unknown) => {
        if (method !== 'chat.history') {
          throw new Error(`unexpected gateway method: ${method}`);
        }

        const sessionKey = (params as { sessionKey?: string } | undefined)?.sessionKey;
        if (sessionKey !== PREFETCHED_SESSION_KEY) {
          return { messages: [] };
        }

        prefetchedHistoryCalls += 1;
        if (prefetchedHistoryCalls === 1) {
          return {
            messages: [
              { role: 'user', content: 'prefetched question', timestamp: 10 },
              { role: 'assistant', content: 'prefetched answer', timestamp: 11 },
            ],
          };
        }

        return foregroundHistoryPromise as Promise<unknown>;
      }),
    });

    await useChatStore.getState().loadSessions(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    useChatStore.getState().switchSession(PREFETCHED_SESSION_KEY);

    let state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(PREFETCHED_SESSION_KEY);
    expect(state.loading).toBe(false);
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'prefetched question' }),
      expect.objectContaining({ role: 'assistant', content: 'prefetched answer' }),
    ]);

    resolveForegroundHistory?.({
      messages: [
        { role: 'user', content: 'prefetched question', timestamp: 10 },
        { role: 'assistant', content: 'prefetched answer', timestamp: 11 },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    state = useChatStore.getState();
    expect(state.currentSessionKey).toBe(PREFETCHED_SESSION_KEY);
    expect(prefetchedHistoryCalls).toBe(2);
  });
});
