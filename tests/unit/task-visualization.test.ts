import { describe, expect, it } from 'vitest';
import type { ToolStatus } from '@/stores/chat';
import { deriveTaskSteps } from '@/pages/Chat/task-visualization';

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
        id: 'stream-thinking',
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
});
