import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from '@/pages/Chat';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/pages/Chat/ChatToolbar', () => ({
  ChatToolbar: () => <div data-testid="chat-toolbar" />,
}));

vi.mock('@/pages/Chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('@/components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

describe('chat execution graph cache', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    useGatewayStore.setState({
      status: { state: 'running', port: 18789 },
      isInitialized: true,
      lastError: null,
    });

    useAgentsStore.setState({
      agents: [{ id: 'lawclaw-main', name: 'LawClaw 主智能体' }],
      defaultAgentId: 'lawclaw-main',
      defaultModelRef: null,
      configuredChannelTypes: [],
      channelOwners: {},
      channelAccountOwners: {},
      loading: false,
      error: null,
      fetchAgents: vi.fn().mockResolvedValue(undefined),
    });

    useChatStore.setState({
      messages: [],
      loading: false,
      sending: false,
      error: null,
      showThinking: true,
      streamingMessage: null,
      streamingTools: [],
      pendingFinal: false,
      activeRunId: null,
      currentSessionKey: 'agent:lawclaw-main:main',
      currentAgentId: 'lawclaw-main',
      sessionLabels: {},
      sessionLastActivity: {},
      sessions: [{ key: 'agent:lawclaw-main:main', persisted: true }],
      loadHistory: vi.fn().mockResolvedValue(undefined),
      loadSessions: vi.fn().mockResolvedValue(undefined),
      cleanupEmptySession: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      abortRun: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
    });
  });

  it('keeps the execution graph visible while final reply is shown before history refresh fills steps', () => {
    const inProgressMessages: RawMessage[] = [
      {
        role: 'user',
        id: 'user-1',
        content: '这个图片是什么内容',
        timestamp: 1,
      },
      {
        role: 'assistant',
        id: 'assistant-thinking-1',
        timestamp: 2,
        content: [
          { type: 'thinking', thinking: '先查看图片内容。' },
          { type: 'tool_use', id: 'tool-1', name: 'vision', input: { prompt: 'describe image' } },
        ],
      },
    ];

    const { rerender } = render(<Chat />);

    act(() => {
      useChatStore.setState({
        messages: inProgressMessages,
        sending: true,
        pendingFinal: true,
        activeRunId: 'run-1',
      });
    });

    rerender(<Chat />);
    expect(screen.getByTestId('chat-execution-graph')).toBeInTheDocument();

    act(() => {
      useChatStore.setState({
        messages: [
          inProgressMessages[0]!,
          {
            role: 'assistant',
            id: 'assistant-final-1',
            content: '这是一个价格订阅页面。',
            timestamp: 3,
          },
        ],
        sending: false,
        pendingFinal: false,
        activeRunId: null,
        streamingMessage: null,
        streamingTools: [],
      });
    });

    rerender(<Chat />);
    expect(screen.getByTestId('chat-execution-graph')).toBeInTheDocument();
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.getByText('vision')).toBeInTheDocument();
  });

  it('does not render duplicate finalizing stream content when an active execution graph already covers the image run', () => {
    useChatStore.setState({
      messages: [
        {
          role: 'user',
          id: 'user-image-1',
          content: '这个图片什么内容',
          timestamp: 1,
        },
        {
          role: 'assistant',
          id: 'assistant-image-thinking-1',
          timestamp: 2,
          content: [
            { type: 'thinking', thinking: '先查看图片内容。' },
            { type: 'tool_use', id: 'tool-image-1', name: 'image', input: { prompt: 'describe image' } },
          ],
        },
      ],
      sending: true,
      pendingFinal: true,
      activeRunId: 'run-image-1',
      streamingMessage: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '正在整理图片分析结果。' },
        ],
      } satisfies RawMessage,
    });

    render(<Chat />);

    expect(screen.getByTestId('chat-execution-graph')).toBeInTheDocument();
    expect(screen.queryByText('Processing tool results...')).not.toBeInTheDocument();
    expect(screen.queryAllByText('正在整理图片分析结果。')).toHaveLength(1);
  });
});
