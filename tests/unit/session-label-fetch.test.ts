import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';

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
      loadHistory: vi.fn().mockResolvedValue(undefined),
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
});
