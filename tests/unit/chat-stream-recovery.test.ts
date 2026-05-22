import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, type RawMessage } from '@/stores/chat';

function resetChatStore(): void {
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
    sessions: [{ key: 'agent:lawclaw-main:main' }],
    currentSessionKey: 'agent:lawclaw-main:main',
    currentAgentId: 'lawclaw-main',
    hasAppliedStartupDefault: true,
    sessionLabels: {},
    sessionLastActivity: {},
    showThinking: true,
    thinkingLevel: null,
  });
}

describe('chat stream recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    resetChatStore();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps sending state alive on recoverable chat.send timeout', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel, method) => {
      if (channel === 'gateway:rpc' && method === 'chat.send') {
        return {
          success: false,
          error: 'Error: RPC timeout: chat.send',
        };
      }
      throw new Error(`unexpected invoke: ${String(channel)} ${String(method)}`);
    });

    await useChatStore.getState().sendMessage('继续生成');

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.error).toBeNull();
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'gateway:rpc',
      'chat.send',
      expect.objectContaining({
        sessionKey: 'agent:lawclaw-main:main',
        message: '继续生成',
      }),
      120_000,
    );
  });

  it('keeps sending state alive on recoverable media agent timeout', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel) => {
      if (channel === 'chat:sendWithMedia') {
        return {
          success: false,
          error: 'Error: RPC timeout: agent',
        };
      }
      throw new Error(`unexpected invoke: ${String(channel)}`);
    });

    await useChatStore.getState().sendMessage('帮我分析', [
      {
        fileName: 'case.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        stagedPath: '/tmp/case.pdf',
        preview: null,
      },
    ]);

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.error).toBeNull();
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'chat:sendWithMedia',
      expect.objectContaining({
        sessionKey: 'agent:lawclaw-main:main',
        message: '帮我分析',
        media: [
          expect.objectContaining({
            filePath: '/tmp/case.pdf',
            mimeType: 'application/pdf',
            fileName: 'case.pdf',
          }),
        ],
      }),
    );
  });

  it('normalizes stale no-response provider wording from gateway errors', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-no-response-wording',
    });

    useChatStore.getState().handleChatEvent({
      state: 'error',
      runId: 'run-no-response-wording',
      errorMessage:
        'No response received from the model. The provider may be unavailable or the API key may have insufficient quota. Please check your provider settings.',
    });

    const error = useChatStore.getState().error ?? '';
    expect(error).toContain('本轮运行暂时没有收到模型响应');
    expect(error).not.toMatch(/api key|quota|provider settings/i);
  });

  it('uses non-misleading wording for local no-response timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation((channel, method) => {
      if (channel === 'gateway:rpc' && method === 'chat.send') {
        return new Promise(() => {});
      }
      throw new Error(`unexpected invoke: ${String(channel)} ${String(method)}`);
    });

    void useChatStore.getState().sendMessage('测试无首包超时');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(91_000);

    const error = useChatStore.getState().error ?? '';
    expect(error).toContain('本轮运行暂时没有收到模型响应');
    expect(error).not.toMatch(/api key|quota|provider settings/i);
    expect(useChatStore.getState().sending).toBe(false);
  });

  it('does not let empty delta overwrite existing streamed content', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-delta-guard',
      error: 'Error: RPC timeout: chat.send',
      streamingMessage: {
        role: 'assistant',
        content: '已经输出到一半的内容',
      } satisfies RawMessage,
    });

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-delta-guard',
      message: {
        role: 'assistant',
      },
    });

    const state = useChatStore.getState();
    expect(state.error).toBeNull();
    expect(state.streamingMessage).toEqual({
      role: 'assistant',
      content: '已经输出到一半的内容',
    });
  });

  it('allows distinct delta events in the same run when seq is absent', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-delta-progress',
    });

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-delta-progress',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        content: '第一段',
      },
    });

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-delta-progress',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        content: '第二段',
      },
    });

    expect(useChatStore.getState().streamingMessage).toEqual({
      role: 'assistant',
      content: '第二段',
    });
  });

  it('keeps history polling active after partial delta silence', async () => {
    vi.useFakeTimers();

    const loadHistoryMock = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({
      loadHistory: loadHistoryMock as unknown as (quiet?: boolean) => Promise<void>,
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation((channel, method) => {
      if (channel === 'gateway:rpc' && method === 'chat.send') {
        return new Promise(() => {});
      }
      throw new Error(`unexpected invoke: ${String(channel)} ${String(method)}`);
    });

    void useChatStore.getState().sendMessage('测试流式恢复');
    await Promise.resolve();

    useChatStore.getState().handleChatEvent({
      state: 'delta',
      runId: 'run-history-recovery',
      message: {
        role: 'assistant',
        content: '前半段输出',
      },
    });

    expect(useChatStore.getState().streamingMessage).toEqual({
      role: 'assistant',
      content: '前半段输出',
    });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(loadHistoryMock).toHaveBeenCalledWith(true);
  });

  it('does not end the running state when history only contains thinking and tool_use', async () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-tool-only-history',
      pendingFinal: true,
      lastUserMessageAt: 1_000,
      messages: [
        {
          role: 'user',
          content: '查看今天的金价',
          timestamp: 1,
          id: 'user-1',
        },
      ],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              {
                role: 'user',
                content: '查看今天的金价',
                timestamp: 1,
                id: 'user-1',
              },
              {
                role: 'assistant',
                timestamp: 2,
                id: 'assistant-tool-step',
                content: [
                  { type: 'thinking', thinking: '先搜索今天金价数据' },
                  { type: 'tool_use', id: 'tool-1', name: 'web_search', input: { query: '今天 金价' } },
                ],
              },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory(true);

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.activeRunId).toBe('run-tool-only-history');
    expect(state.pendingFinal).toBe(true);
  });

  it('does not end the running state when the latest assistant message still contains tool_use', async () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-mixed-history',
      pendingFinal: true,
      lastUserMessageAt: 1_000,
      messages: [
        {
          role: 'user',
          content: '继续处理这个任务',
          timestamp: 1,
          id: 'user-1',
        },
      ],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              {
                role: 'user',
                content: '继续处理这个任务',
                timestamp: 1,
                id: 'user-1',
              },
              {
                role: 'assistant',
                timestamp: 2,
                id: 'assistant-partial-answer',
                content: [{ type: 'text', text: '我先查一下相关信息。' }],
              },
              {
                role: 'assistant',
                timestamp: 3,
                id: 'assistant-still-running',
                content: [
                  { type: 'text', text: '已经定位到线索，继续调用工具。' },
                  { type: 'tool_use', id: 'tool-2', name: 'web_search', input: { query: '继续处理' } },
                ],
              },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory(true);

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.activeRunId).toBe('run-mixed-history');
    expect(state.pendingFinal).toBe(true);
  });

  it('does not infer completion from a text assistant message in history', async () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-text-history',
      pendingFinal: true,
      lastUserMessageAt: 1_000,
      messages: [
        {
          role: 'user',
          content: '分块审查合同',
          timestamp: 1,
          id: 'user-1',
        },
      ],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              {
                role: 'user',
                content: '分块审查合同',
                timestamp: 1,
                id: 'user-1',
              },
              {
                role: 'assistant',
                timestamp: 2,
                id: 'assistant-block-1',
                content: '块1完成（修改5处，失败0项）。',
              },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory(true);

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.activeRunId).toBe('run-text-history');
    expect(state.pendingFinal).toBe(true);
  });

  it('keeps the run active when a final assistant event still contains tool_use', () => {
    useChatStore.setState({
      sending: true,
      activeRunId: 'run-final-tool-use',
      pendingFinal: true,
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'run-final-tool-use',
      message: {
        role: 'assistant',
        id: 'assistant-final-tool-use',
        content: [
          { type: 'text', text: '正在整理结果，继续调用工具。' },
          { type: 'tool_use', id: 'tool-3', name: 'fetch_docs', input: { topic: 'contract' } },
        ],
      },
    });

    const state = useChatStore.getState();
    expect(state.sending).toBe(true);
    expect(state.activeRunId).toBe('run-final-tool-use');
    expect(state.pendingFinal).toBe(true);
    expect(state.messages).toContainEqual({
      role: 'assistant',
      id: 'assistant-final-tool-use',
      content: [
        { type: 'text', text: '正在整理结果，继续调用工具。' },
        { type: 'tool_use', id: 'tool-3', name: 'fetch_docs', input: { topic: 'contract' } },
      ],
    });
  });

  it('deduplicates duplicate assistant finals for the same turn when ids differ', () => {
    useChatStore.setState({
      messages: [
        {
          role: 'user',
          content: '你好',
          timestamp: 1,
          id: 'user-1',
        },
      ],
      sending: true,
      activeRunId: 'run-duplicate-final',
      pendingFinal: true,
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'run-duplicate-final',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        id: 'assistant-final-1',
        content: '你好！有什么可以帮你的吗？',
        timestamp: 2,
      },
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        content: '你好！有什么可以帮你的吗？',
        timestamp: 2,
      },
    });

    const assistantMessages = useChatStore.getState().messages.filter((message) => message.role === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toMatchObject({
      role: 'assistant',
      id: 'assistant-final-1',
      content: '你好！有什么可以帮你的吗？',
    });
  });

  it('keeps identical assistant replies from different turns', () => {
    useChatStore.setState({
      messages: [
        {
          role: 'user',
          content: '你好',
          timestamp: 1,
          id: 'user-1',
        },
        {
          role: 'assistant',
          content: '你好！有什么可以帮你的吗？',
          timestamp: 2,
          id: 'assistant-old',
        },
        {
          role: 'user',
          content: '再说一遍',
          timestamp: 3,
          id: 'user-2',
        },
      ],
      sending: true,
      activeRunId: 'run-next-turn',
      pendingFinal: true,
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'run-next-turn',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'assistant',
        id: 'assistant-new',
        content: '你好！有什么可以帮你的吗？',
        timestamp: 4,
      },
    });

    const assistantMessages = useChatStore.getState().messages.filter((message) => message.role === 'assistant');
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages.map((message) => message.id)).toEqual(['assistant-old', 'assistant-new']);
  });

  it('ignores orphan tool result finals when no visible run is active', () => {
    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'orphan-tool-result',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'toolresult',
        toolCallId: 'tool-1',
        toolName: 'search',
        content: [{ type: 'text', text: '工具结果' }],
      },
    });

    const state = useChatStore.getState();
    expect(state.sending).toBe(false);
    expect(state.activeRunId).toBeNull();
    expect(state.pendingFinal).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.streamingTools).toEqual([]);
  });

  it('does not enter pending-final state for empty final events while idle', () => {
    const loadHistoryMock = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({
      loadHistory: loadHistoryMock as unknown as (quiet?: boolean) => Promise<void>,
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'empty-idle-final',
      sessionKey: 'agent:lawclaw-main:main',
    });

    const state = useChatStore.getState();
    expect(state.sending).toBe(false);
    expect(state.activeRunId).toBeNull();
    expect(state.pendingFinal).toBe(false);
    expect(loadHistoryMock).toHaveBeenCalledWith(true);
  });

  it('deduplicates optimistic user image messages when history returns the canonical media-ref user turn', async () => {
    const optimisticTimestampMs = Date.now();

    useChatStore.setState({
      sending: true,
      activeRunId: 'run-image-user-dedupe',
      lastUserMessageAt: optimisticTimestampMs,
      messages: [
        {
          role: 'user',
          id: 'optimistic-user-image',
          content: '这个图片什么内容',
          timestamp: optimisticTimestampMs / 1000,
          _attachedFiles: [
            {
              fileName: 'test-image.png',
              mimeType: 'image/png',
              fileSize: 1024,
              preview: 'data:image/png;base64,abc',
              filePath: 'C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png',
              source: 'user-upload',
            },
          ],
        },
      ],
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (_channel, method) => {
      if (method === 'chat.history') {
        return {
          success: true,
          result: {
            messages: [
              {
                role: 'user',
                id: 'gateway-user-image',
                content:
                  '这个图片什么内容\n\n[lawclaw-media: C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png (image/png) | C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png]',
                timestamp: optimisticTimestampMs / 1000,
              },
              {
                role: 'assistant',
                id: 'assistant-image-answer',
                content: '这是一个界面截图。',
                timestamp: optimisticTimestampMs / 1000 + 1,
              },
            ],
          },
        };
      }
      throw new Error(`unexpected method: ${String(method)}`);
    });

    await useChatStore.getState().loadHistory(true, { force: true });

    const state = useChatStore.getState();
    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]).toMatchObject({
      role: 'user',
    });
    expect(userMessages[0]?._attachedFiles).toEqual([
      expect.objectContaining({
        fileName: 'test-image.png',
        mimeType: 'image/png',
        filePath: 'C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png',
        preview: 'data:image/png;base64,abc',
      }),
    ]);
    expect(userMessages[0]?.content).toBe('这个图片什么内容');
  });

  it('merges realtime canonical user image echo into the optimistic user message', () => {
    const optimisticTimestampMs = Date.now();

    useChatStore.setState({
      sending: true,
      activeRunId: 'run-image-user-echo',
      lastUserMessageAt: optimisticTimestampMs,
      messages: [
        {
          role: 'user',
          id: 'optimistic-user-image',
          content: '这个图片什么内容',
          timestamp: optimisticTimestampMs / 1000,
          _attachedFiles: [
            {
              fileName: 'test-image.png',
              mimeType: 'image/png',
              fileSize: 1024,
              preview: 'data:image/png;base64,abc',
              filePath: 'C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png',
              source: 'user-upload',
            },
          ],
        },
      ],
    });

    useChatStore.getState().handleChatEvent({
      state: 'final',
      runId: 'run-image-user-echo',
      sessionKey: 'agent:lawclaw-main:main',
      message: {
        role: 'user',
        id: 'gateway-user-image',
        content:
          '这个图片什么内容\n\n[lawclaw-media: C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png (image/png) | C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png]',
        timestamp: optimisticTimestampMs / 1000,
      },
    });

    const state = useChatStore.getState();
    const userMessages = state.messages.filter((message) => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]).toMatchObject({
      role: 'user',
      id: 'gateway-user-image',
      content: '这个图片什么内容',
    });
    expect(userMessages[0]?._attachedFiles).toEqual([
      expect.objectContaining({
        fileName: 'test-image.png',
        mimeType: 'image/png',
        filePath: 'C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png',
        preview: 'data:image/png;base64,abc',
      }),
    ]);
    expect(state.sending).toBe(true);
    expect(state.activeRunId).toBe('run-image-user-echo');
  });
});
