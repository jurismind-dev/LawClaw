import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const HEARTBEAT_PROMPT = `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.
When reading HEARTBEAT.md, use workspace file /Users/huk/.openclaw/workspace-lawclaw-main/HEARTBEAT.md (exact case). Do not read docs/heartbeat.md.
Current time: Wednesday, March 18th, 2026 — 12:14 PM (Asia/Shanghai) / 2026-03-18 04:14 UTC`;

describe('chat heartbeat filtering', () => {
  beforeEach(() => {
    localStorage.clear();
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
      currentSessionKey: 'agent:lawclaw-main:main',
      hasAppliedStartupDefault: true,
      showThinking: true,
      thinkingLevel: null,
    });
  });

  it('loadHistory 会过滤 heartbeat 提示词和回执', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', content: HEARTBEAT_PROMPT, timestamp: 1 },
              { role: 'assistant', content: 'HEARTBEAT_OK', timestamp: 2 },
              { role: 'user', content: '正常问题', timestamp: 3 },
              { role: 'assistant', content: '正常回答', timestamp: 4 },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory();

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: '正常问题' }),
      expect.objectContaining({ role: 'assistant', content: '正常回答' }),
    ]);
  });

  it('实时 heartbeat 事件不会出现在界面中，并会清理误占用的运行态', () => {
    useChatStore.setState({
      messages: [{ role: 'assistant', content: '已有消息', id: 'existing-1' }],
      sending: true,
      activeRunId: 'heartbeat-run-1',
      streamingMessage: { role: 'assistant', content: 'loading...' },
      streamingTools: [
        {
          name: 'tool',
          status: 'running',
          updatedAt: Date.now(),
        },
      ],
      pendingFinal: true,
      lastUserMessageAt: Date.now(),
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'heartbeat-run-1',
      message: { role: 'assistant', content: 'HEARTBEAT_OK' },
    });

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: '已有消息' }),
    ]);
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
    expect(useChatStore.getState().streamingMessage).toBeNull();
    expect(useChatStore.getState().streamingTools).toEqual([]);
  });

  it('空闲状态下的 started 事件不会把 heartbeat 暴露到界面加载态', () => {
    useChatStore.getState().handleChatEvent({
      state: 'started',
      runId: 'heartbeat-run-2',
    });

    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
  });
});
