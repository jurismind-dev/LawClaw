import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Chat } from '@/pages/Chat';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

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

vi.mock('@/pages/Chat/ChatMessage', () => ({
  ChatMessage: ({
    message,
    textOverride,
    isStreaming,
  }: {
    message: { role?: string; content?: unknown };
    textOverride?: string;
    isStreaming?: boolean;
  }) => {
    const content = message.content;
    const text = textOverride ?? (
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((block) => {
                if (block && typeof block === 'object' && 'text' in block) {
                  return String((block as { text?: unknown }).text ?? '');
                }
                return '';
              })
              .filter(Boolean)
              .join('\n')
          : ''
    );
    return (
      <div
        data-testid="chat-message"
        data-role={message.role}
        data-streaming={isStreaming ? 'true' : 'false'}
      >
        {text}
      </div>
    );
  },
}));

vi.mock('@/components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

describe('chat page cleanup behavior', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    localStorage.clear();

    useGatewayStore.setState({
      status: { state: 'running', port: 18789 },
      isInitialized: true,
      lastError: null,
    });

    useChatStore.setState({
      messages: [],
      loading: false,
      startupHistoryLoading: false,
      sending: false,
      error: null,
      sessionsLoading: false,
      hasAppliedStartupDefault: true,
      showThinking: false,
      streamingMessage: null,
      streamingTools: [],
      pendingFinal: false,
      activeRunId: null,
      currentSessionKey: 'agent:lawclaw-main:session-1',
      currentAgentId: 'lawclaw-main',
      sessionLabels: {},
      sessionLastActivity: {},
      sessions: [{ key: 'agent:lawclaw-main:session-1', persisted: false }],
      loadHistory: vi.fn().mockResolvedValue(undefined),
      loadSessions: vi.fn().mockResolvedValue(undefined),
      cleanupEmptySession: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      abortRun: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
    });
  });

  it('does not run cleanup when only gateway status changes', () => {
    const cleanupEmptySession = vi.fn();
    useChatStore.setState({ cleanupEmptySession });

    const view = render(<Chat />);
    expect(cleanupEmptySession).not.toHaveBeenCalled();

    act(() => {
      useGatewayStore.setState({
        status: { state: 'starting', port: 18789 },
      });
    });

    expect(cleanupEmptySession).not.toHaveBeenCalled();
    view.unmount();
    expect(cleanupEmptySession).toHaveBeenCalledTimes(1);
  });

  it('does not render the same assistant reply from history and streaming at the same time', () => {
    useChatStore.setState({
      messages: [
        {
          role: 'user',
          id: 'user-1',
          content: '审核合同',
        },
        {
          role: 'assistant',
          id: 'assistant-history-1',
          content: '好的，开始审核合同。创建副本并提取文本。',
        },
      ],
      sending: true,
      activeRunId: 'run-1',
      streamingMessage: {
        role: 'assistant',
        content: '好的，开始审核合同。创建副本并提取文本。',
      },
      pendingFinal: false,
    });

    render(<Chat />);

    const assistantMessages = screen
      .getAllByTestId('chat-message')
      .filter((element) => element.getAttribute('data-role') === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toHaveAttribute('data-streaming', 'true');
    expect(assistantMessages[0]).toHaveTextContent('好的，开始审核合同。创建副本并提取文本。');
  });
});
