import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chat';

const HEARTBEAT_PROMPT = `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.
When reading HEARTBEAT.md, use workspace file /Users/huk/.openclaw/workspace-lawclaw-main/HEARTBEAT.md (exact case). Do not read docs/heartbeat.md.
Current time: Wednesday, March 18th, 2026 — 12:14 PM (Asia/Shanghai) / 2026-03-18 04:14 UTC`;
const ASYNC_COMPLETION_NOTICE = `System (untrusted): [2026-04-22 12:16:27 CST] Exec completed

An async command you ran earlier has completed. Review the result and continue from there.

Current time: Tuesday, April 22nd, 2026 — 12:16 PM (Asia/Shanghai) / 2026-04-22 04:16 UTC`;
const SUBAGENT_NOTICE = '[Subagent reviewer completed] Checked the draft implementation and returned notes.';
const BOOT_CHECK_PROMPT = `You are running a boot check. Follow BOOT.md instructions exactly.

BOOT.md:
---
title: "BOOT.md Template"
summary: "Workspace template for BOOT.md"
---

# BOOT.md

If the task sends a message, use the message tool and then reply with NO_REPLY.`;

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

  it('loadHistory 会过滤内部异步完成通知、NO_REPLY 和 system 消息', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', content: '正常问题', timestamp: 1 },
              { role: 'assistant', content: ASYNC_COMPLETION_NOTICE, timestamp: 2 },
              { role: 'assistant', content: 'NO_REPLY', timestamp: 3 },
              { role: 'system', content: '内部系统消息', timestamp: 4 },
              { role: 'assistant', content: '正常回答', timestamp: 5 },
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

  it('loadHistory 会过滤 BOOT 启动检查提示词', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'assistant', content: BOOT_CHECK_PROMPT, timestamp: 1 },
              { role: 'user', content: '真正的问题', timestamp: 2 },
              { role: 'assistant', content: '真正的回答', timestamp: 3 },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory();

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: '真正的问题' }),
      expect.objectContaining({ role: 'assistant', content: '真正的回答' }),
    ]);
  });

  it('loadHistory 会过滤 BOOT/HEARTBEAT 的 thinking 和工具步骤整段历史', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'assistant', content: BOOT_CHECK_PROMPT, timestamp: 1 },
              {
                role: 'assistant',
                timestamp: 2,
                content: [
                  {
                    type: 'thinking',
                    thinking: 'The user is asking me to follow BOOT.md instructions.',
                  },
                  {
                    type: 'tool_use',
                    id: 'boot-read',
                    name: 'read',
                    input: { file: 'BOOT.md' },
                  },
                ],
              },
              { role: 'toolresult', toolCallId: 'boot-read', content: 'BOOT.md content', timestamp: 3 },
              { role: 'assistant', content: 'NO_REPLY', timestamp: 4 },
              { role: 'user', content: HEARTBEAT_PROMPT, timestamp: 5 },
              {
                role: 'assistant',
                timestamp: 6,
                content: [
                  {
                    type: 'thinking',
                    thinking: 'Let me read the HEARTBEAT.md file to check for tasks.',
                  },
                  {
                    type: 'tool_use',
                    id: 'heartbeat-read',
                    name: 'read',
                    input: { file: 'HEARTBEAT.md' },
                  },
                ],
              },
              { role: 'toolresult', toolCallId: 'heartbeat-read', content: 'No tasks.', timestamp: 7 },
              { role: 'assistant', content: 'HEARTBEAT_OK', timestamp: 8 },
              { role: 'user', content: '真正的问题', timestamp: 9 },
              { role: 'assistant', content: '真正的回答', timestamp: 10 },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory();

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: '真正的问题' }),
      expect.objectContaining({ role: 'assistant', content: '真正的回答' }),
    ]);
  });

  it('loadHistory 生成会话标题时会忽略 heartbeat 首条消息', async () => {
    useChatStore.setState({
      currentSessionKey: 'agent:lawclaw-main:session-1',
      sessions: [{ key: 'agent:lawclaw-main:session-1', persisted: true }],
      sessionLabels: {},
      sessionLastActivity: {},
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', content: HEARTBEAT_PROMPT, timestamp: 1 },
              { role: 'assistant', content: 'HEARTBEAT_OK', timestamp: 2 },
              { role: 'user', content: '真正的首条问题', timestamp: 3 },
              { role: 'assistant', content: '正常回答', timestamp: 4 },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory();

    const state = useChatStore.getState();
    expect(state.sessionLabels['agent:lawclaw-main:session-1']).toBe('真正的首条问题');
    expect(state.sessionLastActivity['agent:lawclaw-main:session-1']).toBe(4_000);
  });

  it('loadHistory 会过滤 subagent 内部通知并避免污染会话标题', async () => {
    useChatStore.setState({
      currentSessionKey: 'agent:lawclaw-main:session-subagent',
      sessions: [{ key: 'agent:lawclaw-main:session-subagent', persisted: true }],
      sessionLabels: {},
      sessionLastActivity: {},
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              { role: 'user', content: SUBAGENT_NOTICE, timestamp: 1 },
              { role: 'assistant', content: '真正回答前的内部状态', timestamp: 2 },
              { role: 'user', content: '真正需要显示的会话标题', timestamp: 3 },
              { role: 'assistant', content: '正常回答', timestamp: 4 },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: '真正回答前的内部状态' }),
      expect.objectContaining({ role: 'user', content: '真正需要显示的会话标题' }),
      expect.objectContaining({ role: 'assistant', content: '正常回答' }),
    ]);
    expect(state.sessionLabels['agent:lawclaw-main:session-subagent']).toBe('真正需要显示的会话标题');
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

  it('实时 NO_REPLY 和异步完成通知不会显示在界面中', () => {
    useChatStore.setState({
      messages: [{ role: 'assistant', content: '已有消息', id: 'existing-1' }],
      sending: true,
      activeRunId: 'hidden-run-1',
      streamingMessage: { role: 'assistant', content: '处理中...' },
      pendingFinal: true,
      lastUserMessageAt: Date.now(),
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'hidden-run-1',
      message: { role: 'assistant', content: 'NO_REPLY' },
    });

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: '已有消息' }),
    ]);
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();

    useChatStore.setState({
      messages: [{ role: 'assistant', content: '已有消息', id: 'existing-2' }],
      sending: true,
      activeRunId: 'hidden-run-2',
      streamingMessage: { role: 'assistant', content: '处理中...' },
      pendingFinal: true,
      lastUserMessageAt: Date.now(),
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'hidden-run-2',
      message: { role: 'assistant', content: ASYNC_COMPLETION_NOTICE },
    });

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: '已有消息' }),
    ]);
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
  });

  it('空闲状态下的 started 事件不会把 heartbeat 暴露到界面加载态', () => {
    useChatStore.getState().handleChatEvent({
      state: 'started',
      runId: 'heartbeat-run-2',
    });

    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
  });

  it('空闲状态下的 BOOT/HEARTBEAT 工具流不会进入处理中状态', () => {
    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'heartbeat-run-3',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I should read HEARTBEAT.md first.' },
          {
            type: 'tool_use',
            id: 'heartbeat-read',
            name: 'read',
            input: { file: 'HEARTBEAT.md' },
          },
        ],
      },
    });

    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
    expect(useChatStore.getState().streamingMessage).toBeNull();
    expect(useChatStore.getState().streamingTools).toEqual([]);
  });
});
