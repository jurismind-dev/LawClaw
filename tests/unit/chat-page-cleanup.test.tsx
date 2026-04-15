import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
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
  ChatMessage: () => <div data-testid="chat-message" />,
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
      sending: false,
      error: null,
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
});
