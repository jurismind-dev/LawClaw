import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';

const MAIN_SESSION_KEY = 'agent:lawclaw-main:main';
const JURISMIND_AGENT_ID = 'lawclaw-jurismind-xhigh';
const CODEX_ACP_HARNESS_ID = 'codex';
const JURISMIND_ACP_SESSION_KEY = `agent:${CODEX_ACP_HARNESS_ID}:acp:test-session`;
const JURISMIND_NEW_ACP_SESSION_KEY = `agent:${CODEX_ACP_HARNESS_ID}:acp:new-session`;
const ACP_POLL_TICK_MS = 500;

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function resetStores(): void {
  useAgentsStore.setState({
    agents: [
      {
        id: 'lawclaw-main',
        name: 'LawClaw',
        isDefault: true,
        modelDisplay: 'MiniMax-M2.7',
        modelRef: 'minimax-portal/MiniMax-M2.7',
        overrideModelRef: null,
        inheritedModel: false,
        workspace: '~/.openclaw/workspace-lawclaw-main',
        agentDir: '~/.openclaw/agents/lawclaw-main/agent',
        mainSessionKey: MAIN_SESSION_KEY,
        channelTypes: [],
      },
      {
        id: JURISMIND_AGENT_ID,
        name: 'Jurismind xHigh',
        isDefault: false,
        modelDisplay: 'ACP / acpx',
        modelRef: null,
        overrideModelRef: null,
        inheritedModel: false,
        workspace: '~/.openclaw/workspace-lawclaw-jurismind-xhigh',
        agentDir: '~/.openclaw/agents/lawclaw-jurismind-xhigh/agent',
        mainSessionKey: `agent:${JURISMIND_AGENT_ID}:main`,
        channelTypes: [],
        runtime: {
          type: 'acp',
          acp: {
            agent: CODEX_ACP_HARNESS_ID,
            backend: 'acpx',
            mode: 'persistent',
          },
        },
      },
    ],
    defaultAgentId: 'lawclaw-main',
    defaultModelRef: 'minimax-portal/MiniMax-M2.7',
    configuredChannelTypes: [],
    channelOwners: {},
    channelAccountOwners: {},
    loading: false,
    error: null,
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
    sessions: [{ key: MAIN_SESSION_KEY, persisted: true }],
    currentSessionKey: MAIN_SESSION_KEY,
    currentAgentId: 'lawclaw-main',
    hasAppliedStartupDefault: true,
    sessionLabels: {},
    sessionLastActivity: {},
    showThinking: true,
    thinkingLevel: null,
  });
}

describe('chat ACP runtime routing', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStores();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends selected Jurismind xHigh messages to an ACP session instead of the normal agent main session', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method === 'sessions.list') {
        return {
          success: true,
          result: {
            sessions: [
              { key: MAIN_SESSION_KEY },
              { key: JURISMIND_ACP_SESSION_KEY },
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

      if (method === 'chat.send') {
        expect(params).toEqual(expect.objectContaining({
          sessionKey: JURISMIND_ACP_SESSION_KEY,
          message: '你好',
        }));
        return {
          success: true,
          result: { runId: 'run-acp' },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().sendMessage('你好', undefined, JURISMIND_AGENT_ID);

    expect(useChatStore.getState().currentSessionKey).toBe(JURISMIND_ACP_SESSION_KEY);
    expect(useChatStore.getState().currentAgentId).toBe(JURISMIND_AGENT_ID);
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: JURISMIND_ACP_SESSION_KEY,
        message: '你好',
      }),
      120_000,
    );
    expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: `agent:${JURISMIND_AGENT_ID}:main`,
      }),
      expect.anything(),
    );
  });

  it('routes stale ACP alias current agents back to the configured ACP agent', async () => {
    useChatStore.setState({
      currentSessionKey: JURISMIND_ACP_SESSION_KEY,
      currentAgentId: CODEX_ACP_HARNESS_ID,
      sessions: [
        { key: MAIN_SESSION_KEY, persisted: true },
        { key: JURISMIND_ACP_SESSION_KEY, persisted: true },
      ],
      messages: [],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method === 'chat.send') {
        expect(params).toEqual(expect.objectContaining({
          sessionKey: JURISMIND_ACP_SESSION_KEY,
          message: '你是用的什么模型？',
        }));
        return {
          success: true,
          result: { runId: 'run-acp' },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().sendMessage('你是用的什么模型？');

    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: JURISMIND_ACP_SESSION_KEY,
        message: '你是用的什么模型？',
      }),
      120_000,
    );
    expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: `agent:${CODEX_ACP_HARNESS_ID}:main`,
      }),
      expect.anything(),
    );
  });

  it('creates a fresh ACP session after creating a new chat from an ACP session', async () => {
    vi.useFakeTimers();

    useChatStore.setState({
      currentSessionKey: JURISMIND_ACP_SESSION_KEY,
      currentAgentId: CODEX_ACP_HARNESS_ID,
      sessions: [
        { key: MAIN_SESSION_KEY, persisted: true },
        { key: JURISMIND_ACP_SESSION_KEY, persisted: true },
      ],
      messages: [],
    });

    useChatStore.getState().newSession();

    expect(useChatStore.getState().currentSessionKey).toMatch(
      new RegExp(`^agent:${JURISMIND_AGENT_ID}:session-`),
    );
    expect(useChatStore.getState().currentAgentId).toBe(JURISMIND_AGENT_ID);

    let sessionsListCalls = 0;
    let resolveSpawnSent: (() => void) | null = null;
    const spawnSent = new Promise<void>((resolve) => {
      resolveSpawnSent = resolve;
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method === 'sessions.list') {
        sessionsListCalls += 1;
        const sessions = sessionsListCalls >= 2
          ? [
              { key: MAIN_SESSION_KEY },
              { key: JURISMIND_ACP_SESSION_KEY },
              { key: JURISMIND_NEW_ACP_SESSION_KEY },
            ]
          : [
              { key: MAIN_SESSION_KEY },
              { key: JURISMIND_ACP_SESSION_KEY },
            ];
        return {
          success: true,
          result: { sessions },
        };
      }

      if (method === 'chat.history') {
        return {
          success: true,
          result: { messages: [] },
        };
      }

      if (method === 'chat.send') {
        const message = (params as { message?: string }).message;
        if (typeof message === 'string' && message.startsWith('/acp spawn')) {
          expect(params).toEqual(expect.objectContaining({
            sessionKey: expect.stringContaining('__internal_acp_bootstrap__'),
          }));
          resolveSpawnSent?.();
          return {
            success: true,
            result: { runId: 'run-spawn' },
          };
        }

        expect(params).toEqual(expect.objectContaining({
          sessionKey: JURISMIND_NEW_ACP_SESSION_KEY,
          message: 'hi',
        }));
        return {
          success: true,
          result: { runId: 'run-acp' },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    const sendPromise = useChatStore.getState().sendMessage('hi');
    await flushMicrotasks();

    expect(useChatStore.getState().currentSessionKey).toMatch(
      new RegExp(`^agent:${JURISMIND_AGENT_ID}:session-`),
    );
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hi' }),
    ]);

    await spawnSent;
    await vi.advanceTimersByTimeAsync(ACP_POLL_TICK_MS);
    await sendPromise;

    expect(useChatStore.getState().currentSessionKey).toBe(JURISMIND_NEW_ACP_SESSION_KEY);
    expect(useChatStore.getState().currentAgentId).toBe(JURISMIND_AGENT_ID);
    expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: `agent:${CODEX_ACP_HARNESS_ID}:main`,
      }),
      expect.anything(),
    );
  });

  it('spawns missing ACP sessions through a hidden bootstrap session without switching the visible chat to it', async () => {
    vi.useFakeTimers();

    let sessionsListCalls = 0;
    let resolveSpawnSent: (() => void) | null = null;
    const spawnSent = new Promise<void>((resolve) => {
      resolveSpawnSent = resolve;
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method, params) => {
      if (method === 'sessions.list') {
        sessionsListCalls += 1;
        const sessions = sessionsListCalls >= 3
          ? [{ key: MAIN_SESSION_KEY }, { key: JURISMIND_ACP_SESSION_KEY }]
          : [{ key: MAIN_SESSION_KEY }];
        return {
          success: true,
          result: { sessions },
        };
      }

      if (method === 'chat.history') {
        return {
          success: true,
          result: { messages: [] },
        };
      }

      if (method === 'chat.send') {
        const sessionKey = (params as { sessionKey?: string }).sessionKey;
        const message = (params as { message?: string }).message;
        if (typeof message === 'string' && message.startsWith('/acp spawn')) {
          expect(sessionKey).toContain('__internal_acp_bootstrap__');
          resolveSpawnSent?.();
          return {
            success: true,
            result: { runId: 'run-spawn' },
          };
        }

        expect(params).toEqual(expect.objectContaining({
          sessionKey: JURISMIND_ACP_SESSION_KEY,
          message: '你好',
        }));
        return {
          success: true,
          result: { runId: 'run-acp' },
        };
      }

      throw new Error(`unexpected method: ${String(method)}`);
    });

    const sendPromise = useChatStore.getState().sendMessage('你好', undefined, JURISMIND_AGENT_ID);
    await flushMicrotasks();

    expect(useChatStore.getState().currentSessionKey).toMatch(
      new RegExp(`^agent:${JURISMIND_AGENT_ID}:session-`),
    );
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: '你好' }),
    ]);

    await spawnSent;

    await vi.advanceTimersByTimeAsync(ACP_POLL_TICK_MS);
    await sendPromise;

    expect(useChatStore.getState().currentSessionKey).toBe(JURISMIND_ACP_SESSION_KEY);
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: JURISMIND_ACP_SESSION_KEY,
        message: '你好',
      }),
      120_000,
    );
  });

  it('continues polling ACP history for media sends even when task-progress events are still arriving', async () => {
    vi.useFakeTimers();

    useChatStore.setState({
      currentSessionKey: JURISMIND_ACP_SESSION_KEY,
      currentAgentId: JURISMIND_AGENT_ID,
      sessions: [
        { key: MAIN_SESSION_KEY, persisted: true },
        { key: JURISMIND_ACP_SESSION_KEY, persisted: true },
      ],
      messages: [],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel, method) => {
      if (channel === 'chat:sendWithMedia') {
        return {
          success: true,
          result: { runId: 'run-acp-media' },
        };
      }

      if (channel === 'gateway:rpc' && method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', id: 'user-image', content: '这个内容是什么？', timestamp: Date.now() / 1000 },
              { role: 'assistant', id: 'assistant-image', content: '这是一张界面截图。', timestamp: Date.now() / 1000 + 1 },
            ],
          },
        };
      }

      throw new Error(`unexpected invoke: ${String(channel)} ${String(method)}`);
    });

    await useChatStore.getState().sendMessage('这个内容是什么？', [
      {
        fileName: 'image.png',
        mimeType: 'image/png',
        fileSize: 1024,
        stagedPath: '/tmp/acp-image.png',
        preview: 'data:image/png;base64,abc',
      },
    ]);

    useChatStore.getState().handleChatEvent({
      state: 'agent',
      runId: 'run-acp-media',
      sessionKey: JURISMIND_ACP_SESSION_KEY,
      phase: 'preparing',
    });

    await vi.advanceTimersByTimeAsync(ACP_POLL_TICK_MS * 6);

    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.history',
      expect.objectContaining({
        sessionKey: JURISMIND_ACP_SESSION_KEY,
      }),
      undefined,
    );
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: '这个内容是什么？' }),
      expect.objectContaining({ role: 'assistant', content: '这是一张界面截图。' }),
    ]);
  });
});
