import { describe, expect, it } from 'vitest';
import type { ToolStatus } from '@/stores/chat';
import { deriveTaskSteps, findReplyMessageIndex } from '@/pages/Chat/task-visualization';

describe('task visualization', () => {
  it('builds running steps from streaming thinking and tool status', () => {
    const streamingTools: ToolStatus[] = [
      {
        name: 'web_search',
        status: 'running',
        updatedAt: Date.now(),
        summary: 'Searching docs',
      },
    ];

    const steps = deriveTaskSteps({
      messages: [],
      streamingMessage: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '先搜索今天金价数据。' },
          { type: 'tool_use', id: 'tool-1', name: 'web_search', input: { query: '今天 金价' } },
        ],
      },
      streamingTools,
      sending: true,
      pendingFinal: false,
      showThinking: true,
    });

    expect(steps).toEqual([
      expect.objectContaining({
        id: 'stream-thinking-0',
        label: 'Thinking',
        status: 'running',
        kind: 'thinking',
      }),
      expect.objectContaining({
        label: 'web_search',
        status: 'running',
        kind: 'tool',
      }),
    ]);
  });

  it('adds a finalizing step while waiting for the final answer', () => {
    const steps = deriveTaskSteps({
      messages: [
        {
          role: 'assistant',
          id: 'assistant-tool-step',
          content: [
            { type: 'thinking', thinking: '先整理搜索结果。' },
            { type: 'tool_use', id: 'tool-2', name: 'web_search', input: { query: '国际金价' } },
          ],
        },
      ],
      streamingMessage: null,
      streamingTools: [],
      sending: true,
      pendingFinal: true,
      showThinking: true,
    });

    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'system-finalizing',
        label: 'Finalizing answer',
        status: 'running',
        kind: 'system',
      }),
    ]));
  });

  it('folds intermediate assistant narration before tool calls into message steps', () => {
    const steps = deriveTaskSteps({
      messages: [
        {
          role: 'assistant',
          id: 'assistant-narration',
          content: [
            { type: 'text', text: '先整理风险地图，然后开始执行。' },
            { type: 'tool_use', id: 'tool-3', name: 'write', input: { path: 'contract.docx' } },
          ],
        },
        {
          role: 'assistant',
          id: 'assistant-reply',
          content: '已经完成审查。',
        },
      ],
      streamingMessage: null,
      streamingTools: [],
      showThinking: true,
    });

    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'history-message-assistant-narration-0',
        label: 'Message',
        kind: 'message',
        detail: '先整理风险地图，然后开始执行。',
      }),
      expect.objectContaining({
        id: 'tool-3',
        label: 'write',
        kind: 'tool',
      }),
    ]));
    expect(steps.some((step) => step.detail === '已经完成审查。')).toBe(false);
  });

  it('keeps the historical reply unprotected while a live streaming reply is active', () => {
    const messages = [
      { role: 'assistant' as const, content: '历史轮询提前写入的回答。' },
    ];

    expect(findReplyMessageIndex(messages, true)).toBe(-1);
    expect(findReplyMessageIndex(messages, false)).toBe(0);
  });
});
